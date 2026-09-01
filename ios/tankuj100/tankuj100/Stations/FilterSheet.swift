import SwiftUI

/// Obrazovka filtru. **Každá změna platí okamžitě** – žádná kopie, žádné potvrzování.
///
/// Dřív se pracovalo nad kopií a do sdíleného stavu ji zapsalo až tlačítko dole.
/// Mělo to chránit před přerovnáním seznamu pod rukou, jenže sheet výsledek stejně
/// zakrývá celou plochou, takže nebylo co chránit – zbylo jen matoucí „musím to
/// ještě potvrdit?“. Filtrování navíc běží mimo hlavní vlákno a i nad stotisícem
/// benzínek trvá jednotky milisekund, takže přepočet na každé ťuknutí nikoho nebolí.
///
/// Spodní lišta proto **nic nepotvrzuje**: ukazuje, kolik benzínek zrovna odpovídá,
/// a „Hotovo“ jen zavírá. Kdyby to bylo tlačítko „Zobrazit…“, vracíme se k původnímu
/// zmatku, kdy nebylo poznat, co už platí a co ne.
struct FilterSheet: View {

    @ObservedObject private var store = StationFilterStore.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavStack {
            List {
                resetSection
                fuelSection
                serviceSection
                brandSection
                extrasSection
            }
            .animation(.easeInOut(duration: 0.2), value: store.filter.isEmpty)
            .navigationTitle("Filtr")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { summaryBar }
        }
    }

    /// Zapisuje rovnou do sdíleného stavu. `apply` si sám pohlídá, že se nic nepřepočítá,
    /// když se hodnota nezměnila.
    private var filter: Binding<StationFilter> {
        Binding(get: { store.filter }, set: { store.apply($0) })
    }

    private func toggling(_ change: (inout StationFilter) -> Void) {
        var next = store.filter
        change(&next)
        store.apply(next)
    }

    // MARK: - Sekce

    /// Nahoře, ne dole: je to východisko z nastavení, které uživatel vidí pod ním,
    /// a hledá se nejdřív. Když není co resetovat, není tu vůbec – prázdné tlačítko
    /// jen mate a bere místo.
    @ViewBuilder
    private var resetSection: some View {
        if !store.filter.isEmpty {
            Section {
                Button("Resetovat filtrování", role: .destructive) {
                    store.clearFilter()
                }
                .frame(maxWidth: .infinity, alignment: .center)
            } footer: {
                Text("Vypne všechny podmínky najednou.")
            }
        }
    }

    private var fuelSection: some View {
        Section {
            BadgeGrid(items: FuelFlag.filterOrder) { flag in
                FilterBadge(title: flag.label, isOn: store.filter.contains(flag)) {
                    toggling { $0.toggle(flag) }
                }
            }
        } header: {
            Text("Palivo")
        } footer: {
            Text("Stačí, když má benzínka aspoň jedno z vybraných paliv.")
        }
    }

    private var serviceSection: some View {
        Section {
            BadgeGrid(items: ServiceFlag.filterOrder) { flag in
                FilterBadge(title: flag.label, symbol: flag.symbol,
                            isOn: store.filter.contains(flag)) {
                    toggling { $0.toggle(flag) }
                }
            }
        } header: {
            Text("Služby")
        } footer: {
            Text("Benzínka musí mít všechny vybrané služby.")
        }
    }

    private var brandSection: some View {
        Section {
            NavigationLink {
                BrandPicker(brands: store.index.brands, filter: filter)
            } label: {
                HStack {
                    Text("Značky")
                    Spacer()
                    Text(brandSummary).foregroundColor(.secondary)
                }
            }
            .disabled(store.index.brands.isEmpty)
        }
    }

    private var brandSummary: String {
        let selected = store.filter.brandNames.count
        if selected == 0 { return "Všechny" }
        if selected == 1, let only = store.filter.brandNames.first { return only }
        return "Vybráno \(selected)"
    }

    private var extrasSection: some View {
        Section {
            Toggle("Jen oblíbené", isOn: filter.favoritesOnly)

            Picker("Hodnocení", selection: ratingSelection) {
                Text("Nezáleží").tag(0)
                Text("3+").tag(3)
                Text("4+").tag(4)
                Text("5").tag(5)
            }
            .pickerStyle(.segmented)
        } footer: {
            if store.filter.minRating != nil {
                Text("Benzínky bez hodnocení se nezobrazí.")
            }
        }
    }

    private var ratingSelection: Binding<Int> {
        Binding(get: { store.filter.minRating ?? 0 },
                set: { value in toggling { $0.minRating = value == 0 ? nil : value } })
    }

    // MARK: - Spodní lišta

    private var summaryBar: some View {
        VStack(spacing: 8) {
            Divider()
            Text(summaryTitle)
                .font(.subheadline)
                .foregroundColor(matchCount == 0 ? .red : .secondary)
                // Během přepočtu zůstává vidět předchozí číslo jen zesvětlené –
                // blikání na spinner a zpátky je při každém ťuknutí horší než
                // číslo, které o pár milisekund zaostává.
                .opacity(store.isWorking ? 0.4 : 1)
                .animation(.easeOut(duration: 0.15), value: store.isWorking)

            // Roztažení patří na popisek, ne na tlačítko – jinak se `borderedProminent`
            // smrskne na šířku textu a v patičce plave uprostřed.
            Button { dismiss() } label: {
                Text("Hotovo").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal)
        }
        .padding(.bottom, 10)
        .background(.bar)
    }

    private var matchCount: Int { store.result.count }

    private var summaryTitle: String {
        guard matchCount > 0 else { return "Filtru neodpovídá žádná benzínka" }
        if store.filter.isEmpty { return "Zobrazuje se všech \(StationCount.text(matchCount))" }
        return "Odpovídá \(StationCount.text(matchCount))"
    }
}

