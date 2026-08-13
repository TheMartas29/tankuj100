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

    /// `total` může obsahovat i staré hlasy „Nevím“, na typ benzínu vypovídají jen E5 a E10.
    var decisiveVotes: Int { e5 + e10 }

    /// `nil` = nikdo nehlasoval, není co ukazovat.
    var report: FuelReport? {
        switch verdict ?? localVerdict {
        case .e5:
            return .agreed(kind: .e5, matching: e5, total: decisiveVotes)
        case .e10:
            return .agreed(kind: .e10, matching: e10, total: decisiveVotes)
        case .disputed:
            return .disputed(e5: e5, e10: e10)
        case .unconfirmed:
            switch decisiveVotes {
            case 0: return nil
            case 1: return .single(e5 == 1 ? .e5 : .e10)
            default: return .disputed(e5: e5, e10: e10)
            }
        }
    }

    /// Záloha pro případ, že by server verdikt vynechal – stejné pravidlo jako `be/src/fuel-verdict.js`.
    private var localVerdict: FuelVerdict {
        guard decisiveVotes >= 2 else { return .unconfirmed }
        let e5Ratio = Double(e5) / Double(decisiveVotes)
        if e5Ratio >= 0.6 { return .e5 }
        if e5Ratio <= 0.4 { return .e10 }
        return .disputed
    }
}

/// Co o benzínce hlásili ostatní. Formulace musí odpovídat síle důkazu – jeden hlas
/// není ověřený údaj a nesmí tak vypadat.
enum FuelReport: Equatable {
    case single(FuelKind)
    case agreed(kind: FuelKind, matching: Int, total: Int)
    case disputed(e5: Int, e10: Int)

    var title: String {
        switch self {
        case .single(let kind):
            "Jeden řidič tu viděl \(kind.label)"
        // „hlásí“ místo „vidělo“ schválně – je to tvar, který sedí na jednotné i množné číslo.
        case .agreed(let kind, let matching, let total):
            "\(matching) ze \(total) řidičů tu hlásí \(kind.label)"
        case .disputed:
            "Odpovědi se rozcházejí"
        }
    }

    var detail: String {
        switch self {
        case .single:
            "Zatím je to jediná odpověď, ne ověřený údaj. U pumpy se prosím podívejte, jestli to sedí."
        case .agreed(let kind, _, _):
            kind == .e5
                ? "Vypadá to na benzín, který starším motorům svědčí víc. Pořád jde ale o hlášení řidičů, ne o údaj od provozovatele."
                : "Pro starší motory to nemusí být to pravé. Jde o hlášení řidičů, ne o údaj od provozovatele."
        case .disputed(let e5, let e10):
            "E5 hlásí \(driversText(e5)), E10 \(driversText(e10)). Podívejte se u pumpy na stojan a přidejte svůj hlas."
        }
    }

    var symbol: String {
        switch self {
        case .single: "person.fill.questionmark"
        case .agreed(let kind, _, _): kind == .e5 ? "checkmark.seal.fill" : "info.circle.fill"
        case .disputed: "exclamationmark.triangle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .single: .secondary
        case .agreed(let kind, _, _): kind == .e5 ? .green : .secondary
        case .disputed: .orange
        }
    }
}

private func driversText(_ count: Int) -> String {
    switch count {
    case 1: "1 řidič"
    case 2...4: "\(count) řidiči"
    default: "\(count) řidičů"
    }
}
