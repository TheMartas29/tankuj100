#if DEBUG
import Foundation

/// Spouštěcí přepínače pro ladění a snímkování obrazovek na simulátoru, kde nejde
/// klikat (starší runtime bez přístupu k ovládacímu panelu):
///
///     xcrun simctl launch <udid> cz.silkroad.tankuj100 -openSheet menu
///     xcrun simctl launch <udid> cz.silkroad.tankuj100 -openStation 42
///
/// UserDefaults čte argumenty ve tvaru `-klíč hodnota` samo. V release buildu
/// se celý soubor nepřeloží.
enum DebugLaunch {

    static var sheet: MapSheet? {
        guard let raw = UserDefaults.standard.string(forKey: "openSheet") else { return nil }
        return MapSheet(rawValue: raw)
    }

    static var stationID: Int? {
        let id = UserDefaults.standard.integer(forKey: "openStation")
        return id > 0 ? id : nil
    }

    /// Systémový dotaz na polohu se na starších runtime nedá odklepnout přes simctl
    /// a překrýval by snímanou obrazovku.
    static var skipLocation: Bool {
        UserDefaults.standard.bool(forKey: "skipLocation")
    }
}
#endif
