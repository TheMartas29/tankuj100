import SwiftUI

enum BrandLogos {

    static func assetName(for brandName: String?) -> String? {
        guard let key = normalizedKey(brandName) else { return nil }
        let canonical = aliases[key] ?? key
        return assets[canonical]
    }

    static func hasLogo(for brandName: String?) -> Bool {
        assetName(for: brandName) != nil
    }

    /// Barva plátna pro loga sahající až k okraji – jinak na hraně kolečka svítí bílý proužek.
    static func canvasColor(for brandName: String?) -> Color? {
        guard let key = normalizedKey(brandName) else { return nil }
        return canvasColors[aliases[key] ?? key]
    }

    /// Posloupnosti tokenů, protože "s.r.o." se při normalizaci rozpadne na "s", "r", "o".
    private static let legalSuffixes: [[String]] = [
        ["spol", "s", "r", "o"],
        ["s", "r", "o"],
        ["sro"],
        ["spol"],
        ["a", "s"],
        ["as"],
        ["k", "s"],
        ["v", "o", "s"],
        ["s", "p"],
        ["ltd"],
        ["gmbh"],
    ]

    static func normalizedKey(_ brandName: String?) -> String? {
        guard let raw = brandName else { return nil }

        let folded = raw
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "en"))
            .lowercased()
        let cleaned = String(folded.map { ($0.isLetter || $0.isNumber) ? $0 : " " })

        var tokens = cleaned.split(separator: " ").map(String.init)

        var didStrip = true
        while didStrip, !tokens.isEmpty {
            didStrip = false
            for suffix in legalSuffixes where tokens.count > suffix.count {
                if Array(tokens.suffix(suffix.count)) == suffix {
                    tokens.removeLast(suffix.count)
                    didStrip = true
                    break
                }
            }
        }

        let key = tokens.joined()
        return key.isEmpty ? nil : key
    }

    private static let canvasColors: [String: Color] = [
        "orlen": Color(red: 0.769, green: 0.157, blue: 0.102),
        "eurooil": Color(red: 0.161, green: 0.396, blue: 0.655),
        "tankono": Color(red: 0.996, green: 0.827, blue: 0.000),
    ]

    private static let assets: [String: String] = [
        "orlen": "logo-orlen",
        "mol": "logo-mol",
        "omv": "logo-omv",
        "shell": "logo-shell",
        "eurooil": "logo-eurooil",
        "kmprona": "logo-kmprona",
        "tankono": "logo-tankono",
        "robinoil": "logo-robinoil",
        "avia": "logo-avia",
        "one1": "logo-one1",
        "makro": "logo-makro",
        "agrozamberk": "logo-agrozamberk",
        "herst": "logo-herst",
    ]

    private static let aliases: [String: String] = [
        // Benzina i Unipetrol se sloučily pod ORLEN, stará jména ale ještě jezdí v datech.
        "benzina": "orlen",
        "benzinaplus": "orlen",
        "orlenbenzina": "orlen",
        "benzinaorlen": "orlen",
        "orlenunipetrol": "orlen",
        "unipetrol": "orlen",
        "pknorlen": "orlen",

        "molcesko": "mol",
        "molceskarepublika": "mol",
        "molcz": "mol",
        "molgroup": "mol",

        "omvcesko": "omv",
        "omvceskarepublika": "omv",

        "shellczechrepublic": "shell",

        "cepro": "eurooil",
        "euroil": "eurooil",
        "robin": "robinoil",

        "ono": "tankono",
        "prona": "kmprona",
        "aviaceskarepublika": "avia",
        "aviacr": "avia",
        "makrocashcarry": "makro",
        "makrocashandcarry": "makro",
        "zamberkagro": "agrozamberk",
        "agrozamberkcz": "agrozamberk",
    ]
}
