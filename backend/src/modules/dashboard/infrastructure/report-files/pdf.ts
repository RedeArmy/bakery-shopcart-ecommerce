// cspell:disable
import { deflateSync } from 'node:zlib';
import type {
  Report,
  ReportColumn,
  ReportSection,
  ReportWriter,
} from '../../application/report-export.js';

// Hoja A4 vertical, en puntos (1 pt = 1/72 de pulgada), con el origen abajo a la izquierda
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const BOTTOM = 60;
const ROW_HEIGHT = 16;
const BODY_SIZE = 10;
const CELL_PADDING = 4;

/** Una línea ya colocada: su texto, dónde empieza y cómo se dibuja. */
interface Line {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  align: 'left' | 'right';
}

interface Band {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Page {
  lines: Line[];
  bands: Band[];
}

/** Anchos de la fuente Helvetica (por mil) de lo que más aparece: dígitos, separadores y la Q; el resto usa un promedio. */
function glyphWidth(char: string): number {
  if (char >= '0' && char <= '9') return 556;
  if (char === '.' || char === ',' || char === ' ' || char === ':' || char === '·') return 278;
  if (char === 'Q') return 778;
  if (char >= 'A' && char <= 'Z') return 667;
  return 520;
}

const textWidth = (text: string, size: number): number =>
  (Array.from(text).reduce((sum, char) => sum + glyphWidth(char), 0) * size) / 1000;

/** Recorta con «...» un texto que no cabe en el ancho dado. */
function fit(text: string, width: number, size: number): string {
  if (textWidth(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(`${cut}...`, size) > width) cut = cut.slice(0, -1);
  return `${cut}...`;
}

/** «1234567» como «1,234,567»: de tres en tres desde la derecha. */
function groupThousands(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(end - 3, 0), end));
  }
  return groups.join(',');
}

/** Un importe como se lee en una hoja: «Q 1,234.50». */
function money(value: string): string {
  const amount = Number(value);
  if (value.trim() === '' || !Number.isFinite(amount)) return value;
  const [whole = '0', cents = '00'] = Math.abs(amount).toFixed(2).split('.');
  const grouped = groupThousands(whole);
  return `${amount < 0 ? '-' : ''}Q ${grouped}.${cents}`;
}

const display = (column: ReportColumn, value: string): string =>
  column.kind === 'money' ? money(value) : value;

/**
 * Los anchos de las columnas. Cada una pide lo que necesita su contenido: si todas caben, sobran puntos y se reparten en
 * proporción; si no, las columnas cortas conservan lo que piden y la sobrante se reparte entre las largas, que son las que se
 * recortan. Así un nombre largo nunca estrecha el número de al lado.
 */
function columnWidths(section: ReportSection, available: number): number[] {
  const wanted = section.columns.map((column, i) => {
    const cells = section.rows.map((row) => textWidth(display(column, row[i] ?? ''), BODY_SIZE));
    return Math.max(textWidth(column.title, BODY_SIZE), ...cells) + CELL_PADDING * 2;
  });
  const total = wanted.reduce((sum, width) => sum + width, 0);
  if (total <= available) return wanted.map((width) => (width * available) / total);

  const widths = new Array<number>(wanted.length).fill(0);
  let remaining = available;
  const order = wanted.map((width, index) => ({ width, index })).sort((a, b) => a.width - b.width);
  order.forEach(({ width, index }, position) => {
    const share = remaining / (order.length - position);
    widths[index] = Math.min(width, share);
    remaining -= widths[index] ?? 0;
  });
  return widths;
}

class Layout {
  readonly pages: Page[] = [];
  private y = 0;

  constructor() {
    this.newPage();
  }

  private get page(): Page {
    const page = this.pages.at(-1);
    if (page === undefined) throw new TypeError('The layout has no page');
    return page;
  }

