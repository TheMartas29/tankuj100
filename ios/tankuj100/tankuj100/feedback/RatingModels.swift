import Foundation

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

    var isHidden: Bool { status == "hidden" }
}
