import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  DATABASE_COLLATION,
  SETTLE_CONFIRMATION_MS,
  STARTUP_GRACE_SECONDS,
  assessCollation,
  confirmServerSettled,
  isPermissionDenied,
  isServerInitialising,
  isServerShutdown,
  type ServerStartup,
} from '../src/collation.js';

describe('DATABASE_COLLATION', () => {
  // Se incrusta en CREATE DATABASE sin parámetros: solo puede contener letras, dígitos y guion bajo
  it('is a plain identifier that can be embedded in CREATE DATABASE', () => {
    expect(DATABASE_COLLATION).toMatch(/^\w+$/);
  });

  it('is case insensitive, accent sensitive and aware of supplementary characters', () => {
    expect(DATABASE_COLLATION).toContain('_CI_AS_SC');
  });
});

// La constante está repetida en los archivos que arrancan SQL Server: si divergen, tempdb tendría otro collation
describe('servers started by the repository', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

  it.each(['docker-compose.yml', 'docker-compose.sql-test.yml', '.github/workflows/ci.yml'])(
    '%s starts SQL Server with the project collation',
    (file) => {
      expect(readFileSync(join(root, file), 'utf8')).toContain(
        `MSSQL_COLLATION: ${DATABASE_COLLATION}`,
      );
    },
  );
});

describe('assessCollation', () => {
  const same = { database: DATABASE_COLLATION, server: DATABASE_COLLATION };

  it('has nothing to report when both match', () => {
    expect(assessCollation(same, 'ShopCart')).toEqual({});
  });

  it('fails when the database uses another collation and says how to fix it', () => {
    const { error } = assessCollation(
      { ...same, database: 'SQL_Latin1_General_CP1_CI_AS' },
      'ShopCart',
    );
    expect(error).toMatch(/ShopCart uses the collation SQL_Latin1_General_CP1_CI_AS/);
    expect(error).toContain(DATABASE_COLLATION);
    expect(error).toMatch(/docker compose down --volumes/);
  });

  it('only warns when the server collation differs, because tempdb follows the server', () => {
    const findings = assessCollation(
      { ...same, server: 'SQL_Latin1_General_CP1_CI_AS' },
      'ShopCart',
    );
    expect(findings.error).toBeUndefined();
    expect(findings.warning).toMatch(/COLLATE DATABASE_DEFAULT/);
  });

  it('reports both problems at once', () => {
    const findings = assessCollation({ database: 'a', server: 'b' }, 'ShopCart');
    expect(findings.error).toBeDefined();
    expect(findings.warning).toBeDefined();
  });
});

describe('isServerInitialising', () => {
  const settled = {
    collationChangeStarted: true,
    collationChangeFinished: true,
    serverCollation: DATABASE_COLLATION,
    uptimeSeconds: 600,
  };

  it('is ready once the collation change has finished', () => {
    expect(isServerInitialising(settled)).toBe(false);
  });

  it('is still starting while the collation change has begun but not finished', () => {
    expect(isServerInitialising({ ...settled, collationChangeFinished: false })).toBe(true);
  });

  // La propiedad ya muestra el collation nuevo cuando el cambio EMPIEZA: no basta para dar el servidor por listo
  it('does not trust the collation property while the change is running', () => {
    expect(
      isServerInitialising({ ...settled, collationChangeFinished: false, uptimeSeconds: 5 }),
    ).toBe(true);
  });

  it('waits for a young server that still has another collation, because the change may be about to start', () => {
    const young = {
      collationChangeStarted: false,
      collationChangeFinished: false,
      serverCollation: 'SQL_Latin1_General_CP1_CI_AS',
      uptimeSeconds: 8,
    };
    expect(isServerInitialising(young)).toBe(true);
  });

  it('stops waiting after the grace period for a server that deliberately keeps another collation', () => {
    const configured = {
      collationChangeStarted: false,
      collationChangeFinished: false,
      serverCollation: 'SQL_Latin1_General_CP1_CI_AS',
      uptimeSeconds: STARTUP_GRACE_SECONDS,
    };
    expect(isServerInitialising(configured)).toBe(false);
  });

  it('does not wait for a restarted server whose collation already matches', () => {
    expect(
      isServerInitialising({
        collationChangeStarted: false,
        collationChangeFinished: false,
        serverCollation: DATABASE_COLLATION,
        uptimeSeconds: 3,
      }),
    ).toBe(false);
  });

  it('compares collation names without regard to case', () => {
    expect(
      isServerInitialising({ ...settled, serverCollation: DATABASE_COLLATION.toUpperCase() }),
    ).toBe(false);
  });
});

