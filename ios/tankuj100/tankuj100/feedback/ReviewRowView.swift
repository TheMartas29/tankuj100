import SwiftUI

struct ReviewRowView: View {
    let review: StationReview

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                StarsView(rating: Double(review.rating), size: 11)
                Text(review.authorText)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text(review.dateText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if let comment = review.comment, !comment.isEmpty {
                Text(comment)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Možnost nahlásit cizí obsah je u veřejných komentářů podmínkou App Storu.
struct ReportableReviewRow: View {
    let review: StationReview
    let onReport: (StationReview) -> Void

    @State private var showConfirm = false

    var body: some View {
        ReviewRowView(review: review)
            .contextMenu {
                Button(role: .destructive) {
                    showConfirm = true
                } label: {
                    Label("Nahlásit komentář", systemImage: "flag")
                }
            }
            .swipeActions(edge: .trailing) {
                Button {
                    showConfirm = true
                } label: {
                    Label("Nahlásit", systemImage: "flag")
                }
                .tint(.orange)
            }
            .confirmationDialog(
                "Nahlásit tenhle komentář?",
                isPresented: $showConfirm,
                titleVisibility: .visible
            ) {
                Button("Nahlásit", role: .destructive) { onReport(review) }
                Button("Zrušit", role: .cancel) {}
            } message: {
                Text("Zkontrolujeme ho, a pokud je vulgární, urážlivý nebo je to reklama, smažeme ho.")
            }
    }
}
