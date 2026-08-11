import SwiftUI

struct StationFuelsSection: View {
    let detail: GasStationDetail

    var body: some View {
        let fuels = FuelCatalog.sorted(detail.fuels ?? [])
        Section {
            if fuels.isEmpty {
                Text("U téhle benzínky zatím paliva neznáme.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(fuels, id: \.self) { key in
                    let isPremium = FuelCatalog.isPremium(key)
                    HStack(spacing: 10) {
                        Image(systemName: isPremium ? "star.circle.fill" : "fuelpump")
                            .foregroundStyle(isPremium ? Color.accentColor : Color.secondary)
                            .frame(width: 22)
                        Text(FuelCatalog.label(for: key))
                            .fontWeight(isPremium ? .semibold : .regular)
                        Spacer()
                    }
                }
            }
        } header: {
            Text("Paliva")
        }
    }
}
