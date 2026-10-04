import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shells for OVERRUN — iPhone first, Android second.
 * `npm run build && npx cap sync` copies dist/ into ios/ and android/.
 * See docs/IOS.md for running on a device and the TestFlight pipeline.
 */
const config: CapacitorConfig = {
  appId: 'com.overrun.arcade',
  appName: 'OVERRUN',
  webDir: 'dist',
  backgroundColor: '#07080c',
  loggingBehavior: 'debug', // console.* reaches Xcode / logcat in debug builds only
  ios: {
    // Full-bleed WKWebView: the game handles safe areas itself via env(safe-area-inset-*).
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
    zoomEnabled: false,
    backgroundColor: '#07080c',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#07080c',
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;
