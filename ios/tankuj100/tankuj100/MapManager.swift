//
//  MapManager.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.08.2025.
//


import MapKit
import SwiftUI
import ClusterMap
import Foundation

struct BenzinkaClusterAnnotation: Identifiable {
    var id = UUID()
    var coordinate: CLLocationCoordinate2D
    var count: Int
}

@Observable
class MapManager: NSObject, MKLocalSearchCompleterDelegate {
    private let completer = MKLocalSearchCompleter()
    private let clusterManager = ClusterManager<BenzinkaAnnotation>()

    var mapSize: CGSize = .zero
    var currentRegion: MKCoordinateRegion = .init(center: .init(latitude: 50.073658, longitude: 14.418540), span: .init(latitudeDelta: 0.1, longitudeDelta: 0.1))
    var annotations = [BenzinkaAnnotation]()
    var clusters = [BenzinkaClusterAnnotation]()

    func setup() {
        completer.delegate = self
    }

    func load() async -> CustomError? {
        let request = MKLocalSearch.Request()
        request.region = currentRegion

        let result = await NetworkClient().mapData()
        switch result {
        case .success(let fetchedData):
            await clusterManager.removeAll()
            await clusterManager.add(fetchedData.map { BenzinkaAnnotation(coordinate: $0.coordinate, gasStation: $0) })
            await reloadAnnotations()
        case .failure(let failure):
            return CustomError.defaultError(message: failure.localizedDescription)
        }
        return nil
    }

    /// Zavolá se po každé změně `annotations`/`clusters`. `ContentViewModel` sem připojí
    /// `objectWillChange`, protože jinak SwiftUI (kvůli kombinaci ObservableObject + vnořené
    /// @Observable třídy) změnu anotací nezaregistruje a značky se zobrazí až po pohybu mapou.
    var onAnnotationsChanged: (() -> Void)?

    /// Serializace reloadů. `clusterManager.reload` vrací ROZDÍL proti poslednímu stavu;
    /// když by běžely dva naráz (na startu se spouští z načtení dat, změny velikosti mapy
    /// i změny kamery), rozdíly se navzájem vynulují a body v mapě se nevykreslí. Proto
    /// každý reload čeká na dokončení předchozího.
    @MainActor private var reloadTask: Task<Void, Never>?

    @MainActor
    func reloadAnnotations() async {
        let previous = reloadTask
        let task = Task { @MainActor in
            _ = await previous?.value
            await self.performReload()
        }
        reloadTask = task
        await task.value
    }

    @MainActor
    private func performReload() async {
        // Při startu nemusí být velikost mapy z GeometryReaderu ještě známá (mapSize == .zero).
        // Použijeme rozumný fallback; přesná velikost dorazí vzápětí přes mapSizeChanged.
        let size = mapSize == .zero ? CGSize(width: 400, height: 800) : mapSize
        let changes = await clusterManager.reload(mapViewSize: size, coordinateRegion: currentRegion)
        applyChanges(changes)
    }

    @MainActor
    private func applyChanges(_ difference: ClusterManager<BenzinkaAnnotation>.Difference) {
        for removal in difference.removals {
            switch removal {
            case .annotation(let annotation):
                annotations.removeAll { $0 == annotation }
            case .cluster(let clusterAnnotation):
                clusters.removeAll { $0.id == clusterAnnotation.id }
            @unknown default:
                fatalError()
            }
        }
        for insertion in difference.insertions {
            switch insertion {
            case .annotation(let newItem):
                annotations.append(newItem)
            case .cluster(let newItem):
                clusters.append(BenzinkaClusterAnnotation(
                    id: newItem.id,
                    coordinate: newItem.coordinate,
                    count: newItem.memberAnnotations.count
                ))
            @unknown default:
                fatalError()
            }
        }
        onAnnotationsChanged?()
    }
}

extension MKMapItem: @retroactive CoordinateIdentifiable, @retroactive Identifiable {
    public var id: String {
        placemark.region?.identifier ?? UUID().uuidString
    }

    public var coordinate: CLLocationCoordinate2D {
        get { placemark.coordinate }
        set(newValue) { }
    }
}

struct SizePreferenceKey: PreferenceKey {
    static let defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) { }
}

public extension View {
    /// Adds the ability to read the size of a `View` and report changes through a closure.
    ///
    /// Use `readSize(onChange:)` to get the dimensions of the view whenever it changes.
    ///
    /// - Parameter onChange: A closure that receives the `CGSize` of the view whenever it changes.
    ///
    /// Example:
    ///
    /// ```swift
    /// Text("Hello, world!")
    ///     .readSize { size in
    ///         print("Text size: \(size)")
    ///     }
    /// ```
    func readSize(onChange: @escaping (CGSize) -> Void) -> some View {
        background(
            GeometryReader { geometryProxy in
                Color.clear
                    .preference(key: SizePreferenceKey.self, value: geometryProxy.size)
            }
        )
        .onPreferenceChange(SizePreferenceKey.self, perform: onChange)
    }
}

class BenzinkaAnnotation: NSObject, MKAnnotation, Identifiable, CoordinateIdentifiable {
    
    public let id = UUID()
    public var coordinate: CLLocationCoordinate2D
    public let gasStation: GasStation
    
    init(coordinate: CLLocationCoordinate2D, gasStation: GasStation) {
        self.coordinate = coordinate
        self.gasStation = gasStation
        super.init()
    }
}
