import SwiftUI

struct RatingSummaryView: View {
    let summary: RatingSummary

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            VStack(spacing: 2) {
                Text(summary.averageText)
                    .font(.system(size: 34, weight: .semibold))
                    .monospacedDigit()
                StarsView(rating: summary.average ?? 0, size: 11)
                Text(summary.countText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(minWidth: 78)

            if summary.count > 0 {
                VStack(spacing: 3) {
                    ForEach((1...5).reversed(), id: \.self) { stars in
                        HStack(spacing: 6) {
                            Text("\(stars)")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 8)
                            ProgressView(value: Double(summary.count(forStars: stars)), total: Double(max(summary.count, 1)))
                                .tint(.yellow)
                            Text("\(summary.count(forStars: stars))")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 16, alignment: .trailing)
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}
