// The PNG container bits shared by the APNG reader and writer: signature, chunks, CRC.

export const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

export interface Chunk {
  type: string;
  /** View into the file's bytes; copy before keeping it past the source buffer. */
  data: Uint8Array;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIG.every((b, i) => bytes[i] === b);
}

/** Walks the chunks after the signature, stopping at IEND or at the first truncated chunk. */
export function* chunks(bytes: Uint8Array): Generator<Chunk> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  while (p + 12 <= bytes.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    if (p + 12 + len > bytes.length) return;
    yield { type, data: bytes.subarray(p + 8, p + 8 + len) };
    if (type === 'IEND') return;
    p += 12 + len;
  }
}

/** One serialized chunk: length, type, data, CRC over type and data. */
export function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
  return out;
}
