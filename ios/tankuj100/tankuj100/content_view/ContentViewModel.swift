import Foundation
import MapKit
import SwiftUI
import ClusterMap
import CoreLocation

public class ContentViewModel: NSObject, ObservableObject, CLLocationManagerDelegate {

    @Published var mapManager = MapManager()
    @Published var isSheetPresented: Bool = true
    @Published var selectedBenzinka: BenzinkaAnnotation?
    @Published var showMenuSheet: Bool = false
    @Published var showAddBenzinkaSheet: Bool = false
    @Published var showStationsList: Bool = false
    @Published var error: CustomError?
    /// Aktuální poloha uživatele (pro výpočet vzdáleností a seznam nejbližších).
    @Published var userLocation: CLLocation?

    let favorites = FavoritesStore()

    var currentRegion: MKCoordinateRegion { mapManager.currentRegion }
    var annotations: [BenzinkaAnnotation] { mapManager.annotations }
    var clusters: [BenzinkaClusterAnnotation] { mapManager.clusters }
    var allStations: [GasStation] { mapManager.allStations }

    private let locationManager = CLLocationManager()

    public override init() {
        super.init()
        locationManager.delegate = self
        // Přemostění: MapManager (@Observable) sám o sobě nepřekreslí view, které pozoruje
        // tento ObservableObject. Při každé změně anotací proto ručně vydáme objectWillChange.
        mapManager.onAnnotationsChanged = { [weak self] in
            self?.objectWillChange.send()
        }
    }

    func onAppear() {
        mapManager.setup()
        requestLocationPermission()
        Task {
            self.error = await mapManager.load()
        }
    }

    /// Požádá o oprávnění k poloze (jen když ještě nebylo rozhodnuto) a spustí sledování polohy.
    func requestLocationPermission() {
        if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else {
            locationManager.startUpdatingLocation()
        }
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let loc = locations.last {
            userLocation = loc
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // polohu bereme jako volitelnou – chybu tiše ignorujeme
    }

    func mapSizeChanged(_ newValue: CGSize) {
        let wasZero = mapManager.mapSize == .zero
        mapManager.mapSize = newValue
        // Jakmile poprvé známe skutečnou velikost mapy, přepočítáme anotace pro přesné shlukování.
        if wasZero && newValue != .zero {
            Task { await mapManager.reloadAnnotations() }
        }
    }

    func cameraRegionChanged(_ region: MKCoordinateRegion) {
        mapManager.currentRegion = region
    }

    func cameraRegionChangeEnded() {
        Task.detached {
            await self.mapManager.reloadAnnotations()
        }
    }

    func openMenu() {
        showMenuSheet = true
    }

    func openStationsList() {
        showStationsList = true
    }

    func openAddBenzinka() {
        showAddBenzinkaSheet = true
    }

    func closeSheets() {
        showMenuSheet = false
        showAddBenzinkaSheet = false
        showStationsList = false
    }
}

/// Úložiště oblíbených stanic (podle PK id) přes UserDefaults.
final class FavoritesStore: ObservableObject {
    @Published private(set) var ids: Set<Int>
    private let key = "favoriteStationIDs"

    init() {
        let arr = UserDefaults.standard.array(forKey: key) as? [Int] ?? []
        ids = Set(arr)
    }

    func contains(_ id: Int) -> Bool { ids.contains(id) }

    func toggle(_ id: Int) {
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        UserDefaults.standard.set(Array(ids), forKey: key)
    }
}
