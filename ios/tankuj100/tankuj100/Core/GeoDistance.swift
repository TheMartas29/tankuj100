import CoreLocation
import Foundation

/// Vzdálenost dvou bodů po povrchu Země, v metrech.
///
/// Proč ne `CLLocation.distance(from:)`: je to metoda na objektu, takže se pro každou
/// benzínku musí `CLLocation` nejdřív vyrobit. V seznamu se přes tisíc benzínek řadí
/// podle vzdálenosti a porovnávač si o hodnotu řekne u každé dvojice znovu – dohromady
/// přes dvacet tisíc objektů pokaždé, co se seznam překreslí.
///
/// Kulový model se od toho, co počítá CoreLocation (elipsoid), liší v řádu promile.
/// Na „12,3 km k nejbližší pumpě“ to nemá vliv – ale právě proto tenhle výpočet
/// používá i detail benzínky, ať někde nesvítí o desetinu jiné číslo.
enum GeoDistance {

    private static let earthRadius: CLLocationDistance = 6_371_000
    private static let toRadians = Double.pi / 180

    static func meters(from origin: CLLocationCoordinate2D, to target: CLLocationCoordinate2D) -> CLLocationDistance {
        let originLat = origin.latitude * toRadians
        let targetLat = target.latitude * toRadians
        let deltaLat = targetLat - originLat
        let deltaLon = (target.longitude - origin.longitude) * toRadians

        let haversine =
            sin(deltaLat / 2) * sin(deltaLat / 2)
            + cos(originLat) * cos(targetLat) * sin(deltaLon / 2) * sin(deltaLon / 2)

        // `min(1,…)` je pojistka proti zaokrouhlení: u dvou totožných bodů může
        // odmocnina vyjít o chlup nad jedničku a `asin` by vrátil NaN.
        return 2 * earthRadius * asin(min(1, sqrt(haversine)))
    }

    static func meters(from origin: CLLocation?, to target: CLLocationCoordinate2D) -> CLLocationDistance? {
        guard let origin else { return nil }
        return meters(from: origin.coordinate, to: target)
    }
}
