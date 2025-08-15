import SwiftUI
import MapKit

// Model bodu
struct Location: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
    let title: String
}

struct ClusterMapView: View {
    @State private var cameraPosition: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 49.8, longitude: 15.5),
            span: MKCoordinateSpan(latitudeDelta: 3.5, longitudeDelta: 3.5)
        )
    )

    let locations: [Location] = (1...100).map { i in
        // střed Prahy
        let baseLat: Double = 50.08
        let baseLon: Double = 14.42
        
        // náhodný posun ±0.05° (~ pár km)
        let latOffset = Double.random(in: -0.05...0.05)
        let lonOffset = Double.random(in: -0.05...0.05)
        
        return Location(
            coordinate: CLLocationCoordinate2D(
                latitude: baseLat + latOffset,
                longitude: baseLon + lonOffset
            ),
            title: "Bod \(i)"
        )
    }
    
    var body: some View {
        Map(position: $cameraPosition) {
            ForEach(locations) { loc in
                Annotation(loc.title, coordinate: loc.coordinate) {
                    Circle()
                        .fill(.blue)
                        .frame(width: 20, height: 20)
                        .overlay(Circle().stroke(.white, lineWidth: 2))
                }
            }
        }
        .mapStyle(.standard)
        .ignoresSafeArea()
    }
}

#Preview {
    ClusterMapView()
}
