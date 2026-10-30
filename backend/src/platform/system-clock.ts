import type { Clock } from '../shared-kernel/index.js';

/** Reloj real del sistema; las pruebas inyectan uno fijo en su lugar. */
export const systemClock: Clock = { now: () => new Date() };
