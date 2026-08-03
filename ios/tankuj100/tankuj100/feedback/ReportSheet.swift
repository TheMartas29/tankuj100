//
//  ReportSheet.swift
//  tankuj100
//
//  Sheet pro nahlášení nesrovnalosti (špatná cena, zavřeno, chybí palivo, …).
//

import SwiftUI

struct ReportSheet: View {

    @ObservedObject var viewModel: StationFeedbackViewModel
    let stationTitle: String
    /// Názvy paliv načtené v detailu – ať uživatel nemusí nic psát ručně.
    let fuelNames: [String]

    @Environment(\.dismiss) private var dismiss

    @State private var type: ReportType = .price
    @State private var selectedFuel: String = ""
    @State private var priceText: String = ""
    @State private var note: String = ""
    @FocusState private var focusedField: Field?

    private enum Field { case price, note }

    private let noteLimit = 1000

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Co je špatně", selection: $type) {
                        ForEach(ReportType.allCases) { option in
                            Label(option.label, systemImage: option.symbol).tag(option)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    Text("Co je špatně?")
                } footer: {
                    Text(type.hint)
                }

                if type == .price || type == .fuel {
                    Section("Kterého paliva se to týká") {
                        if fuelNames.isEmpty {
                            TextField("Např. Natural 95", text: $selectedFuel)
                        } else {
                            Picker("Palivo", selection: $selectedFuel) {
                                Text("Neuvádím").tag("")
                                ForEach(fuelNames, id: \.self) { name in
                                    Text(name).tag(name)
                                }
                            }
                        }
                    }
                }

                if type == .price {
                    Section {
                        HStack {
                            TextField("36,90", text: $priceText)
                                .keyboardType(.decimalPad)
                                .focused($focusedField, equals: .price)
                            Text("Kč/l")
                                .foregroundStyle(.secondary)
                        }
                    } header: {
                        Text("Správná cena")
                    } footer: {
                        if let message = priceValidationMessage {
                            Text(message).foregroundStyle(.red)
                        } else {
                            Text("Cena z totemu u vjezdu. Když ji nevíš, nech prázdné a napiš poznámku.")
                        }
                    }
                }

                Section {
                    TextField("Popiš, co jsi na místě viděl…", text: $note, axis: .vertical)
                        .lineLimit(3...7)
                        .focused($focusedField, equals: .note)
                        .onChange(of: note) { _, newValue in
                            if newValue.count > noteLimit { note = String(newValue.prefix(noteLimit)) }
                        }
                } header: {
                    Text(type == .other ? "Popis" : "Poznámka (nepovinná)")
                } footer: {
                    Text("Hlášení projde člověk a data opraví. Díky, že nám pomáháš držet appku přesnou.")
                }
            }
            .navigationTitle("Nahlásit nesrovnalost")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(viewModel.isSubmitting)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Zrušit") { dismiss() }
                        .disabled(viewModel.isSubmitting)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if viewModel.isSubmitting {
                        ProgressView()
                    } else {
                        Button("Odeslat") { submit() }
                            .fontWeight(.semibold)
                            .disabled(!canSubmit)
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Hotovo") { focusedField = nil }
                }
            }
            .errorAlert($viewModel.error)
            .onAppear {
                if selectedFuel.isEmpty, fuelNames.count == 1 { selectedFuel = fuelNames[0] }
            }
        }
    }

    // MARK: - Validace

    /// Uživatelé píšou ceny s čárkou i tečkou, obojí bereme.
    private var parsedPrice: Double? {
        let normalized = priceText.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        guard !normalized.isEmpty else { return nil }
        return Double(normalized)
    }

    private var priceValidationMessage: String? {
        guard !priceText.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        guard let price = parsedPrice else { return "Zadej cenu jako číslo, např. 36,90." }
        guard price > 0, price <= 200 else { return "Cena musí být mezi 0 a 200 Kč/l." }
        return nil
    }

    /// Nechceme poslat hlášení, ze kterého nepůjde nic zjistit.
    private var canSubmit: Bool {
        if priceValidationMessage != nil { return false }
        let hasNote = !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        switch type {
        case .other: return hasNote
        case .price: return parsedPrice != nil || hasNote
        default: return true
        }
    }

    private func submit() {
        focusedField = nil
        Task {
            let ok = await viewModel.submitReport(
                type: type,
                fuelName: selectedFuel.isEmpty ? nil : selectedFuel,
                claimedPrice: type == .price ? parsedPrice : nil,
                note: note
            )
            if ok { dismiss() }
        }
    }
}
