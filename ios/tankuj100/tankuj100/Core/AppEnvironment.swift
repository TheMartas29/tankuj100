import Foundation

/// Prostředí, se kterým aplikace mluví.
///
/// Produkce je výchozí a jediná, kam se dá dostat bez kódu. Testovací klíč
/// **není v binárce** – zadává se ručně ve vývojářském nastavení a ukládá se do
/// `UserDefaults`. Kdo rozebere aplikaci, najde jen produkční klíč.
enum AppEnvironment: String {
    case production
    case test

    private static let environmentKey = "appEnvironment"
    private static let testAppKeyKey = "testAppKey"

    /// Čte se i z vláken mimo hlavní – proto `UserDefaults` a ne `@Published`
    /// vlastnost. Změny hlásí `AppEnvironmentStore` kvůli překreslení UI.
    static var current: AppEnvironment {
        guard let raw = UserDefaults.standard.string(forKey: environmentKey),
              let value = AppEnvironment(rawValue: raw),
              value.isUsable
        else { return .production }
        return value
    }

    static var storedTestKey: String {
        UserDefaults.standard.string(forKey: testAppKeyKey) ?? ""
    }

    var baseURL: String {
        switch self {
        case .production: return "https://tankuj100.silkroadbrand.eu"
        case .test: return "https://tankuj100-test.silkroadbrand.eu"
        }
    }

    var appKey: String {
        switch self {
        case .production: return APIClient.productionKey
        case .test: return Self.storedTestKey
        }
    }

    var title: String {
        switch self {
        case .production: return "Produkce"
        case .test: return "Testovací prostředí"
        }
    }

    /// Test bez uloženého klíče by jen sypal 401 – v takovém případě se tváříme
    /// jako produkce, ať se aplikace nezasekne v nepoužitelném stavu.
    private var isUsable: Bool {
        self == .production || !Self.storedTestKey.isEmpty
    }

    static func activateTest(key: String) {
        UserDefaults.standard.set(key, forKey: testAppKeyKey)
        UserDefaults.standard.set(AppEnvironment.test.rawValue, forKey: environmentKey)
    }

    static func activateProduction() {
        UserDefaults.standard.removeObject(forKey: testAppKeyKey)
        UserDefaults.standard.set(AppEnvironment.production.rawValue, forKey: environmentKey)
    }
}

/// Jen kvůli překreslení UI po přepnutí – zdrojem pravdy zůstává `AppEnvironment.current`.
@MainActor
final class AppEnvironmentStore: ObservableObject {

    static let shared = AppEnvironmentStore()

    @Published private(set) var current: AppEnvironment = AppEnvironment.current

    private init() {}

    func useTest(key: String) {
        AppEnvironment.activateTest(key: key)
        current = AppEnvironment.current
    }

    func useProduction() {
        AppEnvironment.activateProduction()
        current = AppEnvironment.current
    }
}
