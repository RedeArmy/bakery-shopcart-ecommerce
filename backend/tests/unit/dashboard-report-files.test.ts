// cspell:disable
import { inflateRawSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { collectReport } from '../../src/modules/dashboard/application/report-export.js';
import type { Report } from '../../src/modules/dashboard/application/report-export.js';
import type { DashboardRepository } from '../../src/modules/dashboard/application/dashboard-repository.js';
import { pdfWriter } from '../../src/modules/dashboard/infrastructure/report-files/pdf.js';
import {
  columnName,
  xlsxWriter,
} from '../../src/modules/dashboard/infrastructure/report-files/xlsx.js';
import { createZip } from '../../src/modules/dashboard/infrastructure/report-files/zip.js';

const AT = new Date('2030-06-15T14:30:00Z');

const report = (rows: number = 3): Report => ({
  title: 'Reporte de ventas',
  subtitle: 'Del 2030-06-01 al 2030-06-30',
  generatedAt: AT,
  sections: [
    {
      name: 'Resumen',
      columns: [
        { title: 'Indicador', kind: 'text' },
        { title: 'Valor', kind: 'text' },
      ],
      rows: [
        ['Pedidos pagados', '2'],
        ['Venta neta (Q)', '255.90'],
      ],
    },
    {
      name: 'Más vendidos',
      columns: [
        { title: '#', kind: 'integer' },
        { title: 'Producto', kind: 'text' },
        { title: 'Neto', kind: 'money' },
      ],
      rows: Array.from({ length: rows }, (_, i) => [
        String(i + 1),
        i === 0 ? 'Pastel <Tres> & "Leches" (ñandú)' : `Producto ${String(i + 1)}`,
        '1234.50',
      ]),
    },
  ],
});

/** Lee un ZIP (solo lo que escribe `createZip`) y devuelve sus archivos ya descomprimidos, comprobando su CRC y su tamaño. */
function unzip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const endAt = buffer.length - 22;
  expect(buffer.readUInt32LE(endAt)).toBe(0x06054b50);
  const count = buffer.readUInt16LE(endAt + 10);
  let cursor = buffer.readUInt32LE(endAt + 16);
  for (let i = 0; i < count; i += 1) {
    expect(buffer.readUInt32LE(cursor)).toBe(0x02014b50);
    const packedSize = buffer.readUInt32LE(cursor + 20);
    const rawSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const local = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    expect(buffer.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + buffer.readUInt16LE(local + 26);
    const raw = inflateRawSync(buffer.subarray(start, start + packedSize));
    expect(raw.length).toBe(rawSize);
    files.set(name, raw.toString('utf8'));
    cursor += 46 + nameLength;
  }
  return files;
}

describe('the zip writer', () => {
  it('writes entries that a reader can list, inflate and check', () => {
    const zip = unzip(
      createZip(
        [
          { name: 'a.txt', content: 'hello' },
          { name: 'dir/ñ.xml', content: '<x>'.repeat(500) },
        ],
        AT,
      ),
    );
    expect([...zip.keys()]).toEqual(['a.txt', 'dir/ñ.xml']);
    expect(zip.get('a.txt')).toBe('hello');
    expect(zip.get('dir/ñ.xml')).toHaveLength(1500);
  });

  it('stores the CRC of the content', () => {
    const buffer = createZip([{ name: 'a.txt', content: 'hello' }], AT);
    // CRC-32 de «hello»
    expect(buffer.readUInt32LE(14)).toBe(0x3610a686);
  });
});

describe('the Excel writer', () => {
  it('names the columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('writes the parts of a workbook, one sheet per table', () => {
    const files = unzip(xlsxWriter.write(report()));

    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    const workbook = files.get('xl/workbook.xml') ?? '';
    expect(workbook).toContain('<sheet name="Resumen" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="Más vendidos" sheetId="2" r:id="rId2"/>');
    // Cada parte es XML bien formado: toda etiqueta que se abre se cierra
    for (const [name, content] of files) {
      const opened = (content.match(/<(?![/?!])[^>]*[^/]>/g) ?? []).length;
      const closed = (content.match(/<\/[^>]+>/g) ?? []).length;
      expect(opened, name).toBe(closed);
    }
  });

  it('writes amounts and integers as numbers and the rest as escaped text', () => {
    const sheet = unzip(xlsxWriter.write(report())).get('xl/worksheets/sheet2.xml') ?? '';

    expect(sheet).toContain('<c r="A5" s="3"><v>1</v></c>');
    expect(sheet).toContain('<c r="C5" s="2"><v>1234.5</v></c>');
    expect(sheet).toContain('Pastel &lt;Tres&gt; &amp; &quot;Leches&quot; (ñandú)');
    expect(sheet).toContain('Reporte de ventas · Más vendidos');
    expect(sheet).toContain('Del 2030-06-01 al 2030-06-30');
  });

  it('keeps a value that is not a number as text in a number column and drops control characters', () => {
    const odd = report();
    const section = odd.sections[1];
    if (section === undefined) throw new TypeError('missing section');
    const changed: Report = {
      ...odd,
      sections: [{ ...section, rows: [['x', 'a\u0001b', '']] }],
    };
    const sheet = unzip(xlsxWriter.write(changed)).get('xl/worksheets/sheet1.xml') ?? '';
    expect(sheet).toContain('t="inlineStr" s="0"><is><t xml:space="preserve">x</t>');
    expect(sheet).toContain('>ab<');
    expect(sheet).not.toContain('\u0001');
  });
});

