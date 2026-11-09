// cspell:disable
import { request } from '@playwright/test';
import type { APIRequestContext, FullConfig } from '@playwright/test';

// Antes de abrir un navegador se espera a que la aplicación conteste y se recorren las lecturas que hace cualquier visitante.
// SQL Server compila cada procedimiento la primera vez que lo llaman y, con la base recién levantada o la máquina cargada, eso
// tarda segundos: sin este recorrido la primera prueba paga esa espera y se queda sin margen. El borde solo deja pasar /api/v1
// (la salud del backend no se ve desde fuera), así que la lectura del catálogo sirve también de señal de que ya está lista.
const READY_TIMEOUT_MS = 180_000;
const RETRY_EVERY_MS = 3_000;

const WARM_UP_PATHS = [
  '/api/v1/categories',
  '/api/v1/products?sort=newest&page=1&size=4',
  '/api/v1/products?q=pastel&sort=name&page=1&size=12',
  '/api/v1/branches',
];

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

async function answers(api: APIRequestContext, path: string): Promise<boolean> {
  try {
    return (await api.get(path, { timeout: 15_000 })).ok();
  } catch {
    // Todavía no hay nadie escuchando (la conexión se rechazó) o la base de datos aún se recupera
    return false;
  }
}

async function waitUntilReady(api: APIRequestContext): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!(await answers(api, WARM_UP_PATHS[0] ?? '/api/v1/categories'))) {
    if (Date.now() > deadline) {
      throw new Error(`The application did not answer within ${String(READY_TIMEOUT_MS / 1000)} s`);
    }
    await sleep(RETRY_EVERY_MS);
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use.baseURL ?? process.env['E2E_BASE_URL'] ?? 'http://localhost:8080';
  const api = await request.newContext({ baseURL });
  try {
    await waitUntilReady(api);
    // Cada ruta dos veces: la primera compila y la segunda confirma que ya contesta rápido
    for (const path of WARM_UP_PATHS) {
      await answers(api, path);
      await answers(api, path);
    }
  } finally {
    await api.dispose();
  }
}
