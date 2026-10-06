/**
 * Minimal PNG encoder (RGBA8, no filtering) for look-dev dumps and tests —
 * node only (uses `zlib`, imported lazily so the game bundle never pulls it).
 */

let crcTable: Uint32Array | null = null;

function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode RGBA8 rows (top-down) as a PNG, scaled up by a whole `zoom` (nearest). */
export async function encodePng(rgba: Uint8Array, w: number, h: number, zoom = 1, bg?: [number, number, number]): Promise<Uint8Array> {
  const zlib = await import('node:zlib');
  const W = w * zoom;
  const H = h * zoom;
  const raw = new Uint8Array(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / zoom);
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / zoom);
      const si = (sy * w + sx) * 4;
      const di = y * (W * 4 + 1) + 1 + x * 4;
      const a = rgba[si + 3];
      if (bg && a === 0) {
        raw[di] = bg[0];
        raw[di + 1] = bg[1];
        raw[di + 2] = bg[2];
        raw[di + 3] = 255;
      } else {
        raw[di] = rgba[si];
        raw[di + 1] = rgba[si + 1];
        raw[di + 2] = rgba[si + 2];
        raw[di + 3] = bg ? 255 : a === 0 ? 0 : 255;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = new Uint8Array(zlib.deflateSync(raw));
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Flip RGBA rows (texture rows bottom-up ↔ image rows top-down). */
export function flipRows(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < h; y++) out.set(rgba.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  return out;
}
