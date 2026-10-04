import UIKit
import WebKit
import Capacitor

/// Root view controller (wired up in SceneDelegate and Main.storyboard):
/// Capacitor's bridge plus the tweaks an arcade shooter needs on iPhone.
class MainViewController: CAPBridgeViewController {

    private static let backdrop = UIColor(red: 7 / 255, green: 8 / 255, blue: 12 / 255, alpha: 1) // #07080c

    // No status bar, ever (Info.plist also sets UIStatusBarHidden).
    override var prefersStatusBarHidden: Bool { true }

    // Fade the home indicator out while playing…
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    // …and make swipes from any edge go to the game first: a frantic swipe-down
    // to reload must not open Notification Centre or send the player home.
    // (The system gesture still works with a second swipe.)
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        view.backgroundColor = Self.backdrop
        guard let webView = webView else { return }
        // Dark until the first frame paints — no white flash on launch.
        webView.isOpaque = false
        webView.backgroundColor = Self.backdrop
        webView.scrollView.backgroundColor = Self.backdrop
        // The game is a single fixed canvas: no rubber-banding, zoom or insets.
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.allowsLinkPreview = false
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        setNeedsStatusBarAppearanceUpdate()
    }
}
