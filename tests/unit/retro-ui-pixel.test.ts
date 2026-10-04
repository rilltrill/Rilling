import { describe, expect, it } from 'vitest';
import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  BOMB,
  HEART,
  INFINITY,
  LOCK,
  SKULL,
  SWAP,
  WEAPON_SPRITES,
  pixelSvg,
  pixelUrl,
} from '../../src/ui/pixel';

const SPRITES: Record<string, string[]> = {
  HEART,
  BOMB,
  SKULL,
  LOCK,
  ARROW_UP,
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  INFINITY,
  SWAP,
  ...Object.fromEntries(Object.entries(WEAPON_SPRITES).map(([k, v]) => [`weapon:${k}`, v])),
};

describe('retro UI pixel sprites', () => {
  it('every sprite is a rectangular grid', () => {
    for (const [name, rows] of Object.entries(SPRITES)) {
      expect(rows.length, name).toBeGreaterThan(0);
      for (const r of rows) expect(r.length, `${name}: "${r}"`).toBe(rows[0].length);
    }
  });

  it('renders crisp SVG with one path per colour and the grid as viewBox', () => {
    const svg = pixelSvg(['.CC', 'KWC'], {}, 'x');
    expect(svg).toContain('viewBox="0 0 3 2"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg.match(/<path /g)).toHaveLength(3); // currentColor, black, white
    expect(svg).toContain('fill="currentColor"');
    // Horizontal runs are merged: the two C's on row 0 form one 2-wide run.
    expect(svg).toContain('M1 0h2v1h-2z');
  });

  it('data URLs are self-contained SVG documents', () => {
    const url = pixelUrl(HEART, { R: '#f00', D: '#800' });
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`viewBox="0 0 ${HEART[0].length} ${HEART.length}"`);
  });
});
