import { describe, expect, it } from 'vitest';
import {
  buildReport,
  extractProcedureNames,
  parseCriticalProcedures,
  stripSqlComments,
} from '../lib/coverage.js';

describe('stripSqlComments', () => {
  it('removes line and block comments', () => {
    expect(stripSqlComments('SELECT 1; -- SP_A_B\n/* SP_C_D */ SELECT 2;')).toBe(
      'SELECT 1; \n  SELECT 2;',
    );
  });

  it('keeps comment markers that are inside a string', () => {
    expect(stripSqlComments("SELECT '-- not a comment', '/* nor this */';")).toBe(
      "SELECT '-- not a comment', '/* nor this */';",
    );
  });

  it('handles an escaped quote inside a string', () => {
    expect(stripSqlComments("SELECT 'it''s -- fine'; -- gone")).toBe("SELECT 'it''s -- fine'; ");
  });

  it('copes with unterminated comments and strings', () => {
    expect(stripSqlComments('SELECT 1; /* never closed')).toBe('SELECT 1;  ');
    expect(stripSqlComments("SELECT 'never closed")).toBe("SELECT 'never closed");
  });
});

describe('extractProcedureNames', () => {
  it('finds names in code and test titles but not in comments', () => {
    const sql = [
      '/* Covers SP_Ignored_Block */',
      '-- SP_Ignored_Line',
      'CREATE PROCEDURE Test_X.[test SP_Orders_CreateOrder is atomic] AS',
      'EXEC dbo.SP_Payments_ConfirmPayment @IDPayment = 1;',
    ].join('\n');
    expect([...extractProcedureNames(sql)].sort()).toEqual([
      'SP_Orders_CreateOrder',
      'SP_Payments_ConfirmPayment',
    ]);
  });

  it('does not take a longer identifier for a procedure name', () => {
    expect(extractProcedureNames('SELECT XSP_A_B, SP_A_B_C;').size).toBe(0);
  });
});

describe('parseCriticalProcedures', () => {
  it('reads the names marked in bold and code, once each', () => {
    const markdown = [
      '| Inventory | `SP_Inventory_RegisterEntry`, **`SP_Inventory_ReserveStock`** |',
      '| Orders | **`SP_Orders_CreateOrder`**, `SP_Orders_List`, **`SP_Inventory_ReserveStock`** |',
      'text **`not a procedure`** and **`unclosed',
    ].join('\n');
    expect(parseCriticalProcedures(markdown)).toEqual([
      'SP_Inventory_ReserveStock',
      'SP_Orders_CreateOrder',
    ]);
  });

  it('returns nothing for a document without critical procedures', () => {
    expect(parseCriticalProcedures('no procedures here')).toEqual([]);
  });
});

describe('buildReport', () => {
  const critical = ['SP_Orders_CreateOrder', 'SP_Payments_ConfirmPayment'];

  it('fails only for critical procedures without a test', () => {
    const report = buildReport(
      ['SP_Orders_CreateOrder', 'SP_Orders_List', 'SP_Users_Register'],
      critical,
      new Set(['SP_Users_Register']),
    );
    expect(report.missingCritical).toEqual(['SP_Orders_CreateOrder']);
    expect(report.missingOther).toEqual(['SP_Orders_List']);
    expect(report.covered).toBe(1);
    expect(report.total).toBe(3);
  });

  it('lists critical procedures that are not built yet without failing', () => {
    const report = buildReport([], critical, new Set());
    expect(report.plannedCritical).toEqual(critical);
    expect(report.missingCritical).toEqual([]);
  });

  it('passes when everything is covered', () => {
    const report = buildReport(critical, critical, new Set(critical));
    expect(report).toMatchObject({ missingCritical: [], missingOther: [], covered: 2, total: 2 });
  });
});
