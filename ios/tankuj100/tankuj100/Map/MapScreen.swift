import MapKit
import SwiftUI

struct MapScreen: View {

    @StateObject private var viewModel = MapViewModel()
    @StateObject private var location = LocationProvider()
    @StateObject private var favorites = FavoritesStore()

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            StationMapView(stations: viewModel.stations,
                           selected: $viewModel.selectedStation)
                .ignoresSafeArea()

            buttons
                // Dole vlevo si Apple Mapy kreslí povinný podpis („Maps · Legal“),
                // tlačítka ho nesmí překrývat.
                .padding(.leading, 20)
                .padding(.bottom, 46)
        }
        .onAppear {
            viewModel.onAppear()
            if shouldStartLocation { location.start() }
        }
        .onValueChange(of: viewModel.stations.count) { _ in applyDebugLaunchOptions() }
        .sheet(item: $viewModel.selectedStation) { station in
            NavigationStack {
                GasStationDetailView(gasStation: station,
                                     userLocation: location.location,
                                     favorites: favorites,
                                     onClose: { viewModel.selectedStation = nil })
            }
            // Když uživatel klepne na jiný špendlík, aniž by detail zavřel, sheet se
            // nezavírá – jen se překreslí. Bez vlastní identity by si SwiftUI nechal
            // stav předchozí benzínky a ukazoval cizí paliva i hodnocení.
            .id(station.id)
        }
        .sheet(item: $viewModel.activeSheet) { sheet in
            switch sheet {
            case .menu:
                MenuSheet()
            case .addStation:
                AddStationSheet(onClose: { viewModel.activeSheet = nil })
            case .stationList:
                StationsListView(stations: viewModel.stations,
                                 userLocation: location.location,
                                 favorites: favorites,
                                 onRetry: { await viewModel.reload() })
            }
        }
        .errorAlert($viewModel.error)
    }

    private var shouldStartLocation: Bool {
        #if DEBUG
        return !DebugLaunch.skipLocation
        #else
        return true
        #endif
    }

    private func applyDebugLaunchOptions() {
        #if DEBUG
        if let sheet = DebugLaunch.sheet {
            viewModel.activeSheet = sheet
        }
        if let id = DebugLaunch.stationID {
            viewModel.selectedStation = viewModel.stations.first { $0.id == id }
        }
        #endif
    }

    private var buttons: some View {
        VStack(spacing: 10) {
            FloatingMapButton(systemImage: "plus",
                              accessibilityLabel: "Přidat benzínku") {
                viewModel.activeSheet = .addStation
            }
            FloatingMapButton(systemImage: "list.bullet",
                              pointSize: 26,
                              accessibilityLabel: "Seznam benzínek") {
                viewModel.activeSheet = .stationList
            }
            FloatingMapButton(systemImage: "line.3.horizontal",
                              pointSize: 30,
                              accessibilityLabel: "Menu") {
                viewModel.activeSheet = .menu
            }
        }
        .shadow(radius: 3)
    }
}

#Preview {
    MapScreen()
}
