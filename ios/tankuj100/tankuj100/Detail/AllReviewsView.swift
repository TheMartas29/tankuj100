import SwiftUI

struct AllReviewsView: View {
    let reviews: [StationReview]
    let summary: RatingSummary
    let stationTitle: String
    var onReport: ((StationReview) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section { RatingSummaryView(summary: summary) } header: { Text(stationTitle) }
                Section {
                    ForEach(reviews) { review in
                        ReportableReviewRow(review: review) { reported in
                            onReport?(reported)
                        }
                    }
                } footer: {
                    Text("Nevhodný komentář nahlásíte dlouhým stiskem nebo přejetím doleva.")
                }
            }
            .navigationTitle("Hodnocení")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
            }
        }
    }
}
