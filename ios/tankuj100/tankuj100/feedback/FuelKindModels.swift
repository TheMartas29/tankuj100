import Foundation
import SwiftUI

/// Z veřejných dat se typ benzínu spolehlivě zjistit nedá (oktanové číslo nic neříká
/// o podílu etanolu), takže ho hlásí řidiči u pumpy a verdikt počítá server.
enum FuelVerdict: String, Codable {
    case e5
    case e10
    case disputed
    case unconfirmed

    // Neznámé hodnoty ze serveru bereme jako „nepotvrzeno“, ať appka nespadne.
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

    func detail(votes: Int) -> String {
        switch self {
        case .e5:
            "Řidiči tady potvrdili benzín s nižším podílem etanolu (E5) – vhodný pro starší vozy."
        case .e10:
            "Podle řidičů se tady čepuje E10. Pro starší vozy nemusí být vhodný."
        case .disputed:
            "Hlášení si odporují. Pomozte nám a napište, co je u pumpy napsané."
        case .unconfirmed:
            votes == 0
                ? "Tuhle benzínku ještě nikdo neověřil. Buďte první!"
                : "Na potvrzení potřebujeme aspoň dva shodné hlasy. Řekněte o appce dalším řidičům."
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

enum FuelKind: String, Codable, CaseIterable, Identifiable {
    case e5
    case e10

    var id: String { rawValue }

    var label: String {
        switch self {
        case .e5: "E5"
        case .e10: "E10"
        }
    }
}

struct FuelSummary: Codable, Hashable {
    let e5: Int
    let e10: Int
    /// Volba „Nevím“ z appky zmizela, staré hlasy ale v datech zůstaly – proto volitelné.
    let unknown: Int?
    let total: Int
    let verdict: FuelVerdict?

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
