import SwiftUI

struct ReportSheet: View {

    @ObservedObject var viewModel: StationFeedbackViewModel
    let stationTitle: String
    let fuelNames: [String]

    @Environment(\.dismiss) private var dismiss

    @State private var type: ReportType = .fuel
    @State private var selectedFuel: String = ""
    @State private var note: String = ""
    @FocusState private var isNoteFocused: Bool

    private let noteLimit = 1000

    var body: some View {
        NavStack {
            Form {
                Section {
                    Picker("Co je špatně", selection: $type) {
                        ForEach(ReportType.selectable) { option in
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

                if type == .fuel {
                    Section("Kterého paliva se to týká") {
                        if fuelNames.isEmpty {
                            TextField("Např. Natural 100", text: $selectedFuel)
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

                Section {
                    MultilineTextField(title: "Popište, co jste na místě viděli…",
                                       text: $note,
                                       lines: 3...7,
                                       limit: noteLimit,
                                       isFocused: $isNoteFocused)
                } header: {
                    Text(type == .other ? "Popis" : "Poznámka (nepovinná)")
                } footer: {
                    if !canSubmit {
                        Text("Bez popisu hlášení odeslat nejde – nevěděli bychom, co opravit.")
                            .foregroundStyle(.red)
                    } else {
                        Text("Hlášení projde člověk a data opraví. Díky, že nám pomáháte držet appku přesnou.")
                    }
                }
            }
            .dismissesKeyboardOnTap()
            .navigationTitle("Nahlásit problém")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Zrušit") { dismiss() }
                        .disabled(viewModel.isSubmitting)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if viewModel.isSubmitting {
                        ProgressView()
                    } else {
                        Button { submit() } label: {
                            Text("Odeslat").fontWeight(.semibold)
                        }
                        .disabled(!canSubmit)
                    }
                }
            }
            .errorAlert($viewModel.error)
            .onAppear {
                if selectedFuel.isEmpty, fuelNames.count == 1 { selectedFuel = fuelNames[0] }
            }
        }
    }

    private var canSubmit: Bool {
        guard type == .other else { return true }
        return !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() {
        isNoteFocused = false
        Task {
            let ok = await viewModel.submitReport(
                type: type,
                fuelName: type == .fuel && !selectedFuel.isEmpty ? selectedFuel : nil,
                note: note
            )
            if ok { dismiss() }
        }
    }
}
