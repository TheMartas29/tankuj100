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
            .accessibilityLabel("Natural \(octane)")
    }
}
