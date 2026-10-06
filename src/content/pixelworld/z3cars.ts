import type { PwCanvas } from './canvas';
import type { PwAtlas, PwTile } from './atlas';
import { neutral, NEUTRAL_HEX } from './retexture';
import { hash2 } from './surfaces';
import { dith, fill, G, rivet, rustRun, wscatter } from './z3kit';

/**
 * HIGHWAY TO HELL (z3) cars for ART: PIXEL WORLD. A car is painted in two
 * layers so one set of tiles serves every paint job:
 *  - the PAINT layer: NEUTRAL tiles (painted round a light grey, tinted per car
 *    by vertex colour) — the side's shading (lit shoulder, the belt-line crease,
 *    the darker rocker), glossy tops with a sky streak;
 *  - the DETAIL layer: cut-out modules in their own colours laid just over the
 *    paint — wheel arches, door seams and handles, the nose (grille, lamps,
 *    plate), the tail (lights, trunk lip), rust, scrapes, dents, the police
 *    livery — and the glass (dusk sky reflected over a dark cabin with
 *    headrests; windscreen wipers, mirror and visor; cracks on the wrecks).
 * Wheels: rubber tread wrapped round, hubcap discs. Burnt-out wrecks get their
 * own charred shell, empty window holes and bare rims.
 * Car kinds: 0 sedan, 1 hatch, 2 SUV, 3 van (4 = police, the sedan's shape).
 */

export interface CarDims {
  len: number;
  w: number;
  bodyH: number;
  cabH: number;
  cabLen: number;
}

const TPM = 32;
const px = (m: number) => Math.max(4, Math.round(m * TPM));

/** Shading of the paint layer (neutral) for a side `h` texels tall: wrap 64 × h. */
export function z3CarPaintSide(atlas: PwAtlas, h: number): PwTile {
  return neutral(
    atlas.tile(`z3carside|${h}`, 64, Math.ceil(h / 16) * 16, (c, k) => {
      const p = k.ramp(NEUTRAL_HEX, { light: 0.6, dark: 0.35, sat: 0 });
      const H = c.h;
      fill(c, p, 3);
      // Rows from the top of the (padded) tile: the body occupies the bottom `h` rows.
      const top = H - h;
      for (let y = top; y < H; y++) {
        const r = (y - top) / h;
        const t = r < 0.08 ? 4.2 : r < 0.18 ? 3.6 : r < 0.24 ? 4.6 : r < 0.3 ? 2.4 : r < 0.72 ? 3 : r < 0.88 ? 2.4 : 1.8;
        c.hline(0, y, 64, p, t);
      }
      // A soft reflection break (the horizon) across the door skins.
      for (let x = 0; x < 64; x++) if (hash2(x >> 3, 0, 5) > 0.5) c.set(x, top + Math.round(h * 0.5), p, 3.4);
    }, { wrap: true }),
  );
}

/** Glossy paint for hoods, roofs, trunks and van sides (neutral wrap 64 × 64): a sky streak, a few swirls. */
export function z3CarPaintTop(atlas: PwAtlas): PwTile {
  return neutral(
    atlas.tile('z3cartop', 64, 64, (c, k) => {
      const p = k.ramp(NEUTRAL_HEX, { light: 0.6, dark: 0.35, sat: 0 });
      fill(c, p, 3);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const d = (x + y * 0.5) % 64;
        if (d > 20 && d < 27) c.tone[y * 64 + x] = d < 22 || d > 25 ? 3.5 : 4.2;
      }
      wscatter(c, k.rng, 0, 0, 64, 64, 14, 0, -0.6, { shapes: 2 });
    }, { wrap: true }),
  );
}

