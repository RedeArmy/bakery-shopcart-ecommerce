import { deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  content: string;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato de dos palabras de 16 bits que usa ZIP (MS-DOS). */
function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.max(at.getUTCFullYear(), 1980) - 1980;
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: (year << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

function header(size: number, write: (view: DataView) => void): Buffer {
  const buffer = Buffer.alloc(size);
  write(new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return buffer;
}

interface Packed {
  name: Buffer;
  raw: Buffer;
  packed: Buffer;
  crc: number;
}

const pack = (entry: ZipEntry): Packed => {
  const raw = Buffer.from(entry.content, 'utf8');
  return {
    name: Buffer.from(entry.name, 'utf8'),
    raw,
    packed: deflateRawSync(raw),
    crc: crc32(raw),
  };
};

function localHeader(file: Packed, stamp: { time: number; date: number }): Buffer {
  return header(30, (v) => {
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // nombres en UTF-8
    v.setUint16(8, 8, true); // DEFLATE
    v.setUint16(10, stamp.time, true);
    v.setUint16(12, stamp.date, true);
    v.setUint32(14, file.crc, true);
    v.setUint32(18, file.packed.length, true);
    v.setUint32(22, file.raw.length, true);
    v.setUint16(26, file.name.length, true);
  });
}

function centralHeader(
  file: Packed,
  stamp: { time: number; date: number },
  offset: number,
): Buffer {
  return header(46, (v) => {
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, 8, true);
    v.setUint16(12, stamp.time, true);
    v.setUint16(14, stamp.date, true);
    v.setUint32(16, file.crc, true);
    v.setUint32(20, file.packed.length, true);
    v.setUint32(24, file.raw.length, true);
    v.setUint16(28, file.name.length, true);
    v.setUint32(42, offset, true);
  });
}

/**
 * Un archivo ZIP con sus entradas comprimidas (DEFLATE) y los nombres en UTF-8. Es lo único que hace falta para un libro de
 * Excel (.xlsx), que es un ZIP de archivos XML: así no se agrega una dependencia para escribir una decena de archivos.
 */
export function createZip(entries: readonly ZipEntry[], at: Date): Buffer {
  const stamp = dosDateTime(at);
  const body: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const file of entries.map(pack)) {
    const local = localHeader(file, stamp);
    body.push(local, file.name, file.packed);
    directory.push(centralHeader(file, stamp, offset), file.name);
    offset += local.length + file.name.length + file.packed.length;
  }

  const central = Buffer.concat(directory);
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, entries.length, true);
    v.setUint16(10, entries.length, true);
    v.setUint32(12, central.length, true);
    v.setUint32(16, offset, true);
  });
  return Buffer.concat([...body, central, end]);
}
