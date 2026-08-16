import SwiftUI

struct AboutView: View {

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

                    // Testovací build to o sobě říká sám; ostrý tenhle odznak nemá.
                    if AppEnvironment.isTest {
                        Text(AppEnvironment.current.title.uppercased())
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
    }
}