/** The side DETAIL layer (cut out): arches, seams, handles, trim, rust / scrapes (`v` 0 clean, 1 worn, 2 police livery). */
export function z3CarSideDetail(atlas: PwAtlas, kind: number, d: CarDims, v: number): PwTile {
  const W = px(d.len);
  const H = px(d.bodyH);
  return atlas.tile(`z3cardet|${kind}|${W}|${H}|${v}`, W, H, (c, k) => {
    const rng = k.rng;
    const black = k.ramp(0x18181c, { light: 0.4 });
    const chrome = k.ramp(0x9a9ca4, { light: 0.6, sat: 0.4 });
    const rust = k.ramp(0x7a3c1c, { light: 0.45 });
    const primer = k.ramp(0x8a8478, { light: 0.4 });
    const amber = k.ramp(0xe08a20, { light: 0.5 });
    const white = k.ramp(0xeeeae2, { light: 0.4 });
    const wr = (kind === 2 ? 0.42 : kind === 3 ? 0.38 : 0.34) * TPM;
    const baseRow = H; // y = H is the body's bottom edge (baseY)
    // Arches: half discs round each wheel (u = 0 at the nose).
    for (const wz of [0.85, d.len - 0.85]) {
      const cx = wz * TPM;
      const cy = baseRow - 0.1 * wr;
      const r = wr * 1.25;
      for (let y = Math.floor(cy - r); y < H; y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dd > r) continue;
          c.set(x, y, black, dd > r - 1.5 ? 2.6 : 0.6);
        }
      }
      // Rubber flare rim.
      for (let a = 0; a <= 20; a++) {
        const t = Math.PI + (a / 20) * Math.PI;
        c.set(Math.round(cx + Math.cos(t) * (r + 0.6)), Math.round(cy + Math.sin(t) * (r + 0.6)), black, 1.6);
      }
    }
    // Rocker trim strip and the belt-line chrome.
    for (let x = 0; x < W; x++) {
      if (!c.at(x, H - 2)) c.set(x, H - 2, black, 2);
      if (kind !== 3) c.set(x, 2, chrome, hash2(x >> 2, 0, 3) > 0.3 ? 3.6 : 4.6);
    }
    // Door seams + handles.
    const seams = kind === 1 ? [1.15, 2.35] : kind === 3 ? [0.95, 1.95, 3.6] : [1.2, 2.3, 3.35];
    for (const sz of seams) {
      const x = Math.round(sz * TPM);
      for (let y = 3; y < H - 3; y++) if (!c.at(x, y)) c.set(x, y, black, 1.4);
    }
    for (const sz of kind === 1 ? [1.95] : kind === 3 ? [1.6, 2.6] : [2.0, 3.05]) {
      const x = Math.round(sz * TPM);
      c.hline(x, 4, 4, chrome, 4);
      c.hline(x, 5, 4, black, 1.6);
    }
    if (kind === 3) {
      // Van cab door window (the dusk in it), the sliding door's track.
      const sky = k.ramp(0xb87278, { light: 0.55, sat: 0.9 });
      const cab = k.ramp(0x2a2232, { light: 0.4 });
      const x0 = Math.round(0.3 * TPM);
      const x1 = Math.round(0.9 * TPM);
      for (let y = 3; y < Math.round(H * 0.32); y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const edge = x < x0 || x > x1 || y === 3;
        c.set(x, y, edge ? black : dith(x, y, 1 - (y - 3) / (H * 0.3)) ? sky : cab, edge ? 2 : 3);
      }
      c.hline(Math.round(1.0 * TPM), Math.round(H * 0.36), Math.round(1.9 * TPM), black, 1.6);
    }
    // Side marker at the nose, fuel cap at the tail.
    c.rect(3, Math.round(H * 0.35), 3, 2, amber, 4);
    const fx = W - Math.round(1.1 * TPM);
    c.rect(fx, 5, 4, 3, black, 2.4);
    c.set(fx, 5, black, 3.4);
    if (v === 1) {
      // Worn: rust bubbling along the rocker and the arches, a long scrape to primer, dents.
      for (let i = 0; i < 18; i++) {
        const x = rng.int(0, W - 1);
        const y = rng.int(H - 6, H - 3);
        if (!c.at(x, y)) c.cluster(x, y, rng.int(0, 5), rust, rng.chance(0.5) ? 3 : 2);
      }
      const sy = rng.int(6, H - 6);
      const sx = rng.int(10, W - 50);
      for (let j = 0; j < rng.int(30, 50); j++) {
        const y = sy + Math.round(Math.sin(j * 0.1) * 1.5);
        if (!c.at(sx + j, y)) c.set(sx + j, y, primer, hash2(j, 0, 7) > 0.5 ? 4 : 3);
      }
      for (let i = 0; i < 3; i++) rustRun(c, rng, rng.int(4, W - 4), H - 6, 4, rust);
      const dx = rng.int(20, W - 20);
      for (let y = 4; y < H - 4; y++) for (let x = dx - 3; x <= dx + 3; x++) if (!c.at(x, y) && hash2(x, y, 9) > 0.55) c.set(x, y, black, 2.4);
    }
    if (v === 2 || v === 3) {
      // Police: black door panels with the shield and POLICE lettering (v 3: drawn mirrored for the
      // side laid with flipU, so it reads the right way round there too).
      const x0 = Math.round(1.25 * TPM);
      const x1 = Math.round(3.3 * TPM);
      for (let y = 4; y < H - 3; y++) for (let x = x0; x < x1; x++) if (!c.at(x, y)) c.set(x, y, black, 2.2);
      const letters = 'POLICE';
      const lx = x0 + 10;
      const mir = (x: number) => (v === 3 ? x0 + x1 - 1 - x : x);
      for (let i = 0; i < letters.length; i++) {
        const gx = lx + i * 5;
        for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (glyph35(letters[i], x, y)) c.set(mir(gx + x), 8 + y, white, 4);
      }
      // Star shield (after the lettering, mirrored with it).
      const sxx = x1 - 12;
      for (let y = 0; y < 7; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) <= 3 - Math.abs(y - 3) * 0.6) c.set(mir(sxx + x), 7 + y, k.ramp(0xd8b040, { light: 0.5 }), y < 3 ? 4 : 3);
    }
  });
}

