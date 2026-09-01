import CoreLocation
import SwiftUI

struct StationRow: View {
    let station: GasStation
    var distance: CLLocationDistance?
    var isFavorite: Bool

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 12) {
            BrandLogoView(brandName: station.brandName, size: 34)

            VStack(alignment: .leading, spacing: 3) {
                titleLine

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

    /// Značka a odznaky paliv. Vedle sebe se vejdou jen při běžné velikosti písma.
    /// Odznak si drží pevnou šířku, takže při zvětšeném písmu na značku nezbylo nic
    /// a zmizela úplně – ze seznamu pak byly řádky „100 oktanů, 1,3 km“, které od
    /// sebe nešly rozeznat. Značka je to hlavní, podle čeho se benzínka pozná,
    /// proto při velkém písmu ustoupí odznak pod ni.
    @ViewBuilder
    private var titleLine: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 3) {
                name
                HStack(spacing: 6) { octaneBadges }
            }
        } else {
            HStack(spacing: 6) {
                name
                octaneBadges
            }
        }
    }

    private var name: some View {
        Text(station.brandName ?? "Benzínka").fontWeight(.medium)
    }

    @ViewBuilder
    private var octaneBadges: some View {
        if station.has100 { OctaneBadge(octane: 100) }
        if station.has98 { OctaneBadge(octane: 98) }
    }
}
