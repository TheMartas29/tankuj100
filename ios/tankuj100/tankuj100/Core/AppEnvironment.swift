import Foundation

/// Prostředí, se kterým aplikace mluví. **Určuje se při překladu, ne za běhu.**
///
/// Schéma `tankuj100` staví ostrou aplikaci, schéma `tankuj100 TEST` testovací –
/// mají jiné bundle ID, takže jdou mít v telefonu obě vedle sebe a nemůže se stát,
/// že by si někdo omylem nechal ostrou appku ukazovat testovací data.
///
/// Dřív to řešil skrytý přepínač (sedm klepnutí na verzi) a v binárce byly oba klíče.
/// Tohle je lepší ve třech ohledech: v každém buildu je jen jeho vlastní klíč,
/// odpadá riziko, že si uživatel prostředí přepne omylem, a hlavně to není skrytá
/// nepopsaná funkce, kterou App Review zakazuje (Guideline 2.3.1).
enum AppEnvironment {

    #if TANKUJ_TEST
    static let current: AppEnvironment = .test
    #else
    static let current: AppEnvironment = .production
    #endif

    case production
    case test

    /// Testovací build to dává najevo pruhem přes celou šířku mapy. Z testovacích dat
    /// se snadno udělá hlášení chyby, která v ostré aplikaci není.
    static var isTest: Bool { current == .test }

    var baseURL: String {
        switch self {
        case .production: return "https://tankuj100.silkroadbrand.eu"
        case .test: return "https://tankuj100-test.silkroadbrand.eu"
        }
    }

    /// Klíč není tajemství – z binárky ho jde vytáhnout. Odfiltruje boty a `curl`,
    /// proti cílenému zneužití nepomůže. Podstatné je, že každý build nese jen ten
    /// svůj: kdo rozebere ostrou aplikaci, na testovací prostředí se nedostane.
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
}
