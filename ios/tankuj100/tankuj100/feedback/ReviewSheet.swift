//
//  ReviewSheet.swift
//  tankuj100
//
//  Sheet pro napsání (nebo úpravu) hodnocení benzínky.
//

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
        NavigationStack {
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
                    Text("Jak jsi tady byl spokojený?")
                } footer: {
                    Text(stationTitle)
                }

                Section {
                    TextField(
                        "Např. rychlá obsluha, čisté WC, dobré kafe…",
                        text: $comment,
                        axis: .vertical
                    )
                    .lineLimit(4...8)
                    .focused($commentFocused)
                    .onChange(of: comment) { _, newValue in
                        if newValue.count > commentLimit { comment = String(newValue.prefix(commentLimit)) }
                    }
                } header: {
                    Text("Komentář (nepovinný)")
                } footer: {
                    HStack {
                        Text("Ostatním řidičům pomůže, když napíšeš, co tě potěšilo nebo zklamalo.")
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
                        .onChange(of: author) { _, newValue in
                            if newValue.count > authorLimit { author = String(newValue.prefix(authorLimit)) }
                        }
                } header: {
                    Text("Podpis (nepovinný)")
                } footer: {
                    Text("Když necháš prázdné, hodnocení se zobrazí jako „Anonym“. Nikam se nepřihlašuješ a e-mail po tobě nechceme.")
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
            .navigationTitle(isEditing ? "Upravit hodnocení" : "Ohodnotit")
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
                        Button(isEditing ? "Uložit" : "Odeslat") { submit() }
                            .fontWeight(.semibold)
                            .disabled(rating == 0)
                    }
                }
            }
            .confirmationDialog(
                "Smazat tvoje hodnocení této benzínky?",
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
        default: "Klepni na hvězdičky"
        }
    }

    /// Když už uživatel hodnotil, otevřeme sheet s jeho hodnocením – neztratí, co napsal.
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