describe('confirmServerSettled', () => {
  const settled: ServerStartup = {
    collationChangeStarted: true,
    collationChangeFinished: true,
    serverCollation: DATABASE_COLLATION,
    uptimeSeconds: 600,
  };
  const running: ServerStartup = { ...settled, collationChangeFinished: false, uptimeSeconds: 11 };
  const instantly = (): Promise<void> => Promise.resolve();

  it('needs two settled readings separated by a pause', async () => {
    const read = vi.fn().mockResolvedValue(settled);
    const pause = vi.fn(instantly);
    await confirmServerSettled(read, pause);
    expect(read).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledExactlyOnceWith(SETTLE_CONFIRMATION_MS);
  });

  it('fails when the first reading says the change is still running', async () => {
    const read = vi.fn().mockResolvedValue(running);
    await expect(confirmServerSettled(read, instantly)).rejects.toThrow(/still finishing/);
    expect(read).toHaveBeenCalledTimes(1);
  });

  // Una lectura aislada puede caer antes de que el registro anuncie el cambio: la segunda lo ve
  it('fails when the change shows up between the two readings', async () => {
    const read = vi.fn().mockResolvedValueOnce(settled).mockResolvedValueOnce(running);
    await expect(confirmServerSettled(read, instantly)).rejects.toThrow(/still finishing/);
    expect(read).toHaveBeenCalledTimes(2);
  });

  // Antes cualquier error de la consulta se daba por "listo" y dejaba pasar a CREATE DATABASE
  it('does not swallow a failed reading: the caller must retry', async () => {
    const deadlock = Object.assign(new Error('deadlock victim'), { number: 1205 });
    const read = vi.fn().mockRejectedValue(deadlock);
    await expect(confirmServerSettled(read, instantly)).rejects.toBe(deadlock);
  });

  it('lets a server whose log cannot be read go on, because it is not a fresh one', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn(instantly);
    await confirmServerSettled(read, pause);
    expect(read).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });
});

describe('isPermissionDenied', () => {
  it.each([229, 230, 262, 297, 300, 15003])('treats error %i as a missing permission', (number) => {
    expect(isPermissionDenied({ number })).toBe(true);
  });

  it.each([1205, 3434, 6005, 4060, -2])(
    'does not treat error %i as a missing permission',
    (number) => {
      expect(isPermissionDenied({ number })).toBe(false);
    },
  );

  it('ignores values that are not SQL Server errors', () => {
    expect(isPermissionDenied(undefined)).toBe(false);
    expect(isPermissionDenied('229')).toBe(false);
    expect(isPermissionDenied(new Error('plain'))).toBe(false);
  });
});

describe('isServerShutdown', () => {
  it('recognises the collation change shutdown and a shutdown in progress', () => {
    expect(isServerShutdown({ number: 3434 })).toBe(true);
    expect(isServerShutdown({ number: 6005 })).toBe(true);
  });

  it('recognises a connection that was cut', () => {
    expect(isServerShutdown({ code: 'ECONNCLOSED' })).toBe(true);
    expect(isServerShutdown({ code: 'ESOCKET' })).toBe(true);
  });

  it('does not mistake an ordinary SQL error for a shutdown', () => {
    expect(isServerShutdown({ number: 1205 })).toBe(false);
    expect(isServerShutdown({ code: 'EREQUEST', number: 2714 })).toBe(false);
    expect(isServerShutdown(null)).toBe(false);
  });
});
