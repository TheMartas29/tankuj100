import CoreLocation
import SwiftUI

struct GasStationDetailView: View {

    let gasStation: GasStation
    var userLocation: CLLocation?
    @ObservedObject var favorites: FavoritesStore
    var onClose: (() -> Void)? = nil

    @StateObject private var feedback: StationFeedbackViewModel
    @State private var detailResult: Result<GasStationDetail, Error>?
    @State private var error: CustomError?
    @State private var showReviewSheet = false
    @State private var showReportSheet = false
    @State private var showAllReviews = false

    init(
        gasStation: GasStation,
        userLocation: CLLocation? = nil,
        favorites: FavoritesStore,
        onClose: (() -> Void)? = nil
    ) {
        self.gasStation = gasStation
        self.userLocation = userLocation
        self.favorites = favorites
        self.onClose = onClose
        _feedback = StateObject(wrappedValue: StationFeedbackViewModel(stationId: gasStation.id))
    }

    /// Stejný výpočet jako v seznamu benzínek – jinak by u jedné pumpy svítilo
    /// na dvou obrazovkách o desetinu jiné číslo.
    private var distanceText: String? {
        GeoDistance.meters(from: userLocation, to: gasStation.coordinate)
            .map(DistanceFormatter.text(for:))
    }

    private var detail: GasStationDetail? {
        if case .success(let value)? = detailResult { return value }
        return nil
    }

    private var fuelNames: [String] {
        FuelCatalog.sorted(detail?.fuels ?? []).map(FuelCatalog.label(for:))
    }

    private var stationTitle: String {
        if let detail {
            let parts = [detail.brandName, detail.city].compactMap { $0 }.filter { !$0.isEmpty }
            if !parts.isEmpty { return parts.joined(separator: " – ") }
        }
        return gasStation.brandName ?? "Benzínka"
    }

    var body: some View {
        List {
            switch detailResult {
            case .success(let response):
                StationHeaderSection(
                    detail: response,
                    distanceText: distanceText,
                    rating: feedback.rating,
                    error: $error
                )
                StationFuelsSection(detail: response)
                StationFuelKindSection(feedback: feedback)
                StationRatingSection(
                    feedback: feedback,
                    onWriteReview: { showReviewSheet = true },
                    onShowAllReviews: { showAllReviews = true }
                )
                StationInfoSection(detail: response)
                StationServicesSection(detail: response)
                StationReportSection(
                    openReports: feedback.openReports,
                    onReport: { showReportSheet = true }
                )

            case .failure(let failure):
                Section {
                    EmptyStateView(title: "Detail se nepodařilo načíst",
                                   systemImage: "wifi.exclamationmark",
                                   message: failure.localizedDescription) {
                        Button("Zkusit znovu") { Task { await loadDetail() } }
                            .buttonStyle(.borderedProminent)
                    }
                    .padding(.vertical, 12)
                }

            case nil:
                Section {
                    HStack { ProgressView(); Text("Načítám…").foregroundStyle(.secondary) }
                }
            }
        }
        // Titulek v baru dá navigation baru pozadí – bez něj obsah při scrollování
        // prosvítá pod plovoucími tlačítky.
        .navigationTitle(gasStation.brandName ?? "Benzínka")
        .navigationBarTitleDisplayMode(.inline)
        .errorAlert($error)
        .successToast($feedback.successMessage)
        // Klíčované na stanici: kdyby SwiftUI view recykloval pro jinou benzínku,
        // data se načtou znovu místo toho, aby zůstala ta předchozí.
        .task(id: gasStation.id) {
            await loadDetail()
        }
        .task(id: gasStation.id) {
            await feedback.load()
        }
        .sheet(isPresented: $showReviewSheet) {
            ReviewSheet(viewModel: feedback, stationTitle: stationTitle)
        }
        .sheet(isPresented: $showReportSheet) {
            ReportSheet(viewModel: feedback, stationTitle: stationTitle, fuelNames: fuelNames)
        }
        .sheet(isPresented: $showAllReviews) {
            AllReviewsView(
                reviews: feedback.reviews,
                summary: feedback.rating,
                stationTitle: stationTitle,
                onReport: { reported in Task { await feedback.reportReview(reported) } }
            )
        }
        .toolbar {
            // Podmínka musí být uvnitř položky – `ToolbarContentBuilder` uměl `if`
            // až od iOS 16. Prázdná položka se nevykreslí.
            ToolbarItem(placement: .topBarLeading) {
                if let onClose {
                    Button { onClose() } label: { Image(systemName: "xmark") }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    favorites.toggle(gasStation.id)
                } label: {
                    Image(systemName: favorites.contains(gasStation.id) ? "heart.fill" : "heart")
                        .foregroundColor(.accentColor)
                }
                .accessibilityLabel(favorites.contains(gasStation.id) ? "Odebrat z oblíbených" : "Přidat do oblíbených")
            }
        }
    }

    private func loadDetail() async {
        detailResult = await APIClient.shared.stationDetail(id: gasStation.id)
    }
}

#Preview {
    NavStack {
        GasStationDetailView(
            gasStation: .init(id: 20, lat: 50.13, lon: 14.53, brandName: "OMV", brandId: 55, has98: true, has100: true),
            userLocation: CLLocation(latitude: 50.08, longitude: 14.42),
            favorites: FavoritesStore(),
            onClose: {}
        )
    }
}
