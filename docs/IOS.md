# OVERRUN on iPhone

iPhone is OVERRUN's first platform. There are three ways to get it onto your phone:

| | What you need | Result |
|---|---|---|
| **A. Web app** (start here) | Just the iPhone. The game hosted at a URL (GitHub Pages) | Home-screen icon, fullscreen, landscape, works offline. Ready in 2 minutes |
| **B. Native app from Xcode** | A Mac with Xcode and a **free** Apple ID | A real app on your phone with haptics and no browser chrome. Needs re-installing every 7 days |
| **C. TestFlight from GitHub Actions** | Apple Developer Program ($99/yr). **No Mac needed** | The cloud builds a signed app and it installs through the TestFlight app |

The game is identical in all three. The native app adds vibration feedback, a launch screen, a locked landscape orientation and edge-swipe protection.

---

## A. Install the web app (no Mac needed)

### 1. Put the game online with GitHub Pages (one time)

1. On GitHub, open the repository and go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
2. Push to `main`, or open **Actions → Deploy to GitHub Pages → Run workflow**. When it finishes, the run summary shows the URL, usually `https://<your-user>.github.io/<repo>/`.
   - The workflow also runs on the `claude/arcade-rail-shooter` branch. GitHub only lets the default branch deploy at first. To let that branch deploy too, go to **Settings → Environments → github-pages → Deployment branches and tags** and add it. Both branches publish to the same URL, so the most recent deploy wins.

### 2. Add it to your home screen

1. On the iPhone, open the URL in **Safari**. In-app browsers such as Instagram, Gmail or the Google app can't install web apps, so use Safari.
2. Tap **Share**: the square with an up-arrow. On iOS 26, tap **•••** first, then **Share**.
3. Tap **Add to Home Screen**. On iOS 26, leave **Open as Web App** switched on. Then tap **Add**.
4. Start OVERRUN from the new icon. It opens fullscreen with no Safari toolbars, shows the OVERRUN launch screen, and keeps working **offline** after the first launch. A service worker caches the whole game, which is about 1.5 MB.

The first time you open the game in a Safari tab, it shows a small *"Install: tap Share, then Add to Home Screen"* hint on the title screen. Tap **×** and it won't appear again.

**Updates:** a new deploy loads the next time you open the app. The page itself is always fetched from the network first when you're online. If you still see the old version, close the app in the app switcher and open it again.

### Other ways to try it

- **Same Wi-Fi, no hosting:** on your computer, run `npm run build && npx vite preview --host`. Then open `http://<computer-ip>:4173` in Safari on the iPhone. Offline mode needs HTTPS, so it isn't available this way.
- **One HTML file:** `npm run build:single` writes `dist-single/overrun.html`, about 1 MB, with everything inlined. You can host it anywhere that serves HTML, including as a claude.ai artifact, and open the link in Safari. The CI workflow also attaches this file to every run as the `overrun-single-file` artifact.

---

## B. Run the native app on your own iPhone (Mac + free Apple ID)

**You need:** a Mac with the latest **Xcode** (16 or newer, from the App Store), **Node.js 22.12+**, an iPhone on **iOS 15+**, and a USB cable.

The Xcode project lives in `ios/`. It uses **Swift Package Manager**, so you don't need CocoaPods. Its Capacitor plugins (haptics, status bar) resolve from `node_modules`.

```bash
git clone <repo-url> overrun && cd overrun
npm ci                 # install JS deps (also provides the native plugin sources)
npm run build          # build the web game into dist/
npx cap sync ios       # copy dist/ into the app + write the plugin package list
npx cap open ios       # opens ios/App/App.xcodeproj in Xcode
```

Then, in Xcode:

1. **Sign in:** go to **Xcode → Settings… → Accounts → +** and choose **Apple ID**. A free account works.
2. **Choose your team:** in the left sidebar click the blue **App** project, then the **App** target, then **Signing & Capabilities**. Tick **Automatically manage signing** and set **Team** to *Your Name (Personal Team)*.
   - If Xcode says the bundle identifier is unavailable, change **Bundle Identifier** from `com.overrun.arcade` to something unique, such as `com.yourname.overrun`.
3. **Connect the iPhone** with the cable, unlock it, and tap **Trust This Computer**.
4. **Turn on Developer Mode on the iPhone:** go to **Settings → Privacy & Security → Developer Mode**, switch it on, and restart when asked. After the restart, confirm with **Turn On**. The option only appears after the phone has been connected to Xcode once.
5. In Xcode's toolbar, pick **your iPhone** as the run destination and press **Run** (⌘R). The first build takes a minute while Xcode fetches the Swift packages.
6. On the first launch, iOS reports an *Untrusted Developer*. On the iPhone, go to **Settings → General → VPN & Device Management**, tap your Apple ID, then tap **Trust**. Start OVERRUN again.

