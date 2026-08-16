import SwiftUI

/// Přepínač prostředí. Schovaný schválně – běžný uživatel ho nemá kde najít
/// a hlavně bez kódu nemá co přepnout.
struct DeveloperSheet: View {

    @ObservedObject private var environment = AppEnvironmentStore.shared
    @Environment(\.dismiss) private var dismiss

    @State private var code = ""
    @State private var isVerifying = false
    @State private var message: String?
    @State private var failed = false
    @FocusState private var codeFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("Aktuálně")
                        Spacer()
                        Text(environment.current.title)
                            .foregroundColor(environment.current == .test ? .orange : .secondary)
                            .fontWeight(environment.current == .test ? .semibold : .regular)
                    }
                } footer: {
                    Text("Testovací prostředí má vlastní databázi. Hodnocení a hlášení, která tam pošlete, se v ostré aplikaci neobjeví.")
                }

                if environment.current == .production {
                    Section {
                        SecureField("Přístupový kód", text: $code)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($codeFocused)
                            .onSubmit(verify)

                        Button(action: verify) {
                            HStack {
                                Text("Přepnout na test")
                                if isVerifying {
                                    Spacer()
                                    ProgressView()
                                }
                            }
                        }
                        .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty || isVerifying)
                    } header: {
                        Text("Přepnout prostředí")
                    } footer: {
                        if let message {
                            Text(message).foregroundColor(failed ? .red : .secondary)
                        } else {
                            Text("Kód ověříme přímo u testovacího serveru. V aplikaci uložený není, takže z ní nejde vyčíst.")
                        }
                    }
                } else {
                    Section {
                        Button(role: .destructive) {
                            environment.useProduction()
                            message = nil
                        } label: {
                            Text("Zpět na produkci")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                    } footer: {
                        Text("Návrat na produkci kód nepotřebuje. Uložený testovací kód se přitom smaže.")
                    }
                }
            }
            .dismissesKeyboardOnTap()
            .navigationTitle("Vývojářské nastavení")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Hotovo") { dismiss() }
                }
            }
        }
    }

    private func verify() {
        let trimmed = code.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !isVerifying else { return }

        codeFocused = false
        isVerifying = true
        message = nil

        Task {
            let result = await APIClient.shared.verifyTestKey(trimmed)
            isVerifying = false

            switch result {
            case .success(let env):
                // Kdyby test odpověděl "production", něco je špatně s adresou
                // nebo s proxy – rozhodně to nepřepínat.
                guard env == "test" else {
                    failed = true
                    message = "Server se hlásí jako „\(env)“, ne jako test. Nepřepínám."
                    return
                }
                environment.useTest(key: trimmed)
                code = ""
                failed = false
                message = nil
            case .failure(let error):
                failed = true
                message = error.localizedDescription
            }
        }
    }
}
