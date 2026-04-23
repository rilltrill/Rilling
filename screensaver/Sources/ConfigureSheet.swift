import AppKit

enum ConfigureSheet {
    static func make(onClose: @escaping () -> Void) -> NSWindow {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 220),
            styleMask: [.titled],
            backing: .buffered,
            defer: false)
        window.title = "Besaid Screensaver"

        let prefs = Preferences.shared
        let content = NSView(frame: window.contentView!.bounds)

        let audioCheck = NSButton(checkboxWithTitle: "Play Besaid Island BGM",
                                  target: nil, action: nil)
        audioCheck.state = prefs.audioEnabled ? .on : .off
        audioCheck.frame = NSRect(x: 20, y: 170, width: 320, height: 22)

        let todLabel = NSTextField(labelWithString: "Time of day:")
        todLabel.frame = NSRect(x: 20, y: 130, width: 100, height: 20)
        let todPopup = NSPopUpButton(frame: NSRect(x: 120, y: 128, width: 220, height: 24))
        todPopup.addItems(withTitles: TimeOfDay.allCases.map(\.label))
        todPopup.selectItem(at: prefs.timeOfDay.rawValue)

        let volLabel = NSTextField(labelWithString: "Volume:")
        volLabel.frame = NSRect(x: 20, y: 92, width: 100, height: 20)
        let volSlider = NSSlider(value: Double(prefs.volume),
                                 minValue: 0, maxValue: 1,
                                 target: nil, action: nil)
        volSlider.frame = NSRect(x: 120, y: 90, width: 220, height: 22)

        let done = NSButton(title: "Done", target: SheetCoordinator.shared,
                            action: #selector(SheetCoordinator.close(_:)))
        done.bezelStyle = .rounded
        done.keyEquivalent = "\r"
        done.frame = NSRect(x: 270, y: 20, width: 70, height: 32)

        content.addSubview(audioCheck)
        content.addSubview(todLabel)
        content.addSubview(todPopup)
        content.addSubview(volLabel)
        content.addSubview(volSlider)
        content.addSubview(done)
        window.contentView = content

        SheetCoordinator.shared.bind(
            window: window,
            audio: audioCheck,
            tod: todPopup,
            volume: volSlider,
            onClose: onClose)
        return window
    }
}

final class SheetCoordinator: NSObject {
    static let shared = SheetCoordinator()
    private var window: NSWindow?
    private var audio: NSButton?
    private var tod: NSPopUpButton?
    private var volume: NSSlider?
    private var onClose: (() -> Void)?

    func bind(window: NSWindow, audio: NSButton, tod: NSPopUpButton,
              volume: NSSlider, onClose: @escaping () -> Void) {
        self.window = window
        self.audio = audio
        self.tod = tod
        self.volume = volume
        self.onClose = onClose
    }

    @objc func close(_ sender: Any?) {
        let prefs = Preferences.shared
        if let a = audio { prefs.audioEnabled = (a.state == .on) }
        if let t = tod, let v = TimeOfDay(rawValue: t.indexOfSelectedItem) {
            prefs.timeOfDay = v
        }
        if let v = volume { prefs.volume = Float(v.doubleValue) }
        onClose?()
        window?.sheetParent?.endSheet(window!)
    }
}
