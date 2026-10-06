import { pwCacheHas, pwCacheKeep, pwCacheRestored, pwCached, pwCollectUnsaved, pwReturnUnsaved, pwTakeUnsaved, type PwAtlasData } from './atlas';

/**
 * Persistent store for painted PixelWorld atlases (IndexedDB).
 *
 * Painting a stage's atlases costs ~0.5–2 s of CPU on a phone. A painted atlas
 * depends only on the code that painted it and its tile list, so it is kept in
 * IndexedDB: one record per atlas NAME (`<version>|<name>`: a later paint of the
 * same atlas replaces it, so the store never holds more than one copy of each),
 * holding the tile-list signature it was painted for (checked on use), all its
 * levels (post-processed) and the tile rects. A stage loaded before skips
 * painting altogether.
 *
 *  - `version`: a hash of the game's sources, injected at build time
 *    (`__PW_VERSION__`, vite.config.ts): any code change invalidates every stored
 *    atlas; records of other versions are deleted when the store opens. Without
 *    it (the dev server, tests) the store is off unless `pwStoreEnable(version)`
 *    is called (the dev flag `&pwstore=1`).
 *  - Graceful: no IndexedDB (node, a sandboxed frame), a blocked / slow open
 *    (> 1.5 s), a failed read or a full disk (QuotaExceededError: the store is
 *    cleared and writes stop for the session) — the game simply paints.
 *  - Reads happen while the intro card is up (`pwStorePrefetch`, before the
 *    stage builds); writes (`pwStoreFlush`: one transaction, the data is
 *    structured-cloned at the call) right after the deferred paint, still behind
 *    the card — never during play.
 */

declare const __PW_VERSION__: string | undefined;

const DB_NAME = 'overrun-pixelworld';
const STORE = 'atlas';
const OPEN_TIMEOUT_MS = 1500;

let version: string = typeof __PW_VERSION__ === 'string' && __PW_VERSION__ && !import.meta.env?.DEV ? __PW_VERSION__ : '';
let db: IDBDatabase | null = null;
let opening: Promise<IDBDatabase | null> | null = null;
let writesOff = false;
/** The stage prefix whose stored atlases are in the session cache. */
let loadedPrefix = '';

interface StoredAtlas {
  v: string;
  name: string;
  sig: string;
  w: number;
  h: number;
  levels: { data: Uint8Array; width: number; height: number }[];
  rects: [string, number, number][];
  bytes: number;
  texels: number;
  /** CPU ms the paint took (reported, not used). */
  ms: number;
}

/** Bench / debug: what the store did this session (`window.__pwStore`). */
export const PW_STORE_STATS = {
  version: '',
  open: false,
  reads: 0,
  readHits: 0,
  readMs: 0,
  readMB: 0,
  writes: 0,
  writeMs: 0,
  writeMB: 0,
  errors: [] as string[],
};

function publish() {
  PW_STORE_STATS.version = version;
  if (typeof window !== 'undefined') (window as unknown as { __pwStore?: unknown }).__pwStore = PW_STORE_STATS;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Turn the store on with an explicit version (dev flag / tools); '' turns it off. */
export function pwStoreEnable(v: string) {
  version = v;
  if (!v) {
    db?.close();
    db = null;
    opening = null;
    pwCollectUnsaved(false);
  }
}

function fail(where: string, e: unknown) {
  const msg = `${where}: ${(e as { name?: string })?.name ?? ''} ${(e as { message?: string })?.message ?? e}`;
  if (PW_STORE_STATS.errors.length < 8) PW_STORE_STATS.errors.push(msg);
  publish();
}

/** Open the store ahead of the first read (boot); resolves true when there is one. */
export function pwStoreOpen(): Promise<boolean> {
  return open().then((d) => !!d);
}

/** Open (once) the store; null when there is none to be had. Never rejects. */
function open(): Promise<IDBDatabase | null> {
  if (db) return Promise.resolve(db);
  if (opening) return opening;
  opening = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const done = (d: IDBDatabase | null) => {
      if (settled) {
        d?.close();
        return;
      }
      settled = true;
      if (d) {
        db = d;
        PW_STORE_STATS.open = true;
        pwCollectUnsaved(true);
        d.onversionchange = () => {
          d.close();
          if (db === d) db = null;
        };
        prune(d);
      }
      publish();
      resolve(d);
    };
    try {
      if (!version || typeof indexedDB === 'undefined') return done(null);
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE);
      };
      rq.onsuccess = () => done(rq.result);
      rq.onerror = () => {
        fail('open', rq.error);
        done(null);
      };
      rq.onblocked = () => done(null);
      setTimeout(() => done(null), OPEN_TIMEOUT_MS);
    } catch (e) {
      fail('open', e);
      done(null);
    }
  });
  return opening;
}