/// Odznaky se vejdou do mřížky, která se sama zalomí – `Layout` ani `Grid` kvůli tomu
/// není potřeba a chová se to stejně na iPhonu i na iPadu.
private struct BadgeGrid<Item: Identifiable, Content: View>: View {
    let items: [Item]
    @ViewBuilder let content: (Item) -> Content

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 8)], spacing: 8) {
            ForEach(items) { content($0) }
        }
        .padding(.vertical, 4)
    }
}

private struct FilterBadge: View {
    let title: String
    var symbol: String?
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let symbol { Image(systemName: symbol).font(.caption) }
                Text(title).font(.subheadline)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(isOn ? Color.accentColor : Color.secondary.opacity(0.15))
            .foregroundColor(isOn ? .white : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }
}

/// Výběr značek. Seznam je líný a hledání jen prosívá pole názvů, takže i pár set
/// značek zůstává plynulých.
private struct BrandPicker: View {
    let brands: [StationIndex.Brand]
    @Binding var filter: StationFilter

    @State private var query = ""

    private var shown: [StationIndex.Brand] {
        let needle = query.trimmingCharacters(in: .whitespaces)
        guard !needle.isEmpty else { return brands }
        return brands.filter { $0.name.localizedCaseInsensitiveContains(needle) }
    }

    var body: some View {
        List {
            ForEach(shown) { brand in
                Button {
                    var next = filter
                    next.setBrand(brand, selected: !filter.isSelected(brand))
                    filter = next
                } label: {
                    HStack {
                        Text(brand.name).foregroundColor(.primary)
                        Spacer()
                        Text("\(brand.count)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Image(systemName: "checkmark")
                            .foregroundColor(.accentColor)
                            .opacity(filter.isSelected(brand) ? 1 : 0)
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Hledat značku")
        .navigationTitle("Značky")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Zrušit výběr") {
                    var next = filter
                    next.clearBrands()
                    filter = next
                }
                .disabled(filter.brandNames.isEmpty)
            }
        }
    }
}

/// „1 benzínku“, „3 benzínky“, „1 234 benzínek“ – s číslem po tisících odděleným
/// mezerou, jak se česky píše.
enum StationCount {
    private static let formatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = Locale(identifier: "cs_CZ")
        return formatter
    }()

    static func text(_ count: Int) -> String {
        let number = formatter.string(from: NSNumber(value: count)) ?? "\(count)"
        switch count {
        case 1: return "\(number) benzínku"
        case 2...4: return "\(number) benzínky"
        default: return "\(number) benzínek"
        }
    }
}
