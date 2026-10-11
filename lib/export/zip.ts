/**
 * Archivio ZIP senza compressione ("store"): basta a mettere insieme i file dell'export
 * senza aggiungere una libreria. I dati di una persona pesano pochi megabyte.
 */

export type ZipEntry = { name: string; data: Uint8Array };

let table: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Data e ora nel formato MS-DOS usato dagli ZIP (ora locale del dispositivo). */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const UTF8_NAMES = 0x0800;

export function createZip(entries: ZipEntry[], modified: Date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);
  const files = entries.map((e) => ({ name: encoder.encode(e.name), data: e.data, crc: crc32(e.data) }));
  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  const out = new Uint8Array(new ArrayBuffer(localSize + centralSize + 22));
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;

  for (const f of files) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, UTF8_NAMES, true);
    view.setUint16(p + 8, 0, true);
    view.setUint16(p + 10, time, true);
    view.setUint16(p + 12, date, true);
    view.setUint32(p + 14, f.crc, true);
    view.setUint32(p + 18, f.data.length, true);
    view.setUint32(p + 22, f.data.length, true);
    view.setUint16(p + 26, f.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(f.name, p + 30);
    out.set(f.data, p + 30 + f.name.length);
    p += 30 + f.name.length + f.data.length;
  }

  const centralStart = p;
  files.forEach((f, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, UTF8_NAMES, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, time, true);
    view.setUint16(p + 14, date, true);
    view.setUint32(p + 16, f.crc, true);
    view.setUint32(p + 20, f.data.length, true);
    view.setUint32(p + 24, f.data.length, true);
    view.setUint16(p + 28, f.name.length, true);
    // Campi extra, commento, disco, attributi interni ed esterni: tutti a zero.
    view.setUint32(p + 42, offsets[i], true);
    out.set(f.name, p + 46);
    p += 46 + f.name.length;
  });

  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 8, files.length, true);
  view.setUint16(p + 10, files.length, true);
  view.setUint32(p + 12, centralSize, true);
  view.setUint32(p + 16, centralStart, true);
  return out;
}
