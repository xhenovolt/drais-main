/**
 * Minimal streaming ZIP writer (STORE method — images are already compressed).
 *
 * Why not a dependency: DRAIS needs exactly "write N files + a manifest into a
 * zip, one at a time, without holding them all in memory". That is ~100 lines
 * of the PKZIP spec; pulling in archiver/jszip would add a dependency tree for
 * it. Each entry is written as local header → bytes → data descriptor, so the
 * file is streamed and never buffered whole. Limits (no ZIP64): < 65,535
 * entries and < 4 GiB total — far above one school's photo library.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array, prev = 0): number {
  let c = (prev ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

interface CentralEntry { name: Buffer; crc: number; size: number; offset: number; time: number; date: number }

export class ZipWriter {
  private entries: CentralEntry[] = [];
  private offset = 0;
  constructor(private write: (chunk: Uint8Array) => void | Promise<void>) {}

  /** Add one file. `data` is written immediately; only its CRC/size are kept. */
  async add(name: string, data: Uint8Array, when = new Date()): Promise<void> {
    if (this.entries.length >= 65534) throw new Error('zip: too many entries');
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8');
    const { time, date } = dosDateTime(when);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);           // version needed
    header.writeUInt16LE(0x0800, 6);       // flags: UTF-8 names
    header.writeUInt16LE(0, 8);            // method: store
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    const offset = this.offset;
    await this.write(header); await this.write(nameBuf); await this.write(data);
    this.offset += header.length + nameBuf.length + data.length;
    if (this.offset > 0xffffffff) throw new Error('zip: archive exceeds 4 GiB');
    this.entries.push({ name: nameBuf, crc, size: data.length, offset, time, date });
  }

  /** Write the central directory. The archive is complete after this resolves. */
  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6);
      h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(0, 10);
      h.writeUInt16LE(e.time, 12); h.writeUInt16LE(e.date, 14);
      h.writeUInt32LE(e.crc, 16); h.writeUInt32LE(e.size, 20); h.writeUInt32LE(e.size, 24);
      h.writeUInt16LE(e.name.length, 28); h.writeUInt16LE(0, 30); h.writeUInt16LE(0, 32);
      h.writeUInt16LE(0, 34); h.writeUInt16LE(0, 36); h.writeUInt32LE(0, 38);
      h.writeUInt32LE(e.offset, 42);
      await this.write(h); await this.write(e.name);
      this.offset += h.length + e.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.entries.length, 8); end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - start, 12); end.writeUInt32LE(start, 16);
    end.writeUInt16LE(0, 20);
    await this.write(end);
  }
}
