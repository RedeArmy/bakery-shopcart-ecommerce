import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MigrationError } from '../src/errors.js';
import { parseObjectHeader } from '../src/header.js';
import { discoverScripts, parseScriptName } from '../src/scripts.js';

function header(name: string, version = '1.0.0', change = 'Initial version'): string {
  return `/* ====\n   Objeto   : ${name}\n   Version  : ${version}\n   Cambio   : ${change}\n   ==== */\nSELECT 1;\n`;
}

describe('parseScriptName', () => {
  it('reads the type, number and descriptor', () => {
    expect(parseScriptName('V0001__create_core_tables.sql')).toEqual({
      type: 'V',
      number: 1,
      description: 'create_core_tables',
    });
    expect(parseScriptName('R0101__SP_Orders_CreateOrder.sql')?.description).toBe(
      'SP_Orders_CreateOrder',
    );
  });

  it('rejects names that do not follow the pattern', () => {
    expect(parseScriptName('V1__x.sql')).toBeUndefined();
    expect(parseScriptName('X0001__x.sql')).toBeUndefined();
    expect(parseScriptName('V0001__x.txt')).toBeUndefined();
  });
});

describe('parseObjectHeader', () => {
  it('reads the object, version and change', () => {
    expect(parseObjectHeader(header('dbo.SP_A_B', '1.2.0', 'Tweak'), 'f.sql')).toEqual({
      name: 'dbo.SP_A_B',
      version: '1.2.0',
      change: 'Tweak',
    });
  });

  it('rejects a missing header, a bad version and an empty change', () => {
    expect(() => parseObjectHeader('SELECT 1;', 'f.sql')).toThrow(MigrationError);
    expect(() => parseObjectHeader(header('dbo.SP_A_B', '1.0'), 'f.sql')).toThrow(/Version/);
    expect(() => parseObjectHeader(header('dbo.SP_A_B', '1.0.0', ''), 'f.sql')).toThrow(/Cambio/);
    expect(() => parseObjectHeader('/* Version: 1.0.0 */', 'f.sql')).toThrow(/Objeto/);
  });
});

describe('discoverScripts', () => {
  let root: string;

  const write = (relative: string, content: string): void => {
    const path = join(root, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'runner-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns migrations, then objects, then seeds, each by number', () => {
    write('seed/S0001__roles.sql', 'SELECT 3;');
    write('objects/procedures/R0101__SP_Orders_Create.sql', header('dbo.SP_Orders_Create'));
    write('objects/functions/R0050__FU_Money_Divide.sql', header('dbo.FU_Money_Divide'));
    write('migrations/V0002__second.sql', 'SELECT 2;');
    write('migrations/V0001__first.sql', 'SELECT 1;');
    write('migrations/README.md', 'ignored');

    expect(discoverScripts(root).map((s) => s.fileName)).toEqual([
      'V0001__first.sql',
      'V0002__second.sql',
      'R0050__FU_Money_Divide.sql',
      'R0101__SP_Orders_Create.sql',
      'S0001__roles.sql',
    ]);
  });

  it('records the object type from the folder and the checksum from normalised text', () => {
    write(
      'objects/views/R0070__VW_Reports_Sales.sql',
      header('dbo.VW_Reports_Sales').replaceAll('\n', '\r\n'),
    );
    const [script] = discoverScripts(root);
    expect(script?.object?.type).toBe('V');
    expect(script?.content).not.toContain('\r');
  });

  it('works when the folders do not exist', () => {
    expect(discoverScripts(root)).toEqual([]);
  });

  it('rejects a duplicated number, a misnamed file and a header that disagrees with the name', () => {
    write('migrations/V0001__a.sql', 'SELECT 1;');
    write('migrations/V0001__b.sql', 'SELECT 2;');
    expect(() => discoverScripts(root)).toThrow(/used twice/);

    rmSync(join(root, 'migrations/V0001__b.sql'));
    write('migrations/oops.sql', 'SELECT 1;');
    expect(() => discoverScripts(root)).toThrow(/pattern/);

    rmSync(join(root, 'migrations/oops.sql'));
    write('objects/procedures/R0101__SP_Orders_Create.sql', header('dbo.SP_Orders_Other'));
    expect(() => discoverScripts(root)).toThrow(/header must declare/);
  });

  it('rejects the same object defined twice', () => {
    write('objects/procedures/R0101__SP_Orders_Create.sql', header('dbo.SP_Orders_Create'));
    write('objects/procedures/R0102__SP_Orders_Create.sql', header('dbo.SP_Orders_Create'));
    expect(() => discoverScripts(root)).toThrow(/defined twice/);
  });
});
