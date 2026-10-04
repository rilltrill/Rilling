export interface PointerState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
}

export interface InputHandlers {
  /** A finger / mouse button went down on the play surface at client coords. */
  press?(x: number, y: number, id: number): void;
  move?(x: number, y: number, id: number): void;
  release?(id: number): void;
  /** Quick downward swipe — the mobile reload gesture. */
  swipeDown?(): void;
  /** Right mouse button / keyboard reload. */
  reload?(): void;
  key?(code: string): void;
}

/**
 * Pointer + keyboard input for the play surface (a full-screen element that sits
 * above the canvas but below interactive HUD buttons, so button taps never fire).
 */
export class Input {
  readonly pointers = new Map<number, PointerState>();
  handlers: InputHandlers = {};
  enabled = true;
  /** Last aim position in client pixels (most recent active pointer, or mouse hover). */
  aimX = 0;
  aimY = 0;

  constructor(private surface: HTMLElement) {
    surface.style.touchAction = 'none';
    surface.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
    // Kill iOS double-tap zoom / long-press callouts on the surface.
    surface.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    surface.addEventListener('dblclick', (e) => e.preventDefault());
    this.aimX = window.innerWidth / 2;
    this.aimY = window.innerHeight / 2;
  }

  get firing(): boolean {
    return this.pointers.size > 0;
  }

  /** Release all pointers (e.g. when pausing) so held auto-fire stops. */
  reset() {
    for (const id of [...this.pointers.keys()]) this.handlers.release?.(id);
    this.pointers.clear();
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button === 2) {
      this.handlers.reload?.();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.surface.setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable — fine */
    }
    const p: PointerState = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startT: performance.now(),
    };
    this.pointers.set(e.pointerId, p);
    this.aimX = e.clientX;
    this.aimY = e.clientY;
    this.handlers.press?.(e.clientX, e.clientY, e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (e.pointerType === 'mouse' && !p) {
      this.aimX = e.clientX;
      this.aimY = e.clientY;
      return;
    }
    if (!p || !this.enabled) return;
    p.x = e.clientX;
    p.y = e.clientY;
    this.aimX = e.clientX;
    this.aimY = e.clientY;
    this.handlers.move?.(e.clientX, e.clientY, e.pointerId);
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const dt = performance.now() - p.startT;
    const dy = p.y - p.startY;
    const dx = p.x - p.startX;
    const minSwipe = Math.max(50, window.innerHeight * 0.12);
    if (this.enabled && dt < 350 && dy > minSwipe && Math.abs(dx) < dy * 0.8) {
      this.handlers.swipeDown?.();
    }
    this.handlers.release?.(e.pointerId);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'KeyR' || e.code === 'Space') {
      if (this.enabled) this.handlers.reload?.();
      if (e.code === 'Space') e.preventDefault();
    }
    this.handlers.key?.(e.code);
  };
}
