import SwiftUI

/// Obrazovka filtru. Pracuje nad kopií (`draft`) a do sdíleného stavu ji zapíše až
/// tlačítko „Použít“ – jinak by se při každém ťuknutí přerovnal seznam pod rukou
/// i celá mapa za sheetem.
struct FilterSheet: View {

    @ObservedObject private var store = StationFilterStore.shared
    @Environment(\.dismiss) private var dismiss

    @State private var draft = StationFilter()
    @State private var matches: Int?
    @State private var countTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            List {
                fuelSection
                serviceSection
                brandSection
                extrasSection
                clearSection
            }
            .navigationTitle("Filtr")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Zrušit") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) { applyBar }
        }
        .onAppear {
            draft = store.filter
            refreshCount()
        }
        .onValueChange(of: draft) { _ in refreshCount() }
        .onDisappear { countTask?.cancel() }
    }

    // MARK: - Sekce

    private var fuelSection: some View {
        Section {
            BadgeGrid(items: FuelFlag.filterOrder) { flag in
                FilterBadge(title: flag.label, isOn: draft.contains(flag)) {
                    draft.toggle(flag)
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
                FilterBadge(title: flag.label, symbol: flag.symbol, isOn: draft.contains(flag)) {
                    draft.toggle(flag)
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
                BrandPicker(brands: store.index.brands, draft: $draft)
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
        let selected = draft.brandNames.count
        if selected == 0 { return "Všechny" }
        if selected == 1, let only = draft.brandNames.first { return only }
        return "Vybráno \(selected)"
    }

    private var extrasSection: some View {
        Section {
            Toggle("Jen oblíbené", isOn: $draft.favoritesOnly)

            Picker("Hodnocení", selection: ratingSelection) {
                Text("Nezáleží").tag(0)
                Text("3+").tag(3)
                Text("4+").tag(4)
                Text("5").tag(5)
            }
            .pickerStyle(.segmented)
        } footer: {
            if draft.minRating != nil {
                Text("Benzínky bez hodnocení se nezobrazí.")
            }
        }
    }

    private var ratingSelection: Binding<Int> {
        Binding(get: { draft.minRating ?? 0 },
                set: { draft.minRating = $0 == 0 ? nil : $0 })
    }

    private var clearSection: some View {
        Section {
            Button("Vymazat filtr", role: .destructive) { draft = StationFilter() }
                .disabled(draft.isEmpty)
                .frame(maxWidth: .infinity, alignment: .center)
        }
    }

    // MARK: - Spodní lišta

    private var applyBar: some View {
        VStack(spacing: 0) {
            Divider()
            Button {
                store.apply(draft)
                dismiss()
            } label: {
                Text(applyTitle)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(matches == 0)
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
        .background(.bar)
    }

    private var applyTitle: String {
        guard let matches else { return "Použít filtr" }
        guard matches > 0 else { return "Nic nevyhovuje" }
        return "Zobrazit \(StationCount.text(matches))"
    }

    /// Počet se přepočítává na pozadí a starý dotaz se ruší – uživatel přepíná odznaky
    /// rychleji, než stihne stotisícový průchod doběhnout.
    private func refreshCount() {
        countTask?.cancel()
        let snapshot = draft
        countTask = Task {
            let count = await store.matchCount(for: snapshot)
            guard !Task.isCancelled else { return }
            matches = count
        }
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
    @Binding var draft: StationFilter

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
                    draft.setBrand(brand, selected: !draft.isSelected(brand))
                } label: {
                    HStack {
                        Text(brand.name).foregroundColor(.primary)
                        Spacer()
                        Text("\(brand.count)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Image(systemName: "checkmark")
                            .foregroundColor(.accentColor)
                            .opacity(draft.isSelected(brand) ? 1 : 0)
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Hledat značku")
        .navigationTitle("Značky")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Zrušit výběr") { draft.clearBrands() }
                    .disabled(draft.brandNames.isEmpty)
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
