import { createAuth } from './session';

/**
 * La sesión única de la aplicación. En el navegador la base es el origen de la página, que es también el del API (nginx
 * reenvía /api): no hay CORS. Fuera del navegador (pruebas) quien la necesite crea la suya con `createAuth`.
 */
export const auth = createAuth({ baseUrl: window.location.origin });
