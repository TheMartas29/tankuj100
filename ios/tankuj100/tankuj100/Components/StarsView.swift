import SwiftUI

struct StarsView: View {
    let rating: Double
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: 1.5) {
            ForEach(1...5, id: \.self) { index in
                Image(systemName: symbol(for: index))
                    .font(.system(size: size))
                    .foregroundStyle(Double(index) - 0.5 <= rating ? Color.yellow : Color.secondary.opacity(0.35))
            }
        }
        .accessibilityLabel("Hodnocení \(String(format: "%.1f", rating)) z 5")
    }

    private func symbol(for index: Int) -> String {
        let value = Double(index)
        if rating >= value { return "star.fill" }
        if rating >= value - 0.5 { return "star.leadinghalf.filled" }
        return "star"
    }
}
