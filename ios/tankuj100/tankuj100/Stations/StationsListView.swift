import CoreLocation
import SwiftUI

/// Seznam benzínek. Ukazuje **všechny**, které projdou filtrem – strop na padesát
/// nejbližších padl, protože se seznam stal hlavní cestou k filtrování.
///
/// Datovým zdrojem `List` je pole indexů (`[Int32]`), ne přefiltrované pole struktur.
/// Kdyby se pole stanic skládalo znovu při každém překreslení, byla by to při stotisíci
/// položkách kopie několika megabajtů na každý pohyb prstem.
struct StationsListView: View {

    /// Načtená data. Index i filtr si z nich postaví sdílený `StationFilterStore`;
    /// když už je postavený nad stejnými daty, nic se neděje.
    let stations: [GasStation]
    var userLocation: CLLocation?
    @ObservedObject var favorites: FavoritesStore
    /// Vrací text chyby, nebo `nil` při úspěchu. Seznam ho ukáže u tlačítka –
    /// bez toho vypadá neúspěšné zopakování stejně jako žádné klepnutí.
    var onRetry: (() async -> String?)?

    @ObservedObject private var store = StationFilterStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .nearest
    @State private var isRetrying = false
    @State private var loadFailure: String?
    @State private var showsFilter = false
    @State private var favoriteRows: [Int32] = []
    /// Ke kterému výsledku `favoriteRows` patří. Bez toho by po přestavbě indexu
    /// zbyly v poli indexy do starých dat – a to je čtení mimo pole, ne kosmetika.
    @State private var favoriteRevision: UInt64 = 0

    enum Mode: String, CaseIterable {
        case nearest = "Nejbližší"
        case favorites = "Oblíbené"
    }

    private var rows: [Int32] {
        guard mode == .favorites else { return store.result.rows }
        // Nový výsledek dorazí dřív, než se stihne ohlásit `onChange`; v tom jednom
        // snímku se oblíbené prosejí rovnou, ať seznam neproblikne prázdnem.
        guard favoriteRevision == store.result.revision else {
            return store.result.keepingOnly(favorites.ids)
        }
        return favoriteRows
    }

    var body: some View {
        NavStack {
            content
                .navigationTitle("Benzínky")
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestinationBackport(for: GasStation.self) { station in
                    detail(for: station)
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { filterButton }
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
        .sheet(isPresented: $showsFilter) { FilterSheet() }
        .task {
            store.setFavorites(favorites.ids)
            store.setOrigin(userLocation)
            await store.load(stations)
            // Když mapa data ještě nemá, přivěsíme se na její dotaz. Bez toho by
            // seznam otevřený během prvního načítání tvrdil „nenačetly se“ ve chvíli,
            // kdy se benzínky po pomalé lince pořád ještě stahují.
            if stations.isEmpty { await runRetry() }
        }
        .onValueChange(of: stations.count) { _ in
            Task { await store.load(stations) }
        }
        .onValueChange(of: userLocation) { store.setOrigin($0) }
        .onValueChange(of: favorites.ids) { ids in
            store.setFavorites(ids)
            refreshFavoriteRows()
        }
        .onValueChange(of: mode) { _ in refreshFavoriteRows() }
        .onValueChange(of: store.result.revision) { _ in refreshFavoriteRows() }
    }

    private var filterButton: some View {
        Button { showsFilter = true } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "line.3.horizontal.decrease")
                if store.filter.activeCount > 0 {
                    Text("\(store.filter.activeCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 14, height: 14)
                        .background(Color.accentColor, in: Circle())
                        .offset(x: 9, y: -8)
                }
            }
        }
        .accessibilityLabel(store.filter.isEmpty ? "Filtr" : "Filtr, aktivní podmínky: \(store.filter.activeCount)")
    }

