import Foundation
import SwiftUI

enum MapSheet: String, Identifiable {
    case menu
    case stationList
    case addStation

    var id: String { rawValue }
}

@MainActor
final class MapViewModel: ObservableObject {

    @Published var stations: [GasStation] = []
    @Published var selectedStation: GasStation?
    @Published var activeSheet: MapSheet?
    @Published var error: CustomError?

    private var didLoad = false

    func onAppear() {
        guard !didLoad else { return }
        didLoad = true
        Task { await load(reportingErrors: true) }
    }

    /// Opětovné načtení po neúspěchu. Chybu tu schválně nevystavujeme do `error`:
    /// alert by zavřel seznam, ve kterém uživatel na „Zkusit znovu“ klepnul.
    func reload() async {
        await load(reportingErrors: false)
    }

    private func load(reportingErrors: Bool) async {
        switch await APIClient.shared.stations() {
        case .success(let loaded):
            stations = loaded
        case .failure(let failure):
            guard reportingErrors else { return }
            error = failure as? CustomError ?? .defaultError(message: failure.localizedDescription)
        }
    }
}
