import SwiftUI

struct StationFuelKindSection: View {
    @ObservedObject var feedback: StationFeedbackViewModel

    var body: some View {
        Section {
            switch feedback.state {
            case .loading:
                HStack { ProgressView(); Text("Zjišťuji…").foregroundStyle(.secondary) }
            case .failed:
                unavailableRow
            case .loaded:
                FuelKindCard(
                    myVote: feedback.myFuelKind,
                    isSubmitting: feedback.isSubmitting
                ) { kind in
                    Task { await feedback.vote(kind) }
                }
            }
        } header: {
            Text("Benzín pro starší auta")
        }
    }

    private var unavailableRow: some View {
        HStack {
            Label("Hodnocení teď nejsou dostupná.", systemImage: "wifi.slash")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Znovu") { Task { await feedback.load() } }
                .font(.footnote)
        }
    }
}
