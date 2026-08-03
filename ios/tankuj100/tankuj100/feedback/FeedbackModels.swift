//
//  FeedbackModels.swift
//  tankuj100
//
//  Modely pro hodnocení, komentáře, hlášení nesrovnalostí a hlasování o typu benzínu.
//

import Foundation
import SwiftUI

// MARK: - Typ benzínu (E5 / E10)

/// Co o benzínu na stanici říkají uživatelé.
///
/// Z veřejných dat se typ benzínu spolehlivě zjistit nedá (oktanové číslo nic neříká
/// o podílu etanolu), takže to hlásí lidi u pumpy. Verdikt počítá server.
enum FuelVerdict: String, Codable {
    case e5
    case e10
    case disputed
    case unconfirmed

    /// Neznámé hodnoty ze serveru bereme jako „nepotvrzeno“, ať appka nespadne.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FuelVerdict(rawValue: raw) ?? .unconfirmed
    }

    var title: String {
        switch self {
        case .e5: "Potvrzené E5"
        case .e10: "Hlášené E10"
        case .disputed: "Hlášení se rozcházejí"
        case .unconfirmed: "Zatím nepotvrzeno"
        }
    }

    /// Vysvětlení pod odznakem. U „nepotvrzeno“ záleží na tom, jestli už nějaký hlas máme –
    /// po vlastním hlasu by bylo „ještě nikdo neověřil“ nesmysl.
    func detail(votes: Int) -> String {
        switch self {
        case .e5:
            "Řidiči tady potvrdili benzín s nižším podílem etanolu (E5) – vhodný pro starší vozy."
        case .e10:
            "Podle řidičů se tady čepuje E10. Pro starší vozy nemusí být vhodný."
        case .disputed:
            "Hlášení si odporují. Pomoz nám a napiš, co je u pumpy napsané."
        case .unconfirmed:
            votes == 0
                ? "Tuhle benzínku ještě nikdo neověřil. Buď první!"
                : "Na potvrzení potřebujeme aspoň dva shodné hlasy. Řekni o appce dalším řidičům."
        }
    }

    var symbol: String {
        switch self {
        case .e5: "checkmark.seal.fill"
        case .e10: "exclamationmark.triangle.fill"
        case .disputed: "questionmark.circle.fill"
        case .unconfirmed: "circle.dashed"
        }
    }

    var tint: Color {
        switch self {
        case .e5: .green
        case .e10: .orange
        case .disputed: .orange
        case .unconfirmed: .secondary
        }
    }
}

/// Jak uživatel hlasuje o typu benzínu.
enum FuelKind: String, Codable, CaseIterable, Identifiable {
    case e5
    case e10
    case unknown

    var id: String { rawValue }

    var label: String {
        switch self {
        case .e5: "E5"
        case .e10: "E10"
        case .unknown: "Nevím"
        }
    }
}

// MARK: - Hodnocení

struct RatingSummary: Codable, Hashable {
    let count: Int
    let average: Double?
    /// Klíče "1"…"5" → počet hodnocení.
    let distribution: [String: Int]

    static let empty = RatingSummary(count: 0, average: nil, distribution: [:])

    func count(forStars stars: Int) -> Int { distribution["\(stars)"] ?? 0 }

    var averageText: String {
        guard let average else { return "–" }
        return String(format: "%.1f", average)
    }

    /// „12 hodnocení“ ve správném tvaru (1 hodnocení / 2–4 hodnocení / 5+ hodnocení).
    var countText: String {
        switch count {
        case 0: "Žádné hodnocení"
        case 1: "1 hodnocení"
        case 2...4: "\(count) hodnocení"
        default: "\(count) hodnocení"
        }
    }
}

struct StationReview: Codable, Identifiable, Hashable {
    let id: Int
    let rating: Int
    let comment: String?
    let author: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, rating, comment, author
        case createdAt = "created_at"
    }

    var authorText: String { (author?.isEmpty == false ? author : nil) ?? "Anonym" }

    /// Datum ve tvaru „3. 8. 2026“; když se nepodaří rozparsovat, vrátí prázdno.
    var dateText: String {
        guard let date = ServerDate.parse(createdAt) else { return "" }
        return date.formatted(.dateTime.day().month().year())
    }
}

struct MyReview: Codable, Hashable {
    let id: Int
    let rating: Int
    let comment: String?
    let author: String?
    let status: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, rating, comment, author, status
        case createdAt = "created_at"
    }

    /// Skryté hodnocení (moderované adminem) – uživateli to řekneme na rovinu.
    var isHidden: Bool { status == "hidden" }
}

struct FuelSummary: Codable, Hashable {
    let e5: Int
    let e10: Int
    let unknown: Int
    let total: Int
    let verdict: FuelVerdict

    static let empty = FuelSummary(e5: 0, e10: 0, unknown: 0, total: 0, verdict: .unconfirmed)

    var votesText: String {
        switch total {
        case 0: "Zatím bez hlasů"
        case 1: "1 hlas řidiče"
        case 2...4: "\(total) hlasy řidičů"
        default: "\(total) hlasů řidičů"
        }
    }
}

struct MyFeedback: Codable, Hashable {
    let review: MyReview?
    let fuelKind: FuelKind?

    enum CodingKeys: String, CodingKey {
        case review
        case fuelKind = "fuel_kind"
    }
}

/// Vše, co detail benzínky potřebuje k feedbacku – server to posílá v jednom requestu.
struct StationFeedback: Codable, Hashable {
    let stationId: Int
    let rating: RatingSummary
    let reviews: [StationReview]
    let fuel: FuelSummary
    let openReports: Int
    let mine: MyFeedback?

    enum CodingKeys: String, CodingKey {
        case stationId = "station_id"
        case rating, reviews, fuel, mine
        case openReports = "open_reports"
    }
}

// MARK: - Hlášení nesrovnalosti

enum ReportType: String, Codable, CaseIterable, Identifiable {
    case price
    case closed
    case fuel
    case location
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .price: "Špatná cena"
        case .closed: "Zavřeno nebo nefunguje"
        case .fuel: "Palivo nesouhlasí"
        case .location: "Špatná adresa nebo poloha"
        case .other: "Něco jiného"
        }
    }

    var symbol: String {
        switch self {
        case .price: "tag"
        case .closed: "xmark.octagon"
        case .fuel: "fuelpump"
        case .location: "mappin.slash"
        case .other: "ellipsis.bubble"
        }
    }

    var hint: String {
        switch self {
        case .price: "Napiš, jaká cena je opravdu na totemu."
        case .closed: "Benzínka je zrušená, zavřená nebo nefunkční?"
        case .fuel: "Chybí nějaké palivo, nebo je tu naopak něco navíc?"
        case .location: "Bod na mapě nebo adresa nesedí."
        case .other: "Popiš prosím krátce, co je špatně."
        }
    }
}

// MARK: - Odpovědi serveru

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
    let fuel: FuelSummary
}

// MARK: - Pomůcky

enum ServerDate {
    /// Server posílá čas s milisekundami (`2026-08-03T15:53:27.564Z`), ale nespoléháme
    /// se na to – zkusíme i variantu bez nich.
    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain = ISO8601DateFormatter()

    static func parse(_ string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }
}