/** Tiny 3×5 glyphs for livery lettering (a few caps). */
function glyph35(ch: string, x: number, y: number): boolean {
  const G3: Record<string, string> = {
    P: '111101111100100',
    O: '111101101101111',
    L: '100100100100111',
    I: '111010010010111',
    C: '111100100100111',
    E: '111100110100111',
  };
  const s = G3[ch];
  return !!s && s[y * 3 + x] === '1';
}

/** Glass: dusk reflected over a dark cabin (headrests), black trim; `kind` sets the window split. w × h texels. */
export function z3CarGlassSide(atlas: PwAtlas, kind: number, d: CarDims, burnt = false): PwTile {
  const W = px(d.cabLen);
  const H = px(d.cabH);
  return atlas.tile(`z3glass|${kind}|${W}|${H}|${burnt ? 1 : 0}`, W, H, (c, k) => {
    const trim = k.ramp(0x16161a, { light: 0.4 });
    const sky = k.ramp(0xb87278, { light: 0.55, sat: 0.9 });
    const cab = k.ramp(0x2a2232, { light: 0.4 });
    const char = k.ramp(0x1a1416, { light: 0.4 });
    const ash = k.ramp(0x6a625e, { light: 0.4 });
    fill(c, trim, 2);
    // Windows with a slanted front / rear edge (the trapezoid's own slant is in the geometry).
    const split = kind === 1 ? [0.55] : [0.5];
    const xs = [2, ...split.map((s) => Math.round(s * W)), W - 2];
    for (let wi = 0; wi < xs.length - 1; wi++) {
      for (let y = 2; y < H - 1; y++) {
        for (let x = xs[wi] + (wi > 0 ? 2 : 0); x < xs[wi + 1] - 1; x++) {
          if (burnt) {
            c.set(x, y, char, hash2(x, y, 3) > 0.85 ? 2 : 0.6);
            continue;
          }
          const r = (y - 2) / (H - 3);
          // Upper rows: the sky reflected (dithered into the cabin), a diagonal glint.
          const glint = (x + y * 2) % 40 < 3;
          if (dith(x, y, 1 - r * 1.6)) c.set(x, y, sky, glint ? 5 : r < 0.2 ? 4 : 3);
          else c.set(x, y, cab, 2);
        }
      }
      // A headrest silhouette in each window.
      if (!burnt) {
        const hx = Math.round((xs[wi] + xs[wi + 1]) / 2);
        for (let y = H - 6; y < H - 2; y++) for (let x = hx - 2; x <= hx + 2; x++) c.set(x, y, cab, 1);
      } else for (let i = 0; i < 6; i++) c.set(xs[wi] + 3 + i * 3, H - 3, ash, 3);
    }
    c.hline(0, 0, W, trim, 3);
  });
}

