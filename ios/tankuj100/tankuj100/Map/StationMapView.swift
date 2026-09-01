import MapKit
import SwiftUI

struct StationMapView: UIViewRepresentable {
    /// Načtená data. Index si z nich postaví sdílený `StationFilterStore`; co se pak
    /// kreslí, určuje jeho `result`, takže mapa reaguje na filtr sama.
    let stations: [GasStation]
    @Binding var selected: GasStation?
    var onRegionChange: (MKCoordinateRegion) -> Void = { _ in }
    /// Smíme číst polohu. Bez svolení nemá tlačítko pro vycentrování co dělat –
    /// klepnutí by jen nic neudělalo. Mění se za běhu, proto se vyhodnocuje
    /// v `updateUIView`, ne jednorázově při vzniku mapy.
    var canShowUserLocation = false

    @ObservedObject private var store = StationFilterStore.shared

    /// Ladicí přepínač polohu vypne i tam, kde ji uživatel povolil – systémový dotaz
    /// by jinak překryl snímanou obrazovku na runtime bez ovládacího panelu.
    private var showsUserLocation: Bool {
        #if DEBUG
        return canShowUserLocation && !DebugLaunch.skipLocation
        #else
        return canShowUserLocation
        #endif
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        // Bod polohy uživatele si na iOS 15 bere odstín z mapy, a ten SwiftUI nastaví
        // podle akcentní barvy – v mapě plné červených špendlíků by pak byl červený
        // i uživatel. Od iOS 16 ho systém drží modrý sám, takže se tam nic nemění.
        map.tintColor = .systemBlue
        map.showsCompass = false
        map.pointOfInterestFilter = .excludingAll
        map.setRegion(.czechia, animated: false)

        map.register(StationAnnotationView.self,
                     forAnnotationViewWithReuseIdentifier: StationAnnotationView.reuseID)
        map.register(StationClusterView.self,
                     forAnnotationViewWithReuseIdentifier: StationClusterView.reuseID)

        addControls(to: map, coordinator: context.coordinator)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.load(stations)
        context.coordinator.sync(stations: store.result, on: map)

        map.showsUserLocation = showsUserLocation
        context.coordinator.locationAllowed = showsUserLocation
        context.coordinator.updateTrackingControl(for: map.userTrackingMode, animated: false)

        // Zavření detailu musí bod v mapě odznačit, jinak na něj podruhé nejde klepnout.
        if selected == nil, let active = map.selectedAnnotations.first {
            map.deselectAnnotation(active, animated: false)
        }
    }

    private func addControls(to map: MKMapView, coordinator: Coordinator) {
        let compass = MKCompassButton(mapView: map)
        compass.compassVisibility = .adaptive

        let trackingSize: CGFloat = 44
        let tracking = MKUserTrackingButton(mapView: map)
        // Šipka zůstává v barvě aplikace – odstín mapy je kvůli bodu polohy modrý.
        tracking.tintColor = .brandAccent
        tracking.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.9)

