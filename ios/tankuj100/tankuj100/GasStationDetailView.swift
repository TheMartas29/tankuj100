//
//  GasStationDetail.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.08.2025.
//

import SwiftUI
import CoreLocation

/// Logo značky z fuelo.net s fallbackem na ikonu, když logo neexistuje.
struct BrandLogo: View {
    let brandName: String?
    var size: CGFloat = 46

    var body: some View {
        AsyncImage(url: fueloLogoURL(brandName: brandName)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFit()
            default:
                Image(systemName: "fuelpump.circle.fill")
                    .resizable().scaledToFit()
                    .foregroundStyle(.accent)
            }
        }
        .frame(width: size, height: size)
    }
}

struct GasStationDetailView: View {

    let gasStation: GasStation
    var userLocation: CLLocation?
    @ObservedObject var favorites: FavoritesStore
    /// Když je nastaveno, zobrazí se křížek pro zavření (režim sheetu). Jinak se spoléhá na nav back.
    var onClose: (() -> Void)? = nil

    @StateObject private var feedback: StationFeedbackViewModel
    @State private var benzinkaDetailResult: Result<GasStationDetail, Error>? = nil
    @State private var currentPricesResult: Result<[FuelPrice], Error>? = nil
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

    /// Kolik komentářů ukážeme přímo v detailu (zbytek přes „Zobrazit všechny“).
    private let inlineReviewLimit = 3

    private var distanceText: String? {
        guard let userLocation else { return nil }
        let stationLoc = CLLocation(latitude: gasStation.lat, longitude: gasStation.lon)
        let meters = userLocation.distance(from: stationLoc)
        if meters < 1000 { return "\(Int(meters)) m" }
        return String(format: "%.1f km", meters / 1000)
    }

    private var prices: [FuelPrice] {
        if case .success(let list)? = currentPricesResult { return list }
        return []
    }

    private var cheapestFuelName: String? {
        prices.min(by: { $0.price < $1.price })?.name
    }

    private var stationTitle: String {
        if case .success(let detail)? = benzinkaDetailResult {
            return [detail.brandName, detail.city].compactMap { $0 }.joined(separator: " – ")
        }
        return gasStation.brandName ?? "Benzínka"
    }

