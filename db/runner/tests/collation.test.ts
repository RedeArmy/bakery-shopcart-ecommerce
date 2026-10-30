import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DATABASE_COLLATION,
  STARTUP_GRACE_SECONDS,
  assessCollation,
  isServerInitialising,
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
