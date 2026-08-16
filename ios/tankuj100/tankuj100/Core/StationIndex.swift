import CoreLocation
import Foundation

/// Obdélník v zeměpisných souřadnicích. Vlastní typ místo `MKCoordinateRegion`, aby
/// filtrovací jádro nemuselo vědět nic o MapKitu – převod si dělá až mapa.
struct GeoRect {
    var minLat: Double
    var maxLat: Double
    var minLon: Double
    var maxLon: Double

    func contains(lat: Double, lon: Double) -> Bool {
        lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon
    }
}

/// Načtené benzínky přerovnané do sloupců, aby se daly filtrovat i ve stotisícovém
/// množství.
///
/// **Proč paralelní pole a ne pole struktur:** filtr se dotýká jen těch sloupců, které
/// opravdu potřebuje, a čte je z paměti za sebou. U pole struktur by se do cache s každou
/// stanicí táhl i název značky a hodnocení, které při testu jedné masky nikdo nečte –
/// při stotisíci položkách je to rozdíl mezi jedním a několika desítkami milisekund.
///
/// **Značky jsou internované na `Int32`:** porovnávat řetězce u každé stanice a každého
/// překreslení je to nejdražší, co by filtr mohl dělat. Tabulka `brands` je seřazená
/// podle četnosti, protože ve filtru chceme nahoře ty značky, které v seznamu opravdu
/// něco udělají.
///
/// Index je neměnný a staví se jednou po načtení dat – viz `build(from:)`.
final class StationIndex: @unchecked Sendable {

    struct Brand: Identifiable, Hashable {
        let id: Int32
        let name: String
        let count: Int
    }

    /// Jak se ve filtru i v tabulce značek jmenují stanice bez značky. Zároveň je to
    /// klíč, pod kterým se výběr ukládá, takže se nesmí měnit.
    static let unbrandedName = "Bez značky"

    static let empty = StationIndex(stations: [])

    /// Původní záznamy kvůli vykreslení řádku a špendlíku. Filtr do nich nesahá.
    let stations: [GasStation]

    let lat: [Double]
    let lon: [Double]
    let fuelMask: [UInt32]
    let serviceMask: [UInt32]
    let brandID: [Int32]
    let ratingAvg: [Float]
    let ratingCount: [Int32]
    let id: [Int]

    /// Seřazené podle četnosti sestupně, stanice bez značky až na konci.
    let brands: [Brand]

    /// Abecední pořadí značky – `brands` je podle četnosti, takže na řazení seznamu
    /// bez polohy se použít nedá.
    private let brandRank: [Int32]
    private let brandIDByName: [String: Int32]

    var count: Int { id.count }

    init(stations: [GasStation]) {
        self.stations = stations
        let total = stations.count

        // 1) Četnosti značek. Jeden průchod, klíčem je rovnou to, co uvidí uživatel.
        var counts: [String: Int] = [:]
        counts.reserveCapacity(128)
        for station in stations {
            let name = station.brandName ?? Self.unbrandedName
            counts[name.isEmpty ? Self.unbrandedName : name, default: 0] += 1
        }

        // 2) Pořadí ve filtru: nejčastější nahoře, „Bez značky“ vždy dole – je to
        //    zbytková kategorie, ne značka, a bývá jich hodně.
        let unbranded = Self.unbrandedName
        let ordered = counts.sorted { left, right in
            if (left.key == unbranded) != (right.key == unbranded) { return right.key == unbranded }
            if left.value != right.value { return left.value > right.value }
            return left.key.localizedCaseInsensitiveCompare(right.key) == .orderedAscending
        }

        var brands: [Brand] = []
        brands.reserveCapacity(ordered.count)
        var brandIDByName: [String: Int32] = [:]
        brandIDByName.reserveCapacity(ordered.count)
        for (position, entry) in ordered.enumerated() {
            let identifier = Int32(position)
            brands.append(Brand(id: identifier, name: entry.key, count: entry.value))
            brandIDByName[entry.key] = identifier
        }
        self.brands = brands
        self.brandIDByName = brandIDByName

        var brandRank = [Int32](repeating: 0, count: brands.count)
        let alphabetical = brands.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        for (position, brand) in alphabetical.enumerated() {
            brandRank[Int(brand.id)] = Int32(position)
        }
        self.brandRank = brandRank

        // 3) Sloupce. Rezervace dopředu, ať se pole během plnění nepřealokovávají.
        var lat = [Double](); lat.reserveCapacity(total)
        var lon = [Double](); lon.reserveCapacity(total)
        var fuelMask = [UInt32](); fuelMask.reserveCapacity(total)
        var serviceMask = [UInt32](); serviceMask.reserveCapacity(total)
        var brandColumn = [Int32](); brandColumn.reserveCapacity(total)
        var ratingAvg = [Float](); ratingAvg.reserveCapacity(total)
        var ratingCount = [Int32](); ratingCount.reserveCapacity(total)
        var ids = [Int](); ids.reserveCapacity(total)

        for station in stations {
            lat.append(station.lat)
            lon.append(station.lon)
            fuelMask.append(station.fuelMask)
            serviceMask.append(station.serviceMask)
            let name = station.brandName ?? unbranded
            brandColumn.append(brandIDByName[name.isEmpty ? unbranded : name] ?? 0)
            ratingAvg.append(Float(station.ratingAvg ?? 0))
            ratingCount.append(Int32(station.ratingCount ?? 0))
            ids.append(station.id)
        }

        self.lat = lat
        self.lon = lon
        self.fuelMask = fuelMask
        self.serviceMask = serviceMask
        self.brandID = brandColumn
        self.ratingAvg = ratingAvg
        self.ratingCount = ratingCount
        self.id = ids
    }

