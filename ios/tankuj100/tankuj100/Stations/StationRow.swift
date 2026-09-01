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

                metaLine
            }

            Spacer()

            // Při přístupnostní velikosti písma se srdíčko stěhuje dovnitř k odznaku,
            // viz `titleLine` – na konci řádku ubíralo názvu tolik místa, že se
            // „MOL“ zlomilo doprostřed slova.
            if isFavorite, !typeSize.isAccessibilitySize {
                heart
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
                HStack(spacing: 6) {
                    octaneBadges
                    if isFavorite { heart }
                }
            }
        } else {
            HStack(spacing: 6) {
                name
                octaneBadges
            }
        }
    }

    /// Vzdálenost a hodnocení. Hvězdičky i počet v závorce mají pevnou šířku, takže
    /// při zvětšeném písmu ukously celé místo a vzdálenost se smrskla na nulu –
    /// u oblíbené benzínky, kde řádek zužuje ještě srdíčko, zmizela úplně. Stejné
    /// řešení jako u značky: co se vedle sebe nevejde, jde pod sebe.
    @ViewBuilder
    private var metaLine: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 3) {
                distanceText
                ratingText
            }
        } else {
            HStack(spacing: 10) {
                distanceText
                ratingText
            }
        }
    }

    @ViewBuilder
    private var distanceText: some View {
        if let distance {
            Text(DistanceFormatter.text(for: distance))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private var ratingText: some View {
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

    private var heart: some View {
        Image(systemName: "heart.fill")
            .foregroundColor(.accentColor)
            .font(.footnote)
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