/** Los objetos de un PDF escrito por `pdfWriter`, leídos con su tabla de referencias. */
function readPdf(buffer: Buffer) {
  const text = buffer.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
  expect(text.slice(startxref, startxref + 4)).toBe('xref');
  const size = Number(/\/Size (\d+)/.exec(text)?.[1]);
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
    Number(m[1]),
  );
  expect(offsets).toHaveLength(size - 1);
  // Cada entrada de la tabla apunta al «n 0 obj» que dice ser
  offsets.forEach((offset, index) => {
    expect(text.slice(offset).startsWith(`${String(index + 1)} 0 obj`)).toBe(true);
  });
  const pages = Number(/\/Count (\d+)/.exec(text)?.[1]);
  const streams = [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) =>
    inflateSync(Buffer.from(m[1] ?? '', 'latin1')).toString('latin1'),
  );
  return { text, pages, streams };
}

describe('the PDF writer', () => {
  it('writes a well formed document with a cross reference table that points to every object', () => {
    const { pages, streams } = readPdf(pdfWriter.write(report()));
    expect(pages).toBe(1);
    expect(streams).toHaveLength(1);
  });

  it('writes the title, the tables and the page footer', () => {
    const [content = ''] = readPdf(pdfWriter.write(report())).streams;

    expect(content).toContain('(Reporte de ventas) Tj');
    expect(content).toContain('(Del 2030-06-01 al 2030-06-30) Tj');
    expect(content).toContain('(Generado: 2030-06-15 14:30 UTC) Tj');
    expect(content).toContain('(Resumen) Tj');
    expect(content).toContain('(Q 1,234.50) Tj');
    expect(content).toContain('(P\u00e1gina 1 de 1) Tj');
    // El paréntesis del texto va escapado y la ñ entra en Latin-1 (0xF1)
    expect(content).toContain('Pastel <Tres> & "Leches" \\(\u00f1and\u00fa\\)');
  });

  it('continues on a new page, with the header of the table again', () => {
    const { pages, streams } = readPdf(pdfWriter.write(report(120)));

    expect(pages).toBeGreaterThan(1);
    expect(streams).toHaveLength(pages);
    for (const [index, content] of streams.entries()) {
      expect(content).toContain(`(P\u00e1gina ${String(index + 1)} de ${String(pages)}) Tj`);
    }
    // El encabezado «Producto» se repite en cada hoja que continúa la tabla
    expect(streams.at(-1)).toContain('(Producto) Tj');
  });

  it('says so when a table has no rows, shortens what does not fit and replaces what Latin-1 cannot write', () => {
    const base = report(1);
    const section = base.sections[1];
    if (section === undefined) throw new TypeError('missing section');
    const changed: Report = {
      ...base,
      sections: [
        { ...section, rows: [] },
        { ...section, name: 'Largo', rows: [['1', `${'M'.repeat(200)} \u4e2d`, '-5']] },
      ],
    };
    const [content = ''] = readPdf(pdfWriter.write(changed)).streams;

    expect(content).toContain('(Sin datos en el per\u00edodo.) Tj');
    expect(content).toContain('...) Tj');
    expect(content).not.toContain('\u4e2d');
    expect(content).toContain('(-Q 5.00) Tj');
  });
});

describe('the report collection', () => {
  const rows = {
    summary: {
      fromDate: '2030-06-01',
      toDate: '2030-06-30',
      orders: 2,
      gross: '300.00',
      returned: '44.10',
      net: '255.90',
      averageTicket: '127.95',
      pendingPaymentOrders: 1,
      depositsUnderReview: 0,
      abandonedCarts: 4,
    },
    salesByPeriod: [
      {
        periodStart: '2030-06-01',
        orders: 2,
        gross: '300.00',
        returned: '44.10',
        net: '255.90',
        averageTicket: '127.95',
      },
    ],
    salesByCategory: [{ categoryName: 'Cakes', orders: 2, units: 3, net: '255.90' }],
    topProducts: [{ position: 1, productName: 'Milk cake', units: 3, net: null }],
  };
  const repository = {
    summary: () => Promise.resolve(rows.summary),
    salesByPeriod: () => Promise.resolve(rows.salesByPeriod),
    salesByCategory: () => Promise.resolve(rows.salesByCategory),
    topProducts: () => Promise.resolve(rows.topProducts),
  } as unknown as DashboardRepository;

  it('gathers the four reports of the dashboard in four tables', async () => {
    const collected = await collectReport(repository, { from: null, to: null }, 'day', 10, AT);

    expect(collected.subtitle).toBe('Del 2030-06-01 al 2030-06-30');
    expect(collected.generatedAt).toBe(AT);
    expect(collected.sections.map((section) => section.name)).toEqual([
      'Resumen',
      'Ventas por período',
      'Ventas por categoría',
      'Más vendidos',
    ]);
    const [summary, sales, categories, top] = collected.sections;
    expect(summary?.rows[0]).toEqual(['Pedidos pagados', '2']);
    expect(summary?.rows[3]).toEqual(['Venta neta (Q)', '255.90']);
    expect(summary?.rows.at(-1)).toEqual(['Carritos abandonados', '4']);
    expect(sales?.rows[0]).toEqual(['2030-06-01', '2', '300.00', '44.10', '255.90', '127.95']);
    expect(categories?.rows[0]).toEqual(['Cakes', '2', '3', '255.90']);
    // Un valor que falta queda vacío, no «null»
    expect(top?.rows[0]).toEqual(['1', 'Milk cake', '3', '']);
  });
});
