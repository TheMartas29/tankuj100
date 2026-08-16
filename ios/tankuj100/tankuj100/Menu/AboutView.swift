import SwiftUI

struct AboutView: View {

    /// Kolikrát je potřeba klepnout na verzi, než se objeví přepínač prostředí.
    /// Sedm je zaběhaná konvence a náhodou se na to nepřijde.
    private static let tapsToUnlock = 7

    @ObservedObject private var environment = AppEnvironmentStore.shared
    @State private var versionTaps = 0
    @State private var showDeveloper = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Image("icon")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 88, height: 88)
                    Text("tankuj100")
                        .font(.title).bold()
                    Text("Verze \(version)")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .contentShape(Rectangle())
                        .onTapGesture(perform: countTap)

                    if environment.current == .test {
                        Text(environment.current.title.uppercased())
                            .font(.caption2).bold()
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.orange.opacity(0.2), in: Capsule())
                            .foregroundColor(.orange)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
            }

            Section {
                // Licence ODbL uvedení zdroje vyžaduje, tak ať tahle věta nezmizí.
                Text("Data o benzínkách přebíráme z OpenStreetMap (© přispěvatelé OpenStreetMap, licence ODbL). Můžou být neúplná nebo zastaralá – když něco nesedí, nahlaste to v detailu benzínky a opravíme to.")
                    .font(.subheadline)
            } header: {
                Text("Data")
            }

            Section {
                Link(destination: URL(string: "\(APIClient.productionURL)/privacy")!) {
                    Label("Zásady ochrany soukromí", systemImage: "hand.raised")
                }
                Link(destination: URL(string: "mailto:info@silkroadbrand.eu")!) {
                    Label("Napsat nám", systemImage: "envelope")
                }
            }
        }
        .navigationTitle("O aplikaci")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showDeveloper) {
            DeveloperSheet()
        }
    }

    /// Odemyká se jen souvislou sérií klepnutí – když uživatel mezi nimi odejde
    /// jinam, počítadlo se vynuluje při dalším zobrazení obrazovky.
    private func countTap() {
        versionTaps += 1
        guard versionTaps >= Self.tapsToUnlock else { return }
        versionTaps = 0
        showDeveloper = true
    }
}
