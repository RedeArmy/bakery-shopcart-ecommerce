import { buildContainer } from './composition-root.js';
import { loadEnv } from './platform/config/env.js';

// Punto de entrada del proceso: solo arranca el servidor y gestiona el apagado ordenado
const env = loadEnv();
const { app, logger, database } = buildContainer(env);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'ShopCart API listening');
});

// Al recibir SIGTERM se dejan de aceptar conexiones, se drenan las peticiones en curso y se cierra el pool
const shutdown = (signal: string): void => {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    database
      .close()
      .catch((error: unknown) => {
        logger.error({ err: error }, 'Error closing the database pool');
      })
      .finally(() => process.exit(0));
  });
};
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
