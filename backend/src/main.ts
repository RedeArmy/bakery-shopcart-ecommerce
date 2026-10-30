import { buildContainer } from './composition-root.js';
import { loadEnv } from './platform/config/env.js';

// Punto de entrada del proceso: solo arranca el servidor y gestiona el apagado ordenado
const env = loadEnv();
const { app, logger, database } = buildContainer(env);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'ShopCart API listening');
});

// Docker espera 10 s tras SIGTERM antes de enviar SIGKILL: el límite propio evita quedar colgado en una conexión abierta
const SHUTDOWN_TIMEOUT_MS = 8_000;
let shuttingDown = false;

// Al recibir SIGTERM se dejan de aceptar conexiones, se drenan las peticiones en curso y se cierra el pool
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  setTimeout(() => {
    logger.error('Shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(() => {
    database
      .close()
      .catch((error: unknown) => {
        logger.error({ err: error }, 'Error closing the database pool');
      })
      .finally(() => process.exit(0));
  });
  // Las conexiones keep-alive ociosas impedirían que close() termine nunca
  server.closeIdleConnections();
};
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});

// Un rechazo sin manejar o una excepción dejan el proceso en un estado desconocido: se registra y se reinicia limpio
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});
