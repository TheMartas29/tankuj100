import SwiftUI

struct ReviewSheet: View {

    @ObservedObject var viewModel: StationFeedbackViewModel
    let stationTitle: String

    @Environment(\.dismiss) private var dismiss

    @State private var rating: Int = 0
    @State private var comment: String = ""
    @State private var author: String = ""
    @State private var showDeleteConfirm = false
    @FocusState private var commentFocused: Bool

    private let commentLimit = 1000
    private let authorLimit = 40

    private var isEditing: Bool { viewModel.myReview != nil }

    var body: some View {
        NavStack {
            Form {
                Section {
                    VStack(spacing: 10) {
                        Text(ratingHint)
                            .font(.subheadline)
                            .foregroundStyle(rating == 0 ? .secondary : .primary)
                            .animation(.none, value: rating)
                        StarPickerView(rating: $rating)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                } header: {
                    Text("Jak jste tady byli spokojeni?")
                } footer: {
                    Text(stationTitle)
                }

                Section {
                    MultilineTextField(
                        title: "Např. rychlá obsluha, čisté WC, dobré kafe…",
                        text: $comment,
                        lines: 4...8,
                        isFocused: $commentFocused
                    )
                    .onValueChange(of: comment) { newValue in
                        if newValue.count > commentLimit { comment = String(newValue.prefix(commentLimit)) }
                    }
                } header: {
                    Text("Komentář (nepovinný)")
                } footer: {
                    HStack {
                        Text("Ostatním řidičům pomůže, když napíšete, co vás potěšilo nebo zklamalo.")
                        Spacer()
                        if comment.count > commentLimit - 200 {
                            Text("\(comment.count)/\(commentLimit)")
                                .monospacedDigit()
                        }
                    }
                }

                Section {
                    TextField("Anonym", text: $author)
                        .textInputAutocapitalization(.words)
                        .onValueChange(of: author) { newValue in
                            if newValue.count > authorLimit { author = String(newValue.prefix(authorLimit)) }
                        }
                } header: {
                    Text("Podpis (nepovinný)")
                } footer: {
                    Text("Když necháte prázdné, hodnocení se zobrazí jako „Anonym“. Nikam se nepřihlašujete a e-mail po vás nechceme.")
                }

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Text("Smazat moje hodnocení")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                }
            }
            .dismissesKeyboardOnTap()
            .navigationTitle(isEditing ? "Upravit hodnocení" : "Ohodnotit")
            .navigationBarTitleDisplayMode(.inline)
            // Rozepsané hodnocení nesmí zmizet omylem – scrollování nahoru se snadno
            // splete se zatažením sheetu dolů. Zavřít jde jen tlačítkem „Zrušit“.
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
                        // `fontWeight` na tlačítku je iOS 16; na popisku jde odjakživa.
                        Button { submit() } label: {
                            Text(isEditing ? "Uložit" : "Odeslat").fontWeight(.semibold)
                        }
                        .disabled(rating == 0)
                    }
                }
            }
            .confirmationDialog(
                "Smazat vaše hodnocení této benzínky?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Smazat", role: .destructive) {
                    Task {
                        await viewModel.deleteMyReview()
                        if viewModel.error == nil { dismiss() }
                    }
                }
                Button("Ponechat", role: .cancel) {}
            }
            .errorAlert($viewModel.error)
            .onAppear(perform: prefill)
        }
    }

    private var ratingHint: String {
        switch rating {
        case 1: "Špatné"
        case 2: "Slabší"
        case 3: "Průměr"
        case 4: "Dobré"
        case 5: "Výborné"
        default: "Klepněte na hvězdičky"
        }
    }

    private func prefill() {
        guard let mine = viewModel.myReview else { return }
        rating = mine.rating
        comment = mine.comment ?? ""
        author = mine.author ?? ""
    }

    private func submit() {
        commentFocused = false
        Task {
            let ok = await viewModel.submitReview(rating: rating, comment: comment, author: author)
            if ok { dismiss() }
        }
    }
}