    /// Stavba indexu patří mimo hlavní vlákno – při stotisíci stanicích je to práce
    /// na desítky milisekund, což by bylo vidět jako zaseknutá mapa.
    static func build(from stations: [GasStation]) async -> StationIndex {
        await Task.detached(priority: .userInitiated) { StationIndex(stations: stations) }.value
    }

    func station(forRow row: Int32) -> GasStation { stations[Int(row)] }

    func coordinate(forRow row: Int32) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat[Int(row)], longitude: lon[Int(row)])
    }

    func brandID(named name: String) -> Int32? { brandIDByName[name] }

    // MARK: - Filtrování

    /// Vrací indexy do sloupců, ne kopie stanic – i při stotisíci stanicích je to
    /// jedno souvislé pole `Int32`, které se dá levně předat na hlavní vlákno.
    func rows(matching filter: StationFilter, favorites: Set<Int>) -> [Int32] {
        let fuels = filter.fuels
        let services = filter.services
        let minRating = Float(filter.minRating ?? 0)
        let favoritesOnly = filter.favoritesOnly

        // Vybrané značky se převedou na pole `Bool` indexované ID značky: jeden dotaz
        // do pole místo hashování v `Set` u každé stanice.
        var brandAllowed: [Bool] = []
        if !filter.brands.isEmpty {
            brandAllowed = [Bool](repeating: false, count: brands.count)
            for identifier in filter.brands where identifier >= 0 && Int(identifier) < brands.count {
                brandAllowed[Int(identifier)] = true
            }
        }
        let checksBrand = !brandAllowed.isEmpty

        var matched = [Int32]()
        matched.reserveCapacity(filter.isEmpty ? count : min(count, 8192))

        for row in 0..<count {
            // Palivo bere „aspoň jedno z vybraných“ – kdo chce sto oktanů nebo osmadevadesát,
            // hledá jednu pumpu, ne pumpu s obojím. U služeb je to naopak: myčka a nonstop
            // dávají smysl jen dohromady.
            if fuels != 0 && fuelMask[row] & fuels == 0 { continue }
            if services != 0 && serviceMask[row] & services != services { continue }
            if checksBrand && !brandAllowed[Int(brandID[row])] { continue }
            if minRating > 0 && (ratingCount[row] <= 0 || ratingAvg[row] < minRating) { continue }
            if favoritesOnly && !favorites.contains(id[row]) { continue }
            matched.append(Int32(row))
        }
        return matched
    }

    /// Jen počet – používá ho filtr pro živý údaj „Zobrazit 1 234 benzínek“.
    func matchCount(for filter: StationFilter, favorites: Set<Int>) -> Int {
        rows(matching: filter, favorites: favorites).count
    }

    // MARK: - Řazení

    /// Vzdálenosti se počítají **jednou dopředu**, ne v porovnávači: ten si o hodnotu
    /// řekne u každé dvojice znovu, takže by se u stotisíce stanic počítal haversine
    /// přes milionkrát (viz commit e1c9ad9, kde se to řešilo u seznamu).
    ///
    /// Vrácené pole vzdáleností je indexované řádkem, ne pořadím ve výsledku – řádek
    /// je jediné, co má seznam i mapa po ruce.
    func sortedByDistance(_ rows: [Int32], from origin: CLLocationCoordinate2D)
        -> (rows: [Int32], distanceByRow: [CLLocationDistance])
    {
        var distanceByRow = [CLLocationDistance](repeating: 0, count: count)
        var pairs = [(distance: CLLocationDistance, row: Int32)]()
        pairs.reserveCapacity(rows.count)

        for row in rows {
            let position = Int(row)
            let distance = GeoDistance.meters(
                from: origin,
                to: CLLocationCoordinate2D(latitude: lat[position], longitude: lon[position]))
            distanceByRow[position] = distance
            pairs.append((distance, row))
        }

        pairs.sort { $0.distance < $1.distance }
        return (pairs.map(\.row), distanceByRow)
    }

    /// Náhradní řazení, když polohu nemáme. Obec by byla lepší, ale `/api/map/` ji
    /// kvůli velikosti odpovědi neposílá, takže druhé kritérium je ID stanice –
    /// jde jen o to, aby pořadí bylo stálé a seznam pod rukou neposkakoval.
    func sortedByBrand(_ rows: [Int32]) -> [Int32] {
        rows.sorted { left, right in
            let leftRank = brandRank[Int(brandID[Int(left)])]
            let rightRank = brandRank[Int(brandID[Int(right)])]
            if leftRank != rightRank { return leftRank < rightRank }
            return id[Int(left)] < id[Int(right)]
        }
    }

    // MARK: - Výřez pro mapu

    /// Řádky uvnitř obdélníku, nejvýš `limit` kusů.
    ///
    /// Když se jich vejde víc, bere se každý n-tý. Ne nejbližší ke středu: to by
    /// udělalo hustý chuchvalec uprostřed a prázdné okraje. Rovnoměrný výběr z pořadí,
    /// v jakém data přišla, drží hustotu špendlíků zhruba tam, kde je hustota pump.
    func rows(_ rows: [Int32], inside rect: GeoRect, limit: Int) -> [Int32] {
        var visible = [Int32]()
        visible.reserveCapacity(min(rows.count, limit * 2))
        for row in rows {
            let position = Int(row)
            if rect.contains(lat: lat[position], lon: lon[position]) { visible.append(row) }
        }
        guard visible.count > limit, limit > 0 else { return visible }

        let step = Double(visible.count) / Double(limit)
        var trimmed = [Int32]()
        trimmed.reserveCapacity(limit)
        var cursor = 0.0
        while trimmed.count < limit {
            let position = Int(cursor)
            if position >= visible.count { break }
            trimmed.append(visible[position])
            cursor += step
        }
        return trimmed
    }
}

