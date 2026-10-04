/**
 * Vibration feedback. Uses the Capacitor Haptics plugin when running as a native
 * app (iOS has no navigator.vibrate), otherwise the Vibration API where available.
 */
interface CapHaptics {
  impact(opts: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
}

function capHaptics(): CapHaptics | null {
  const cap = (globalThis as unknown as { Capacitor?: { Plugins?: { Haptics?: CapHaptics }; isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Haptics) return cap.Plugins.Haptics;
  return null;
}

let last = 0;

export function haptic(ms: number) {
  const now = performance.now();
  if (now - last < 40) return;
  last = now;
  try {
    const h = capHaptics();
    if (h) {
      void h.impact({ style: ms >= 150 ? 'HEAVY' : ms >= 60 ? 'MEDIUM' : 'LIGHT' }).catch(() => {});
      return;
    }
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
