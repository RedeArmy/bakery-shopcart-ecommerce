import type {
  Report,
  ReportColumn,
  ReportSection,
  ReportWriter,
} from '../../application/report-export.js';
import { createZip } from './zip.js';
import type { ZipEntry } from './zip.js';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SHEET_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

// Los caracteres de control no existen en XML 1.0; el resto se escapa
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const escape = (value: string): string =>
  value
    .replace(CONTROL, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** A, B, … Z, AA: la letra de una columna (la primera es 0). */
export function columnName(index: number): string {
  let name = '';
  for (let k = index + 1; k > 0; k = Math.floor((k - 1) / 26)) {
    name = String.fromCodePoint(65 + ((k - 1) % 26)) + name;
  }
  return name;
}

// Estilos: 0 normal, 1 encabezado, 2 importe con formato de moneda, 3 entero, 4 título
const STYLES = `${XML}<styleSheet xmlns="${NS}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Q&quot;#,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE6DA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const stringCell = (ref: string, value: string, style: number): string =>
  `<c r="${ref}" t="inlineStr" s="${String(style)}"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;

/** Un valor de una columna de importes o de enteros va como número; si no se lee como tal, queda como texto. */
function valueCell(ref: string, value: string, column: ReportColumn): string {
  const numeric = column.kind !== 'text' && value.trim() !== '' && Number.isFinite(Number(value));
  if (!numeric) return stringCell(ref, value, 0);
  return `<c r="${ref}" s="${column.kind === 'money' ? '2' : '3'}"><v>${String(Number(value))}</v></c>`;
}

function columnWidths(section: ReportSection): string {
  return section.columns
    .map((column, i) => {
      const longest = Math.max(
        column.title.length,
        ...section.rows.map((row) => (row[i] ?? '').length),
      );
      const width = Math.min(Math.max(longest + 4, 12), 50);
      return `<col min="${String(i + 1)}" max="${String(i + 1)}" width="${String(width)}" customWidth="1"/>`;
    })
    .join('');
}

function sheetXml(section: ReportSection, report: Report): string {
  const header = section.columns.map((column, i) =>
    stringCell(`${columnName(i)}4`, column.title, 1),
  );
  const heading = `${report.title} · ${section.name}`;
  const rows = [
    `<row r="1">${stringCell('A1', heading, 4)}</row>`,
    `<row r="2">${stringCell('A2', report.subtitle, 0)}</row>`,
    `<row r="4">${header.join('')}</row>`,
    ...section.rows.map((values, index) => {
      const r = index + 5;
      const cells = section.columns.map((column, i) =>
        valueCell(`${columnName(i)}${String(r)}`, values[i] ?? '', column),
      );
      return `<row r="${String(r)}">${cells.join('')}</row>`;
    }),
  ];
  return `${XML}<worksheet xmlns="${NS}"><cols>${columnWidths(section)}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

function contentTypes(sections: readonly ReportSection[]): string {
  const sheets = sections.map(
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${String(i + 1)}.xml" ContentType="${SHEET_TYPE}.worksheet+xml"/>`,
  );
  return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${SHEET_TYPE}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${SHEET_TYPE}.styles+xml"/>${sheets.join('')}</Types>`;
}

function workbook(sections: readonly ReportSection[]): string {
  const sheets = sections.map(
    (section, i) =>
      `<sheet name="${escape(section.name.slice(0, 31))}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`,
  );
  return `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${sheets.join('')}</sheets></workbook>`;
}

function workbookRelationships(sections: readonly ReportSection[]): string {
  const sheets = sections.map(
    (_, i) =>
      `<Relationship Id="rId${String(i + 1)}" Type="${REL}/worksheet" Target="worksheets/sheet${String(i + 1)}.xml"/>`,
  );
  const styles = `<Relationship Id="rId${String(sections.length + 1)}" Type="${REL}/styles" Target="styles.xml"/>`;
  return `${XML}<Relationships xmlns="${PKG}">${sheets.join('')}${styles}</Relationships>`;
}

/** Libro de Excel (.xlsx): una hoja por tabla del reporte, con los importes y los enteros como números. */
export const xlsxWriter: ReportWriter = {
  write(report) {
    const sections = report.sections;
    const entries: ZipEntry[] = [
      { name: '[Content_Types].xml', content: contentTypes(sections) },
      {
        name: '_rels/.rels',
        content: `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      { name: 'xl/workbook.xml', content: workbook(sections) },
      { name: 'xl/_rels/workbook.xml.rels', content: workbookRelationships(sections) },
      { name: 'xl/styles.xml', content: STYLES },
      ...sections.map((section, i) => ({
        name: `xl/worksheets/sheet${String(i + 1)}.xml`,
        content: sheetXml(section, report),
      })),
    ];
    return createZip(entries, report.generatedAt);
  },
};