/// Výsledek filtru: co se má ukázat v seznamu i v mapě.
///
/// Je to třída schválně – seznam i mapa pak poznají „nic nového nepřišlo“ porovnáním
/// `revision`, ne procházením stotisícového pole.
final class FilteredStations: @unchecked Sendable {

    static let empty = FilteredStations(index: .empty, rows: [], distanceByRow: [], revision: 0)

    let index: StationIndex
    /// Indexy do `index`, už seřazené.
    let rows: [Int32]
    /// Vzdálenost podle řádku; prázdné, když polohu neznáme.
    let distanceByRow: [CLLocationDistance]
    /// Roste s každým novým výsledkem. Slouží k levnému porovnání „změnilo se něco?“.
    let revision: UInt64

    var count: Int { rows.count }
    var isEmpty: Bool { rows.isEmpty }
    var hasDistances: Bool { !distanceByRow.isEmpty }

    init(index: StationIndex, rows: [Int32], distanceByRow: [CLLocationDistance], revision: UInt64) {
        self.index = index
        self.rows = rows
        self.distanceByRow = distanceByRow
        self.revision = revision
    }

    func station(forRow row: Int32) -> GasStation { index.station(forRow: row) }

    func distance(forRow row: Int32) -> CLLocationDistance? {
        distanceByRow.isEmpty ? nil : distanceByRow[Int(row)]
    }

    /// Podmnožina pro záložku Oblíbené. Pořadí i vzdálenosti zůstávají, jen se řádky
    /// prosejí – nemá smysl kvůli tomu filtrovat a řadit znovu.
    func keepingOnly(_ ids: Set<Int>) -> [Int32] {
        guard !ids.isEmpty else { return [] }
        return rows.filter { ids.contains(index.id[Int($0)]) }
    }
}