  newPage(): void {
    this.pages.push({ lines: [], bands: [] });
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Deja pasar a otra hoja si lo que sigue no cabe. Devuelve si hubo salto. */
  ensure(height: number): boolean {
    if (this.y - height >= BOTTOM) return false;
    this.newPage();
    return true;
  }

  gap(height: number): void {
    this.y -= height;
  }

  text(
    text: string,
    size: number,
    bold: boolean,
    x = MARGIN,
    align: 'left' | 'right' = 'left',
  ): void {
    this.y -= size + 4;
    this.page.lines.push({ text, x, y: this.y, size, bold, align });
  }

  row(
    section: ReportSection,
    widths: readonly number[],
    values: readonly string[],
    header: boolean,
  ): void {
    this.y -= ROW_HEIGHT;
    if (header) {
      this.page.bands.push({
        x: MARGIN,
        y: this.y - 4,
        width: PAGE_WIDTH - MARGIN * 2,
        height: ROW_HEIGHT,
      });
    }
    let x = MARGIN;
    section.columns.forEach((column, i) => {
      const width = widths[i] ?? 0;
      const shown = fit(display(column, values[i] ?? ''), width - CELL_PADDING * 2, BODY_SIZE);
      const right = column.kind !== 'text';
      this.page.lines.push({
        text: shown,
        x: right ? x + width - CELL_PADDING : x + CELL_PADDING,
        y: this.y,
        size: BODY_SIZE,
        bold: header,
        align: right ? 'right' : 'left',
      });
      x += width;
    });
  }
}

function layoutReport(report: Report): Page[] {
  const layout = new Layout();
  layout.text(report.title, 18, true);
  layout.text(report.subtitle, 11, false);
  layout.text(
    `Generado: ${report.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    9,
    false,
  );
  const available = PAGE_WIDTH - MARGIN * 2;

  for (const section of report.sections) {
    layout.gap(14);
    layout.ensure(ROW_HEIGHT * 3 + 20);
    layout.text(section.name, 13, true);
    layout.gap(4);
    const widths = columnWidths(section, available);
    const titles = section.columns.map((column) => column.title);
    layout.row(section, widths, titles, true);
    if (section.rows.length === 0) layout.text('Sin datos en el período.', BODY_SIZE, false);
    for (const values of section.rows) {
      if (layout.ensure(ROW_HEIGHT)) layout.row(section, widths, titles, true);
      layout.row(section, widths, values, false);
    }
  }
  return layout.pages;
}

/** El texto de una línea como lo entiende PDF con la codificación WinAnsi (Latin-1): lo que no cabe en ella se cambia por «?». */
function pdfString(text: string): string {
  const latin = Array.from(text)
    .map((char) => ((char.codePointAt(0) ?? 0) > 255 ? '?' : char))
    .join('');
  const escaped = latin.replaceAll(/[\\()]/g, String.raw`\$&`);
  return `(${escaped})`;
}

const num = (value: number): string => value.toFixed(2);

function pageContent(page: Page, number: number, total: number): string {
  const out: string[] = [];
  for (const band of page.bands) {
    out.push(
      `0.94 0.90 0.85 rg ${num(band.x)} ${num(band.y)} ${num(band.width)} ${num(band.height)} re f 0 g`,
    );
  }
  const footer: Line = {
    text: `Página ${String(number)} de ${String(total)}`,
    x: PAGE_WIDTH - MARGIN,
    y: 30,
    size: 9,
    bold: false,
    align: 'right',
  };
  for (const line of [...page.lines, footer]) {
    const x = line.align === 'right' ? line.x - textWidth(line.text, line.size) : line.x;
    out.push(
      `BT /${line.bold ? 'F2' : 'F1'} ${String(line.size)} Tf ${num(x)} ${num(line.y)} Td ${pdfString(line.text)} Tj ET`,
    );
  }
  return out.join('\n');
}

/** Documento PDF (1.4) con las tablas del reporte, escrito a mano con las fuentes estándar Helvetica: sin dependencias. */
export const pdfWriter: ReportWriter = {
  write(report) {
    const pages = layoutReport(report);
    const objects: Buffer[] = [];
    const add = (body: string | Buffer): number => {
      objects.push(Buffer.from(body));
      return objects.length;
    };
    const fontId = (name: string) =>
      add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`);

    // 1 catálogo, 2 páginas, 3 y 4 las fuentes; después, por hoja, su contenido y su descripción
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // el árbol de páginas se completa abajo, cuando se conocen los identificadores
    fontId('Helvetica');
    fontId('Helvetica-Bold');
    const pageIds: number[] = [];
    pages.forEach((page, index) => {
      const stream = deflateSync(Buffer.from(pageContent(page, index + 1, pages.length), 'latin1'));
      const contentId = add(
        Buffer.concat([
          Buffer.from(`<< /Length ${String(stream.length)} /Filter /FlateDecode >>\nstream\n`),
          stream,
          Buffer.from('\nendstream'),
        ]),
      );
      pageIds.push(
        add(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${String(contentId)} 0 R >>`,
        ),
      );
    });
    const kids = pageIds.map((id) => `${String(id)} 0 R`).join(' ');
    objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${String(pageIds.length)} >>`);

    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
    const offsets: number[] = [];
    let position = parts[0]?.length ?? 0;
    objects.forEach((body, index) => {
      offsets.push(position);
      const part = Buffer.concat([
        Buffer.from(`${String(index + 1)} 0 obj\n`),
        body,
        Buffer.from('\nendobj\n'),
      ]);
      parts.push(part);
      position += part.length;
    });
    const xref = [
      `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`,
      ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
      `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(position)}\n%%EOF\n`,
    ].join('');
    parts.push(Buffer.from(xref));
    return Buffer.concat(parts);
  },
};
