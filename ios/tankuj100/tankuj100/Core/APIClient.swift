import Foundation

/// Chyba z API i s kódem, který k ní poslal server (`{"error":"duplicate_station",…}`).
///
/// `CustomError` nese jen text, takže se z něj nedá poznat, o jakou chybu šlo.
/// U žádosti o benzínku to potřebujeme: duplicitu má formulář vysvětlit sám,
/// ne ji schovat do obecného alertu.
struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String?
    let message: String

    var errorDescription: String? { message }

    /// Do 150 m už stanice nebo nevyřízená žádost existuje (viz kontrakt, `409`).
    var isDuplicateStation: Bool { code == "duplicate_station" }
}

struct APIClient {

    static let shared = APIClient()

    static let productionURL = AppEnvironment.production.baseURL

    /// V ladicím buildu jde server přepnout spouštěcím argumentem
    /// `-apiBaseURL http://localhost:3000`. Jinak rozhoduje zvolené prostředí,
    /// které je bez zadaného kódu vždy produkce.
    private var baseURL: String {
        #if DEBUG
        if let override = UserDefaults.standard.string(forKey: "apiBaseURL"), !override.isEmpty {
            return override
        }
        #endif
        return AppEnvironment.current.baseURL
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

    /// Odeslání žádosti o přidání benzínky. Server ji jen uloží – stanice vzniká
    /// až schválením v administraci.
    func submitStationRequest(
        lat: Double,
        lon: Double,
        brandName: String?,
        name: String?,
        city: String?,
        address: String?,
        fuels: [FuelFlag],
        note: String?
    ) async -> Result<StationRequestResponse, APIError> {
        var body: [String: Any] = [
            "device_id": DeviceIdentity.current,
            "lat": lat,
            "lon": lon,
            "fuels": fuels.map(\.apiKey),
        ]
        // Prázdné texty se neposílají vůbec – server si je uloží jako NULL a nemusí
        // rozlišovat mezi „nevyplněno“ a „vyplněno prázdnem“.
        let optionalFields: [(String, String?)] = [
            ("brand_name", brandName), ("name", name), ("city", city),
            ("address", address), ("note", note),
        ]
        for (key, value) in optionalFields {
            if let value, !value.isEmpty { body[key] = value }
        }

        return await sendChecked(
            path: "/api/station-requests",
            method: "POST",
            body: body,
            as: StationRequestResponse.self
        )
    }

    func myStationRequests() async -> Result<[StationRequest], APIError> {
        await sendChecked(
            path: "/api/station-requests?device_id=\(DeviceIdentity.current)",
            as: [StationRequest].self
        )
    }

    func send<T: Decodable>(
        path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        as type: T.Type
    ) async -> Result<T, Error> {
        switch await sendChecked(path: path, method: method, body: body, as: type) {
        case .success(let value):
            return .success(value)
        case .failure(let failure):
            return .failure(CustomError.defaultError(message: failure.message))
        }
    }

    /// Jako `send`, ale nechá projít i kód chyby ze serveru. Formulář žádosti podle
    /// něj pozná duplicitu (`duplicate_station`) a umí ji vysvětlit místo obecného
    /// „něco se nepovedlo“.
    private func sendChecked<T: Decodable>(
        path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        as type: T.Type
    ) async -> Result<T, APIError> {
        switch await perform(path: path, method: method, body: body) {
        case .success(let data):
            do {
                return .success(try JSONDecoder().decode(T.self, from: data))
            } catch {
                #if DEBUG
                print("[APIClient] dekódování \(T.self) selhalo: \(error)")
                #endif
                return .failure(APIError(
                    status: 0, code: "decode_error",
                    message: "Odpověď serveru se nepodařilo zpracovat."))
            }
        case .failure(let failure):
            return .failure(failure)
        }
    }

    private func perform(
        path: String,
        method: String,
        body: [String: Any]?
    ) async -> Result<Data, APIError> {
        guard let url = URL(string: baseURL + path) else {
            return .failure(APIError(status: 0, code: "invalid_url",
                                     message: "Neplatná adresa serveru."))
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue(AppEnvironment.current.appKey, forHTTPHeaderField: "X-App-Key")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: body)
            } catch {
                return .failure(APIError(status: 0, code: "encode_error",
                                         message: "Data se nepodařilo připravit k odeslání."))
            }
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                return .failure(APIError(status: 0, code: nil,
                                         message: "Server odpověděl neočekávaně."))
            }
            guard (200...299).contains(http.statusCode) else {
                let payload = try? JSONDecoder().decode(ServerErrorPayload.self, from: data)
                return .failure(APIError(
                    status: http.statusCode,
                    code: payload?.error,
                    message: Self.serverMessage(from: data, status: http.statusCode)))
            }
            return .success(data)
        } catch {
            return .failure(APIError(status: 0, code: nil,
                                     message: Self.networkMessage(for: error)))
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
