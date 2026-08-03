//
//  NetworkClient.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.08.2025.
//

import Foundation
import CoreLocation
import MapKit
import SwiftUI

struct NetworkClient {
    
    // Produkční server (HTTPS – nutné pro App Store / ATS).
    // Pro lokální testování lze dočasně přepnout na "http://localhost:3000".
    let BASE_URL = "https://tankuj100.silkroadbrand.eu"
    
    public init() {}
    
    public func mapData() async -> Result<[GasStation], Error> {
        if let url = URL(string: "\(BASE_URL)/api/map/") {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let decodedData = try JSONDecoder().decode([GasStation].self, from: data)
                return .success(decodedData)
            } catch {
                return .failure(CustomError.defaultError(message: error.localizedDescription))
            }
        } else {
            return .failure(CustomError.defaultError(message: "Neplatná URL"))
        }
    }
    
    public func gasStationDetail(id: String) async -> Result<GasStationDetail, Error> {
        if let url = URL(string: "\(BASE_URL)/api/detail/\(id)") {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let decodedData = try JSONDecoder().decode(GasStationDetail.self, from: data)
                return .success(decodedData)
            } catch {
                return .failure(CustomError.defaultError(message: error.localizedDescription))
            }
        } else {
            return .failure(CustomError.defaultError(message: "Neplatná URL"))
        }
    }
    
    public func getCurrentPrices(id: String) async -> Result<[FuelPrice], Error> {
        if let url = URL(string: "\(BASE_URL)/api/fuel-prices/\(id)") {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let decodedData = try JSONDecoder().decode([FuelPrice].self, from: data)
                return .success(decodedData)
            } catch {
                return .failure(CustomError.defaultError(message: error.localizedDescription))
            }
        } else {
            return .failure(CustomError.defaultError(message: "Neplatná URL"))
        }
    }
}

extension String {
    /// Slug loga na fuelo.net: bez diakritiky, malá písmena, jen alfanumerické znaky.
    var fueloLogoSlug: String {
        folding(options: .diacriticInsensitive, locale: Locale(identifier: "en"))
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
    }
}

/// URL loga značky na fuelo.net (fallback řeší AsyncImage, když logo neexistuje).
func fueloLogoURL(brandName: String?) -> URL? {
    guard let slug = brandName?.fueloLogoSlug, !slug.isEmpty else { return nil }
    return URL(string: "https://fuelo.net/img/logos/\(slug).png")
}

/// Naformátuje české telefonní číslo na "+420 732 443 612" a vrátí i tel: URL.
func formatCzechPhone(_ raw: String) -> (display: String, dialURL: URL?) {
    var digits = raw.filter(\.isNumber)
    if digits.hasPrefix("420") { digits = String(digits.dropFirst(3)) }
    if digits.count == 9 {
        let a = digits.prefix(3)
        let b = digits.dropFirst(3).prefix(3)
        let c = digits.dropFirst(6)
        return ("+420 \(a) \(b) \(c)", URL(string: "tel://+420\(digits)"))
    }
    // Neznámý formát – zobraz původní, vytoč holé číslice.
    let onlyDigits = raw.filter(\.isNumber)
    return (raw, onlyDigits.isEmpty ? nil : URL(string: "tel://\(onlyDigits)"))
}

struct FuelPrice: Codable, Identifiable {
    var id = UUID()
    let name: String
    let price: Double
    let currency: String
    let unit: String

    private enum CodingKeys: String, CodingKey { //vynecháme id
        case name
        case price
        case currency
        case unit
    }
}

struct GasStationDetail: Codable, Identifiable {
    let id: Int
    let lat: Double
    let lon: Double
    let brandName: String?
    let brandId: Int?
    let name: String
    let city: String
    let address: String
    let zip: String
    let phone: String?
    let worktime: String?
    let services: String?
    let payments: String?
    let note: String?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    enum CodingKeys: String, CodingKey {
        case id, lat, lon
        case brandName = "brand_name"
        case brandId = "brand_id"
        case name, city, address, zip, phone, worktime, services, payments, note
    }
}

struct GasStation: Codable, Identifiable, Hashable {
    let id: Int
    let lat: Double
    let lon: Double
    let brandName: String?
    let brandId: Int?
    let stationId: Int
    /// Agregované hodnocení a ověřený typ benzínu posílá /api/map, ať je seznam
    /// můžeme zobrazit bez dotahování detailu každé stanice.
    var ratingAvg: Double? = nil
    var ratingCount: Int? = nil
    var fuelVerdict: FuelVerdict? = nil

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    /// Má stanice potvrzené E5? Kvůli tomu appka existuje, tak to jde vidět i v seznamu.
    var hasConfirmedE5: Bool { fuelVerdict == .e5 }

    enum CodingKeys: String, CodingKey {
        case id, lat, lon
        case brandName = "brand_name"
        case brandId = "brand_id"
        case stationId = "station_id"
        case ratingAvg = "rating_avg"
        case ratingCount = "rating_count"
        case fuelVerdict = "fuel_verdict"
    }
}
