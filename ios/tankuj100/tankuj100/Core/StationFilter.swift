import CoreLocation
import Foundation

/// Nastavení filtru. Hodnotový typ schválně: `Equatable` umožní levně poznat, že se
/// nic nezměnilo a přepočítávat se nemusí, a `Codable` ho přenese přes restart.
///
/// Značky jsou uvnitř dvakrát: `brands` jsou internovaná ID pro rychlé porovnání
/// (jeden dotaz do pole místo porovnávání řetězců u sta tisíc stanic), `brandNames`
/// jsou názvy, které jediné mají smysl ukládat – ID platí vždy jen pro konkrétní
/// index a po novém načtení dat se můžou posunout. Po přestavbě indexu se ID doplní
/// v `rebind(to:)`.
struct StationFilter: Equatable, Codable {

    /// Maska paliv – stanici stačí mít **aspoň jedno** z vybraných.
    var fuels: UInt32 = 0
    /// Maska služeb – stanice musí mít **všechny** vybrané.
    var services: UInt32 = 0
    var brandNames: Set<String> = []
    var favoritesOnly = false
    /// Minimální průměrné hodnocení; `nil` = nezáleží.
    var minRating: Int?

    private(set) var brands: Set<Int32> = []

    /// `brands` se neukládá – po restartu se dopočítá z názvů.
    private enum CodingKeys: String, CodingKey {
        case fuels, services, brandNames, favoritesOnly, minRating
    }

    var isEmpty: Bool {
        fuels == 0 && services == 0 && brandNames.isEmpty && !favoritesOnly && minRating == nil
    }

    /// Kolik podmínek je zapnutých – číslo do odznaku u tlačítka filtru. Počítají se
    /// skupiny, ne jednotlivá zaškrtnutí: „3“ je pro odznak čitelnější než „17“.
    var activeCount: Int {
        var active = 0
        if fuels != 0 { active += 1 }
        if services != 0 { active += 1 }
        if !brandNames.isEmpty { active += 1 }
        if favoritesOnly { active += 1 }
        if minRating != nil { active += 1 }
        return active
    }

    func contains(_ flag: FuelFlag) -> Bool { fuels & flag.bit != 0 }
    func contains(_ flag: ServiceFlag) -> Bool { services & flag.bit != 0 }

    mutating func toggle(_ flag: FuelFlag) { fuels ^= flag.bit }
    mutating func toggle(_ flag: ServiceFlag) { services ^= flag.bit }

    func isSelected(_ brand: StationIndex.Brand) -> Bool { brandNames.contains(brand.name) }

    mutating func setBrand(_ brand: StationIndex.Brand, selected: Bool) {
        if selected {
            brandNames.insert(brand.name)
            brands.insert(brand.id)
        } else {
            brandNames.remove(brand.name)
            brands.remove(brand.id)
        }
    }

    mutating func clearBrands() {
        brandNames.removeAll()
        brands.removeAll()
    }

    /// Po novém načtení dat se ID značek přerozdělí (jsou to pozice v tabulce seřazené
    /// podle četnosti). Názvy zůstávají, takže se z nich výběr obnoví; značka, která
    /// v nových datech není, se z filtru tiše vypustí – jinak by filtr nevracel nic
    /// a uživatel by nevěděl proč.
    mutating func rebind(to index: StationIndex) {
        var resolvedNames = Set<String>()
        var resolvedIDs = Set<Int32>()
        for name in brandNames {
            guard let identifier = index.brandID(named: name) else { continue }
            resolvedNames.insert(name)
            resolvedIDs.insert(identifier)
        }
        brandNames = resolvedNames
        brands = resolvedIDs
    }
}

/// Sdílený stav filtru pro mapu i seznam.
///
/// Jedináček schválně: filtr má být podle zadání jeden pro celou aplikaci a stejně tak
/// index – postavit ho zvlášť pro mapu a zvlášť pro seznam by při stotisíci stanicích
/// znamenalo dvojí práci i dvojí paměť.
///
/// Všechno těžké (stavba indexu, filtrování, řazení) běží mimo hlavní vlákno a výsledek
/// se publikuje **jedním přiřazením** do `result`.
@MainActor
final class StationFilterStore: ObservableObject {

    static let shared = StationFilterStore()

