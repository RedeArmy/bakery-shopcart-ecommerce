import type { SessionState, SessionUser } from './session-store';

/** Dominio que la base de datos inventa para el correo de un invitado que todavía no dio el suyo (V0013). */
const INVENTED_EMAIL_SUFFIX = '@guest.invalid';

/** Sesión de una cuenta registrada: las funciones que piden cuenta (personalización, productos por encargo) la exigen. */
export const hasAccount = (session: Pick<SessionState, 'status' | 'user'>): boolean =>
  session.status === 'authenticated' && session.user !== null && !session.user.isGuest;

/** Sesión de invitado: compra sin cuenta, pero sin cupones, personalización ni productos por encargo. */
export const isGuestSession = (session: Pick<SessionState, 'status' | 'user'>): boolean =>
  session.status === 'authenticated' && session.user?.isGuest === true;

/** El invitado ya dio un correo de contacto real; sin él el pedido no se puede crear. */
export const hasContact = (user: Pick<SessionUser, 'email'>): boolean =>
  !user.email.endsWith(INVENTED_EMAIL_SUFFIX);
