import sql from 'mssql';
import type { Env } from '../config/env.js';

export interface Database {
  /** Devuelve el pool compartido, conectándolo la primera vez. */
  getPool(): Promise<sql.ConnectionPool>;
  /** Comprueba la conectividad sin escribir SQL en el backend: ejercita la conexión del driver. */
  checkConnection(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabase(
  env: Pick<
    Env,
    | 'DB_HOST'
    | 'DB_PORT'
    | 'DB_NAME'
    | 'DB_APP_USER'
    | 'DB_APP_PASSWORD'
    | 'DB_TRUST_SERVER_CERTIFICATE'
    | 'NODE_ENV'
  >,
): Database {
  let pool: sql.ConnectionPool | undefined;

  const getPool = async (): Promise<sql.ConnectionPool> => {
    pool ??= new sql.ConnectionPool({
      server: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_APP_USER,
      password: env.DB_APP_PASSWORD,
      // El contenedor de desarrollo usa un certificado autofirmado; en producción solo se confía si se pide expresamente
      options: {
        encrypt: true,
        trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE ?? env.NODE_ENV !== 'production',
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
      connectionTimeout: 5_000,
    });
    if (!pool.connected && !pool.connecting) await pool.connect();
    return pool;
  };

  return {
    getPool,
    // La Etapa 2 sustituye esta comprobación por SP_Sistema_ObtenerVersionEsquema
    async checkConnection() {
      try {
        const connected = await getPool();
        return connected.connected;
      } catch {
        // Si la conexión falló se descarta el pool para reintentar limpio en la próxima sonda
        await pool?.close().catch(() => undefined);
        pool = undefined;
        return false;
      }
    },
    async close() {
      await pool?.close();
      pool = undefined;
    },
  };
}