/** Windscreen / rear window (front-on): sky bands, wipers, mirror, visor shadow; `v` 0 clean, 1 cracked, 2 rear (defroster lines), 3 burnt hole. */
export function z3CarScreen(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z3screen|${v}`, 48, 24, (c, k) => {
    const trim = k.ramp(0x16161a, { light: 0.4 });
    const sky = k.ramp(0xc07a78, { light: 0.55, sat: 0.9 });
    const sky2 = k.ramp(0x6a4a6a, { light: 0.5 });
    const cab = k.ramp(0x2a2232, { light: 0.4 });
    const char = k.ramp(0x1a1416, { light: 0.4 });
    fill(c, trim, 2);
    for (let y = 2; y < 22; y++) {
      for (let x = 2; x < 46; x++) {
        if (v === 3) {
          c.set(x, y, char, hash2(x, y, 3) > 0.9 ? 2 : 0.6);
          continue;
        }
        const r = (y - 2) / 20;
        const band = r < 0.25 ? 0 : r < 0.5 ? 1 : 2;
        if (band === 0 || (band === 1 && dith(x, y, 0.6))) c.set(x, y, sky, r < 0.12 ? 4 : 3);
        else if (band === 1 || dith(x, y, 0.3)) c.set(x, y, sky2, 3);
        else c.set(x, y, cab, 2);
        if ((x - y * 1.4 + 200) % 34 < 2) c.shift(x, y, 1.5);
      }
    }
    if (v === 0 || v === 1) {
      // Mirror, visor shadow, wipers resting at the bottom.
      c.rect(22, 3, 5, 2, trim, 1.6);
      c.hline(3, 2, 42, trim, 1.4);
      for (let i = 0; i < 16; i++) {
        c.set(6 + i, 20 - (i >> 3), trim, 1.4);
        c.set(26 + i, 20 - (i >> 3), trim, 1.4);
      }
    }
    if (v === 1) {
      // Spider crack from an impact.
      const white = k.ramp(0xe8e8f0, { light: 0.4 });
      const cx = 30;
      const cy = 10;
      for (let a = 0; a < 7; a++) {
        const t = (a / 7) * Math.PI * 2 + 0.3;
        for (let r = 1; r < 12; r++) c.set(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r * 0.7), white, 4);
      }
      c.set(cx, cy, white, 5);
    }
    if (v === 2) for (let y = 6; y < 20; y += 3) for (let x = 6; x < 42; x++) if (!(x & 1)) c.shift(x, y, -0.8);
  });
}

/** The nose (cut out, over the paint): grille, headlamps (`lit` glow), indicators, plate, bumper shadow. W × H for the car's width / body height. */
export function z3CarNose(atlas: PwAtlas, kind: number, d: CarDims, lit: boolean, burnt = false): PwTile {
  const W = px(d.w);
  const H = px(kind === 3 ? 0.9 : d.bodyH);
  return atlas.tile(`z3nose|${kind}|${W}|${H}|${lit ? 1 : 0}|${burnt ? 1 : 0}`, W, H, (c, k) => {
    const black = k.ramp(0x18181c, { light: 0.4 });
    const chrome = k.ramp(burnt ? 0x5a3a2a : 0xa0a2aa, { light: 0.6, sat: 0.4 });
    const lamp = k.ramp(lit ? 0xfff0c8 : 0xc8c8c0, { light: 0.6, sat: 0.5 });
    const amber = k.ramp(0xe08a20, { light: 0.5 });
    const plate = k.ramp(0xe8e4d0, { light: 0.4 });
    const gy0 = Math.round(H * 0.32);
    const gy1 = Math.round(H * 0.68);
    const lw = Math.round(W * 0.2);
    // Grille between the lamps: bars.
    for (let y = gy0; y < gy1; y++) for (let x = lw + 3; x < W - lw - 3; x++) c.set(x, y, black, (y - gy0) % 2 === 0 ? 2.4 : 0.8);
    c.hline(lw + 3, gy0 - 1, W - 2 * lw - 6, chrome, 4.4);
    // Headlamps (a bright lens with a lit rim) + indicators under them.
    for (const x0 of [2, W - lw - 2]) {
      for (let y = gy0; y < gy1 - 1; y++) for (let x = x0; x < x0 + lw; x++) {
        if (burnt) c.set(x, y, black, 0.8);
        else c.set(x, y, lamp, lit ? (y === gy0 ? 5 : 4) : y === gy0 ? 4.4 : 3, lit ? G : 0);
      }
      if (!burnt) c.rect(x0, gy1, lw, 2, amber, 3.6);
    }
    // Plate on the bumper line, a shadow band under the nose.
    if (!burnt) {
      const pw = Math.min(16, W >> 2);
      c.rect((W - pw) >> 1, H - 6, pw, 4, plate, 3);
      c.hline(((W - pw) >> 1) + 2, H - 4, pw - 4, black, 2);
    }
    c.hline(0, H - 1, W, black, 1.2);
  });
}

/** The tail (cut out): tail lights (`lit` glow), trunk lip, plate, exhaust. */
export function z3CarTail(atlas: PwAtlas, kind: number, d: CarDims, lit: boolean, burnt = false): PwTile {
  const W = px(d.w);
  const H = px(kind === 3 ? 1.9 : d.bodyH);
  return atlas.tile(`z3tail|${kind}|${W}|${H}|${lit ? 1 : 0}|${burnt ? 1 : 0}`, W, H, (c, k) => {
    const black = k.ramp(0x18181c, { light: 0.4 });
    const red = k.ramp(0xd02018, { light: 0.55, sat: 1.1 });
    const plate = k.ramp(0xe8e4d0, { light: 0.4 });
    const chrome = k.ramp(0x9a9ca4, { light: 0.6, sat: 0.4 });
    const ly0 = kind === 3 ? Math.round(H * 0.55) : Math.round(H * 0.18);
    const lh = kind === 3 ? Math.round(H * 0.22) : Math.round(H * 0.32);
    const lw = Math.round(W * 0.18);
    for (const x0 of [1, W - lw - 1]) {
      for (let y = ly0; y < ly0 + lh; y++) for (let x = x0; x < x0 + lw; x++) {
        if (burnt) c.set(x, y, black, 0.8);
        else c.set(x, y, red, lit ? (y === ly0 ? 5 : 4) : y === ly0 ? 3.6 : 2.6, lit ? G : 0);
      }
    }
    if (kind === 3) {
      // Twin rear doors: the centre seam, handles, windows high up.
      for (let y = 2; y < H - 3; y++) c.set(W >> 1, y, black, 1.2);
      for (const x0 of [4, (W >> 1) + 3]) {
        for (let y = 4; y < Math.round(H * 0.38); y++) for (let x = x0; x < x0 + (W >> 1) - 7; x++) c.set(x, y, burnt ? black : k.ramp(0x6a4a6a, { light: 0.5 }), y < 8 ? 3.4 : 2.4);
      }
      c.hline((W >> 1) - 4, Math.round(H * 0.5), 3, chrome, 4);
      c.hline((W >> 1) + 2, Math.round(H * 0.5), 3, chrome, 4);
    } else c.hline(lw + 2, ly0, W - 2 * lw - 4, chrome, 4.2);
    if (!burnt) {
      const pw = Math.min(16, W >> 2);
      c.rect((W - pw) >> 1, H - 7, pw, 4, plate, 3);
      c.hline(((W - pw) >> 1) + 2, H - 5, pw - 4, black, 2);
    }
    c.rect(W - lw - 2, H - 2, 3, 2, black, 0.6);
  });
}

/** Tyre tread (wrap 32 × 16 round the wheel): blocks, a worn shoulder; `burnt` = bare charred rim. */
export function z3TyreTile(atlas: PwAtlas, burnt = false): PwTile {
  return atlas.tile(`z3tyre|${burnt ? 1 : 0}`, 32, 16, (c, k) => {
    const r = k.ramp(burnt ? 0x3a2a22 : 0x1e1e22, { light: 0.4 });
    fill(c, r, 2);
    for (let x = 0; x < 32; x += 4) for (let y = 2; y < 14; y++) c.set(x + ((y >> 2) & 1), y, r, burnt ? 3 : 1);
    c.hline(0, 0, 32, r, 3);
    c.hline(0, 15, 32, r, 3);
  }, { wrap: true });
}

/** Wheel face (disc module 24 × 24): steel rim + hubcap / bare rusty rim. */
export function z3WheelFace(atlas: PwAtlas, v: number): PwTile {
  return atlas.tile(`z3wheel|${v}`, 24, 24, (c, k) => {
    const tyre = k.ramp(0x1e1e22, { light: 0.4 });
    const cap = k.ramp(v === 2 ? 0x5a3a26 : v === 1 ? 0x2a2a30 : 0xb8bac2, { light: 0.6, sat: 0.4 });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - 11.5, y - 11.5);
      if (d > 12) continue;
      if (d > 7.5 || v === 2) c.set(x, y, v === 2 && d < 7.5 ? cap : tyre, d > 11 ? 1 : 2.2);
      else c.set(x, y, cap, d > 6.5 ? 2 : (x + y) < 22 ? 4 : 3);
    }
    if (v !== 2) for (let a = 0; a < 5; a++) {
      const t = (a / 5) * Math.PI * 2;
      c.set(Math.round(11.5 + Math.cos(t) * 4), Math.round(11.5 + Math.sin(t) * 4), cap, 1.4);
    }
    c.set(11, 11, cap, 5);
  });
}

/** Burnt-out shell (wrap 64 × 64): charred black-brown, rust blooms, blistered paint ghosts, ash. */
export function z3BurntShell(atlas: PwAtlas): PwTile {
  return atlas.tile('z3burnt', 64, 64, (c, k) => {
    const rng = k.rng;
    const ch = k.ramp(0x2a2226, { light: 0.45 });
    const rust = k.ramp(0x6a3a22, { light: 0.45 });
    const ghost = k.ramp(0x5a5a5e, { light: 0.4 });
    fill(c, ch, 2.6);
    for (let i = 0; i < 9; i++) {
      const cx = rng.int(0, 63);
      const cy = rng.int(0, 63);
      const r = rng.int(4, 10);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) + hash2(cx + x, cy + y, 3) * 3;
        if (d > r) continue;
        const xx = (cx + x + 64) % 64;
        const yy = (cy + y + 64) % 64;
        c.set(xx, yy, rust, d < r * 0.5 ? 3 : 2.4);
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = rng.int(0, 63);
      const y = rng.int(0, 63);
      for (let j = 0; j < rng.int(4, 9); j++) c.set((x + j) % 64, y, ghost, 2.4);
    }
    wscatter(c, rng, 0, 0, 64, 64, 60, 0, -0.8, { shapes: 3 });
    wscatter(c, rng, 0, 0, 64, 64, 30, 0, 1, { shapes: 2 });
  }, { wrap: true });
}

/** A rivet line helper for truck panels (kept here for the vehicles' painters). */
export function rivetRow(c: PwCanvas, x0: number, x1: number, y: number, step: number, ramp: number) {
  for (let x = x0; x <= x1; x += step) rivet(c, x, y, ramp, 3);
}

/** Bumper bar (wrap 32 × 8): chrome with a lit top edge (`black` = plastic). */
export function z3BumperTile(atlas: PwAtlas, black: boolean): PwTile {
  return atlas.tile(`z3bumper|${black ? 1 : 0}`, 32, 16, (c, k) => {
    const r = k.ramp(black ? 0x26262c : 0xa0a2aa, { light: black ? 0.4 : 0.6, sat: 0.4 });
    fill(c, r, black ? 2.4 : 3);
    // Two identical 8-row bars (a 0.18 m face shows the lower one's 6 rows from the bottom).
    for (const y0 of [0, 8]) {
      c.hline(0, y0 + 2, 32, r, 4.6);
      c.hline(0, y0 + 3, 32, r, 4);
      c.hline(0, y0 + 6, 32, r, 1.8);
      c.hline(0, y0 + 7, 32, r, 1.2);
      if (!black) for (let x = 0; x < 32; x += 11) c.set(x, y0 + 4, r, 5);
    }
  }, { wrap: true });
}

/** A soft contact shadow under a parked car (dithered, 32 × 48 module). */
export function z3CarShadow(atlas: PwAtlas): PwTile {
  return atlas.tile('z3carshadow', 32, 48, (c, k) => {
    const r = k.ramp(0x1a161e, { light: 0.4 });
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      const u = (x + 0.5 - 16) / 16;
      const v = (y + 0.5 - 24) / 24;
      const d = Math.max(Math.abs(u) * 1.05, Math.abs(v));
      if (d > 1) continue;
      if (d > 0.8 && !dith(x, y, (1 - d) * 5)) continue;
      c.set(x, y, r, 1.4);
    }
  });
}
