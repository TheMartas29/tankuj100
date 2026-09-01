import SwiftUI

struct OctaneBadge: View {
    let octane: Int

    var body: some View {
        Text("\(octane) oktanů")
            .font(.caption2.weight(.semibold))
            .monospacedDigit()
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(Color.accentColor.opacity(0.15), in: Capsule())
            .foregroundColor(.accentColor)
            .lineLimit(1)
            .fixedSize()
            // `fixedSize` drží nápis na jednom řádku, ale zároveň mu dovolí růst přes
            // šířku buňky – při přístupnostní velikosti písma odznak přetekl přes okraj
            // karty a vytlačil srdíčko oblíbené benzínky mimo obrazovku. Odznak je
            // doplněk, ne to hlavní, co se ze řádku čte, takže se mu růst zastropuje;
            // značka a vzdálenost se zvětšují dál bez omezení.
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .accessibilityLabel("Natural \(octane)")
    }
}