        // Zaoblení si tlačítko přepisuje samo, ořez proto musí zajistit až obal.
        let trackingHolder = UIView()
        trackingHolder.layer.cornerRadius = 10
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
            trackingHolder.topAnchor.constraint(equalTo: compass.bottomAnchor, constant: 12),
            trackingHolder.trailingAnchor.constraint(equalTo: map.trailingAnchor, constant: -12),
            trackingHolder.widthAnchor.constraint(equalToConstant: trackingSize),
            trackingHolder.heightAnchor.constraint(equalToConstant: trackingSize),
        ])

        coordinator.trackingControl = trackingHolder
        coordinator.updateTrackingControl(for: map.userTrackingMode, animated: false)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {

        /// Kolik špendlíků se do mapy nejvýš pošle. Přes tisíc jich MapKit ještě
        /// zvládne, sto tisíc ne – a co je hustší než tohle, stejně skončí ve shlucích.
        private static let annotationLimit = 2000

        /// Rezerva za okrajem obrazovky (podíl šířky/výšky výřezu na každou stranu),
        /// aby při posunu o kousek nebyla vidět prázdná mapa, než doběhne přepočet.
        private static let viewportPadding = 0.35

        /// Posun mapy hlásí MapKit prakticky na každý snímek. Přepočítávat výřez tak
        /// často je zbytečné – špendlíky se dokreslí, až se prst zastaví.
        private static let refreshDelay: TimeInterval = 0.2

        var parent: StationMapView
        weak var trackingControl: UIView?
        /// Smíme číst polohu. Druhá podmínka viditelnosti tlačítka vedle režimu
        /// sledování; obě musí rozhodovat na jednom místě, jinak si zápisy do
        /// `isHidden` přebíjejí a tlačítko problikává.
        var locationAllowed = false
        private var didCenterOnUser = false

        private var data: FilteredStations = .empty
        private var loadedCount = -1
        /// Vykreslené anotace podle řádku v indexu. Řádky platí jen pro jeden index,
        /// při jeho výměně se proto všechno zahodí.
        private var shown: [Int32: StationAnnotation] = [:]
        private var pendingRefresh: DispatchWorkItem?

        init(_ parent: StationMapView) {
            self.parent = parent
        }

        /// Tlačítko svítí jen tehdy, když mapa není vycentrovaná na uživatele – jinak
        /// by nabízelo něco, co už platí.
        ///
        /// Vedlejší efekt, na kterém záleží: `MKUserTrackingButton` přepíná dokola
        /// `none → follow → followWithHeading` a ten poslední režim mapou otáčí.
        /// Protože po prvním klepnutí tlačítko zmizí, do otáčení se uživatel nedostane
        /// a natočení zůstává na systémovém kompasu.
        func updateTrackingControl(for mode: MKUserTrackingMode, animated: Bool) {
            guard let control = trackingControl else { return }
            // Bez svolení tlačítko nedává smysl vůbec; se svolením zmizí ve chvíli,
            // kdy mapa uživatele už sleduje.
            let hidden = !locationAllowed || mode != .none
            guard control.isHidden != hidden || control.alpha != (hidden ? 0 : 1) else { return }

            guard animated else {
                control.isHidden = hidden
                control.alpha = hidden ? 0 : 1
                return
            }
            if !hidden { control.isHidden = false }
            UIView.animate(withDuration: 0.2) {
                control.alpha = hidden ? 0 : 1
            } completion: { _ in
                control.isHidden = hidden
            }
        }

        func mapView(
            _ mapView: MKMapView, didChange mode: MKUserTrackingMode, animated: Bool
        ) {
            updateTrackingControl(for: mode, animated: true)
        }

        /// Po startu přiblížíme mapu k uživateli, jakmile dorazí první poloha –
        /// stejně, jako kdyby klepnul na tlačítko polohy. Jen jednou, ať mapa
        /// neuhýbala pod rukou, když si ji mezitím posune sám.
        func mapView(_ mapView: MKMapView, didUpdate userLocation: MKUserLocation) {
            guard !didCenterOnUser, userLocation.location != nil else { return }
            didCenterOnUser = true
            mapView.setUserTrackingMode(.follow, animated: true)
        }

        /// Data do sdíleného indexu. Stavba běží mimo hlavní vlákno, mapa se dokreslí,
        /// až bude hotová. Počet stanic si držíme, ať se při každém překreslení
        /// nezakládá úloha, která by stejně nic neudělala.
        func load(_ stations: [GasStation]) {
            guard stations.count != loadedCount else { return }
            loadedCount = stations.count
            Task { await StationFilterStore.shared.load(stations) }
        }

        /// Volá se při každém překreslení SwiftUI, takže musí být levné: dokud sedí
        /// `revision`, nezměnilo se nic a nedělá se nic.
        func sync(stations: FilteredStations, on map: MKMapView) {
            guard stations.revision != data.revision else { return }

            let indexChanged = stations.index !== data.index
            data = stations
            if indexChanged {
                map.removeAnnotations(Array(shown.values))
                shown.removeAll(keepingCapacity: true)
            }
            refreshAnnotations(on: map)
        }

        /// Do mapy jdou jen body z viditelného výřezu a jeho okolí. Rozdíl proti tomu,
        /// co už v mapě je, se dopočítá po řádcích – přidávají a odebírají se jednotky
        /// až stovky anotací, ne celý seznam znovu.
        private func refreshAnnotations(on map: MKMapView) {
            pendingRefresh?.cancel()
            pendingRefresh = nil

            let wanted = data.index.rows(data.rows,
                                         inside: GeoRect(region: map.region,
                                                         padding: Self.viewportPadding),
                                         limit: Self.annotationLimit)

            var keep = Set<Int32>(minimumCapacity: wanted.count)
            var added: [StationAnnotation] = []
            for row in wanted {
                keep.insert(row)
                guard shown[row] == nil else { continue }
                let annotation = StationAnnotation(station: data.station(forRow: row))
                shown[row] = annotation
                added.append(annotation)
            }

            // Vybraný špendlík se odebrat nesmí, i když vyjel z výřezu – zmizel by
            // pod otevřeným detailem a mapa by ho po zavření neměla kam odznačit.
            let selected = Set(map.selectedAnnotations.compactMap { $0 as? StationAnnotation }
                .map(ObjectIdentifier.init))

            var removed: [StationAnnotation] = []
            var removedRows: [Int32] = []
            for (row, annotation) in shown
            where !keep.contains(row) && !selected.contains(ObjectIdentifier(annotation)) {
                removed.append(annotation)
                removedRows.append(row)
            }
            for row in removedRows { shown.removeValue(forKey: row) }

            if !removed.isEmpty { map.removeAnnotations(removed) }
            if !added.isEmpty { map.addAnnotations(added) }
        }

        private func scheduleRefresh(on map: MKMapView) {
            pendingRefresh?.cancel()
            let work = DispatchWorkItem { [weak self, weak map] in
                guard let self, let map else { return }
                self.pendingRefresh = nil
                self.refreshAnnotations(on: map)
            }
            pendingRefresh = work
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.refreshDelay, execute: work)
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
            scheduleRefresh(on: mapView)
        }

        /// Programové posuny (tlačítko polohy, rozbalení shluku) `didChangeVisibleRegion`
        /// nemusí ohlásit až do konce animace – tohle je pojistka, že se špendlíky
        /// dokreslí i po nich.
        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            scheduleRefresh(on: mapView)
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

extension GeoRect {
    /// `padding` je podíl šířky a výšky výřezu přidaný na každou stranu.
    init(region: MKCoordinateRegion, padding: Double) {
        // Než mapa dostane rozměry, hlásí nulový nebo nesmyslný výřez – v takovém
        // případě je lepší vzít celou zeměkouli a nechat rozhodnout strop na počet
        // špendlíků, než nekreslit nic.
        guard region.span.latitudeDelta > 0, region.span.longitudeDelta > 0,
              region.span.latitudeDelta <= 180, region.span.longitudeDelta <= 360
        else {
            self.init(minLat: -90, maxLat: 90, minLon: -180, maxLon: 180)
            return
        }

        let latReach = region.span.latitudeDelta / 2 * (1 + padding * 2)
        let lonReach = region.span.longitudeDelta / 2 * (1 + padding * 2)
        self.init(minLat: region.center.latitude - latReach,
                  maxLat: region.center.latitude + latReach,
                  minLon: region.center.longitude - lonReach,
                  maxLon: region.center.longitude + lonReach)
    }
}

extension MKCoordinateRegion {
    static let czechia = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 49.8175, longitude: 15.4730),
        span: MKCoordinateSpan(latitudeDelta: 3.2, longitudeDelta: 4.6))
}