    var body: some View {
        List {
            switch benzinkaDetailResult {
            case .success(let response):
                headerSection(response)
                fuelKindSection
                pricesSection
                ratingSection
                infoSection(response)
                reportSection

            case .failure(let failure):
                // Detail se nenačetl – nabídneme zkusit znovu, ne slepou uličku.
                Section {
                    ContentUnavailableView {
                        Label("Detail se nepodařilo načíst", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(failure.localizedDescription)
                    } actions: {
                        Button("Zkusit znovu") { Task { await loadDetail() } }
                            .buttonStyle(.borderedProminent)
                    }
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
        .task {
            await loadDetail()
        }
        .task {
            await feedback.load()
        }
        .sheet(isPresented: $showReviewSheet) {
            ReviewSheet(viewModel: feedback, stationTitle: stationTitle)
        }
        .sheet(isPresented: $showReportSheet) {
            ReportSheet(viewModel: feedback, stationTitle: stationTitle, fuelNames: prices.map(\.name))
        }
        .sheet(isPresented: $showAllReviews) {
            AllReviewsView(reviews: feedback.reviews, summary: feedback.rating, stationTitle: stationTitle)
        }
        .toolbar {
            if let onClose {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onClose() } label: { Image(systemName: "xmark") }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    favorites.toggle(gasStation.id)
                } label: {
                    Image(systemName: favorites.contains(gasStation.id) ? "heart.fill" : "heart")
                        .foregroundStyle(.accent)
                }
                .accessibilityLabel(favorites.contains(gasStation.id) ? "Odebrat z oblíbených" : "Přidat do oblíbených")
            }
        }
    }

    // MARK: - Sekce

    private func headerSection(_ response: GasStationDetail) -> some View {
        Section {
            HStack(spacing: 14) {
                BrandLogo(brandName: response.brandName)
                VStack(alignment: .leading, spacing: 4) {
                    Text(response.brandName ?? "")
                        .font(.title2).bold()
                    HStack(spacing: 10) {
                        if let distanceText {
                            Label(distanceText, systemImage: "location.fill")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if feedback.rating.count > 0 {
                            HStack(spacing: 4) {
                                StarsView(rating: feedback.rating.average ?? 0, size: 10)
                                Text("\(feedback.rating.averageText)")
                                    .font(.footnote.weight(.medium))
                                    .monospacedDigit()
                            }
                        }
                    }
                }
                Spacer()
            }

            Text("\(response.city), \(response.address), \(response.zip)")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button {
                self.error = GeneralViewModel.shared.openAppleMaps(
                    latitude: response.lat, longitude: response.lon,
                    name: response.brandName ?? "")
            } label: {
                Text("Navigovat")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    private var fuelKindSection: some View {
        Section {
            switch feedback.state {
            case .loading:
                HStack { ProgressView(); Text("Zjišťuji…").foregroundStyle(.secondary) }
            case .failed:
                feedbackUnavailableRow
            case .loaded:
                FuelKindCard(
                    summary: feedback.fuel,
                    myVote: feedback.myFuelKind,
                    isSubmitting: feedback.isSubmitting
                ) { kind in
                    Task { await feedback.vote(kind) }
                }
            }
        } header: {
            Text("Benzín pro starší auta")
        }
    }

    private var pricesSection: some View {
        Section("Ceny paliv") {
            switch currentPricesResult {
            case .success(let pricesResponse):
                if pricesResponse.isEmpty {
                    Text("Tahle benzínka ceny nezveřejňuje.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(pricesResponse) { item in
                        HStack {
                            Text(item.name)
                            if item.name == cheapestFuelName, pricesResponse.count > 1 {
                                Text("nejlevnější")
                                    .font(.caption2).fontWeight(.semibold)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(.green.opacity(0.18))
                                    .foregroundStyle(.green)
                                    .clipShape(Capsule())
                            }
                            Spacer()
                            Text(item.price.formatted(.currency(code: item.currency)))
                                .bold()
                        }
                    }
                }
            case .failure:
                HStack {
                    Text("Ceny se nepodařilo načíst.")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Zkusit znovu") { Task { await loadPrices() } }
                        .font(.footnote)
                }
            case nil:
                HStack { ProgressView(); Text("Načítám ceny…").foregroundStyle(.secondary) }
            }
        }
    }

    private var ratingSection: some View {
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
                    Text("Tuhle benzínku ještě nikdo neohodnotil. Buď první!")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Button {
                    showReviewSheet = true
                } label: {
                    Label(
                        feedback.myReview == nil ? "Ohodnotit benzínku" : "Upravit moje hodnocení",
                        systemImage: feedback.myReview == nil ? "star" : "square.and.pencil"
                    )
                }

                if let mine = feedback.myReview, mine.isHidden {
                    Label("Tvoje hodnocení jsme skryli, protože nesplňovalo pravidla.", systemImage: "eye.slash")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                ForEach(feedback.reviews.prefix(inlineReviewLimit)) { review in
                    ReviewRowView(review: review)
                }

                if feedback.reviews.count > inlineReviewLimit {
                    Button("Zobrazit všech \(feedback.reviews.count) hodnocení") {
                        showAllReviews = true
                    }
                    .font(.subheadline)
                }
            }
        } header: {
            Text("Hodnocení řidičů")
        }
    }

    private func infoSection(_ response: GasStationDetail) -> some View {
        Section("Další informace") {
            if let phone = response.phone, !phone.isEmpty {
                let formatted = formatCzechPhone(phone)
                HStack {
                    Text("Telefon")
                    Spacer()
                    if let telURL = formatted.dialURL {
                        Link(destination: telURL) {
                            Text(formatted.display)
                                .foregroundStyle(.primary)
                                .underline()
                        }
                    } else {
                        Text(formatted.display)
                    }
                }
            }
            if let worktime = response.worktime, !worktime.isEmpty {
                HStack {
                    Text("Pracovní doba")
                    Spacer()
                    Text(worktime).foregroundStyle(.secondary)
                }
            }
            if let services = response.services, !services.isEmpty {
                HStack(alignment: .top) {
                    Text("Služby")
                    Spacer()
                    Text(services).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
                }
            }
            if let payments = response.payments, !payments.isEmpty {
                HStack(alignment: .top) {
                    Text("Možnosti platby")
                    Spacer()
                    Text(payments).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
                }
            }
        }
    }

    private var reportSection: some View {
        Section {
            Button {
                showReportSheet = true
            } label: {
                Label("Nahlásit nesrovnalost", systemImage: "exclamationmark.bubble")
                    .foregroundStyle(.accent)
            }
        } footer: {
            if feedback.openReports > 0 {
                Text("U téhle benzínky už řešíme \(feedback.openReports) hlášení.")
            } else {
                Text("Neodpovídá cena, otevírací doba nebo poloha? Dej nám vědět a opravíme to.")
            }
        }
    }

    /// Feedback (hodnocení, hlasy) se nenačetl – detail benzínky ale funguje dál.
    private var feedbackUnavailableRow: some View {
        HStack {
            Label("Hodnocení teď nejsou dostupná.", systemImage: "wifi.slash")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Znovu") { Task { await feedback.load() } }
                .font(.footnote)
        }
    }

    // MARK: - Načítání

    private func loadDetail() async {
        benzinkaDetailResult = await NetworkClient().gasStationDetail(id: gasStation.id.description)
        await loadPrices()
    }

    private func loadPrices() async {
        currentPricesResult = nil
        currentPricesResult = await NetworkClient().getCurrentPrices(id: gasStation.stationId.description)
    }
}

/// Všechna hodnocení benzínky na vlastní obrazovce.
struct AllReviewsView: View {
    let reviews: [StationReview]
    let summary: RatingSummary
    let stationTitle: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section { RatingSummaryView(summary: summary) } header: { Text(stationTitle) }
                Section {
                    ForEach(reviews) { ReviewRowView(review: $0) }
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

#Preview {
    NavigationStack {
        GasStationDetailView(
            gasStation: .init(id: 20, lat: 50.13, lon: 14.53, brandName: "OMV", brandId: 55, stationId: 5048),
            userLocation: CLLocation(latitude: 50.08, longitude: 14.42),
            favorites: FavoritesStore(),
            onClose: {}
        )
    }
}
