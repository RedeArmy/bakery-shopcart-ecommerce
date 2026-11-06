import { useSyncExternalStore } from 'react';
import { auth } from './instance';
import type { SessionState } from './session-store';

/** El estado de la sesión como un valor de React: la pantalla se actualiza sola al iniciar, renovar o cerrar sesión. */
export function useSession(): SessionState {
  return useSyncExternalStore(auth.subscribe, auth.getState, auth.getState);
}
