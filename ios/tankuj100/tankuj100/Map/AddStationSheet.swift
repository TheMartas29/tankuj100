import CoreLocation
import SwiftUI

/// Obrazovka „Benzínka navíc“ – formulář a moje žádosti na dvou záložkách.
///
/// Kdo ještě nic neposlal, začíná na formuláři. Kdo už žádost má, začíná u ní:
/// tam je to, co ho zajímá (jestli se s ní něco stalo), a formulář je krok stranou.
struct AddStationSheet: View {

    /// Odznak nepřečtených změn. Zhasne, jakmile se záložka s žádostmi zobrazí.
    var badge: StationRequestBadge?
    var userLocation: CLLocation?
    /// Vyplní se z `MapScreen` – z žádosti se pak dá skočit na hotovou benzínku.
    var onShowStation: ((Int) -> Void)?
    let onClose: () -> Void

    @StateObject private var viewModel = StationRequestViewModel()

    @State private var tab: Tab = .add
    @State private var didSwitchTabByHand = false

    @State private var pick: MapPick = .czechia
    @State private var brand = ""
    @State private var name = ""
    @State private var city = ""
    @State private var address = ""
    @State private var fuels: Set<FuelFlag> = []
    @State private var note = ""
    @FocusState private var noteFocused: Bool

    private let noteLimit = 1000

