import AppKit
import MetalKit
import ScreenSaver

@objc(BesaidScreensaverView)
public final class BesaidScreensaverView: ScreenSaverView {
    private var mtkView: MTKView!
    private var renderer: Renderer!
    private var audio: AudioController!
    private let prefs = Preferences.shared

    public override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0 / 60.0
        wantsLayer = true
        setupMetal(isPreview: isPreview)
        audio = AudioController()
    }

    public required init?(coder: NSCoder) { nil }

    private func setupMetal(isPreview: Bool) {
        guard let device = MTLCreateSystemDefaultDevice() else {
            NSLog("BesaidScreensaver: no Metal device")
            return
        }
        mtkView = MTKView(frame: bounds, device: device)
        mtkView.autoresizingMask = [.width, .height]
        mtkView.colorPixelFormat = .bgra8Unorm_srgb
        mtkView.depthStencilPixelFormat = .depth32Float
        mtkView.clearColor = MTLClearColorMake(0, 0, 0, 1)
        mtkView.preferredFramesPerSecond = isPreview ? 30 : 60
        mtkView.isPaused = true
        mtkView.enableSetNeedsDisplay = false
        addSubview(mtkView)

        do {
            renderer = try Renderer(view: mtkView, isPreview: isPreview)
            mtkView.delegate = renderer
        } catch {
            NSLog("BesaidScreensaver: renderer failed: \(error)")
        }
    }

    public override func startAnimation() {
        super.startAnimation()
        mtkView?.isPaused = false
        if prefs.audioEnabled { audio.start() }
    }

    public override func stopAnimation() {
        super.stopAnimation()
        mtkView?.isPaused = true
        audio.stop()
    }

    public override func animateOneFrame() {
        mtkView?.draw()
    }

    public override var hasConfigureSheet: Bool { true }

    public override var configureSheet: NSWindow? {
        ConfigureSheet.make(onClose: { [weak self] in
            self?.renderer?.applyPreferences()
            if self?.prefs.audioEnabled == true {
                self?.audio.start()
            } else {
                self?.audio.stop()
            }
        })
    }
}
