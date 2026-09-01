import MapKit
import SwiftUI

struct MapScreen: View {

    @StateObject private var viewModel = MapViewModel()
    @StateObject private var location = LocationProvider()
    @StateObject private var favorites = FavoritesStore()
    @StateObject private var requestBadge = StationRequestBadge()

    /// Filtr je sdílený s mapou i seznamem; tady se z něj bere jen počet do odznaku.
    @ObservedObject private var filterStore = StationFilterStore.shared

    @Environment(\.scenePhase) private var scenePhase

    @State private var toast: String?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            StationMapView(stations: viewModel.stations,
                           selected: $viewModel.selectedStation,
                           canShowUserLocation: location.isAuthorized)
                .ignoresSafeArea()

            // Menu si okraje i ztmavení řeší samo, proto tu nemá odsazení.
            FloatingMenu(items: menuItems)

            // Prostředí se určuje při překladu, takže tenhle pruh buď je v buildu
            // vždycky, nebo v něm není vůbec – za běhu se přepnout nedá.
            if AppEnvironment.isTest { testBanner }
        }
        .onAppear {
            viewModel.onAppear()
            // Oblíbené jsou z disku načtené už v `init`, takže `onValueChange` níž
            // se pro ně nikdy nespustí – `onChange` počáteční hodnotu přeskakuje.
            // Bez tohohle předání znal sdílený filtr prázdnou množinu a „Jen
            // oblíbené“ po startu schovalo úplně všechno, dokud uživatel neotevřel
            // seznam nebo nepřeklikl nějaké srdíčko.
            filterStore.setFavorites(favorites.ids)
            if shouldStartLocation { location.start() }
        }
        // Index se staví tady, ne až v seznamu: mapa kreslí to, co projde filtrem,
        // takže bez načteného indexu by zůstala prázdná.
        .task(id: viewModel.stations.count) {
            await filterStore.load(viewModel.stations)
        }
        .onValueChange(of: location.location) { filterStore.setOrigin($0) }
        .onValueChange(of: favorites.ids) { filterStore.setFavorites($0) }
        .onValueChange(of: viewModel.stations.count) { _ in applyDebugLaunchOptions() }
        // Aplikace nemá push notifikace, o změně stavu žádosti se dozví jen dotazem.
        .onValueChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task { await requestBadge.refresh() }
        }
        .sheet(item: $viewModel.selectedStation) { station in
            NavStack {
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
                AddStationSheet(badge: requestBadge,
                                userLocation: location.location,
                                canUseLocation: location.isAuthorized,
                                onShowStation: showStation,
                                onClose: { viewModel.activeSheet = nil })
            case .stationList:
                StationsListView(stations: viewModel.stations,
                                 userLocation: location.location,
                                 favorites: favorites,
                                 onRetry: { await viewModel.reload() })
            case .filter:
                FilterSheet()
            }
        }
        .errorAlert($viewModel.error)
        .successToast($toast)
    }

    private var menuItems: [FloatingMenuItem] {
        // Pořadí odspodu nahoru podle toho, jak často se to používá – nejčastější
        // věc má být nejblíž palci, tedy hned nad hamburgerem.
        [
            // Velikosti symbolů jsou stejné jako u původních čtyř tlačítek – tečky
            // i seznam potřebují jinou, aby v kroužku působily stejně velké.
            FloatingMenuItem(id: "menu", systemImage: "ellipsis", title: "Další",
                             pointSize: 30) {
                viewModel.activeSheet = .menu
            },
            FloatingMenuItem(id: "add", systemImage: "plus", title: "Přidat benzínku",
                             pointSize: 28,
                             badge: requestBadge.hasUnread ? .dot : .none) {
                viewModel.activeSheet = .addStation
            },
            FloatingMenuItem(id: "filter", systemImage: "line.3.horizontal.decrease",
                             title: "Filtr",
                             pointSize: 24,
                             badge: .count(filterStore.filter.activeCount)) {
                viewModel.activeSheet = .filter
            },
            FloatingMenuItem(id: "list", systemImage: "list.bullet", title: "Seznam benzínek",
                             pointSize: 26) {
                viewModel.activeSheet = .stationList
            },
        ]
    }

    /// Ze schválené žádosti se dá skočit rovnou na benzínku v mapě. Když ji filtr
    /// zrovna schovává, zahodí se – jinak by klepnutí nic neudělalo a vypadalo
    /// by to jako chyba. Že filtr zmizel, se ale musí říct nahlas; tiše zmizelý
    /// filtr je horší než žádný.
    private func showStation(id: Int) {
        guard let station = viewModel.stations.first(where: { $0.id == id }) else { return }
        viewModel.activeSheet = nil
        if filterStore.result.keepingOnly([id]).isEmpty && !filterStore.filter.isEmpty {
            filterStore.clearFilter()
            toast = "Filtr jsme vypnuli, tahle benzínka mu neodpovídala."
        }
        viewModel.selectedStation = station
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

    /// Nepřehlédnutelně schválně – z testovacích dat se snadno udělá hlášení chyby,
    /// která v ostré aplikaci není.
    private var testBanner: some View {
        VStack {
            Text("TESTOVACÍ PROSTŘEDÍ")
                .font(.caption).bold()
                .foregroundColor(.white)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity)
                .background(Color.orange)
            Spacer()
        }
        .ignoresSafeArea(edges: .horizontal)
        .allowsHitTesting(false)
    }
}

#Preview {
    MapScreen()
}
