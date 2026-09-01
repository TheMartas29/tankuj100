import CoreLocation
import SwiftUI

struct StationRow: View {
    let station: GasStation
    var distance: CLLocationDistance?
    var isFavorite: Bool

    var body: some View {
        HStack(spacing: 12) {
            BrandLogoView(brandName: station.brandName, size: 34)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(station.brandName ?? "Benzínka").fontWeight(.medium)
                    if station.has100 { OctaneBadge(octane: 100) }
                    if station.has98 { OctaneBadge(octane: 98) }
                }

                HStack(spacing: 10) {
                    if let distance {
                        Text(DistanceFormatter.text(for: distance))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    if let average = station.ratingAvg, let count = station.ratingCount, count > 0 {
                        HStack(spacing: 3) {
                            StarsView(rating: average, size: 9)
                            Text("(\(count))")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                                // Na 320 bodech si SwiftUI vyloží závorku s číslem
                                // jako lámatelný text a rozseká „(1)“ na dva řádky.
                                .fixedSize()
                        }
                    }
                }
            }

            Spacer()

            if isFavorite {
                Image(systemName: "heart.fill")
                    .foregroundColor(.accentColor)
                    .font(.footnote)
            }
        }
    }
}
