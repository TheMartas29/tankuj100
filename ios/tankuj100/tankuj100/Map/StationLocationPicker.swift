import CoreLocation
import MapKit
import SwiftUI

/// Souřadnice jako hodnotový typ. `CLLocationCoordinate2D` není `Equatable`,
/// takže by na ni nešlo pověsit `.task(id:)` ani `onValueChange`.
struct MapPoint: Equatable {
    var lat: Double
    var lon: Double

    init(lat: Double, lon: Double) {
        self.lat = lat
        self.lon = lon
    }

    init(_ coordinate: CLLocationCoordinate2D) {
        self.init(lat: coordinate.latitude, lon: coordinate.longitude)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    var location: CLLocation { CLLocation(latitude: lat, longitude: lon) }

    var text: String { String(format: "%.5f, %.5f", lat, lon) }
}

/// Kam uživatel míří špendlíkem, i s tím, jak je zrovna přiblížený.
struct MapPick: Equatable {
    var point: MapPoint
    /// Výška viditelného výřezu ve stupních zeměpisné šířky.
    var spanDegrees: Double

    /// Nad celou republikou špendlík neukazuje na benzínku, ale někam do polí.
    /// Zhruba dva kilometry výšky výřezu je hranice, kde má míření smysl.
    var isPrecise: Bool { spanDegrees <= 0.02 }

    static let czechia = MapPick(
        point: MapPoint(MKCoordinateRegion.czechia.center),
        spanDegrees: MKCoordinateRegion.czechia.span.latitudeDelta)
}

/// Zadání polohy posouváním mapy pod pevným špendlíkem.
///
/// Proč ne klepnutí do mapy: prst zakrývá právě to místo, kam se míří, a na malé
/// mapě se tak o pár desítek metrů netrefíte. Špendlík proto zůstává nehybně
/// uprostřed a pohybuje se mapa – stejný princip, jaký zná uživatel z Apple Map.
struct StationLocationPicker: View {

    @Binding var pick: MapPick
    var userLocation: CLLocation?
    /// Bez svolení k poloze se tlačítko „Moje poloha“ vůbec nekreslí. Zašedlé
    /// tlačítko je horší než žádné – vypadá jako porucha, i když je to jen
    /// rozhodnutí, které uživatel sám udělal.
    var canUseLocation = false

    @State private var recenter: RecenterCommand?

    var body: some View {
        ZStack {
            PickerMap(pick: $pick, autoCenter: userLocation.map { MapPoint($0.coordinate) }, recenter: recenter)
            pin
            myLocationButton
        }
        .frame(height: 220)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Poloha benzínky")
        .accessibilityValue(pick.isPrecise ? pick.point.text : "Zatím nezaměřeno")
    }

    private var pin: some View {
        ZStack {
            Circle()
                .fill(Color.accentColor.opacity(0.9))
                .frame(width: 6, height: 6)
            Image(systemName: "mappin")
                .font(.system(size: 30, weight: .semibold))
                .foregroundColor(.accentColor)
                .shadow(radius: 2)
                // Špička špendlíku musí sedět na středu mapy, ne jeho hlavička.
                .offset(y: -17)
        }
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private var myLocationButton: some View {
        if canUseLocation {
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button {
                        guard let userLocation else { return }
                        recenter = RecenterCommand(point: MapPoint(userLocation.coordinate))
                    } label: {
                        Label("Moje poloha", systemImage: "location.fill")
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    // Svolení je, jen zaměření ještě nedorazilo – to je chvilkový
                    // stav, tady zašedlé tlačítko dává smysl.
                    .disabled(userLocation == nil)
                }
            }
            .padding(10)
            .transition(.opacity)
        }
    }

    /// Vycentrování je příkaz, ne stav – bez vlastní identity by se po každém
    /// překreslení mapa vracela zpátky na uživatele a nešlo by s ní hnout.
    struct RecenterCommand: Equatable {
        let id = UUID()
        let point: MapPoint
    }
}

private struct PickerMap: UIViewRepresentable {

    @Binding var pick: MapPick
    /// Poloha uživatele, na kterou mapa jednou sama skočí, jakmile ji systém vydá.
    var autoCenter: MapPoint?
    var recenter: StationLocationPicker.RecenterCommand?

    /// Přiblížení „na benzínku“ – vejde se do něj křižovatka i s odbočkou.
    private static let closeSpan = MKCoordinateSpan(latitudeDelta: 0.004, longitudeDelta: 0.004)

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        #if DEBUG
        map.showsUserLocation = !DebugLaunch.skipLocation
        #else
        map.showsUserLocation = true
        #endif
        map.showsCompass = false
        // Otáčení a náklon při míření jen překáží a hůř se z nich vrací zpátky.
        map.isRotateEnabled = false
        map.isPitchEnabled = false

        let region = MKCoordinateRegion(
            center: pick.point.coordinate,
            span: MKCoordinateSpan(latitudeDelta: pick.spanDegrees,
                                   longitudeDelta: pick.spanDegrees))
        context.coordinator.setRegion(region, on: map, animated: false)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.parent = self

        if let recenter, context.coordinator.handledRecenter != recenter.id {
            context.coordinator.handledRecenter = recenter.id
            context.coordinator.didAutoCenter = true
            context.coordinator.setRegion(
                MKCoordinateRegion(center: recenter.point.coordinate, span: Self.closeSpan),
                on: map, animated: true)
            return
        }

        // Když poloha dorazí až po otevření formuláře, mapa se na ni jednou sama
        // přesune – ale jen dokud si s ní uživatel sám nehnul.
        if !context.coordinator.didAutoCenter, !context.coordinator.didUserMove,
           let autoCenter {
            context.coordinator.didAutoCenter = true
            context.coordinator.setRegion(
                MKCoordinateRegion(center: autoCenter.coordinate, span: Self.closeSpan),
                on: map, animated: false)
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: PickerMap
        var handledRecenter: UUID?
        var didAutoCenter = false
        var didUserMove = false

        private var isProgrammaticChange = false

        init(_ parent: PickerMap) {
            self.parent = parent
        }

        func setRegion(_ region: MKCoordinateRegion, on map: MKMapView, animated: Bool) {
            isProgrammaticChange = true
            map.setRegion(region, animated: animated)
        }

        /// Souřadnice se hlásí až po dojetí mapy, ne během tažení. Průběžné hlášení
        /// by při každém snímku přepočítalo celý formulář.
        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            if isProgrammaticChange {
                isProgrammaticChange = false
            } else {
                didUserMove = true
            }

            let updated = MapPick(point: MapPoint(mapView.centerCoordinate),
                                  spanDegrees: mapView.region.span.latitudeDelta)
            guard updated != parent.pick else { return }
            parent.pick = updated
        }
    }
}
