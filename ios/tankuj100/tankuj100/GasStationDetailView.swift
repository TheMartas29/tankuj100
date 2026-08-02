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

    @State private var benzinkaDetailResult: Result<GasStationDetail, Error>? = nil
    @State private var currentPricesResult: Result<[FuelPrice], Error>? = nil
    @State private var error: CustomError?

    private var distanceText: String? {
        guard let userLocation else { return nil }
        let stationLoc = CLLocation(latitude: gasStation.lat, longitude: gasStation.lon)
        let meters = userLocation.distance(from: stationLoc)
        if meters < 1000 { return "\(Int(meters)) m" }
        return String(format: "%.1f km", meters / 1000)
    }

    private var cheapestFuelName: String? {
        guard case .success(let prices)? = currentPricesResult else { return nil }
        return prices.min(by: { $0.price < $1.price })?.name
    }

    var body: some View {
        List {
            switch benzinkaDetailResult {
            case .success(let response):
                Section {
                    HStack(spacing: 14) {
                        BrandLogo(brandName: response.brandName)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(response.brandName ?? "")
                                .font(.title2).bold()
                            if let distanceText {
                                Label(distanceText, systemImage: "location.fill")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
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
                        Label("Navigovat", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                }

                Section("Ceny paliv") {
                    switch currentPricesResult {
                    case .success(let pricesResponse):
                        ForEach(pricesResponse) { item in
                            HStack {
                                Text(item.name)
                                if item.name == cheapestFuelName {
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
                    case .failure:
                        Text("Ceny se nepodařilo načíst.")
                            .foregroundStyle(.secondary)
                    case nil:
                        HStack { ProgressView(); Text("Načítám ceny…").foregroundStyle(.secondary) }
                    }
                }

                Section("Další informace") {
                    if let phone = response.phone, !phone.isEmpty {
                        HStack {
                            Text("Telefon")
                            Spacer()
                            if let telURL = URL(string: "tel://\(phone.filter { !$0.isWhitespace })") {
                                Link(phone, destination: telURL).foregroundStyle(.accent)
                            } else {
                                Text(phone)
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

            case .failure(let failure):
                Text(failure.localizedDescription)
            case nil:
                HStack { ProgressView(); Text("Načítám…").foregroundStyle(.secondary) }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .errorAlert($error)
        .onAppear {
            Task {
                self.benzinkaDetailResult = await NetworkClient().gasStationDetail(id: gasStation.id.description)
                self.currentPricesResult = await NetworkClient().getCurrentPrices(id: gasStation.stationId.description)
            }
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
