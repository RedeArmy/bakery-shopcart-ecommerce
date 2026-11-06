import i18n from '../i18n';
import { ApiError } from './result';

/** Texto en español para mostrar al cliente: el código del API se traduce, el mensaje en inglés nunca se muestra. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const key = `errors.codes.${error.code}`;
    return i18n.exists(key) ? i18n.t(key) : i18n.t('errors.unexpected');
  }
  // fetch falla con TypeError cuando no hay red
  if (error instanceof TypeError) return i18n.t('errors.network');
  return i18n.t('errors.unexpected');
}
