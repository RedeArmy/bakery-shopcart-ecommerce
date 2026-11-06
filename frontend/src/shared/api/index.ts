import { auth } from '../auth';

/** El cliente tipado de la aplicación: ya lleva el token de la sesión y lo renueva ante un 401. */
export const api = auth.api;

export { ApiError, unwrap } from './result';
export { errorMessage } from './error-message';
