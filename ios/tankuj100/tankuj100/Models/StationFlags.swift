import Foundation

/// Bitové masky paliv a služeb, které chodí v `/api/map/` jako pole `f` a `s`.
///
/// **Přesná kopie `be/src/fuel-flags.js`.** Když se na serveru přidá bit, musí přibýt
/// i tady. Pozice se nikdy nemění a nepoužité se nerecyklují – jinak by starší build
/// aplikace filtroval podle něčeho úplně jiného, než co server posílá.
///
/// Proč masky: filtrování běží celé v telefonu a musí zvládnout i stotisíc stanic.
/// Jedno `&` je řádově levnější než procházet u každé stanice pole textů.
enum FuelFlag: UInt32, CaseIterable, Identifiable {
    case octane100 = 0
    case octane98 = 1
    case octane95 = 2
    case diesel = 3
    case lpg = 4
    case cng = 5
    case adblue = 6
    case e85 = 7

    var id: UInt32 { rawValue }
    var bit: UInt32 { 1 << rawValue }

    var label: String {
        switch self {
        case .octane100: "100 oktanů"
        case .octane98: "98 oktanů"
        case .octane95: "Natural 95"
        case .diesel: "Nafta"
        case .lpg: "LPG"
        case .cng: "CNG"
        case .adblue: "AdBlue"
        case .e85: "E85"
        }
    }

    /// Pořadí ve filtru: prémiový benzín je důvod, proč aplikace existuje, tak je nahoře.
    static let filterOrder: [FuelFlag] = [.octane100, .octane98, .octane95, .diesel, .lpg, .cng, .adblue, .e85]
}

enum ServiceFlag: UInt32, CaseIterable, Identifiable {
    case shop = 0
    case carWash = 1
    case toilets = 2
    // Trojka je volná po zahozeném příznaku pro občerstvení – v datech pro něj není
    // jediný tag. Až budou, obsadí ji a nonstop si nechá svou pozici.
    case nonstop = 4

    var id: UInt32 { rawValue }
    var bit: UInt32 { 1 << rawValue }

    var label: String {
        switch self {
        case .shop: "Obchod"
        case .carWash: "Myčka"
        case .toilets: "Toalety"
        case .nonstop: "Nonstop"
        }
    }

    var symbol: String {
        switch self {
        case .shop: "cart"
        case .carWash: "car"
        case .toilets: SymbolName.toiletsBadge
        case .nonstop: "clock"
        }
    }

    static let filterOrder: [ServiceFlag] = [.nonstop, .shop, .carWash, .toilets]
}

extension UInt32 {
    func contains(_ flag: FuelFlag) -> Bool { self & flag.bit != 0 }
    func contains(_ flag: ServiceFlag) -> Bool { self & flag.bit != 0 }
}
