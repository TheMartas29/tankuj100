import Foundation

/// Sleduje, jestli se u některé z mých žádostí změnil stav a já jsem to ještě neviděl.
///
/// Aplikace nemá push notifikace, takže se to zjišťuje dotazem – při startu a při
/// návratu z pozadí (`scenePhase`). V `UserDefaults` se drží mapa `id → naposledy
/// viděný stav`; rozdíl proti odpovědi serveru je nepřečtená změna.
///
/// Klíčové je, že se naposledy viděný stav u změněné žádosti **nepřepisuje** hned
/// po načtení – jinak by odznak po druhém dotazu tiše zhasl, aniž by si ho uživatel
/// stihl všimnout. Zapíše ho až `markSeen()`, tedy zobrazení záložky s žádostmi.
@MainActor
final class StationRequestBadge: ObservableObject {

    @Published private(set) var hasUnread: Bool

    private let seenKey = "stationRequestSeenStatus"
    private let unreadKey = "stationRequestHasUnread"
    private let defaults: UserDefaults
    private let client = APIClient.shared

    /// Stavy z posledního načtení. Podle nich `markSeen()` ví, co má zapsat.
    private var lastKnown: [Int: String] = [:]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        // Odznak přežije restart: dokud se dotaz nevrátí, platí to, co jsme věděli
        // naposledy. Jinak by po startu na chvíli zmizel a znovu naskočil.
        hasUnread = defaults.bool(forKey: unreadKey)
    }

    /// Zeptá se serveru sám. Volá se při startu a po návratu z pozadí.
    func refresh() async {
        guard case .success(let requests) = await client.myStationRequests() else { return }
        apply(requests)
    }

    /// Použije seznam, který si právě načetla obrazovka žádostí – ať se stejný
    /// endpoint nevolá dvakrát za sebou.
    func apply(_ requests: [StationRequest]) {
        var seen = storedSeen()
        var known: [Int: String] = [:]
        var pruned: [String: String] = [:]
        var changed = false

        for request in requests {
            let key = String(request.id)
            known[request.id] = request.statusRaw

            if let last = seen[key] {
                if last != request.statusRaw { changed = true }
                pruned[key] = last
            } else {
                // Vlastní čerstvě odeslaná žádost není novinka. Zapíšeme ji rovnou
                // jako viděnou, ať se pozná až ta skutečná změna stavu.
                pruned[key] = request.statusRaw
            }
        }

        lastKnown = known
        seen = pruned
        store(seen)
        setUnread(changed)
    }

    /// Uživatel si žádosti prohlédl – odznak zhasne a stavy se zapíšou jako viděné.
    func markSeen() {
        guard hasUnread || !lastKnown.isEmpty else { return }
        var seen = storedSeen()
        for (id, status) in lastKnown { seen[String(id)] = status }
        store(seen)
        setUnread(false)
    }

    private func storedSeen() -> [String: String] {
        defaults.dictionary(forKey: seenKey) as? [String: String] ?? [:]
    }

    private func store(_ seen: [String: String]) {
        defaults.set(seen, forKey: seenKey)
    }

    private func setUnread(_ value: Bool) {
        defaults.set(value, forKey: unreadKey)
        guard hasUnread != value else { return }
        hasUnread = value
    }
}
