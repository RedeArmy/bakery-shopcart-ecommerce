import sql from 'mssql';
import type { Env } from '../config/env.js';

export interface Database {
  /** Devuelve el pool compartido, conectándolo la primera vez. Quien llega mientras otra llamada conecta espera a esa conexión. */
  getPool(): Promise<sql.ConnectionPool>;
  /** Comprueba la conectividad sin escribir SQL en el backend: ejercita la conexión del driver. */
  checkConnection(): Promise<boolean>;
  close(): Promise<void>;
}

export interface DatabaseHooks {
  /**
   * Se llama cada vez que se establece la conexión: la primera y también la que sigue a una caída de la base de datos. Sirve para
   * calentarla (la primera conversión de zona horaria de SQL Server tarda segundos). No debe lanzar ni se espera.
   */
  onConnected?: () => void;
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
  hooks: DatabaseHooks = {},
): Database {
  let pool: sql.ConnectionPool | undefined;
  // La conexión en curso. Se guarda para que dos llamadas simultáneas compartan una sola: devolver el pool mientras todavía
  // conecta le entregaría a la segunda un pool que aún no sirve, y su consulta fallaría
  let connecting: Promise<sql.ConnectionPool> | undefined;

  const getPool = (): Promise<sql.ConnectionPool> => {
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
    const current = pool;
    if (current.connected) return Promise.resolve(current);
    connecting ??= current
      .connect()
      .then(() => {
        hooks.onConnected?.();
        return current;
      })
      // Al terminar, bien o mal, la siguiente llamada vuelve a intentarlo si hace falta
      .finally(() => {
        connecting = undefined;
      });
    return connecting;
  };

  return {
    getPool,
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
      connecting = undefined;
    },
  };
}