**Free-account limits:** the app stops opening after **7 days**. Press Run in Xcode again to renew it. A free account can install at most 3 apps per device.

**After changing the game:** run `npm run build && npx cap copy ios`, then press Run again. `npm run cap:ios` does the build, the sync and the Xcode launch in one step.

### What the native shell adds

All of this is set up in `ios/App/App/`:

- **Landscape only**, fullscreen, status bar hidden, home indicator auto-hidden.
- **Edge swipes go to the game first**, so a fast swipe-down to reload doesn't open Notification Centre. Swiping a second time still triggers the system gesture.
- **The screen stays awake** while the app is in front.
- **Audio session `.ambient`:** the silent switch is respected and your own music keeps playing.
- **Haptics** through `@capacitor/haptics`, used by `src/core/Haptics.ts`.
- A dark launch screen with the OVERRUN logo, and the app icon. Both are generated from `public/icon.svg` by `npm run icons`.

The custom code lives in `MainViewController.swift` (a `CAPBridgeViewController` subclass), `AppDelegate.swift` and `SceneDelegate.swift`. The plist settings are in `Info.plist`.

---

## C. TestFlight builds from GitHub Actions (no Mac needed)

`.github/workflows/ios.yml` always builds the app for the **iOS Simulator** to check that the Xcode project compiles. The result is uploaded as the `OVERRUN-ios-simulator` artifact. Once the secrets below exist, the workflow also **archives a signed Release build, exports an `.ipa` and uploads it to TestFlight**. That happens on every push to `main`, and whenever you click **Actions → iOS → Run workflow** on any branch with **Upload to TestFlight** ticked.

### One-time setup

You need an **Apple Developer Program** membership ($99/year) at <https://developer.apple.com/programs/>. A free Apple ID can't upload to TestFlight.

**1. Register the app ID.** At developer.apple.com, go to **Certificates, IDs & Profiles → Identifiers → +**. Choose **App IDs**, then **App**. Set the description to *OVERRUN* and the **Explicit** bundle ID to `com.overrun.arcade`.
   If that ID is taken, pick your own. Then change it in three places: `appId` in `capacitor.config.ts`, `PRODUCT_BUNDLE_IDENTIFIER` in Xcode (or in `ios/App/App.xcodeproj/project.pbxproj`), and the `provisioningProfiles` key in `ios.yml`.

