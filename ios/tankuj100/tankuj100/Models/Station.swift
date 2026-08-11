import CoreLocation
import Foundation

struct StationService: Codable, Hashable {
    let key: String
    let value: String
}

struct GasStationDetail: Codable, Identifiable {
    let id: Int
    let osmId: String?
    let lat: Double
    let lon: Double
    let brandName: String?
    let brandId: Int?
    // Adresní pole u OSM bodů běžně chybí – proto všechno volitelné, ať se detail
    // kvůli neúplnému záznamu vůbec nenačte.
    let name: String?
    let city: String?
    let address: String?
    let zip: String?
    let phone: String?
    let worktime: String?
    let fuels: [String]?
    let services: [StationService]?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    enum CodingKeys: String, CodingKey {
        case id, lat, lon
        case osmId = "osm_id"
        case brandName = "brand_name"
        case brandId = "brand_id"
        case name, city, address, zip, phone, worktime, fuels, services
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        lat = try container.decode(Double.self, forKey: .lat)
        lon = try container.decode(Double.self, forKey: .lon)
        osmId = try container.decodeIfPresent(String.self, forKey: .osmId)
        brandName = try container.decodeIfPresent(String.self, forKey: .brandName)
        brandId = try container.decodeIfPresent(Int.self, forKey: .brandId)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        city = try container.decodeIfPresent(String.self, forKey: .city)
        address = try container.decodeIfPresent(String.self, forKey: .address)
        zip = try container.decodeIfPresent(String.self, forKey: .zip)
        phone = try container.decodeIfPresent(String.self, forKey: .phone)
        worktime = try container.decodeIfPresent(String.self, forKey: .worktime)
        // Starý server posílal `services` jako jeden řetězec a paliva neposílal vůbec.
        // Než se backend přepne, takový tvar radši zahodíme, než aby se kvůli němu
        // celý detail nenačetl.
        fuels = (try? container.decodeIfPresent([String].self, forKey: .fuels)) ?? nil
        services = (try? container.decodeIfPresent([StationService].self, forKey: .services)) ?? nil
    }
}

struct GasStation: Codable, Identifiable, Hashable {
    let id: Int
    let lat: Double
    let lon: Double
    let brandName: String?
    let brandId: Int?
    var ratingAvg: Double? = nil
    var ratingCount: Int? = nil
    var has98: Bool = false
    var has100: Bool = false

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    enum CodingKeys: String, CodingKey {
        case id, lat, lon
        case brandName = "brand_name"
        case brandId = "brand_id"
        case ratingAvg = "rating_avg"
        case ratingCount = "rating_count"
        case has98 = "has_98"
        case has100 = "has_100"
    }

    init(
        id: Int,
        lat: Double,
        lon: Double,
        brandName: String?,
        brandId: Int? = nil,
        ratingAvg: Double? = nil,
        ratingCount: Int? = nil,
        has98: Bool = false,
        has100: Bool = false
    ) {
        self.id = id
        self.lat = lat
        self.lon = lon
        self.brandName = brandName
        self.brandId = brandId
        self.ratingAvg = ratingAvg
        self.ratingCount = ratingCount
        self.has98 = has98
        self.has100 = has100
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        lat = try container.decode(Double.self, forKey: .lat)
        lon = try container.decode(Double.self, forKey: .lon)
        brandName = try container.decodeIfPresent(String.self, forKey: .brandName)
        brandId = try container.decodeIfPresent(Int.self, forKey: .brandId)
        ratingAvg = try container.decodeIfPresent(Double.self, forKey: .ratingAvg)
        ratingCount = try container.decodeIfPresent(Int.self, forKey: .ratingCount)
        has98 = container.decodeFlag(forKey: .has98)
        has100 = container.decodeFlag(forKey: .has100)
    }
}

private extension KeyedDecodingContainer {
    /// `has_98`/`has_100` posílá server jako 0/1. Bereme i true/false a chybějící
    /// klíč, ať se kvůli jednomu příznaku nerozsype celý seznam benzínek.
    func decodeFlag(forKey key: Key) -> Bool {
        if let number = try? decode(Int.self, forKey: key) { return number != 0 }
        if let flag = try? decode(Bool.self, forKey: key) { return flag }
        return false
    }
}
