import Foundation

enum FuelCatalog {

    private static let names: [String: String] = [
        "octane_100": "Natural 100",
        "octane_98": "Natural 98",
        "octane_95": "Natural 95",
        "octane_91": "Natural 91",
        "diesel": "Nafta",
        "lpg": "LPG",
        "cng": "CNG",
        "adblue": "AdBlue",
        "e85": "E85",
        "biodiesel": "Bionafta",
        "gtl_diesel": "GTL nafta",
        "hgv_diesel": "Nafta pro kamiony",
    ]

    /// OSM upřesňuje část paliv dvojtečkou (`adblue:canister`, `diesel:truck`).
    private static let qualifiers: [String: String] = [
        "canister": "kanystr",
        "pump": "u stojanu",
        "truck": "pro kamiony",
        "bulk": "cisterna",
    ]

    private static func octane(of key: String) -> Int? {
        let lower = key.lowercased()
        guard lower.hasPrefix("octane_") else { return nil }
        return Int(lower.dropFirst("octane_".count))
    }

    private static func prettify(_ key: String) -> String {
        let readable = key.replacingOccurrences(of: "_", with: " ")
        return readable.prefix(1).uppercased() + readable.dropFirst()
    }

    static func label(for key: String) -> String {
        let lower = key.lowercased()
        if let name = names[lower] { return name }
        if let octane = octane(of: lower) { return "Natural \(octane)" }

        if let separator = lower.firstIndex(of: ":") {
            let base = String(lower[lower.startIndex..<separator])
            let qualifier = String(lower[lower.index(after: separator)...])
            let baseLabel = names[base] ?? prettify(base)
            guard let readable = qualifiers[qualifier] else { return baseLabel }
            return "\(baseLabel) (\(readable))"
        }

        return prettify(lower)
    }

    static func isPremium(_ key: String) -> Bool {
        (octane(of: key) ?? 0) >= 98
    }

    /// Duplicitní klíče zahodíme, ať `ForEach` nedostane dva stejné.
    static func sorted(_ keys: [String]) -> [String] {
        var seen = Set<String>()
        let unique = keys.filter { seen.insert($0.lowercased()).inserted }
        return unique.filter(isPremium) + unique.filter { !isPremium($0) }
    }
}

enum ServiceCatalog {

    struct Row: Identifiable, Hashable {
        let id: String
        let title: String
        let detail: String?
        let symbol: String
    }

    private static let titles: [String: (title: String, symbol: String)] = [
        "shop": ("Obchod", "cart"),
        "car_wash": ("Myčka", "car"),
        "toilets": ("Toalety", SymbolName.toiletsRow),
        "compressed_air": ("Huštění pneumatik", "wind"),
        "wheelchair": ("Bezbariérový přístup", "figure.roll"),
        "self_service": ("Samoobsluha", "hand.tap"),
    ]

    private static let paymentNames: [String: String] = [
        "cash": "hotovost",
        "coins": "mince",
        "notes": "bankovky",
        "cards": "karty",
        "credit_cards": "kreditní karty",
        "debit_cards": "debetní karty",
        "contactless": "bezkontaktně",
        "visa": "Visa",
        "mastercard": "Mastercard",
        "maestro": "Maestro",
        "american_express": "American Express",
        "apple_pay": "Apple Pay",
        "google_pay": "Google Pay",
        "fuel_cards": "tankovací karty",
        // Tankovací karty dopravců – jsou to zkratky, „Dkv“ nebo „Uta“ vypadá jako překlep.
        "dkv": "DKV",
        "uta": "UTA",
        "ccs": "CCS",
        "omv_card": "OMV Card",
        "euroshell": "euroShell",
        "eurooil": "EuroOil",
        "routex": "Routex",
        "jcb": "JCB",
        "union_pay": "UnionPay",
        "diners_club": "Diners Club",
        "visa_electron": "Visa Electron",
        "mastercard_electronic": "Mastercard Electronic",
    ]

    private static let values: [String: String] = [
        "limited": "omezeně",
        "only": "pouze",
        "customers": "pro zákazníky",
        "designated": "vyhrazeno",
        "yes": "ano",
    ]

    private static func isAbsent(_ value: String) -> Bool {
        ["no", "false", "0", "none", ""].contains(value.trimmingCharacters(in: .whitespaces).lowercased())
    }

    /// Klíče, které nesou poznámku o původu dat, ne službu pro řidiče. Neznámý klíč
    /// jinak propadne přes `prettify` do seznamu a mezi myčkou a toaletami vyskočí
    /// „Geocoded – Nominatim“; na testovacích datech to potká skoro čtvrtinu benzínek.
    private static let internalKeys: Set<String> = ["geocoded"]

    private static func prettify(_ raw: String) -> String {
        let readable = raw.replacingOccurrences(of: "_", with: " ")
        return readable.prefix(1).uppercased() + readable.dropFirst()
    }

    static func rows(from services: [StationService]) -> [Row] {
        var rows: [Row] = []
        var payments: [String] = []

        for service in services where !isAbsent(service.value) {
            let key = service.key.lowercased()
            let value = service.value.trimmingCharacters(in: .whitespaces).lowercased()

            if internalKeys.contains(key) { continue }

            if key.hasPrefix("payment:") {
                let method = String(key.dropFirst("payment:".count))
                payments.append(paymentNames[method] ?? prettify(method))
                continue
            }

            let known = titles[key]
            rows.append(Row(
                id: key,
                title: known?.title ?? prettify(service.key),
                detail: value == "yes" ? nil : (values[value] ?? prettify(service.value)),
                symbol: known?.symbol ?? "checkmark.circle"
            ))
        }

        if !payments.isEmpty {
            rows.append(Row(
                id: "payment",
                title: "Platba",
                detail: payments.joined(separator: ", "),
                symbol: "creditcard"
            ))
        }

        return rows
    }
}
