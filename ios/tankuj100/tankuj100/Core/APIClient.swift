import Foundation

struct APIClient {

    static let shared = APIClient()

    static let productionURL = "https://tankuj100.silkroadbrand.eu"

    /// V ladicím buildu jde server přepnout spouštěcím argumentem
    /// `-apiBaseURL http://localhost:3000`. Produkční build vždy míří na ostrý server,
    /// takže se nemůže stát, že by se do App Store dostala testovací adresa.
    private var baseURL: String {
        #if DEBUG
        if let override = UserDefaults.standard.string(forKey: "apiBaseURL"), !override.isEmpty {
            return override
        }
        #endif
        return Self.productionURL
    }

    func stations() async -> Result<[GasStation], Error> {
        await send(path: "/api/map/", as: [GasStation].self)
    }

    func stationDetail(id: Int) async -> Result<GasStationDetail, Error> {
        await send(path: "/api/detail/\(id)", as: GasStationDetail.self)
    }

    func stationFeedback(stationId: Int) async -> Result<StationFeedback, Error> {
        await send(
            path: "/api/stations/\(stationId)/feedback?device_id=\(DeviceIdentity.current)",
            as: StationFeedback.self
        )
    }

    func submitReview(
        stationId: Int,
        rating: Int,
        comment: String?,
        author: String?
    ) async -> Result<ReviewSubmitResponse, Error> {
        await send(
            path: "/api/stations/\(stationId)/reviews",
            method: "POST",
            body: [
                "device_id": DeviceIdentity.current,
                "rating": rating,
                "comment": comment ?? "",
                "author": author ?? "",
            ],
            as: ReviewSubmitResponse.self
        )
    }

    func deleteMyReview(stationId: Int) async -> Result<ReviewSubmitResponse, Error> {
        await send(
            path: "/api/stations/\(stationId)/reviews",
            method: "DELETE",
            body: ["device_id": DeviceIdentity.current],
            as: ReviewSubmitResponse.self
        )
    }

    func submitReport(
        stationId: Int,
        type: ReportType,
        fuelName: String?,
        note: String?,
        reviewId: Int? = nil
    ) async -> Result<ReportSubmitResponse, Error> {
        var body: [String: Any] = [
            "device_id": DeviceIdentity.current,
            "type": type.rawValue,
            "note": note ?? "",
        ]
        if let fuelName, !fuelName.isEmpty { body["fuel_name"] = fuelName }
        if let reviewId { body["review_id"] = reviewId }

        return await send(
            path: "/api/stations/\(stationId)/reports",
            method: "POST",
            body: body,
            as: ReportSubmitResponse.self
        )
    }

    func submitFuelVote(stationId: Int, kind: FuelKind) async -> Result<FuelVoteResponse, Error> {
        await send(
            path: "/api/stations/\(stationId)/fuel-vote",
            method: "POST",
            body: ["device_id": DeviceIdentity.current, "fuel_kind": kind.rawValue],
            as: FuelVoteResponse.self
        )
    }

    func send<T: Decodable>(
        path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        as type: T.Type
    ) async -> Result<T, Error> {
        guard let url = URL(string: baseURL + path) else {
            return .failure(CustomError.defaultError(message: "Neplatná adresa serveru."))
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: body)
            } catch {
                return .failure(CustomError.defaultError(message: "Data se nepodařilo připravit k odeslání."))
            }
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(CustomError.defaultError(message: "Server odpověděl neočekávaně."))
            }
            guard (200...299).contains(http.statusCode) else {
                return .failure(CustomError.defaultError(
                    message: Self.serverMessage(from: data, status: http.statusCode)))
            }
            do {
                return .success(try JSONDecoder().decode(T.self, from: data))
            } catch {
                #if DEBUG
                print("[APIClient] dekódování \(T.self) selhalo: \(error)")
                #endif
                return .failure(CustomError.defaultError(message: "Odpověď serveru se nepodařilo zpracovat."))
            }
        } catch {
            return .failure(CustomError.defaultError(message: Self.networkMessage(for: error)))
        }
    }

    private struct ServerErrorPayload: Decodable {
        let error: String?
        let message: String?
    }

    static func serverMessage(from data: Data, status: Int) -> String {
        if let payload = try? JSONDecoder().decode(ServerErrorPayload.self, from: data),
           let message = payload.message, !message.isEmpty {
            return message
        }
        switch status {
        case 404: return "Tuhle benzínku jsme na serveru nenašli."
        case 429: return "Zkoušíte to příliš často. Dejte tomu chvilku a zkuste to znovu."
        case 500...599: return "Na serveru se něco pokazilo. Zkuste to prosím za chvíli."
        default: return "Požadavek se nepodařilo dokončit (\(status))."
        }
    }

    static func networkMessage(for error: Error) -> String {
        guard let urlError = error as? URLError else {
            return "Nepodařilo se spojit se serverem. Zkuste to prosím znovu."
        }
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
            return "Nejste online. Zkontrolujte připojení a zkuste to znovu."
        case .timedOut:
            return "Server neodpovídá. Zkuste to prosím znovu."
        case .cancelled:
            return "Požadavek byl zrušen."
        default:
            return "Nepodařilo se spojit se serverem. Zkuste to prosím znovu."
        }
    }
}
