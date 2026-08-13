import Foundation

enum ReportType: String, Codable, CaseIterable, Identifiable {
    case closed
    case fuel
    case location
    case content
    case other

    var id: String { rawValue }

    /// `content` se nevybírá v seznamu – posílá se z nahlášení komentáře.
    static var selectable: [ReportType] { [.fuel, .closed, .location, .other] }

    var label: String {
        switch self {
        case .closed: "Zavřeno nebo nefunguje"
        case .fuel: "Palivo nesouhlasí"
        case .location: "Špatná adresa nebo poloha"
        case .content: "Nevhodný komentář"
        case .other: "Něco jiného"
        }
    }

    var symbol: String {
        switch self {
        case .closed: "xmark.octagon"
        case .fuel: "fuelpump"
        case .location: "mappin.slash"
        case .content: "flag"
        case .other: "ellipsis.bubble"
        }
    }

    var hint: String {
        switch self {
        case .closed: "Benzínka je zrušená, zavřená nebo nefunkční?"
        case .fuel: "Chybí nějaké palivo, nebo je tu naopak něco navíc?"
        case .location: "Bod na mapě nebo adresa nesedí."
        case .content: "Komentář je vulgární, urážlivý nebo je to reklama."
        case .other: "Popište prosím krátce, co je špatně."
        }
    }
}
