import CoreLocation
import SwiftUI

struct StationsListView: View {
    let stations: [GasStation]
    var userLocation: CLLocation?
    @ObservedObject var favorites: FavoritesStore
    var onRetry: (() async -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .nearest
    @State private var isRetrying = false

    enum Mode: String, CaseIterable {
        case nearest = "Nejbližší"
        case favorites = "Oblíbené"
    }

    private static let nearestLimit = 50

    /// Benzínka i s už spočítanou vzdáleností. Počítat ji až v porovnávači by
    /// znamenalo vyhodnotit ji nad tisícovkou položek přes dvacet tisíckrát – a to
    /// pokaždé, co si SwiftUI řekne o překreslení seznamu.
    private struct Nearby: Identifiable {
        let station: GasStation
        let distance: CLLocationDistance?

        var id: Int { station.id }
    }

    private var displayed: [Nearby] {
        let source = mode == .favorites
            ? stations.filter { favorites.contains($0.id) }
            : stations

        guard let origin = userLocation?.coordinate else {
            // Bez polohy není podle čeho řadit. Režim „Nejbližší“ se v takovém stavu
            // stejně nezobrazí a místo seznamu nabídne povolení polohy.
            return source.map { Nearby(station: $0, distance: nil) }
        }

        var list = source.map {
            Nearby(station: $0, distance: GeoDistance.meters(from: origin, to: $0.coordinate))
        }
        list.sort { ($0.distance ?? .greatestFiniteMagnitude) < ($1.distance ?? .greatestFiniteMagnitude) }

        return mode == .nearest ? Array(list.prefix(Self.nearestLimit)) : list
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Benzínky")
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: GasStation.self) { station in
                    GasStationDetailView(gasStation: station,
                                         userLocation: userLocation,
                                         favorites: favorites)
                }
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        Picker("", selection: $mode) {
                            ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { dismiss() } label: { Image(systemName: "xmark") }
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if stations.isEmpty {
            EmptyStateView(
                title: "Benzínky se nenačetly",
                systemImage: "wifi.exclamationmark",
                message: "Zkontrolujte připojení k internetu. Bez dat vám seznam nemáme co zobrazit."
            ) {
                Button(action: retry) {
                    if isRetrying { ProgressView() } else { Text("Zkusit znovu") }
                }
                .buttonStyle(.borderedProminent)
                .disabled(onRetry == nil || isRetrying)
            }
        } else if mode == .favorites && displayed.isEmpty {
            EmptyStateView(title: "Žádné oblíbené",
                           systemImage: "heart",
                           message: "Benzínku si přidáte do oblíbených srdíčkem v detailu.")
        } else if mode == .nearest && userLocation == nil {
            EmptyStateView(title: "Poloha není dostupná",
                           systemImage: "location.slash",
                           message: "Povolte přístup k poloze pro seznam nejbližších benzínek.")
        } else {
            List(displayed) { item in
                NavigationLink(value: item.station) {
                    StationRow(station: item.station,
                               distance: item.distance,
                               isFavorite: favorites.contains(item.station.id))
                }
            }
        }
    }

    private func retry() {
        guard let onRetry, !isRetrying else { return }
        isRetrying = true
        Task {
            await onRetry()
            isRetrying = false
        }
    }
}
