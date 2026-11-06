import type { components } from '../api/generated/schema';

export type SessionUser = components['schemas']['UserProfile'];
export type Role = SessionUser['role'];

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Solo vive en memoria: ni localStorage ni cookie accesible a scripts (ADR-0026) */
  accessToken: string | null;
}

export interface SessionStore {
  get(): SessionState;
  set(next: SessionState): void;
  subscribe(listener: () => void): () => void;
}

export const UNKNOWN_SESSION: SessionState = { status: 'unknown', user: null, accessToken: null };

/** Almacén mínimo y sin dependencias: lo lee React con useSyncExternalStore y lo lee el cliente HTTP. */
export function createSessionStore(initial: SessionState = UNKNOWN_SESSION): SessionStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      state = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Pista de que este navegador tuvo sesión. No es un secreto ni sirve para autenticar: solo evita pedir una renovación a
 * cada visitante anónimo (el borde limita /auth a 10 por minuto). La credencial real es la cookie HttpOnly.
 */
export interface SessionHint {
  has(): boolean;
  set(): void;
  clear(): void;
}

const HINT_KEY = 'shopcart.session';

export function createLocalStorageHint(storage: Storage | undefined = safeStorage()): SessionHint {
  const attempt = (action: () => void): void => {
    try {
      action();
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): la sesión sigue funcionando, solo no se recupera al recargar
    }
  };
  return {
    has: () => {
      try {
        return storage?.getItem(HINT_KEY) === '1';
      } catch {
        return false;
      }
    },
    set: () => {
      attempt(() => storage?.setItem(HINT_KEY, '1'));
    },
    clear: () => {
      attempt(() => storage?.removeItem(HINT_KEY));
    },
  };
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
