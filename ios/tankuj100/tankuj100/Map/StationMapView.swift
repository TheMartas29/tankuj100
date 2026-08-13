import MapKit
import SwiftUI

struct StationMapView: UIViewRepresentable {
    let stations: [GasStation]
    @Binding var selected: GasStation?
    var onRegionChange: (MKCoordinateRegion) -> Void = { _ in }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        #if DEBUG
        map.showsUserLocation = !DebugLaunch.skipLocation
        #else
        map.showsUserLocation = true
        #endif
        map.showsCompass = false
        map.pointOfInterestFilter = .excludingAll
        map.setRegion(.czechia, animated: false)

        map.register(StationAnnotationView.self,
                     forAnnotationViewWithReuseIdentifier: StationAnnotationView.reuseID)
        map.register(StationClusterView.self,
                     forAnnotationViewWithReuseIdentifier: StationClusterView.reuseID)

        addControls(to: map)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.sync(stations: stations, on: map)

        // Zavření detailu musí bod v mapě odznačit, jinak na něj podruhé nejde klepnout.
        if selected == nil, let active = map.selectedAnnotations.first {
            map.deselectAnnotation(active, animated: false)
        }
    }

    private func addControls(to map: MKMapView) {
        let compass = MKCompassButton(mapView: map)
        compass.compassVisibility = .adaptive
        let trackingSize: CGFloat = 48
        let tracking = MKUserTrackingButton(mapView: map)
        tracking.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.9)

        // Vlastní zaoblení si tlačítko přepisuje samo, kulatý tvar proto vynutí až ořez
        // obalu. Bez něj z něj je zakulacený čtverec.
        let trackingHolder = UIView()
        trackingHolder.layer.cornerRadius = trackingSize / 2
        trackingHolder.layer.masksToBounds = true
        trackingHolder.addSubview(tracking)
        tracking.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            tracking.topAnchor.constraint(equalTo: trackingHolder.topAnchor),
            tracking.bottomAnchor.constraint(equalTo: trackingHolder.bottomAnchor),
            tracking.leadingAnchor.constraint(equalTo: trackingHolder.leadingAnchor),
            tracking.trailingAnchor.constraint(equalTo: trackingHolder.trailingAnchor),
        ])

        for control in [compass, trackingHolder] {
            control.translatesAutoresizingMaskIntoConstraints = false
            map.addSubview(control)
        }

        NSLayoutConstraint.activate([
            compass.topAnchor.constraint(equalTo: map.safeAreaLayoutGuide.topAnchor, constant: 12),
            compass.trailingAnchor.constraint(equalTo: map.trailingAnchor, constant: -12),

            // Vpravo dole, v dosahu palce a naproti plovoucím tlačítkům. Odsazení zespodu
            // je stejné jako u nich, aby nepřekrylo povinný podpis Apple Map.
            trackingHolder.trailingAnchor.constraint(equalTo: map.trailingAnchor, constant: -20),
            trackingHolder.bottomAnchor.constraint(
                equalTo: map.safeAreaLayoutGuide.bottomAnchor, constant: -46),
            trackingHolder.widthAnchor.constraint(equalToConstant: trackingSize),
            trackingHolder.heightAnchor.constraint(equalToConstant: trackingSize),
        ])
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: StationMapView
        private var shownIDs: Set<Int> = []
        private var didCenterOnUser = false

        init(_ parent: StationMapView) {
            self.parent = parent
        }

        /// Po startu přiblížíme mapu k uživateli, jakmile dorazí první poloha –
        /// stejně, jako kdyby klepnul na tlačítko polohy. Jen jednou, ať mapa
        /// neuhýbala pod rukou, když si ji mezitím posune sám.
        func mapView(_ mapView: MKMapView, didUpdate userLocation: MKUserLocation) {
            guard !didCenterOnUser, userLocation.location != nil else { return }
            didCenterOnUser = true
            mapView.setUserTrackingMode(.follow, animated: true)
        }

        func sync(stations: [GasStation], on map: MKMapView) {
            let incoming = Set(stations.map(\.id))
            guard incoming != shownIDs else { return }

            map.removeAnnotations(map.annotations.compactMap { $0 as? StationAnnotation })
            map.addAnnotations(stations.map(StationAnnotation.init(station:)))
            shownIDs = incoming
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            switch annotation {
            case is MKUserLocation:
                return nil
            case is MKClusterAnnotation:
                return mapView.dequeueReusableAnnotationView(
                    withIdentifier: StationClusterView.reuseID, for: annotation)
            case is StationAnnotation:
                return mapView.dequeueReusableAnnotationView(
                    withIdentifier: StationAnnotationView.reuseID, for: annotation)
            default:
                return nil
            }
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            switch view.annotation {
            case let station as StationAnnotation:
                parent.selected = station.station
            case let cluster as MKClusterAnnotation:
                mapView.deselectAnnotation(cluster, animated: false)
                zoom(mapView, to: cluster)
            default:
                break
            }
        }

        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            parent.onRegionChange(mapView.region)
        }

        private func zoom(_ mapView: MKMapView, to cluster: MKClusterAnnotation) {
            let members = cluster.memberAnnotations
            guard !members.isEmpty else { return }

            var rect = MKMapRect.null
            for member in members {
                let point = MKMapPoint(member.coordinate)
                rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 0, height: 0))
            }

            // Body ve shluku můžou ležet na sobě (stanice na obou stranách dálnice),
            // z nulového obdélníku by MapKit udělal maximální přiblížení.
            if rect.size.width < 1 && rect.size.height < 1 {
                let zoomed = MKCoordinateRegion(
                    center: cluster.coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.005, longitudeDelta: 0.005))
                mapView.setRegion(zoomed, animated: true)
            } else {
                mapView.setVisibleMapRect(
                    rect,
                    edgePadding: UIEdgeInsets(top: 80, left: 60, bottom: 120, right: 60),
                    animated: true)
            }
        }
    }
}

extension MKCoordinateRegion {
    static let czechia = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 49.8175, longitude: 15.4730),
        span: MKCoordinateSpan(latitudeDelta: 3.2, longitudeDelta: 4.6))
}
