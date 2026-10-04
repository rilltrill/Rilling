import type { MusicId } from './names';
import type { DrumKey } from './drums';

/**
 * Procedural music, written as data for the step sequencer in Music.ts.
 *
 * Notation (16 steps = one 4/4 bar of 16th notes):
 * - chords: per bar, "<semitones from key><quality>", e.g. "0m 8M 7M" (i, bVI, V).
 *   Qualities (always letters, so they can't merge with the root's digits):
 *   m minor, M major, p power chord (root/5th/octave), d dim, s4 sus4, s2 sus2,
 *   m7, M7, dom7, a augmented. Omitted = major. See QUAL / validateTracks().
 * - drums: one string per instrument; 'X' accent, 'x' hit, 'o' ghost, '.' rest.
 *   Strings longer than 16 span several bars. Keys: k kick, s snare, c clap,
 *   h hat, o open hat, p shaker, r rim, t low tom, m mid tom, T taiko, x crash, b boom.
 * - bass: chord-relative; R root, O octave, L low octave, 5 fifth, 3 third, b flat 7th,
 *   4 fourth, 2 ninth, '-' hold, '.' rest.
 * - arp: digit = index into the chord tones stacked upwards; '-' hold, '.' rest.
 * - stab: chord stab, 'X' long, 'x' short.
 * - lead: "semi:len" tokens in sequence (semitones above key+2 octaves, length in
 *   steps), '_' = rest, '|' = bar separator (cosmetic).
 *
 * Layers fade in with the intensity hint (enemy count / boss): each part has a
 * threshold in `layers`; parts without one always play.
 */
export type Part = 'bass' | 'pad' | 'kick' | 'beat' | 'perc' | 'arp' | 'lead' | 'stab' | 'amb';
export const PARTS: Part[] = ['bass', 'pad', 'kick', 'beat', 'perc', 'arp', 'lead', 'stab', 'amb'];

/**
 * Ambience under the music: a looping bed plus occasional distant events.
 * city: wind, sirens, howls, far-off groans and clangs · jungle: insects, birdsong,
 * distant roars and cries · storm: deep wind and rolling thunder · wind: the
 * storm's wind bed alone (the title screen's MenuBackdrop plays its own thunder,
 * synced to its lightning).
 */
export type Ambience = 'city' | 'jungle' | 'storm' | 'wind';

export interface SectionDef {
  bars: number;
  chords: string;
  drums?: Partial<Record<DrumKey, string>>;
  /** Drums for the last bar of the section. */
  fill?: Partial<Record<DrumKey, string>>;
  bass?: string;
  arp?: string;
  lead?: string;
  stab?: string;
  /** false = no pad; string = pad preset override. */
  pad?: boolean | string;
  /** Noise riser through the last bar. */
  riser?: boolean;
  /** Crash on the downbeat (default true). */
  crash?: boolean;
}

export interface TrackDef {
  bpm: number;
  /** MIDI note of the bass root (e.g. 40 = E2). */
  key: number;
  bass: string;
  arp?: string;
  lead?: string;
  pad?: string;
  stab?: string;
  arpOct?: number;
  leadOct?: number;
  /** Intensity threshold per part. */
  layers?: Partial<Record<Part, number>>;
  /** Mix level per part. */
  mix?: Partial<Record<Part, number>>;
  /** Minimum intensity (drive tracks never drop to silence). */
  floor?: number;
  /** false = ignore setIntensity (menus). */
  reactive?: boolean;
  fadeIn?: number;
  amb?: Ambience;
  sections: Record<string, SectionDef>;
  order: string[];
  /** Index into `order` to loop back to. */
  loop?: number;
}

const r = (n: number) => '.'.repeat(n);

// ─── Chords ───────────────────────────────────────────────────────────────────

/** Chord qualities: semitone intervals above the root. */
export const QUAL: Record<string, number[]> = {
  m: [0, 3, 7], M: [0, 4, 7], p: [0, 7, 12], d: [0, 3, 6], s4: [0, 5, 7], s2: [0, 2, 7],
  m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], a: [0, 4, 8],
};

export interface Chord {
  /** Semitones from the track key. */
  root: number;
  iv: number[];
  key: string;
}

const CHORD_RE = /^(-?\d+)([A-Za-z]\w*)?$/;

/** Parse one chord token; null when malformed (unknown quality, root out of -12..12). */
export function parseChord(tok: string): Chord | null {
  const m = CHORD_RE.exec(tok);
  if (!m) return null;
  const root = Number(m[1]);
  const iv = QUAL[m[2] ?? 'M'];
  if (!iv || root < -12 || root > 12) return null;
  return { root, iv, key: tok };
}

