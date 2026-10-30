import sql from 'mssql';
import type { ProcedureExecutor } from '../../../platform/db/execute-procedure.js';
import { camelRow, toPage } from '../../../platform/http/serialise.js';
import type { Page, Row } from '../../../platform/http/serialise.js';
import type { AuditRepository, AuditSearch } from '../application/audit-repository.js';

/** Adaptador SQL de la bitácora de auditoría y de la versión del sistema: solo lectura. */
export function createSqlAuditRepository(execute: ProcedureExecutor): AuditRepository {
  return {
    async query(search: AuditSearch): Promise<Page<Row>> {
      const result = await execute<Row>('dbo.SP_Audit_Query', [
        { name: 'Module', type: sql.NVarChar(30), value: search.module },
        { name: 'EntityKey', type: sql.NVarChar(40), value: search.entityKey },
        { name: 'From', type: sql.DateTime2(3), value: search.from },
        { name: 'To', type: sql.DateTime2(3), value: search.to },
        { name: 'PageNumber', type: sql.Int, value: search.page },
        { name: 'PageSize', type: sql.Int, value: search.size },
      ]);
      return toPage(result.rows, search.page, search.size);
    },

    async systemVersion(): Promise<{ schemaVersion: number; objects: Row[] }> {
      const [schema, objects] = await Promise.all([
        execute<{ SchemaVersion: number }>('dbo.SP_System_GetSchemaVersion'),
        execute<Row>('dbo.SP_System_ListObjectVersions'),
      ]);
      return {
        schemaVersion: schema.rows[0]?.SchemaVersion ?? 0,
        objects: objects.rows.map((row) => camelRow(row)),
      };
    },
  };
}
