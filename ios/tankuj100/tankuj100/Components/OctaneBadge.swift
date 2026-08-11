import SwiftUI

struct OctaneBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .monospacedDigit()
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(Color.accentColor.opacity(0.15), in: Capsule())
            .foregroundColor(.accentColor)
            .accessibilityLabel("Natural \(text)")
    }
}
