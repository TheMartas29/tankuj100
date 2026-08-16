import CoreLocation
import Foundation

final class LocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {

    @Published private(set) var location: CLLocation?

    /// Smíme polohu vůbec číst. Ovládací prvky, které bez ní nemají smysl – tlačítko
    /// pro vycentrování v mapě a „Moje poloha“ ve formuláři – se podle toho schovávají.
    ///
    /// Je to samostatný údaj, ne `location != nil`: než dorazí první zaměření, je
    /// poloha prázdná i u uživatele, který svolení dal, a tlačítko by mu na chvíli
    /// zmizelo a zase naskočilo.
    @Published private(set) var isAuthorized: Bool

    private let manager = CLLocationManager()

    override init() {
        isAuthorized = Self.authorized(manager.authorizationStatus)
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func start() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.startUpdatingLocation()
        }
    }

    /// Volá se i po návratu z Nastavení, takže odebrané i dodatečně udělené svolení
    /// se propíše samo – uživatel nemusí aplikaci restartovat.
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        isAuthorized = Self.authorized(status)

        guard isAuthorized else {
            // Po odebrání svolení musí zmizet i poslední známá poloha. Jinak by se
            // dál počítaly vzdálenosti z místa, kde uživatel dávno není.
            manager.stopUpdatingLocation()
            location = nil
            return
        }
        manager.startUpdatingLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        location = last
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    private static func authorized(_ status: CLAuthorizationStatus) -> Bool {
        switch status {
        case .authorizedWhenInUse, .authorizedAlways: return true
        default: return false
        }
    }
}