/** Delete the records of other versions (by key range: their values are never read). */
function prune(d: IDBDatabase) {
  try {
    const st = d.transaction(STORE, 'readwrite').objectStore(STORE);
    st.delete(IDBKeyRange.upperBound(`${version}|`, true));
    st.delete(IDBKeyRange.lowerBound(`${version}|￿`, true));
  } catch (e) {
    fail('prune', e);
  }
}

function restore(r: StoredAtlas): PwAtlasData | null {
  if (!r || r.v !== version || !Array.isArray(r.levels) || !r.levels.length) return null;
  const rects = new Map<string, { x: number; y: number }>();
  for (const [k, x, y] of r.rects) rects.set(k, { x, y });
  return { name: r.name, sig: r.sig, w: r.w, h: r.h, levels: r.levels, rects, ms: 0, bytes: r.bytes, texels: r.texels, painted: true, restored: true };
}

/**
 * Before a stage builds: bring its stored atlases (every atlas whose name is
 * `prefix` or starts with `prefix-`) into the session cache, and drop other
 * atlases from it (but those of the `keep` prefixes). Resolves when done (or at
 * once when there is nothing to read); never rejects.
 */
export function pwStorePrefetch(prefix: string, keep: readonly string[] = []): Promise<void> {
  pwCacheKeep([prefix, ...keep]);
  if (!version) return Promise.resolve();
  // Read already (and still cached): nothing new on disk for it.
  if (loadedPrefix === prefix && pwCacheHas(prefix)) return Promise.resolve();
  return open().then(
    (d) =>
      new Promise<void>((resolve) => {
        if (!d) return resolve();
        const t0 = now();
        try {
          const tx = d.transaction(STORE, 'readonly');
          const rq = tx.objectStore(STORE).getAll(IDBKeyRange.bound(`${version}|${prefix}`, `${version}|${prefix}￿`));
          rq.onsuccess = () => {
            let bytes = 0;
            for (const r of rq.result as StoredAtlas[]) {
              if (r.name !== prefix && !r.name.startsWith(`${prefix}-`)) continue;
              const a = restore(r);
              if (!a || pwCached(a.sig)) continue;
              pwCacheRestored(a);
              bytes += a.bytes;
              PW_STORE_STATS.readHits++;
            }
            PW_STORE_STATS.reads++;
            PW_STORE_STATS.readMs += now() - t0;
            PW_STORE_STATS.readMB += bytes / 1048576;
            loadedPrefix = prefix;
            publish();
            resolve();
          };
          rq.onerror = () => {
            fail('read', rq.error);
            resolve();
          };
        } catch (e) {
          fail('read', e);
          resolve();
        }
      }),
  );
}

/**
 * Persist the atlases painted since the last flush (finished, post-processed) —
 * at most `max` of them per call (the rest wait for the next call). The data is
 * cloned right here (call it behind the card); the disk write runs in the
 * background. Returns how many are still waiting.
 */
export function pwStoreFlush(max = Infinity): number {
  const all = pwTakeUnsaved();
  const list = all.slice(0, max);
  pwReturnUnsaved(all.slice(list.length));
  if (!list.length || !db || writesOff || !version) return 0;
  const t0 = now();
  let bytes = 0;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const a of list) {
      const rec: StoredAtlas = {
        v: version,
        name: a.name,
        sig: a.sig,
        w: a.w,
        h: a.h,
        levels: a.levels,
        rects: [...a.rects].map(([k, r]) => [k, r.x, r.y]),
        bytes: a.bytes,
        texels: a.texels,
        ms: a.ms,
      };
      st.put(rec, `${version}|${a.name}`);
      bytes += a.bytes;
    }
    tx.onabort = () => {
      const e = tx.error;
      fail('write', e);
      if (e?.name === 'QuotaExceededError') {
        // Full: make room for other data on the device and stop writing this session.
        writesOff = true;
        try {
          db?.transaction(STORE, 'readwrite').objectStore(STORE).clear();
        } catch {
          /* gone */
        }
      }
    };
    PW_STORE_STATS.writes += list.length;
    PW_STORE_STATS.writeMB += bytes / 1048576;
  } catch (e) {
    fail('write', e);
  }
  PW_STORE_STATS.writeMs += now() - t0;
  publish();
  return all.length - list.length;
}

/** Forget the stage prefix read last (tests). */
export function pwStoreReset() {
  loadedPrefix = '';
}
