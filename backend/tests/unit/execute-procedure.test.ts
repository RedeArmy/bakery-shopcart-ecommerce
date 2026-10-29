import sql from 'mssql';
import { describe, expect, it, vi } from 'vitest';
import { createProcedureExecutor } from '../../src/platform/db/execute-procedure.js';
import type { Database } from '../../src/platform/db/pool.js';
import { AppError } from '../../src/shared-kernel/index.js';

const sqlError = (number: number) => Object.assign(new Error(`SQL error ${number}`), { number });

// Doble mínimo de la solicitud del driver: registra los parámetros y devuelve los resultados programados
function buildDatabase(outcomes: (() => unknown)[]) {
  const inputs: { name: string; value: unknown }[] = [];
  const outputs: string[] = [];
  const execute = vi.fn(() => {
    const next = outcomes.shift();
    if (next === undefined) throw new Error('no outcome programmed');
    return Promise.resolve(next());
  });
  const request = () => ({
    input: (name: string, _type: unknown, value: unknown) => inputs.push({ name, value }),
    output: (name: string) => outputs.push(name),
    execute,
  });
  const database = {
    getPool: () => Promise.resolve({ request }),
  } as unknown as Database;
  return { database, inputs, outputs, execute };
}

describe('procedure executor', () => {
  it('sends typed parameters and returns the rows and the output values', async () => {
    const { database, inputs, outputs } = buildDatabase([
      () => ({ recordset: [{ IDReservation: 7 }], output: { IDReservation: 7 } }),
    ]);
    const run = createProcedureExecutor(database);

    const result = await run<{ IDReservation: number }>(
      'dbo.SP_Inventory_ReserveStock',
      [{ name: 'IDUser', type: sql.Int, value: 42 }],
      [{ name: 'IDReservation', type: sql.Int }],
    );

    expect(inputs).toEqual([{ name: 'IDUser', value: 42 }]);
    expect(outputs).toEqual(['IDReservation']);
    expect(result).toEqual({ rows: [{ IDReservation: 7 }], output: { IDReservation: 7 } });
  });

  it('retries after a deadlock and succeeds on the second attempt', async () => {
    const { database, execute } = buildDatabase([
      () => {
        throw sqlError(1205);
      },
      () => ({ recordset: [], output: {} }),
    ]);

    const result = await createProcedureExecutor(database)('dbo.SP_Orders_CreateOrder');

    expect(result.rows).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('gives up after three deadlocks and reports a database error', async () => {
    const { database, execute } = buildDatabase([
      () => {
        throw sqlError(1205);
      },
      () => {
        throw sqlError(1205);
      },
      () => {
        throw sqlError(1205);
      },
    ]);

    await expect(
      createProcedureExecutor(database)('dbo.SP_Orders_CreateOrder'),
    ).rejects.toMatchObject({
      httpStatus: 500,
      code: 'DATABASE_ERROR',
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('maps a business error without retrying it', async () => {
    const { database, execute } = buildDatabase([
      () => {
        throw sqlError(50409);
      },
    ]);

    const failure = await createProcedureExecutor(database)('dbo.SP_Inventory_ReserveStock').catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ httpStatus: 409, code: 'CONFLICT' });
    expect(execute).toHaveBeenCalledOnce();
  });
});
