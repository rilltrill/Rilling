import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        AppDelegate.configureAudioSession()
        // Arcade game: never dim / lock the screen mid-fight (SceneDelegate
        // toggles this as the app moves between foreground and background).
        application.isIdleTimerDisabled = true
        return true
    }

    /// `.ambient`: the game's sound respects the ring/silent switch and mixes
    /// with whatever the player is already listening to — Apple's guidance for
    /// games. (The web layer also sets navigator.audioSession.type = 'ambient'.)
    static func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.ambient, mode: .default)
            try session.setActive(true)
        } catch {
            NSLog("[OVERRUN] AVAudioSession setup failed: \(error)")
        }
    }

    // With the UIScene lifecycle, foreground/background callbacks arrive in SceneDelegate.

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