const warned = new Set<string>();
/** Parse a section's chord list. Malformed tokens warn once and fall back to a major triad on 0. */
export function parseChords(str: string): Chord[] {
  return str
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const c = parseChord(tok);
      if (c) return c;
      if (!warned.has(tok)) {
        warned.add(tok);
        console.warn(`[music] bad chord "${tok}"`);
      }
      return { root: 0, iv: QUAL.M, key: tok };
    });
}

const DRUM_KEYS = new Set(['k', 's', 'c', 'h', 'o', 'p', 'r', 't', 'm', 'T', 'x', 'b']);

/** Arrangement sanity check (unit tests): returns a list of problems, empty when every track is well-formed. */
export function validateTracks(): string[] {
  const errs: string[] = [];
  for (const [id, t] of Object.entries(TRACKS)) {
    if (!t.order.length) errs.push(`${id}: empty order`);
    for (const name of t.order) if (!t.sections[name]) errs.push(`${id}: order names missing section "${name}"`);
    if ((t.loop ?? 0) >= t.order.length) errs.push(`${id}: loop index out of range`);
    for (const [name, sec] of Object.entries(t.sections)) {
      const at = `${id}.${name}`;
      const chords = sec.chords.trim().split(/\s+/);
      if (sec.bars % chords.length) errs.push(`${at}: ${sec.bars} bars not a multiple of ${chords.length} chords`);
      for (const c of chords) if (!parseChord(c)) errs.push(`${at}: bad chord "${c}"`);
      const pats: [string, string | undefined, RegExp][] = [
        ['bass', sec.bass, /^[ROL53b42.-]{16}$/],
        ['arp', sec.arp, /^[0-9.-]{16}$/],
        ['stab', sec.stab, /^[Xx.]{16}$/],
      ];
      for (const [k, pat, re] of pats) if (pat !== undefined && !re.test(pat)) errs.push(`${at}: bad ${k} pattern "${pat}"`);
      for (const d of [sec.drums, sec.fill]) {
        if (!d) continue;
        for (const [k, pat] of Object.entries(d)) {
          if (!DRUM_KEYS.has(k)) errs.push(`${at}: unknown drum "${k}"`);
          if (!pat || pat.length % 16 || !/^[xXo.]+$/.test(pat)) errs.push(`${at}: bad drum pattern ${k} "${pat}"`);
        }
      }
      if (sec.lead) {
        const bars = sec.lead.split('|');
        if (bars.length !== sec.bars) errs.push(`${at}: lead has ${bars.length} bars, section has ${sec.bars}`);
        bars.forEach((b, i) => {
          let sum = 0;
          for (const tok of b.trim().split(/\s+/)) {
            const [a, len] = tok.split(':');
            if (a !== '_' && !Number.isFinite(Number(a))) errs.push(`${at}: bad lead note "${tok}"`);
            sum += Number(len) || 1;
          }
          if (sum !== 16) errs.push(`${at}: lead bar ${i} lasts ${sum} steps`);
        });
      }
    }
  }
  return errs;
}