    @ViewBuilder
    private var content: some View {
        if stations.isEmpty && isRetrying {
            VStack(spacing: 12) {
                ProgressView()
                Text("Načítám benzínky…")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if stations.isEmpty {
            EmptyStateView(
                title: "Benzínky se nenačetly",
                systemImage: "wifi.exclamationmark",
                // Konkrétní důvod je přednější než obecná rada: „server neodpovídá“
                // a „nejste online“ vedou uživatele každé jinam.
                message: loadFailure ?? "Zkontrolujte připojení k internetu. Bez dat vám seznam nemáme co zobrazit."
            ) {
                Button("Zkusit znovu", action: retry)
                    .buttonStyle(.borderedProminent)
                    .disabled(onRetry == nil)
            }
        } else if rows.isEmpty && store.isWorking {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if rows.isEmpty {
            emptyResult
        } else {
            // `List` je líný, takže i sto tisíc řádků vykreslí jen tolik, kolik je vidět.
            List {
                ForEach(rows, id: \.self) { row in
                    link(toRow: row)
                }
            }
        }
    }

    /// Odkaz do detailu. Na iOS 16+ hodnotový – cíl se staví až při otevření a
    /// registruje ho `navigationDestination`. Na patnáctce ta cesta neexistuje, tak
    /// se cíl předává rovnou; `List` je líný, takže se stejně postaví jen pro řádky,
    /// které jsou vidět.
    @ViewBuilder
    private func link(toRow row: Int32) -> some View {
        let station = store.result.station(forRow: row)
        if #available(iOS 16.0, *) {
            NavigationLink(value: station) { rowLabel(station, row: row) }
        } else {
            NavigationLink { detail(for: station) } label: { rowLabel(station, row: row) }
        }
    }

    private func rowLabel(_ station: GasStation, row: Int32) -> some View {
        StationRow(station: station,
                   distance: store.result.distance(forRow: row),
                   isFavorite: favorites.contains(station.id))
    }

    private func detail(for station: GasStation) -> some View {
        GasStationDetailView(gasStation: station,
                             userLocation: userLocation,
                             favorites: favorites)
    }

    /// Bez polohy se seznam **nezablokuje** – jen se řadí podle značky. Prázdný stav
    /// tu zbyl jen pro případy, kdy opravdu není co ukázat.
    @ViewBuilder
    private var emptyResult: some View {
        // Rozhoduje **počet oblíbených**, ne filtr: kdo si zatím žádnou benzínku
        // neuložil, má na téhle záložce prázdno bez ohledu na podmínky. Když se to
        // vázalo na prázdný filtr, dostal místo toho „Filtru nic neodpovídá“
        // s tlačítkem „Vymazat filtr“ – uživatel si po něm zahodil nastavené
        // podmínky a seznam zůstal stejně prázdný. Filtr smí za prázdno jen tehdy,
        // když nějaké oblíbené jsou a teprve on je odsud vyřadil.
        if mode == .favorites && favorites.ids.isEmpty {
            EmptyStateView(title: "Žádné oblíbené",
                           systemImage: "heart",
                           message: "Benzínku si přidáte do oblíbených srdíčkem v detailu.")
        } else {
            EmptyStateView(
                title: "Filtru nic neodpovídá",
                systemImage: "line.3.horizontal.decrease",
                message: "Zkuste ubrat některou z podmínek."
            ) {
                Button("Vymazat filtr") { store.clearFilter() }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    /// Oblíbené se jen prosejí z hotového výsledku – pořadí i vzdálenosti tím zůstávají
    /// a nemusí se kvůli záložce filtrovat a řadit znovu. Počítá se jen tehdy, když je
    /// záložka vidět.
    private func refreshFavoriteRows() {
        guard mode == .favorites else {
            if !favoriteRows.isEmpty { favoriteRows = [] }
            favoriteRevision = 0
            return
        }
        favoriteRows = store.result.keepingOnly(favorites.ids)
        favoriteRevision = store.result.revision
    }

    private func retry() {
        Task { await runRetry() }
    }

    /// Mapa běžící dotaz nezdvojuje – když už jeden má, tohle si počká na jeho výsledek.
    private func runRetry() async {
        guard let onRetry, !isRetrying else { return }
        isRetrying = true
        loadFailure = await onRetry()
        isRetrying = false
    }
}
