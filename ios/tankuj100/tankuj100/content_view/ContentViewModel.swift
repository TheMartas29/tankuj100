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
    
    func onAppear() {
        mapManager.setup()
        Task {
            self.error = await mapManager.load()
        }
    }
    
    func mapSizeChanged(_ newValue: CGSize) {
        mapManager.mapSize = newValue
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
