import AVFoundation
import Foundation

final class AudioController {
    private var player: AVAudioPlayer?

    private var assetURL: URL? {
        let support = FileManager.default.urls(for: .applicationSupportDirectory,
                                               in: .userDomainMask).first
        let candidates = ["besaid.m4a", "besaid.aac", "besaid.mp3"]
        for name in candidates {
            if let url = support?.appendingPathComponent("BesaidScreensaver/\(name)"),
               FileManager.default.fileExists(atPath: url.path) {
                return url
            }
        }
        return nil
    }

    func start() {
        guard player == nil, let url = assetURL else { return }
        do {
            let p = try AVAudioPlayer(contentsOf: url)
            p.numberOfLoops = -1
            p.volume = Preferences.shared.volume
            p.prepareToPlay()
            p.play()
            player = p
        } catch {
            NSLog("BesaidScreensaver: audio failed: \(error)")
        }
    }

    func stop() {
        player?.stop()
        player = nil
    }
}
