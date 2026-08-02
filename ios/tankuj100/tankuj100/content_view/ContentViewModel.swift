import Foundation
import MapKit
import SwiftUI
import ClusterMap

public class ContentViewModel: ObservableObject {
    
    @Published var mapManager = MapManager()
    @Published var isSheetPresented: Bool = true
    @Published var selectedBenzinka: BenzinkaAnnotation?
    @Published var showMenuSheet: Bool = false
    @Published var showAddBenzinkaSheet: Bool = false
    @Published var error: CustomError?
    
    var currentRegion: MKCoordinateRegion { mapManager.currentRegion }
    var annotations: [BenzinkaAnnotation] { mapManager.annotations }
    var clusters: [BenzinkaClusterAnnotation] { mapManager.clusters }

    private let locationManager = CLLocationManager()

    init() {
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

    /// Požádá o oprávnění k poloze (jen když ještě nebylo rozhodnuto), aby šla zobrazit
    /// poloha uživatele a fungovalo tlačítko „na mě".
    func requestLocationPermission() {
        if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        }
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
    
    func openAddBenzinka() {
        showAddBenzinkaSheet = true
    }
    
    func closeSheets() {
        showMenuSheet = false
        showAddBenzinkaSheet = false
    }
}