**2. Create the app record.** In App Store Connect (<https://appstoreconnect.apple.com>), go to **Apps → + → New App**. Choose iOS, enter a name (it must be unique on the App Store, for example *OVERRUN Arcade*), and select the bundle ID from step 1. The SKU can be anything, such as `overrun`.

**3. Create a distribution certificate (`.p12`).** This works on any OS that has `openssl`:

```bash
openssl genrsa -out overrun_dist.key 2048
openssl req -new -key overrun_dist.key -out overrun_dist.csr -subj "/emailAddress=you@example.com/CN=Your Name/C=US"
```

At developer.apple.com, go to **Certificates → +**, choose **Apple Distribution**, upload `overrun_dist.csr`, and download `distribution.cer`. Then:

```bash
openssl x509 -inform DER -in distribution.cer -out distribution.pem
openssl pkcs12 -export -legacy -inkey overrun_dist.key -in distribution.pem -out distribution.p12 -name "Apple Distribution"
# choose an export password → this is P12_PASSWORD
```

`-legacy` keeps the file readable by macOS's keychain. If your openssl is older and rejects the flag, remove it. On a Mac you can instead export the certificate and its key from **Keychain Access** as a `.p12`.

**4. Create the provisioning profile.** Go to **Profiles → +** and choose **Distribution → App Store Connect**. Select the app ID and the certificate, name it (for example *OVERRUN App Store*), then download the `.mobileprovision` file.

**5. Create an App Store Connect API key.** In App Store Connect, go to **Users and Access → Integrations → App Store Connect API → Team Keys → +**. Name it *GitHub CI*, give it the **App Manager** role, and download `AuthKey_XXXXXXXXXX.p8`. You can only download this file once. Note the **Key ID** and the **Issuer ID** shown above the list.

**6. Find your Team ID** at developer.apple.com under **Account → Membership details**. It's 10 characters long.

**7. Add the GitHub secrets.** Go to **Settings → Secrets and variables → Actions → New repository secret** and create these seven:

| Secret | Value |
|---|---|
| `BUILD_CERTIFICATE_BASE64` | `distribution.p12`, base64-encoded |
| `P12_PASSWORD` | the `.p12` export password |
| `BUILD_PROVISION_PROFILE_BASE64` | the `.mobileprovision` file, base64-encoded |
| `APPLE_TEAM_ID` | the Team ID |
| `APP_STORE_CONNECT_API_KEY_ID` | the Key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | the Issuer ID |
| `APP_STORE_CONNECT_API_KEY_BASE64` | `AuthKey_XXXXXXXXXX.p8`, base64-encoded |

To base64-encode a file:
- **macOS:** `base64 -i file | pbcopy`
- **Linux:** `base64 -w0 file`
- **Windows PowerShell:** `[Convert]::ToBase64String([IO.File]::ReadAllBytes("file"))`

### Getting the build onto your iPhone

1. Push to `main`, or click **Actions → iOS → Run workflow**. Each upload's build number is the workflow run number.
2. Apple processes the build, which takes about 5–15 minutes. It then appears under **App Store Connect → your app → TestFlight**. The app declares `ITSAppUsesNonExemptEncryption = NO`, so you won't get an export-compliance question.
3. Under **Internal Testing**, create a group and add yourself.
4. Install **TestFlight** from the App Store on the iPhone, open it, and install **OVERRUN**. Each TestFlight build lasts 90 days.

If one of the seven secrets is missing, the TestFlight job is skipped and the run shows a notice naming the missing ones. The simulator build still runs.

---

## D. Troubleshooting

| Problem | Fix |
|---|---|
| **No sound** | Check the **ring/silent switch** (the Action button on iPhone 15 Pro and later). OVERRUN uses the *ambient* audio session, so it's silent when the phone is, and it mixes with your music. Turn the volume up. iOS only allows sound after your first tap. |
| **Sound stopped after a call, Siri or switching apps** | Tap the screen once. The game resumes audio on the next touch. |
| **Choppy, about 30 fps** | **Low Power Mode caps the frame rate at 30 fps** in Safari, web apps and native apps alike. Turn it off in Control Centre or Settings → Battery. A hot phone also throttles. If it's still slow, set **Settings → Graphics → Low** in the game. The game also lowers its own resolution automatically when frames drop. |
| **Stuck in portrait / "Rotate your phone"** | Turn off **Portrait Orientation Lock** in Control Centre. iOS doesn't let web apps lock the orientation; the native app is landscape-only. |
| **No "Add to Home Screen"** | You're in an in-app browser. Use **Open in Safari** first. On iOS 26 the option is under **••• → Share**. |
| **Home-screen app shows an old version** | Close it in the app switcher and reopen it. If that doesn't help, long-press the icon, choose **Remove App**, and add it again. |
| **Swiping down from the top opens Notification Centre** | The native app defers edge gestures to the game. Safari and web apps can't block this, so reload with the **RELOAD** button or swipe down in the middle of the screen. |
| **No vibration** | iOS Safari has no vibration API, so haptics only work in the **native app**. Check that **Vibration** is on in the game's settings. |
| **The screen dims during play (web app)** | The game requests a screen wake lock during stages. That needs iOS 16.4+, and for home-screen apps iOS 18.4+. On older iOS, raise **Settings → Display & Brightness → Auto-Lock**. |
| **Xcode: "Signing for App requires a development team"** | See B, step 2. |
| **Xcode: "Failed to register bundle identifier"** | The bundle ID is taken. Use your own, such as `com.yourname.overrun`. |
| **Xcode: "Untrusted Developer" or "Developer Mode disabled"** | See B, steps 4 and 6. |
| **Xcode: missing package or `public` folder errors** | Run `npm ci && npm run build && npx cap sync ios`. The Swift packages point into `node_modules`, and `ios/App/App/public` is generated. Then choose **File → Packages → Reset Package Caches**. |
| **App expired after a week** | Free-account apps last 7 days. Press Run in Xcode again, or use TestFlight (C). |

### Where things live

| Path | What |
|---|---|
| `public/manifest.webmanifest`, `public/icon-*.png`, `public/apple-touch-icon.png`, `public/splash/` | Web app manifest, icons, iOS launch images |
| `scripts/gen-icons.mjs` (`npm run icons`) | Renders every icon and launch image (web, iOS, Android) from `public/icon.svg` with headless Chromium |
| `src/platform/sw-template.js` + `vite.config.ts` | Service worker, generated at build time with the list of hashed files |
| `src/platform/` | iOS web runtime: install hint, audio unlock, Audio Session, wake lock, viewport fixes, gesture blocking |
| `capacitor.config.ts` | Native shell config (`com.overrun.arcade`, dark background, no scrolling or zoom) |
| `ios/App/` | Xcode project (SPM). `ios/App/App/public` and `capacitor.config.json` are generated by `cap sync` and not committed |
| `.github/workflows/ios.yml`, `scripts/ios-signing.mjs` | Simulator build and TestFlight pipeline |
