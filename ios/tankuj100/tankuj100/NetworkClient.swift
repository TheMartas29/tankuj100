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
    
    let BASE_URL = "http://80.211.200.128:3000"
    
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

struct GasStation: Codable, Identifiable {
    let id: Int
    let lat: Double
    let lon: Double
    let brandName: String?
    let brandId: Int?
    let stationId: Int

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    enum CodingKeys: String, CodingKey {
        case id, lat, lon
        case brandName = "brand_name"
        case brandId = "brand_id"
        case stationId = "station_id"
    }
}
