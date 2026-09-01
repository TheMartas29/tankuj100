import SwiftUI

struct StationInfoSection: View {
    let detail: GasStationDetail

    private var phone: String {
        detail.phone?.trimmingCharacters(in: .whitespaces) ?? ""
    }

    /// OSM píše otevírací dobu do jednoho řádku (`Mo-Fr 06:00-22:00; Sa 08:00-20:00`),
    /// tak ji rozsekáme na řádky.
    private var openingHoursLines: [String] {
        guard let raw = detail.worktime else { return [] }
        if raw.trimmingCharacters(in: .whitespaces) == "24/7" { return ["Nonstop"] }
        return raw.split(separator: ";")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    @ViewBuilder
    var body: some View {
        if !phone.isEmpty || !openingHoursLines.isEmpty {
            Section("Další informace") {
                if !phone.isEmpty {
                    let formatted = PhoneFormatter.format(phone)
                    HStack {
                        Text("Telefon")
                        Spacer()
                        if let telURL = formatted.dialURL {
                            Link(destination: telURL) {
                                // Pořadí není kosmetika: `underline` na Textu je
                                // stará metoda, na Viewu až iOS 16.
                                //
                                // Barvu schválně nenastavujeme: `.primary` je
                                // hierarchický styl a uvnitř `Link` se stejně
                                // rozpustí do jeho odstínu. Akcentní barva je
                                // u telefonního odkazu správně, jen to dřív
                                // vypadalo, že kód říká něco jiného.
                                Text(formatted.display)
                                    .underline()
                            }
                        } else {
                            Text(formatted.display)
                        }
                    }
                }
                if !openingHoursLines.isEmpty {
                    HStack(alignment: .top) {
                        Text("Otevírací doba")
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            // Řádky se můžou opakovat (dva dny se stejnou dobou),
                            // proto identita podle pořadí, ne podle textu.
                            ForEach(Array(openingHoursLines.enumerated()), id: \.offset) { _, line in
                                Text(line).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }
}
