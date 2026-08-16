import Foundation

/// Prostředí, se kterým aplikace mluví. Každé má vlastní adresu i vlastní klíč –
/// přepnutí mění obojí naráz, jinak by aplikace klepala na test produkčním klíčem
/// a dostávala 401.
///
/// Oba klíče jsou v aplikaci natvrdo a bez obfuskace. Z binárky je stejně jde
/// vytáhnout, takže by schovávání bylo divadlo; slouží k tomu, aby API nešlo
/// pohodlně provolávat curlem. Když některý unikne, vymění se na serveru i tady.
enum AppEnvironment: String {
    case production
    case test

    private static let storageKey = "appEnvironment"

    /// Čte se i z vláken mimo hlavní – proto `UserDefaults` a ne `@Published`
    /// vlastnost. Změny hlásí `AppEnvironmentStore` kvůli překreslení UI.
    static var current: AppEnvironment {
        guard let raw = UserDefaults.standard.string(forKey: storageKey),
              let value = AppEnvironment(rawValue: raw)
        else { return .production }
        return value
    }

    var baseURL: String {
        switch self {
        case .production: return "https://tankuj100.silkroadbrand.eu"
        case .test: return "https://tankuj100-test.silkroadbrand.eu"
        }
    }

    var appKey: String {
        switch self {
        case .production: return "t100_WrtE15YfHu7wW0VhJPUwrUgAt9YXmLwGF2I56kVH"
        case .test: return "t100test_6OmjK2dGBvjC4nBkRCdoPjBpK8JNO0tj2pCA"
        }
    }

    var title: String {
        switch self {
        case .production: return "Produkce"
        case .test: return "Testovací prostředí"
        }
    }

    var other: AppEnvironment {
        self == .production ? .test : .production
    }

    static func select(_ environment: AppEnvironment) {
        UserDefaults.standard.set(environment.rawValue, forKey: storageKey)
    }
}

/// Jen kvůli překreslení UI po přepnutí – zdrojem pravdy zůstává `AppEnvironment.current`.
@MainActor
final class AppEnvironmentStore: ObservableObject {

    static let shared = AppEnvironmentStore()

    @Published private(set) var current: AppEnvironment = AppEnvironment.current

    private init() {}

    /// Vrací prostředí, na které se právě přepnulo, ať má volající co oznámit.
    @discardableResult
    func toggle() -> AppEnvironment {
        let next = current.other
        AppEnvironment.select(next)
        current = next
        return next
    }
}
