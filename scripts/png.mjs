/**
 * Minimal PNG reader / writer for the capture tools (node only, no dependencies):
 * 8-bit RGB / RGBA, non-interlaced — what Chromium's screenshots are.
 *
 *   const { w, h, data } = decodePng(buffer)   // data: RGBA8, rows top-down
 *   const buffer = encodePng(data, w, h)       // RGBA8 in, RGB PNG out (opaque)
 *   scale(img, 3)                              // whole-number nearest upscale
 *   sideBySide([a, b], gap)                    // images in a row
 */
import zlib from 'node:zlib';

let crcTable = null;
function crc32(buf) {
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

export function decodePng(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) throw new Error('not a PNG');
  let o = 8;
  let w = 0;
  let h = 0;
  let type = 6;
  const idat = [];
  while (o < buf.length) {
    const len = dv.getUint32(o);
    const tag = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]);
    if (tag === 'IHDR') {
      w = dv.getUint32(o + 8);
      h = dv.getUint32(o + 12);
      type = buf[o + 17];
      if (buf[o + 16] !== 8 || (type !== 2 && type !== 6) || buf[o + 20] !== 0) throw new Error('png: only 8-bit RGB / RGBA, non-interlaced');
    } else if (tag === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len));
    else if (tag === 'IEND') break;
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 3;
  const stride = w * bpp;
  const data = new Uint8Array(w * h * 4);
  const cur = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      data[q] = cur[x * bpp];
      data[q + 1] = cur[x * bpp + 1];
      data[q + 2] = cur[x * bpp + 2];
      data[q + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev.set(cur);
  }
  return { w, h, data };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(data, w, h) {
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    let d = y * (w * 3 + 1) + 1;
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      raw[d++] = data[q];
      raw[d++] = data[q + 1];
      raw[d++] = data[q + 2];
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))]);
}

/** Whole-number nearest upscale. */
export function scale(img, k) {
  const W = img.w * k;
  const H = img.h * k;
  const out = new Uint8Array(W * H * 4);
  const src = new Uint32Array(img.data.buffer, img.data.byteOffset, img.w * img.h);
  const dst = new Uint32Array(out.buffer);
  for (let y = 0; y < H; y++) {
    const sy = ((y / k) | 0) * img.w;
    for (let x = 0; x < W; x++) dst[y * W + x] = src[sy + ((x / k) | 0)];
  }
  return { w: W, h: H, data: out };
}

/** Every k-th pixel (the centre of each k × k block): a k× art frame back to 1:1. */
export function unscale(img, k) {
  const W = (img.w / k) | 0;
  const H = (img.h / k) | 0;
  const out = new Uint8Array(W * H * 4);
  const src = new Uint32Array(img.data.buffer, img.data.byteOffset, img.w * img.h);
  const dst = new Uint32Array(out.buffer);
  const o = k >> 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dst[y * W + x] = src[(y * k + o) * img.w + x * k + o];
  return { w: W, h: H, data: out };
}

/** Images laid in a grid (`cols` across), `gap` pixels of `bg` between them. */
export function grid(imgs, cols, gap = 4, bg = [10, 10, 14]) {
  const rows = Math.ceil(imgs.length / cols);
  const cw = Math.max(...imgs.map((i) => i.w));
  const ch = Math.max(...imgs.map((i) => i.h));
  const W = cols * cw + (cols - 1) * gap;
  const H = rows * ch + (rows - 1) * gap;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) out.set([bg[0], bg[1], bg[2], 255], i * 4);
  imgs.forEach((im, k) => {
    const ox = (k % cols) * (cw + gap);
    const oy = ((k / cols) | 0) * (ch + gap);
    for (let y = 0; y < im.h; y++) out.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((oy + y) * W + ox) * 4);
  });
  return { w: W, h: H, data: out };
}
