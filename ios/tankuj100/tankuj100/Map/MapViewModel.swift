import Foundation
import SwiftUI

enum MapSheet: String, Identifiable {
    case menu
    case stationList
    case addStation
    case filter

    var id: String { rawValue }
}

@MainActor
final class MapViewModel: ObservableObject {

    /// Jak dopadlo načtení benzínek. Mapa i seznam z toho poznají rozdíl mezi
    /// „ještě se to načítá“ a „nepovedlo se to“ – bez toho vypadá pomalé připojení
    /// úplně stejně jako výpadek a obrazovka lže.
    enum LoadState: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    @Published var stations: [GasStation] = []
    @Published var selectedStation: GasStation?
    @Published var activeSheet: MapSheet?
    @Published var error: CustomError?
    @Published private(set) var loadState: LoadState = .loading

    private var didLoad = false
    /// Rozdělaný dotaz. Kdo přijde během něj, pověsí se na něj místo posílání druhého –
    /// jinak by otevření seznamu během prvního načtení znamenalo stažení dat dvakrát.
    private var loadTask: Task<String?, Never>?
    /// Čekání na návrat sítě. Drží se, aby neběžela dvě naráz.
    private var recoveryTask: Task<Void, Never>?

    func onAppear() {
        guard !didLoad else { return }
        didLoad = true
        Task {
            let message = await load()
            // Alert je na mapě jediná zpráva o tom, proč je prázdná. U opakovaných
            // pokusů se už neukazuje – tam uživatel stojí u tlačítka, kterým to spustil.
            if let message { error = .defaultError(message: message) }
        }
    }

    /// Opětovné načtení. Vrací text chyby, aby si ho obrazovka, ze které se spustilo,
    /// ukázala u tlačítka sama: alert by seznam zavřel a uživatel by nevěděl,
    /// jestli se vůbec něco stalo.
    @discardableResult
    func reload() async -> String? {
        await load()
    }

    private func load() async -> String? {
        // Běžící dotaz se nepřerušuje – druhý žadatel si počká na jeho výsledek.
        if let loadTask { return await loadTask.value }

        loadState = .loading
        let task = Task { () -> String? in
            switch await APIClient.shared.stations() {
            case .success(let loaded):
                stations = loaded
                loadState = .loaded
                return nil
            case .failure(let failure):
                let message = failure.localizedDescription
                loadState = .failed(message)
                scheduleRecovery(after: failure)
                return message
            }
        }
        loadTask = task
        let message = await task.value
        loadTask = nil
        return message
    }

    /// Až se připojení vrátí, načteme benzínky samy od sebe. Po vyjetí z tunelu
    /// nemá uživatel řešit, kde je tlačítko – jen mu naskočí mapa.
    ///
    /// Čeká se jen na skutečný výpadek připojení. Nedostupný server se návratem sítě
    /// nespraví a čekání by skončilo hned, což by z toho udělalo smyčku dotazů.
    private func scheduleRecovery(after failure: Error) {
        guard (failure as? APIError)?.isOffline == true, recoveryTask == nil else { return }

        recoveryTask = Task { [weak self] in
            await NetworkMonitor.waitUntilOnline()
            // Hned po naskočení sítě ještě neprojde DNS, chvilka navíc ušetří
            // jeden jistý neúspěch.
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled, let self else { return }
            self.recoveryTask = nil
            guard self.stations.isEmpty else { return }
            await self.load()
        }
    }
}
