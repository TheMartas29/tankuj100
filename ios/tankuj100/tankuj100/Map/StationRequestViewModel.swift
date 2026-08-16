import CoreLocation
import Foundation
import SwiftUI

@MainActor
final class StationRequestViewModel: ObservableObject {

    enum ListState: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var listState: ListState = .loading
    @Published private(set) var requests: [StationRequest] = []
    @Published private(set) var isSubmitting = false
    @Published var successMessage: String?
    @Published var error: CustomError?
    /// Duplicita není chyba uživatele, je to odpověď „tuhle už máme“. Proto má
    /// vlastní hlášku a nemíchá se do obecného alertu s chybami.
    @Published var duplicateMessage: String?

    private let client = APIClient.shared
    private let geocoder = CLGeocoder()

    func load() async {
        if requests.isEmpty { listState = .loading }
        switch await client.myStationRequests() {
        case .success(let loaded):
            requests = loaded
            listState = .loaded
        case .failure(let failure):
            // Co už na obrazovce je, tam necháme – chybu má smysl ukazovat jen tehdy,
            // když není co zobrazit.
            listState = requests.isEmpty ? .failed(failure.message) : .loaded
        }
    }

    /// Vrací true při úspěchu, ať si obrazovka pozná, že má přepnout na žádosti.
    func submit(
        point: MapPoint,
        brandName: String,
        name: String,
        city: String,
        address: String,
        fuels: [FuelFlag],
        note: String
    ) async -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        defer { isSubmitting = false }

        let result = await client.submitStationRequest(
            lat: point.lat,
            lon: point.lon,
            brandName: Self.trimmed(brandName),
            name: Self.trimmed(name),
            city: Self.trimmed(city),
            address: Self.trimmed(address),
            fuels: fuels,
            note: Self.trimmed(note)
        )

        switch result {
        case .success(let response):
            await load()
            successMessage = response.message ?? "Díky! Žádost jsme přijali."
            return true
        case .failure(let failure):
            if failure.isDuplicateStation {
                duplicateMessage = failure.message
            } else {
                error = .defaultError(message: failure.message)
            }
            return false
        }
    }

    /// Obec a ulice podle špendlíku. Uživatel je nemusí vyplňovat ručně a hlavně
    /// je nemusí opisovat z mapy – stačí, když souhlasí s tím, co se doplní.
    func lookUpAddress(at point: MapPoint) async -> (city: String?, street: String?) {
        // Čeština natvrdo, ne podle jazyka telefonu: adresa jde do databáze českých
        // benzínek a admin ji schvaluje. Bez toho by z anglicky nastaveného iPhonu
        // přišlo „Prague 7“ a v datech by se mísily dva jazyky.
        //
        // Bez sítě geokodér prostě nic nevrátí a formulář se vyplní ručně – proto
        // `try?` a žádný alert. Posunutí špendlíku ale musí rozdělaný dotaz opravdu
        // zrušit: jeden `CLGeocoder` obslouží jen jeden dotaz naráz, takže by dotaz
        // visící na mrtvé lince zablokoval i všechna další hledání.
        let geocoder = self.geocoder
        let placemarks = try? await withTaskCancellationHandler {
            try await geocoder.reverseGeocodeLocation(point.location,
                                                      preferredLocale: Locale(identifier: "cs_CZ"))
        } onCancel: {
            geocoder.cancelGeocode()
        }
        guard let placemark = placemarks?.first else {
            return (nil, nil)
        }
        let city = placemark.locality ?? placemark.subAdministrativeArea
        let street = [placemark.thoroughfare, placemark.subThoroughfare]
            .compactMap { $0 }
            .joined(separator: " ")
        return (city, street.isEmpty ? nil : street)
    }

    private static func trimmed(_ text: String) -> String? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
