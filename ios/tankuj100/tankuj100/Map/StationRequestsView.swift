import SwiftUI

/// Záložka „Moje žádosti“. Jen se čte – nic se tu needituje ani neruší, žádost
/// je od odeslání v rukou administrace.
struct StationRequestsView: View {

    @ObservedObject var viewModel: StationRequestViewModel
    /// Když je vyplněné, u schválené žádosti přibude tlačítko do mapy.
    var onShowStation: ((Int) -> Void)?
    var onAddTapped: () -> Void

    var body: some View {
        switch viewModel.listState {
        case .loading where viewModel.requests.isEmpty:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .failed(let message) where viewModel.requests.isEmpty:
            EmptyStateView(
                title: "Žádosti se nenačetly",
                systemImage: "wifi.exclamationmark",
                message: message
            ) {
                Button("Zkusit znovu") {
                    Task { await viewModel.load() }
                }
                .buttonStyle(.borderedProminent)
            }

        default:
            if viewModel.requests.isEmpty {
                EmptyStateView(
                    title: "Zatím žádná žádost",
                    systemImage: "tray",
                    message: "Chybí v mapě benzínka? Pošlete nám ji a po kontrole se do mapy přidá."
                ) {
                    Button("Přidat benzínku", action: onAddTapped)
                        .buttonStyle(.borderedProminent)
                }
            } else {
                List(viewModel.requests) { request in
                    StationRequestRow(request: request, onShowStation: onShowStation)
                }
                .refreshable { await viewModel.load() }
            }
        }
    }
}

private struct StationRequestRow: View {

    let request: StationRequest
    var onShowStation: ((Int) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(request.title)
                    .font(.headline)
                    // Ustoupit má název, ne stav: „Čeká na k…“ neřekne nic, kdežto
                    // zkrácená značka je pořád poznat. Na 320 bodech se jinak
                    // ořízne odznak.
                    .lineLimit(1)
                Spacer(minLength: 8)
                statusChip
                    .fixedSize()
            }

            if let place = request.placeText {
                Text(place)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Text("Odesláno \(request.dateText)")
                .font(.caption)
                .foregroundColor(.secondary)

            outcome
        }
        .padding(.vertical, 4)
    }

    private var statusChip: some View {
        Label(request.status.label, systemImage: request.status.symbol)
            .font(.caption.weight(.semibold))
            .foregroundColor(request.status.tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(request.status.tint.opacity(0.12), in: Capsule())
    }

    @ViewBuilder
    private var outcome: some View {
        switch request.status {
        case .rejected:
            // Důvod zamítnutí píše admin přímo uživateli – když chybí, aspoň se
            // nesmí tvářit, že žádost zmizela bez vysvětlení.
            Text(adminNote ?? "Žádost jsme nepřijali. Napište nám prosím, pokud si myslíte, že je to omyl.")
                .font(.footnote)
                .foregroundColor(.primary)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))

        case .approved:
            VStack(alignment: .leading, spacing: 6) {
                Label("Benzínka už je v mapě. Díky!", systemImage: "map")
                    .font(.footnote)
                    .foregroundColor(.secondary)

                if let onShowStation, let stationId = request.stationId {
                    Button("Ukázat v mapě") { onShowStation(stationId) }
                        .font(.footnote.weight(.semibold))
                        .buttonStyle(.borderless)
                }
            }

        case .new, .unknown:
            Text("Žádost čeká na kontrolu. Ozveme se přes tuhle obrazovku.")
                .font(.footnote)
                .foregroundColor(.secondary)
        }
    }

    private var adminNote: String? {
        let note = request.adminNote?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return note.isEmpty ? nil : note
    }
}
