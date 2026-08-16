import CoreLocation
import Foundation
import SwiftUI

/// Stav žádosti o přidání benzínky (`station_request.status` na serveru).
enum StationRequestStatus: String, Decodable {
    case new
    case approved
    case rejected
    /// Cokoli, co server začne posílat až po vydání téhle verze. Bereme to jako
    /// „ještě se to řeší“ – horší než neznámý stav je seznam, který se kvůli němu
    /// vůbec nenačte.
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StationRequestStatus(rawValue: raw) ?? .unknown
    }

    var label: String {
        switch self {
        case .new: "Čeká na kontrolu"
        case .approved: "Schváleno"
        case .rejected: "Zamítnuto"
        case .unknown: "Zpracovává se"
        }
    }

    var symbol: String {
        switch self {
        case .new, .unknown: "clock"
        case .approved: "checkmark.seal.fill"
        case .rejected: "xmark.circle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .new, .unknown: .orange
        case .approved: .green
        case .rejected: .red
        }
    }
}

/// Jedna moje žádost tak, jak ji vrací `GET /api/station-requests`.
///
/// Skoro všechno kromě polohy je volitelné: uživatel vyplňuje jen to, co ví, a
/// odpověď serveru se v čase může rozrůst. Kvůli jednomu chybějícímu poli nesmí
/// spadnout celý seznam.
struct StationRequest: Identifiable, Decodable, Equatable {
    let id: Int
    let lat: Double
    let lon: Double
    let brandName: String?
    let name: String?
    let city: String?
    let address: String?
    let status: StationRequestStatus
    /// Stav přesně tak, jak přišel ze serveru. Odznak nepřečtených změn porovnává
    /// řetězce, ne `status` – dvě různé neznámé hodnoty by se jinak schovaly do
    /// jednoho `unknown` a změna mezi nimi by zapadla.
    let statusRaw: String
    /// U zamítnutí je to důvod psaný uživateli, jinde interní poznámka.
    let adminNote: String?
    let createdAt: String
    let resolvedAt: String?
    /// Doplní se při schválení – je to ID hotové benzínky v mapě.
    let stationId: Int?

    enum CodingKeys: String, CodingKey {
        case id, lat, lon, name, city, address, status
        case brandName = "brand_name"
        case adminNote = "admin_note"
        case createdAt = "created_at"
        case resolvedAt = "resolved_at"
        case stationId = "station_id"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        lat = try container.decode(Double.self, forKey: .lat)
        lon = try container.decode(Double.self, forKey: .lon)
        brandName = try container.decodeIfPresent(String.self, forKey: .brandName)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        city = try container.decodeIfPresent(String.self, forKey: .city)
        address = try container.decodeIfPresent(String.self, forKey: .address)
        statusRaw = (try? container.decode(String.self, forKey: .status)) ?? ""
        status = (try? container.decode(StationRequestStatus.self, forKey: .status)) ?? .unknown
        adminNote = try container.decodeIfPresent(String.self, forKey: .adminNote)
        createdAt = (try? container.decode(String.self, forKey: .createdAt)) ?? ""
        resolvedAt = try container.decodeIfPresent(String.self, forKey: .resolvedAt)
        stationId = try container.decodeIfPresent(Int.self, forKey: .stationId)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    /// Čím žádost pojmenovat v seznamu. Značka je typicky to jediné, co uživatel vyplnil.
    var title: String {
        for candidate in [brandName, name] {
            let text = candidate?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !text.isEmpty { return text }
        }
        return "Benzínka bez značky"
    }

    var placeText: String? {
        let parts = [city, address]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    var dateText: String {
        guard let date = ServerDate.parse(createdAt) else { return "" }
        return date.formatted(.dateTime.day().month().year())
    }
}

/// Odpověď na `POST /api/station-requests`. Všechno volitelné schválně – jistá je
/// jen návratová stovka, o zbytek tvaru se opírat nemusíme, seznam si stejně
/// hned načteme znovu.
struct StationRequestResponse: Decodable {
    let ok: Bool?
    let message: String?
    let request: StationRequest?
}

extension FuelFlag {
    /// Klíč, kterým se palivo posílá na server (`be/src/fuel-flags.js`).
    ///
    /// Proč tady a ne ve `StationFlags.swift`: ten je doslovná kopie bitových masek
    /// z `/api/map/` a přenosový formát žádosti do něj nepatří.
    var apiKey: String {
        switch self {
        case .octane100: "octane_100"
        case .octane98: "octane_98"
        case .octane95: "octane_95"
        case .diesel: "diesel"
        case .lpg: "lpg"
        case .cng: "cng"
        case .adblue: "adblue"
        case .e85: "e85"
        }
    }
}
