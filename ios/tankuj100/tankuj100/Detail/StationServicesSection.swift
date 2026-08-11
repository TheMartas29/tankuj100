import SwiftUI

struct StationServicesSection: View {
    let detail: GasStationDetail

    @ViewBuilder
    var body: some View {
        let rows = ServiceCatalog.rows(from: detail.services ?? [])
        if !rows.isEmpty {
            Section("Služby") {
                ForEach(rows) { row in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: row.symbol)
                            .foregroundColor(.accentColor)
                            .frame(width: 22)
                        Text(row.title)
                        Spacer()
                        if let detail = row.detail {
                            Text(detail)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }
            }
        }
    }
}
