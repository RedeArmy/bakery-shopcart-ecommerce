import { vi } from 'vitest';

export interface Call {
  method: string;
  path: string;
  search: string;
  headers: Headers;
  body: unknown;
}

type Reply = Response | Promise<Response> | ((call: Call) => Response | Promise<Response>);

export const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

export const apiError = (status: number, code: string, details?: unknown): Response =>
  json({ error: { code, message: code, requestId: 'test', details } }, { status });

export const session = (name = 'Ana', role = 'Customer', token = 'token-1') => ({
  accessToken: token,
  refreshToken: 'r'.repeat(40),
  expiresIn: 900,
  user: {
    idUser: 1,
    role,
    email: 'ana@shopcart.test',
    fullName: name,
    isActive: true,
    isGuest: false,
  },
});

/** La sesión de un invitado: una cuenta sin contraseña con un correo inventado hasta que dé el suyo. */
export const guestSession = (
  idUser = 9,
  email = `guest-${idUser}@guest.invalid`,
  token = 'guest-token',
) => ({
  accessToken: token,
  refreshToken: 'g'.repeat(40),
  expiresIn: 900,
  user: {
    idUser,
    role: 'Customer',
    email,
    fullName: 'Guest',
    phone: null,
    isActive: true,
    isGuest: true,
  },
});

/**
 * Un servidor falso para las pruebas: se declara qué responde cada "MÉTODO /ruta" y se anotan las llamadas recibidas.
 * Las pruebas de las pantallas lo instalan como `fetch` global y así recorren el mismo cliente tipado que usa la app.
 */
export function installFakeApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      const raw = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
      const call: Call = {
        method: request.method,
        path: url.pathname,
        search: url.search,
        headers: request.headers,
        body: raw === '' ? undefined : (JSON.parse(raw) as unknown),
      };
      calls.push(call);
      const reply = routes[`${call.method} ${call.path}`];
      if (reply === undefined) return apiError(404, 'ROUTE_NOT_FOUND');
      if (typeof reply === 'function') return reply(call);
      // Un Response solo se puede leer una vez: cada llamada recibe una copia
      return reply instanceof Response ? reply.clone() : reply;
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
