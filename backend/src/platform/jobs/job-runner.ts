import type { Logger } from '../logging/logger.js';
import type { Clock } from '../../shared-kernel/index.js';

/** Ran: el trabajo se ejecutó. Skipped: otra instancia ya lo estaba ejecutando (bloqueo de la base de datos). */
export type JobOutcome = 'Ran' | 'Skipped';

export interface JobResult {
  outcome: JobOutcome;
  /** Lo que hizo, en números (pedidos vencidos, filas purgadas...) */
  counts: Record<string, number>;
  /** Si existe, algo requiere atención humana y se registra como error aunque el trabajo haya terminado bien */
  alert?: string;
}

export interface JobDefinition {
  name: string;
  intervalMs: number;
  /** Espera antes de la primera ejecución, para no competir con el arranque */
  startDelayMs: number;
  run: () => Promise<JobResult>;
}

export interface JobStatus {
  name: string;
  intervalMs: number;
  running: boolean;
  runs: number;
  skipped: number;
  failures: number;
  consecutiveFailures: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastOutcome: JobOutcome | 'Failed' | null;
  lastCounts: Record<string, number> | null;
  lastError: string | null;
}

/** Temporizadores inyectables: las pruebas avanzan el tiempo a mano en vez de esperar. */
export interface Timers {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}

const systemTimers: Timers = {
  set: (callback, milliseconds) => {
    const handle = setTimeout(callback, milliseconds);
    // Un temporizador pendiente no debe impedir que el proceso termine en el apagado
    handle.unref();
    return handle;
  },
  clear: (handle) => {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

export interface JobRunner {
  start(): void;
  /** Deja de programar y espera a que termine lo que está en ejecución */
  stop(): Promise<void>;
  /** Ejecuta un trabajo ahora (pruebas y diagnóstico); si ya está en curso no lo repite */
  runNow(name: string): Promise<JobStatus>;
  status(): JobStatus[];
}

interface JobState {
  definition: JobDefinition;
  status: JobStatus;
  timer: unknown;
  inFlight: Promise<void> | undefined;
}

const emptyStatus = (definition: JobDefinition): JobStatus => ({
  name: definition.name,
  intervalMs: definition.intervalMs,
  running: false,
  runs: 0,
  skipped: 0,
  failures: 0,
  consecutiveFailures: 0,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastDurationMs: null,
  lastOutcome: null,
  lastCounts: null,
  lastError: null,
});

const hasActivity = (counts: Record<string, number>): boolean =>
  Object.values(counts).some((value) => value > 0);

/**
 * Planificador de los trabajos de fondo. Cada trabajo se vuelve a programar al TERMINAR el anterior (retardo fijo y no
 * intervalo fijo), así que dentro de un proceso nunca se solapa consigo mismo; entre procesos lo impide el bloqueo
 * `sp_getapplock` de cada procedimiento. Un fallo se registra y el trabajo sigue programado: una base de datos caída un minuto
 * no debe detener el vencimiento de las reservas para siempre.
 */
export function createJobRunner(options: {
  jobs: readonly JobDefinition[];
  logger: Logger;
  clock: Clock;
  timers?: Timers;
}): JobRunner {
  const { logger, clock } = options;
  const timers = options.timers ?? systemTimers;
  const states = new Map<string, JobState>(
    options.jobs.map((definition) => [
      definition.name,
      { definition, status: emptyStatus(definition), timer: undefined, inFlight: undefined },
    ]),
  );
  let stopped = true;

  const record = (state: JobState, result: JobResult, startedAt: number): void => {
    const { status } = state;
    status.lastFinishedAt = clock.now().toISOString();
    status.lastDurationMs = clock.now().getTime() - startedAt;
    status.lastOutcome = result.outcome;
    status.lastCounts = result.counts;
    status.lastError = null;
    status.consecutiveFailures = 0;
    if (result.outcome === 'Skipped') status.skipped += 1;
    else status.runs += 1;

    const context = { job: status.name, ...result.counts, durationMs: status.lastDurationMs };
    if (result.alert !== undefined) logger.error(context, result.alert);
    else if (result.outcome === 'Ran' && hasActivity(result.counts))
      logger.info(context, 'Job ran');
    else logger.debug({ ...context, outcome: result.outcome }, 'Job had nothing to do');
  };

  const fail = (state: JobState, error: unknown, startedAt: number): void => {
    const { status } = state;
    status.lastFinishedAt = clock.now().toISOString();
    status.lastDurationMs = clock.now().getTime() - startedAt;
    status.lastOutcome = 'Failed';
    status.lastCounts = null;
    status.lastError = error instanceof Error ? error.message : String(error);
    status.failures += 1;
    status.consecutiveFailures += 1;
    logger.error(
      { err: error, job: status.name, consecutiveFailures: status.consecutiveFailures },
      'Job failed',
    );
  };

  const execute = (state: JobState): Promise<void> => {
    const startedAt = clock.now().getTime();
    state.status.running = true;
    state.status.lastStartedAt = new Date(startedAt).toISOString();
    return state.definition
      .run()
      .then((result) => {
        record(state, result, startedAt);
      })
      .catch((error: unknown) => {
        fail(state, error, startedAt);
      })
      .finally(() => {
        state.status.running = false;
      });
  };

  const schedule = (state: JobState, delayMs: number): void => {
    if (stopped) return;
    state.timer = timers.set(() => {
      state.inFlight = execute(state).finally(() => {
        state.inFlight = undefined;
        schedule(state, state.definition.intervalMs);
      });
    }, delayMs);
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      for (const state of states.values()) schedule(state, state.definition.startDelayMs);
      logger.info({ jobs: [...states.keys()] }, 'Job runner started');
    },

    async stop() {
      stopped = true;
      for (const state of states.values()) timers.clear(state.timer);
      // Solo lo que está en ejecución: un trabajo ocioso no tiene nada que esperar
      await Promise.allSettled([...states.values()].flatMap((state) => state.inFlight ?? []));
      logger.info('Job runner stopped');
    },

    async runNow(name) {
      const state = states.get(name);
      if (state === undefined) throw new RangeError(`Unknown job: ${name}`);
      // Si ya hay una ejecución en curso se comparte; si no, se inicia una
      state.inFlight ??= execute(state).finally(() => {
        state.inFlight = undefined;
      });
      await state.inFlight;
      return { ...state.status };
    },

    status: () => [...states.values()].map((state) => ({ ...state.status })),
  };
}
