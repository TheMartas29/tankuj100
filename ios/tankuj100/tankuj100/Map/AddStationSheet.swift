import SwiftUI

struct AddStationSheet: View {
    let onClose: () -> Void

    var body: some View {
        EmptyStateView(
            title: "Přidání benzínky",
            systemImage: "hammer.fill",
            message: "Na téhle funkci pracujeme – v příští verzi aplikace půjde přidat benzínku, která nám v mapě chybí."
        ) {
            VStack(spacing: 16) {
                Text("Než ji dokončíme, můžete nám chybějící benzínku napsat na info@silkroadbrand.eu.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Zavřít", action: onClose)
                    .buttonStyle(.borderedProminent)
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .sheetBackground(Color(.systemGroupedBackground))
    }
}
