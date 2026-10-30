import sql from 'mssql';
import type {
  BeginOutcome,
  IdempotencyRequest,
  IdempotencyStorePort,
} from '../idempotency/idempotency.js';
import type { ProcedureExecutor } from './execute-procedure.js';

interface BeginRow {
  Outcome: BeginOutcome;
  HttpStatus: number | null;
  ResponseBody: string | null;
  RetryAfterSeconds: number | null;
}

const identityParams = (request: IdempotencyRequest) => [
  { name: 'Scope', type: sql.NVarChar(64), value: request.scope },
  { name: 'Method', type: sql.NVarChar(7), value: request.method },
  { name: 'Route', type: sql.NVarChar(200), value: request.route },
  { name: 'IdempotencyKey', type: sql.NVarChar(64), value: request.key },
];

/** Adaptador SQL del puerto de idempotencia: toda la lógica atómica vive en SP_Idempotency_*. */
export function createSqlIdempotencyStore(execute: ProcedureExecutor): IdempotencyStorePort {
  return {
    async begin(request) {
      const result = await execute<BeginRow>('dbo.SP_Idempotency_Begin', [
        ...identityParams(request),
        { name: 'RequestHash', type: sql.Char(64), value: request.requestHash },
      ]);
      const row = result.rows[0];
      if (row === undefined) throw new TypeError('SP_Idempotency_Begin returned no row');
      return {
        outcome: row.Outcome,
        httpStatus: row.HttpStatus,
        responseBody: row.ResponseBody,
        retryAfterSeconds: row.RetryAfterSeconds,
      };
    },
    async complete(request) {
      await execute(
        'dbo.SP_Idempotency_Complete',
        [
          ...identityParams(request),
          { name: 'HttpStatus', type: sql.SmallInt, value: request.httpStatus },
          { name: 'ResponseBody', type: sql.NVarChar(sql.MAX), value: request.body },
        ],
        [{ name: 'Stored', type: sql.Bit }],
      );
    },
    async fail(request) {
      await execute('dbo.SP_Idempotency_Fail', identityParams(request));
    },
  };
}
