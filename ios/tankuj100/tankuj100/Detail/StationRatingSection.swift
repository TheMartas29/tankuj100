import SwiftUI

struct StationRatingSection: View {
    @ObservedObject var feedback: StationFeedbackViewModel
    let onWriteReview: () -> Void
    let onShowAllReviews: () -> Void

    private let inlineReviewLimit = 3

    var body: some View {
        Section {
            switch feedback.state {
            case .loading:
                HStack { ProgressView(); Text("Načítám hodnocení…").foregroundStyle(.secondary) }

            case .failed(let message):
                VStack(alignment: .leading, spacing: 8) {
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("Zkusit znovu") { Task { await feedback.load() } }
                        .font(.subheadline)
                }

            case .loaded:
                if feedback.rating.count > 0 {
                    RatingSummaryView(summary: feedback.rating)
                } else {
                    Text("Tuhle benzínku ještě nikdo neohodnotil. Buďte první!")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Button(action: onWriteReview) {
                    Label(
                        feedback.myReview == nil ? "Ohodnotit benzínku" : "Upravit moje hodnocení",
                        systemImage: feedback.myReview == nil ? "star" : "square.and.pencil"
                    )
                }

                if let mine = feedback.myReview, mine.isHidden {
                    Label("Vaše hodnocení jsme skryli, protože nesplňovalo pravidla.", systemImage: "eye.slash")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                ForEach(feedback.reviews.prefix(inlineReviewLimit)) { review in
                    ReportableReviewRow(review: review) { reported in
                        Task { await feedback.reportReview(reported) }
                    }
                }

                if feedback.reviews.count > inlineReviewLimit {
                    // Vyhýbáme se skloňování („všech 4 hodnocení“ by bylo špatně).
                    Button("Zobrazit všechna hodnocení (\(feedback.reviews.count))", action: onShowAllReviews)
                        .font(.subheadline)
                }
            }
        } header: {
            Text("Hodnocení řidičů")
        }
    }
}