    @Published private(set) var index: StationIndex = .empty
    @Published private(set) var result: FilteredStations = .empty
    @Published private(set) var filter: StationFilter
    /// Svítí, dokud běží přepočet na pozadí – seznam podle toho ukáže spinner.
    @Published private(set) var isWorking = false

    private var favorites: Set<Int> = []
    private var origin: CLLocationCoordinate2D?
    /// Roste s každým zadaným přepočtem; starší výsledek se podle něj zahodí.
    private var revision: UInt64 = 0
    private var loadedSignature: Int?

    private static let storageKey = "stationFilter"

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.storageKey),
           let stored = try? JSONDecoder().decode(StationFilter.self, from: data) {
            filter = stored
        } else {
            filter = StationFilter()
        }
    }

    // MARK: - Data

    /// Postaví index z načtených benzínek. Volá se z mapy i ze seznamu, proto se stejná
    /// data poznají podle otisku a nestaví se dvakrát. `force` je pro přepnutí prostředí,
    /// kde se může sejít stejný počet stanic z jiného serveru.
    func load(_ stations: [GasStation], force: Bool = false) async {
        let signature = Self.signature(of: stations)
        guard force || signature != loadedSignature else { return }
        loadedSignature = signature

        let built = await StationIndex.build(from: stations)
        index = built
        // Prázdný index neznamená „značka z dat zmizela“, ale „data ještě nedorazila“ –
        // mapa i seznam sem hned po startu chodí s prázdným polem, než doběhne stahování.
        // Bez téhle podmínky si `rebind` uložené názvy značek pokaždé smazal a filtr
        // po každém spuštění tiše přišel o vybrané značky.
        if !built.brands.isEmpty { filter.rebind(to: built) }
        recompute()
    }

    private static func signature(of stations: [GasStation]) -> Int {
        var hasher = Hasher()
        hasher.combine(stations.count)
        hasher.combine(stations.first?.id ?? -1)
        hasher.combine(stations.last?.id ?? -1)
        return hasher.finalize()
    }

    // MARK: - Vstupy

    func apply(_ newFilter: StationFilter) {
        guard newFilter != filter else { return }
        filter = newFilter
        persist()
        recompute()
    }

    func clearFilter() { apply(StationFilter()) }

    func setFavorites(_ ids: Set<Int>) {
        guard ids != favorites else { return }
        favorites = ids
        // Na výsledek mají vliv jen tehdy, když se podle nich filtruje; záložka
        // Oblíbené v seznamu si je prosívá sama.
        guard filter.favoritesOnly else { return }
        recompute()
    }

    /// Nová poloha mění pořadí celého seznamu, takže se na každý pohyb o metr
    /// přepočítávat nesmí – GPS jich pošle několik za sekundu.
    func setOrigin(_ location: CLLocation?) {
        guard let coordinate = location?.coordinate else {
            guard origin != nil else { return }
            origin = nil
            recompute()
            return
        }
        if let origin, GeoDistance.meters(from: origin, to: coordinate) < Self.originThreshold { return }
        origin = coordinate
        recompute()
    }

    private static let originThreshold: CLLocationDistance = 150

    // MARK: - Přepočet

    private func recompute() {
        revision &+= 1
        let token = revision
        let index = self.index
        let filter = self.filter
        let favorites = self.favorites
        let origin = self.origin
        isWorking = true

        Task.detached(priority: .userInitiated) {
            let matched = index.rows(matching: filter, favorites: favorites)
            let outcome: FilteredStations
            if let origin {
                let sorted = index.sortedByDistance(matched, from: origin)
                outcome = FilteredStations(index: index,
                                           rows: sorted.rows,
                                           distanceByRow: sorted.distanceByRow,
                                           revision: token)
            } else {
                outcome = FilteredStations(index: index,
                                           rows: index.sortedByBrand(matched),
                                           distanceByRow: [],
                                           revision: token)
            }
            await MainActor.run {
                // Mezitím mohl přijít novější filtr; starší výsledek by ho přepsal zpět.
                guard token == self.revision else { return }
                self.result = outcome
                self.isWorking = false
            }
        }
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(filter) else { return }
        UserDefaults.standard.set(data, forKey: Self.storageKey)
    }
}