    /// Popisky jsou krátké schválně – přepínač se v liště dělí o místo se „Zavřít“
    /// a „Odeslat“, na „Moje žádosti“ tam zbylo „Moje žád…“. Celý název nese titulek.
    enum Tab: String, CaseIterable {
        case add = "Přidat"
        case mine = "Žádosti"
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(tab == .add ? "Přidat benzínku" : "Moje žádosti")
                .navigationBarTitleDisplayMode(.inline)
                // Rozepsaný formulář nesmí zmizet omylem – zatažení dolů se snadno
                // splete se scrollováním. Prázdný formulář zavřít gestem jde.
                .interactiveDismissDisabled(hasDraft)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        Picker("", selection: tabSelection) {
                            ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Zavřít", action: onClose)
                            .disabled(viewModel.isSubmitting)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if tab == .add {
                            if viewModel.isSubmitting {
                                ProgressView()
                            } else {
                                Button("Odeslat", action: submit)
                                    .fontWeight(.semibold)
                                    .disabled(!canSubmit)
                            }
                        }
                    }
                }
                .successToast($viewModel.successMessage)
        }
        .errorAlert($viewModel.error)
        .task {
            await viewModel.load()
            badge?.apply(viewModel.requests)
            if !didSwitchTabByHand, !viewModel.requests.isEmpty { tab = .mine }
            if tab == .mine { badge?.markSeen() }
        }
        .onValueChange(of: tab) { newTab in
            if newTab == .mine { badge?.markSeen() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch tab {
        case .add:
            form
        case .mine:
            StationRequestsView(
                viewModel: viewModel,
                onShowStation: onShowStation,
                onAddTapped: { tab = .add }
            )
        }
    }

    // MARK: - Formulář

    private var form: some View {
        Form {
            Section {
                StationLocationPicker(pick: $pick, userLocation: userLocation)
                    .listRowInsets(EdgeInsets())
            } header: {
                Text("Kde benzínka stojí")
            } footer: {
                locationFooter
            }

            Section {
                LimitedTextField(title: "Např. MOL", text: $brand, limit: 60, capitalization: .words)
            } header: {
                Text("Značka")
            } footer: {
                Text("Podle značky benzínku poznáme. Když žádnou nemá, napište třeba „bez značky“.")
            }

            Section {
                ForEach(FuelFlag.filterOrder) { fuel in
                    Button {
                        toggle(fuel)
                    } label: {
                        HStack {
                            Text(fuel.label)
                                .foregroundColor(.primary)
                            Spacer()
                            if fuels.contains(fuel) {
                                Image(systemName: "checkmark")
                                    .font(.body.weight(.semibold))
                                    .foregroundColor(.accentColor)
                            }
                        }
                    }
                    .accessibilityAddTraits(fuels.contains(fuel) ? .isSelected : [])
                }
            } header: {
                Text("Jaká paliva tady natankujete?")
            } footer: {
                Text(fuels.isEmpty
                     ? "Vyberte aspoň jedno palivo – bez toho nevíme, komu benzínku ukázat."
                     : "Vybrat můžete i víc paliv. Co si nejste jistí, radši nechte nevybrané.")
                .foregroundColor(fuels.isEmpty ? .red : .secondary)
            }

            Section {
                LimitedTextField(title: "Název (nepovinný)", text: $name, limit: 80, capitalization: .words)
                LimitedTextField(title: "Obec", text: $city, limit: 80, capitalization: .words)
                LimitedTextField(title: "Ulice a číslo", text: $address, limit: 120, capitalization: .words)
            } header: {
                Text("Adresa (nepovinná)")
            } footer: {
                Text("Obec a ulici doplňujeme podle špendlíku. Když sedí, nemusíte nic psát.")
            }

            Section {
                TextField("Např. nová pumpa u sjezdu, otevřeli v květnu…", text: $note, axis: .vertical)
                    .lineLimit(3...7)
                    .focused($noteFocused)
                    .onValueChange(of: note) { newValue in
                        if newValue.count > noteLimit { note = String(newValue.prefix(noteLimit)) }
                    }
            } header: {
                Text("Poznámka (nepovinná)")
            } footer: {
                HStack {
                    Text("Cokoli, co nám pomůže benzínku najít a ověřit.")
                    Spacer()
                    if note.count > noteLimit - 200 {
                        Text("\(note.count)/\(noteLimit)")
                            .monospacedDigit()
                    }
                }
            }
        }
        .dismissesKeyboardOnTap()
        // Adresu hledáme až chvíli po dojetí mapy – při přejíždění po mapě by to
        // byla řada zbytečných dotazů, které si geokodér stejně zaškrtí limitem.
        .task(id: pick.point) {
            guard pick.isPrecise else { return }
            try? await Task.sleep(nanoseconds: 700_000_000)
            guard !Task.isCancelled else { return }
            let found = await viewModel.lookUpAddress(at: pick.point)
            // Po pomalé lince může odpověď dorazit až po posunutí špendlíku – to už
            // je ale adresa úplně jiného místa a do formuláře nepatří.
            guard !Task.isCancelled else { return }
            // Přepisujeme jen prázdná pole – co si uživatel napsal, je vždycky přednější.
            if city.isEmpty, let foundCity = found.city { city = foundCity }
            if address.isEmpty, let street = found.street { address = street }
        }
        .alert("Tuhle benzínku už známe", isPresented: showsDuplicate) {
            Button("Rozumím", role: .cancel) {}
            Button("Zobrazit moje žádosti") { tab = .mine }
        } message: {
            Text(viewModel.duplicateMessage
                 ?? "Do 150 metrů od špendlíku už jedna benzínka nebo nevyřízená žádost je.")
        }
    }

    @ViewBuilder
    private var locationFooter: some View {
        if pick.isPrecise {
            Text("Špendlík míří na \(pick.point.text). Posuňte mapou, když nesedí.")
        } else {
            Text("Přibližte mapu a namiřte špendlík přesně na benzínku.")
                .foregroundColor(.red)
        }
    }

    // MARK: - Stav

    /// Pořadí paliv je dané číselníkem, ne tím, jak je uživatel naklikal.
    private var selectedFuels: [FuelFlag] {
        FuelFlag.filterOrder.filter { fuels.contains($0) }
    }

    private var trimmedBrand: String {
        brand.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmit: Bool {
        pick.isPrecise && !fuels.isEmpty && !trimmedBrand.isEmpty
    }

    private var hasDraft: Bool {
        tab == .add && (!trimmedBrand.isEmpty || !fuels.isEmpty || !note.isEmpty)
    }

    private var tabSelection: Binding<Tab> {
        Binding {
            tab
        } set: { newValue in
            // Ruční přepnutí je signál, že se do záložek už nemá sahat samo – jinak
            // by pomalé načtení žádostí přeskočilo z rozepsaného formuláře pryč.
            didSwitchTabByHand = true
            tab = newValue
        }
    }

    private var showsDuplicate: Binding<Bool> {
        Binding {
            viewModel.duplicateMessage != nil
        } set: { shown in
            if !shown { viewModel.duplicateMessage = nil }
        }
    }

    private func toggle(_ fuel: FuelFlag) {
        if fuels.contains(fuel) {
            fuels.remove(fuel)
        } else {
            fuels.insert(fuel)
        }
    }

    private func submit() {
        noteFocused = false
        Task {
            let ok = await viewModel.submit(
                point: pick.point,
                brandName: brand,
                name: name,
                city: city,
                address: address,
                fuels: selectedFuels,
                note: note
            )
            guard ok else { return }
            clearForm()
            badge?.apply(viewModel.requests)
            // Po odeslání ukážeme, kam žádost doputovala – ať je jasné, kde se
            // pozná výsledek.
            tab = .mine
            badge?.markSeen()
        }
    }

    private func clearForm() {
        brand = ""
        name = ""
        city = ""
        address = ""
        note = ""
        fuels = []
    }
}

/// Textové pole s tvrdým stropem délky. Server delší text stejně nepřijme a je
/// lepší nenechat ho napsat, než ho po odeslání vracet.
private struct LimitedTextField: View {
    let title: String
    @Binding var text: String
    let limit: Int
    var capitalization: TextInputAutocapitalization = .sentences

    var body: some View {
        TextField(title, text: $text)
            .textInputAutocapitalization(capitalization)
            .onValueChange(of: text) { newValue in
                if newValue.count > limit { text = String(newValue.prefix(limit)) }
            }
    }
}
