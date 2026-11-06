import type { components } from '../api/generated/schema';
import { createApiClient } from '../api/client';
import { unwrap } from '../api/result';
import { createLocalStorageHint, createSessionStore } from './session-store';
import type { SessionHint, SessionStore, SessionUser } from './session-store';

type Session = components['schemas']['Session'];

export interface AuthOptions {
  /** Origen del API; con rutas absolutas del contrato (/api/v1/...) basta el origen de la página */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  store?: SessionStore;
  hint?: SessionHint;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
}

// Las llamadas de autenticación nunca llevan el access token ni disparan una renovación
const AUTH_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  // Abrir o recuperar la sesión de un invitado no tiene sesión previa: no llevan token ni disparan una renovación
  '/api/v1/auth/guest',
  '/api/v1/auth/guest/recover',
]);

/**
 * Sesión del navegador: access token en memoria, refresh token en la cookie HttpOnly (ADR-0026). El cliente que devuelve
 * (`api`) añade el token y, ante un 401, renueva una sola vez aunque fallen varias peticiones a la vez (single-flight) y
 * repite la petición con el token nuevo.
 */
export function createAuth(options: AuthOptions = {}) {
  const store = options.store ?? createSessionStore();
  const hint = options.hint ?? createLocalStorageHint();
  // Se resuelve en cada llamada para que las pruebas puedan sustituir fetch después de crear la sesión
  const send: typeof fetch = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const baseUrl = options.baseUrl ?? '';
  const plain = createApiClient(baseUrl, send);

  const signIn = (session: Session): SessionUser => {
    store.set({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
    hint.set();
    return session.user;
  };
  const signOut = (): void => {
    store.set({ status: 'anonymous', user: null, accessToken: null });
    hint.clear();
  };

  let inFlight: Promise<boolean> | null = null;

  async function renew(): Promise<boolean> {
    try {
      const result = await plain.POST('/api/v1/auth/refresh');
      if (result.data === undefined) {
        // El servidor rechazó la cookie (vencida, revocada o reutilizada): no hay sesión que conservar
        signOut();
        return false;
      }
      signIn(result.data);
      return true;
    } catch {
      // Sin red no se sabe si la sesión sigue viva: no se cierra, solo no se pudo renovar ahora
      return false;
    }
  }

  /** Una sola renovación a la vez: las demás peticiones esperan la misma promesa. */
  const refresh = (): Promise<boolean> => {
    inFlight ??= renew().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const withToken = (request: Request, token: string | null): Request => {
    if (token === null) return request;
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return new Request(request, { headers });
  };

  const authFetch = async (
    input: Request | string | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (AUTH_PATHS.has(new URL(request.url).pathname)) return send(request);

    const used = store.get().accessToken;
    // El cuerpo de una petición se consume al enviarla: se guarda una copia para poder repetirla
    const spare = request.clone();
    const response = await send(withToken(request, used));
    if (response.status !== 401 || used === null) return response;

    // Otra petición ya pudo renovar mientras esta esperaba: se reutiliza su token en vez de renovar de nuevo
    const current = store.get().accessToken;
    const renewed = current !== null && current !== used ? true : await refresh();
    if (!renewed) return response;
    return send(withToken(spare, store.get().accessToken));
  };

  const api = createApiClient(baseUrl, authFetch);

  return {
    api,
    getState: () => store.get(),
    subscribe: (listener: () => void) => store.subscribe(listener),
    refresh,

    /** Al arrancar: si este navegador tuvo sesión intenta recuperarla con la cookie; si no, es un visitante anónimo. */
    async restore(): Promise<void> {
      if (store.get().status !== 'unknown') return;
      if (hint.has()) await refresh();
      if (store.get().status === 'unknown') {
        store.set({ status: 'anonymous', user: null, accessToken: null });
      }
    },

    async login(email: string, password: string): Promise<SessionUser> {
      return signIn(unwrap(await plain.POST('/api/v1/auth/login', { body: { email, password } })));
    },

    /** Crea la cuenta e inicia sesión: el registro solo devuelve el identificador. */
    async register(input: RegisterInput): Promise<SessionUser> {
      unwrap(
        await plain.POST('/api/v1/auth/register', {
          body: { ...input, phone: input.phone ?? null },
        }),
      );
      return signIn(
        unwrap(
          await plain.POST('/api/v1/auth/login', {
            body: { email: input.email, password: input.password },
          }),
        ),
      );
    },

    /** Abre la sesión de un invitado: una cuenta sin contraseña para usar un cupón y pagar sin registrarse (ADR-0027). */
    async startGuest(): Promise<SessionUser> {
      return signIn(unwrap(await plain.POST('/api/v1/auth/guest')));
    },

    /** Devuelve la sesión del invitado que presenta su correo y el código de recuperación de sus pedidos. */
    async recoverGuest(email: string, code: string): Promise<SessionUser> {
      return signIn(
        unwrap(await plain.POST('/api/v1/auth/guest/recover', { body: { email, code } })),
      );
    },

    /** Actualiza los datos del usuario de la sesión (el contacto que dio el invitado) sin tocar los tokens. */
    updateUser(user: SessionUser): void {
      const current = store.get();
      if (current.status === 'authenticated') store.set({ ...current, user });
    },

    async logout(): Promise<void> {
      try {
        await plain.POST('/api/v1/auth/logout');
      } finally {
        // Aunque el servidor no responda, este navegador deja de considerarse con sesión
        signOut();
      }
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
