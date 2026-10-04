/** A buffer update range, preallocated once and reused every frame. */
export interface UploadRange {
  start: number;
  count: number;
}

interface RangedBuffer {
  updateRanges: UploadRange[];
  needsUpdate: boolean;
}

export const newRange = (): UploadRange => ({ start: 0, count: 0 });

/**
 * Flag `[start, start + count)` (in array elements) of a BufferAttribute /
 * InterleavedBuffer for upload, without the per-call object `addUpdateRange`
 * allocates. three.js clears `updateRanges` after each upload.
 */
export function uploadRange(buf: RangedBuffer, r: UploadRange, start: number, count: number) {
  r.start = start;
  r.count = count;
  buf.updateRanges.length = 0;
  buf.updateRanges.push(r);
  buf.needsUpdate = true;
}
