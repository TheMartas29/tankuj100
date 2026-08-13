import Foundation

struct StationFeedback: Codable, Hashable {
    let stationId: Int
    let rating: RatingSummary
    let reviews: [StationReview]
    /// Nepovinný schválně – kdyby ho server přestal posílat, nesmí to shodit hodnocení.
    let fuel: FuelSummary?
    let openReports: Int
    let mine: MyFeedback?

    enum CodingKeys: String, CodingKey {
        case stationId = "station_id"
        case rating, reviews, fuel, mine
        case openReports = "open_reports"
    }
}

struct MyFeedback: Codable, Hashable {
    let review: MyReview?
    let fuelKind: FuelKind?

    enum CodingKeys: String, CodingKey {
        case review
        case fuelKind = "fuel_kind"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        review = try container.decodeIfPresent(MyReview.self, forKey: .review)
        // Dřív šlo hlasovat i „Nevím“ – takový hlas už appka neumí zobrazit, tak
        // se tváříme, že uživatel nehlasoval. Lepší než rozbité dekódování feedbacku.
        fuelKind = (try? container.decodeIfPresent(FuelKind.self, forKey: .fuelKind)) ?? nil
    }
}

struct ReviewSubmitResponse: Codable {
    let ok: Bool
    let message: String?
    let rating: RatingSummary
}

struct ReportSubmitResponse: Codable {
    let ok: Bool
    let message: String?
    let reportId: Int?

    enum CodingKeys: String, CodingKey {
        case ok, message
        case reportId = "report_id"
    }
}

struct FuelVoteResponse: Codable {
    let ok: Bool
    let message: String?
    let fuel: FuelSummary?
}
