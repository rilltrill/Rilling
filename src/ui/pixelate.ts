/**
 * Turns the procedural vector menu art into arcade-board pixel art: the SVG is
 * rasterised into a tiny canvas, quantised to a 15-bit-era palette with 4×4
 * ordered dithering, and shown scaled up with `image-rendering: pixelated`.
 * Results are cached per key; if anything fails the vector art stays visible.
 */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Colour levels per channel (7 → a 343-colour board). */
const LEVELS = 7;

const ready = new Map<string, HTMLCanvasElement>();
const loading = new Map<string, Promise<HTMLCanvasElement | null>>();

function rasterise(svg: string, w: number, h: number): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    try {
      const src = svg.replace(/^<svg\b/, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`);
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d');
          if (!g) return resolve(null);
          g.imageSmoothingEnabled = true;
          g.drawImage(img, 0, 0, w, h);
          try {
            const data = g.getImageData(0, 0, w, h);
            const d = data.data;
            const step = 255 / (LEVELS - 1);
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const th = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
                for (let ch = 0; ch < 3; ch++) {
                  const q = Math.round(d[i + ch] / step + th);
                  d[i + ch] = Math.max(0, Math.min(255, q * step));
                }
                d[i + 3] = 255;
              }
            }
            g.putImageData(data, 0, 0);
          } catch {
            /* tainted canvas (old WebKit) — keep the undithered low-res image */
          }
          resolve(c);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Append a pixelated rendering of `svg` (w × h board pixels) to `host`. The host
 * keeps the vector art until the pixel version is ready (class `px-ready`).
 */
export function pixelateInto(host: HTMLElement, key: string, svg: string, w: number, h: number) {
  const show = (src: HTMLCanvasElement) => {
    if (!host.isConnected) return; // the screen was closed while the art was rendering
    const c = document.createElement('canvas');
    c.className = 'px-art';
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')?.drawImage(src, 0, 0);
    host.appendChild(c);
    host.classList.add('px-ready');
  };
  const done = ready.get(key);
  if (done) return show(done);
  let p = loading.get(key);
  if (!p) {
    p = rasterise(svg, w, h).then((c) => {
      if (c) ready.set(key, c);
      loading.delete(key);
      return c;
    });
    loading.set(key, p);
  }
  void p.then((c) => c && show(c));
}