export const TRACKS: Record<MusicId, TrackDef> = {
  // Moody, ominous: D minor, a slow heartbeat, glassy arps and tolling bells.
  menu: {
    bpm: 76, key: 38, bass: 'sub', arp: 'glass', lead: 'bell', pad: 'dark', reactive: false, fadeIn: 2.5, amb: 'wind',
    mix: { arp: 0.8, lead: 0.9 },
    sections: {
      intro: {
        bars: 4, chords: '0m 0m 1M 0m', bass: 'R---------------', crash: false,
        drums: { k: 'Xo' + r(14), b: 'x' + r(63) },
      },
      A: {
        bars: 8, chords: '0m 0m 10M 10M 8M 8M 7M 7M', bass: 'R-----------5---', crash: false,
        drums: { k: 'Xo' + r(14), r: r(8) + 'o' + r(7) },
        arp: '0.2.1.3.2.4.3.1.',
        lead: '7:6 8:2 7:8 | 5:4 3:4 2:4 3:4 | 2:6 3:2 2:8 | _:8 10:4 7:4 | 3:6 5:2 3:8 | 2:4 0:4 -2:8 | 1:8 2:8 | -1:8 _:8',
      },
      B: {
        bars: 8, chords: '0m 0m 3M 3M 1M 1M 7M 7M', bass: 'R-------R-------', pad: 'choir', crash: false,
        drums: { k: 'Xo' + r(14), T: 'x.......x..x....' },
        arp: '0.1.2.3.4.3.2.1.',
        lead: '12:8 15:8 | 14:16 | 15:6 17:2 15:8 | 12:16 | 13:8 10:8 | 8:16 | 7:8 11:8 | 13:8 _:8',
      },
    },
    order: ['intro', 'A', 'B', 'A', 'B'], loop: 1,
  },

  // Horror synth: E minor, pulsing bass, tense arpeggios, a theremin lead.
  zombie: {
    bpm: 112, key: 40, bass: 'pulse', arp: 'pluck', lead: 'theremin', pad: 'dark', stab: 'power', amb: 'city',
    layers: { beat: 0.18, arp: 0.32, lead: 0.5, perc: 0.6, stab: 0.8 }, floor: 0.05,
    sections: {
      intro: {
        bars: 4, chords: '0m 0m 0m 1M', bass: 'R.......R.......', crash: false,
        drums: { k: 'x' + r(15), r: '....o.......o...' },
      },
      A: {
        bars: 8, chords: '0m 0m 8M 7M', bass: 'R.R.R.O.R.R.R.O.',
        drums: { k: 'x.....x.x.......', s: '....x.......x...', h: '..x...x...x...x.', m: r(14) + 'o.', t: r(15) + 'o' },
        arp: '0213243202132432',
        lead: '7:8 8:4 7:4 | 3:8 2:4 3:4 | 8:12 7:4 | 11:8 7:8 | 12:8 10:4 12:4 | 15:6 14:2 12:8 | 8:8 12:4 15:4 | 14:8 11:8',
        stab: 'X.......x.......',
      },
      B: {
        bars: 8, chords: '5m 5m 0m 0m 1M 1M 7M 7M', bass: 'R.RRR.RRR.RRR.RR', riser: true,
        drums: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', t: '......o.....o...' },
        fill: { k: 'x.....x...x.....', s: '....x...x.x.xxxx', t: r(12) + 'x.x.', m: r(13) + 'x.x' },
        arp: '0124210401242104',
        lead: '12:16 | 15:8 12:8 | 11:8 12:8 | 7:16 | 8:16 | 13:8 12:8 | 11:16 | 14:8 _:8',
        stab: 'X.....x.....x...',
      },
    },
    order: ['intro', 'A', 'B', 'A', 'B'], loop: 1,
  },

  // Fast driving action: E minor, galloping octave bass, four-on-the-floor.
  zombie_drive: {
    bpm: 144, key: 40, bass: 'drive', arp: 'saw', lead: 'saw', pad: 'dark', stab: 'power', amb: 'city',
    layers: { arp: 0.4, lead: 0.5, perc: 0.55, stab: 0.7 }, floor: 0.45, mix: { kick: 0.75 },
    sections: {
      A: {
        bars: 8, chords: '0m 0m 8M 10M 0m 0m 8M 7M', bass: 'RRORRRORRRORRROR',
        drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxXxxxXxxxXxxxXx', t: r(10) + 'o...o.' },
        arp: '0212021202120212',
        lead: '12:3 12:3 15:4 14:2 12:4 | 10:4 7:4 10:2 12:6 | 8:3 12:3 15:6 17:4 | 17:8 14:4 10:4 | 12:3 12:3 15:4 19:2 17:4 | 15:4 14:4 12:8 | 15:4 17:4 19:4 20:4 | 11:8 14:4 19:4',
        stab: 'X..x..x...x..x..',
      },
      B: {
        bars: 8, chords: '8M 8M 10M 10M 5m 5m 7M 7M', bass: 'RRORRRORRRORRROR',
        drums: { k: 'x...x...x...x...', c: '....x.......x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', t: '......x.....x.x.', m: r(10) + 'x.....' },
        fill: { k: 'x...x...x...x...', s: 'x.x.x.x.xxxxxxxx', t: r(8) + 'x.x.x.x.' },
        arp: '0212021202120212',
        lead: '20:6 19:2 15:8 | 17:4 15:4 12:8 | 22:6 19:2 17:8 | 14:4 17:4 22:8 | 24:8 22:4 20:4 | 19:4 17:4 15:4 17:4 | 19:8 23:8 | 23:4 19:4 14:8',
        stab: 'X.......X.......',
      },
      C: {
        bars: 4, chords: '0m 0m 1M 1M', bass: 'RRRRRRRRRRRRRRRR', riser: true,
        drums: { k: 'x.......x.......', t: 'x..x..x...x..x..', m: '......x.....x...' },
        arp: '0.0.1.1.2.2.3.3.',
      },
    },
    order: ['A', 'B', 'A', 'C'], loop: 0,
  },

  // Adventure: D major/mixolydian, tribal taiko + heroic brass lead.
  dino: {
    bpm: 100, key: 38, bass: 'round', arp: 'marimba', lead: 'brass', pad: 'strings', stab: 'brassStab', amb: 'jungle',
    layers: { beat: 0.15, arp: 0.32, lead: 0.45, perc: 0.5, stab: 0.72 }, floor: 0.15,
    sections: {
      intro: {
        bars: 4, chords: '0M 0M 10M 10M', bass: 'R-------R-------', riser: true, crash: false,
        drums: { T: 'x.......x..x....', p: 'o.o.o.o.o.o.o.o.' },
      },
      A: {
        bars: 8, chords: '0M 10M 5M 0M 0M 10M 5M 7M', bass: 'R..R..R.R..R..5.',
        drums: { T: 'x.....x...x.....', k: 'x.......x.......', t: '....x.......x.x.', p: 'oxoxoxoxoxoxoxox' },
        arp: '0.1.2.1.3.2.1.2.',
        lead: '0:3 7:3 12:10 | 10:6 9:2 7:8 | 9:4 7:4 5:4 7:4 | 4:8 2:4 0:4 | 0:3 7:3 12:6 14:4 | 16:6 14:2 12:4 10:4 | 17:8 14:4 12:4 | 11:8 9:4 7:4',
        stab: 'X.........x.....',
      },
      B: {
        bars: 8, chords: '9m 9m 5M 5M 0M 0M 7M 7M', bass: 'R..R..R.R..R..R.',
        drums: { T: 'x..x..x...x..x..', k: 'x.......x.......', s: '....x.......x...', t: '......x.......xx', m: r(10) + 'x.....', p: 'oxoxoxoxoxoxoxox' },
        fill: { T: 'x..x..x...x..x..', s: '....x.......x.x.', t: r(8) + 'x.x.xxxx', m: '....x.x.' + r(8) },
        arp: '0.2.1.3.2.4.3.1.',
        lead: '16:8 14:4 12:4 | 14:6 12:2 9:8 | 17:8 19:4 21:4 | 19:16 | 19:4 21:4 24:8 | 21:6 19:2 16:8 | 16:8 14:4 11:4 | 14:8 11:8',
        stab: 'X.....x.....x...',
      },
    },
    order: ['intro', 'A', 'B', 'A', 'B'], loop: 1,
  },

  // Intense chase: D minor, galloping taiko, brass stabs on the off-beats.
  dino_drive: {
    bpm: 152, key: 38, bass: 'drive', arp: 'saw', lead: 'brass', pad: 'strings', stab: 'brassStab', amb: 'jungle',
    layers: { perc: 0.3, arp: 0.35, lead: 0.5, stab: 0.6 }, floor: 0.45, mix: { kick: 0.55 },
    sections: {
      A: {
        bars: 8, chords: '0m 0m 8M 10M 0m 0m 8M 7M', bass: 'R.RRR.RRR.RRR.RR',
        drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', T: 'x..x..x...x..x..', m: r(8) + 'o.o.....', t: r(12) + 'o.o.' },
        arp: '0121012101210121',
        lead: '12:4 15:4 14:2 12:2 10:4 | 12:12 _:4 | 15:4 17:4 19:4 20:4 | 19:12 17:4 | 24:4 22:4 19:4 22:4 | 24:8 19:8 | 20:4 19:4 17:4 15:4 | 19:8 23:8',
        stab: '.X..X..X...X..X.',
      },
      B: {
        bars: 8, chords: '5m 5m 0m 0m 8M 10M 7M 7M', bass: 'R.RRR.RRR.RRR.RR',
        drums: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', T: 'x..x..x...x..x..', t: r(12) + 'o.o.' },
        fill: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', T: 'x..x..x.x.x.x.x.', t: r(8) + 'x.x.x.x.' },
        arp: '0121012101210121',
        lead: '17:4 20:4 24:8 | 22:4 20:4 19:8 | 17:8 15:8 | 14:4 15:4 17:8 | 20:8 22:8 | 24:8 22:4 19:4 | 23:16 | 23:8 19:8',
        stab: 'X...X...X...X...',
      },
      C: {
        bars: 4, chords: '0m 1M 0m 1M', bass: 'RRRRRRRRRRRRRRRR', riser: true,
        drums: { T: 'x..x..x...x..x..', t: '..x...x...x...x.', m: '...x...x...x...x' },
        arp: '0.0.1.1.2.2.3.3.',
      },
    },
    order: ['A', 'B', 'A', 'C'], loop: 0,
  },

  // Aggressive boss: C# phrygian, 160 bpm, distorted chug, double kick.
  boss: {
    bpm: 160, key: 37, bass: 'dist', arp: 'saw', lead: 'saw', pad: 'choir', stab: 'power', leadOct: -1,
    layers: { stab: 0.6, perc: 0.55, arp: 0.65, lead: 0.75 }, floor: 0.6, mix: { kick: 0.55 },
    sections: {
      A: {
        bars: 8, chords: '0p 0p 1p 0p 0p 0p 6p 7p', bass: 'RRRRRRRRRRRRRRRR',
        drums: { k: 'x.x.x.x.x.x.x.x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', t: r(14) + 'xx' },
        arp: '0123012301230123',
        lead: '12:2 13:2 12:2 7:2 6:8 | _:4 12:2 13:2 15:4 13:4 | 13:2 15:2 13:2 8:2 7:8 | _:8 6:4 7:4 | 24:2 25:2 24:2 19:2 18:8 | _:4 24:2 25:2 27:4 25:4 | 18:4 19:4 18:4 13:4 | 19:8 12:8',
        stab: 'X..X..X...X..X..',
      },
      B: {
        bars: 8, chords: '0p 0p 3p 3p 1p 1p 7p 7p', bass: 'R-------R---R---',
        drums: { k: 'x.........x.....', s: '........X.......', h: 'x...x...x...x...', T: 'x.......x.......' },
        lead: '24:16 | 22:8 19:8 | 27:16 | 25:8 24:8 | 25:16 | 24:8 20:8 | 19:16 | 18:8 19:8',
        stab: 'X' + r(15),
      },
      C: {
        bars: 4, chords: '0p 1p 0p 6p', bass: 'RRRRRRRRRRRRRRRR', riser: true,
        drums: { k: 'xxxxxxxxxxxxxxxx', s: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.', t: r(12) + 'xxxx' },
        lead: '12:4 13:4 12:4 6:4 | 12:4 13:4 15:4 13:4 | 12:4 13:4 12:4 6:4 | 18:8 19:8',
        stab: 'X.X.X.X.X.X.X.X.',
      },
    },
    order: ['A', 'B', 'A', 'C'], loop: 0,
  },

  // Triumphant results: F major, march snare, brass melody.
  results: {
    bpm: 124, key: 41, bass: 'round', arp: 'pluck', lead: 'brass', pad: 'strings', stab: 'brassStab', reactive: false, fadeIn: 0.4,
    mix: { arp: 0.7 },
    sections: {
      A: {
        bars: 8, chords: '0M 7M 9m 5M 0M 7M 5M 7M', bass: 'R...R.5.R...R.5.',
        drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', r: r(14) + 'oo' },
        arp: '0123210101232101',
        lead: '7:4 12:4 16:6 14:2 | 14:8 11:4 7:4 | 9:4 12:4 16:4 14:4 | 17:6 16:2 14:8 | 19:4 16:4 12:4 16:4 | 19:8 23:8 | 24:4 21:4 17:4 21:4 | 19:8 23:4 24:4',
        stab: 'X.......X.......',
      },
      B: {
        bars: 8, chords: '5M 0M 5M 7M 9m 5M 7M 7M', bass: 'R.R.R.R.R.R.R.R.',
        drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
        fill: { k: 'x...x...x...x...', s: '....x...x.x.xxxx' },
        arp: '0.2.1.3.0.2.1.3.',
        lead: '12:8 14:4 16:4 | 19:16 | 17:4 16:4 14:4 12:4 | 14:16 | 16:4 14:4 12:4 9:4 | 12:8 14:8 | 14:8 16:4 19:4 | 23:16',
        stab: 'X.......X.......',
      },
    },
    order: ['A', 'B'], loop: 0,
  },

  // Somber game over: C minor, slow tolls and a falling bell line.
  gameover: {
    bpm: 66, key: 36, bass: 'sub', lead: 'bell', pad: 'choir', reactive: false, fadeIn: 1.2, amb: 'storm',
    sections: {
      A: {
        bars: 4, chords: '0m 8M 5m 7M', bass: 'R---------------', crash: false,
        drums: { T: 'x' + r(15) },
        lead: '7:8 3:8 | 8:8 0:8 | 5:8 8:4 7:4 | 2:8 -1:8',
      },
      B: {
        bars: 4, chords: '0m 3M 5m 7M', bass: 'R-------5-------', crash: false,
        drums: { T: 'x.......o.......' },
        lead: '12:16 | 10:8 7:8 | 8:8 5:8 | 7:16',
      },
    },
    order: ['A', 'B'], loop: 0,
  },
};
