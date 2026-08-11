import SwiftUI

struct MenuSheet: View {

    private let shareURL = URL(string: "https://tankuj100.cz")!

    var body: some View {
        NavigationStack {
            List {
                NavigationLink {
                    AboutView()
                } label: {
                    MenuRow(icon: "info.circle", title: "O aplikaci")
                }

                ShareLink(item: shareURL) {
                    MenuRow(icon: "person.2", title: "Doporučit přátelům")
                }
                .buttonStyle(.plain)
            }
            .tightListTop()
            .navigationTitle("Menu")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sheetBackground(Color(.systemGroupedBackground))
    }
}

private struct MenuRow: View {
    let icon: String
    let title: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(.accentColor)
                .font(.body)
                .frame(width: 24, alignment: .center)
            Text(title)
                .foregroundColor(.primary)
                .font(.body)
            Spacer()
        }
    }
}
