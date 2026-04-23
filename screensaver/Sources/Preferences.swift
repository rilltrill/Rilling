import Foundation
import ScreenSaver

enum TimeOfDay: Int, CaseIterable {
    case dawn = 0, noon = 1, sunset = 2, night = 3
    var label: String {
        switch self {
        case .dawn:   return "Dawn"
        case .noon:   return "Noon"
        case .sunset: return "Sunset"
        case .night:  return "Night"
        }
    }
}

final class Preferences {
    static let shared = Preferences()
    private let store = ScreenSaverDefaults(forModuleWithName: "local.besaid.screensaver")!

    private enum Keys {
        static let audio = "audioEnabled"
        static let tod   = "timeOfDay"
        static let vol   = "volume"
    }

    init() {
        store.register(defaults: [
            Keys.audio: false,
            Keys.tod: TimeOfDay.noon.rawValue,
            Keys.vol: 0.5,
        ])
    }

    var audioEnabled: Bool {
        get { store.bool(forKey: Keys.audio) }
        set { store.set(newValue, forKey: Keys.audio); store.synchronize() }
    }

    var timeOfDay: TimeOfDay {
        get { TimeOfDay(rawValue: store.integer(forKey: Keys.tod)) ?? .noon }
        set { store.set(newValue.rawValue, forKey: Keys.tod); store.synchronize() }
    }

    var volume: Float {
        get { store.float(forKey: Keys.vol) }
        set { store.set(newValue, forKey: Keys.vol); store.synchronize() }
    }
}
