export type TestOutcome = 'Success' | 'Failure' | 'Error' | 'Skipped';

/** Una fila de la tabla tSQLt.TestResult. */
export interface TestResultRow {
  Class: string;
  TestCase: string;
  Result: string;
  Msg: string | null;
  TestStartTime: Date | null;
  TestEndTime: Date | null;
}

export interface Summary {
  total: number;
  failures: number;
  errors: number;
  skipped: number;
}

export function summarise(rows: readonly TestResultRow[]): Summary {
  const count = (outcome: TestOutcome): number =>
    rows.filter((row) => row.Result === outcome).length;
  return {
    total: rows.length,
    failures: count('Failure'),
    errors: count('Error'),
    skipped: count('Skipped'),
  };
}

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// Se quitan los caracteres de control que XML 1.0 no admite (los saltos de línea y tabuladores sí)
function escapeXml(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const allowed = code === 9 || code === 10 || code === 13 || code >= 32;
    if (allowed) result += XML_ESCAPES[char] ?? char;
  }
  return result;
}

function seconds(row: TestResultRow): string {
  if (row.TestStartTime === null || row.TestEndTime === null) return '0.000';
  const elapsed = Math.max(0, row.TestEndTime.getTime() - row.TestStartTime.getTime());
  return (elapsed / 1000).toFixed(3);
}

function testCase(row: TestResultRow): string {
  const attributes = `classname="${escapeXml(row.Class)}" name="${escapeXml(row.TestCase)}" time="${seconds(row)}"`;
  const message = escapeXml(row.Msg ?? '');
  switch (row.Result) {
    case 'Success':
      return `    <testcase ${attributes}/>`;
    case 'Skipped':
      return `    <testcase ${attributes}><skipped/></testcase>`;
    case 'Failure':
      return `    <testcase ${attributes}><failure message="${message}">${message}</failure></testcase>`;
    default:
      return `    <testcase ${attributes}><error message="${message}">${message}</error></testcase>`;
  }
}

/** Genera un informe JUnit XML (testsuites > testsuite > testcase) agrupado por clase de pruebas. */
export function buildJUnitXml(rows: readonly TestResultRow[]): string {
  const classes = [...new Set(rows.map((row) => row.Class))];
  const suites = classes.map((name) => {
    const own = rows.filter((row) => row.Class === name);
    const summary = summarise(own);
    const time = own.reduce((total, row) => total + Number(seconds(row)), 0).toFixed(3);
    return [
      `  <testsuite name="${escapeXml(name)}" tests="${summary.total}" failures="${summary.failures}" errors="${summary.errors}" skipped="${summary.skipped}" time="${time}">`,
      ...own.map(testCase),
      '  </testsuite>',
    ].join('\n');
  });

  const all = summarise(rows);
  const time = rows.reduce((total, row) => total + Number(seconds(row)), 0).toFixed(3);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${all.total}" failures="${all.failures}" errors="${all.errors}" skipped="${all.skipped}" time="${time}">`,
    ...suites,
    '</testsuites>',
    '',
  ].join('\n');
}
