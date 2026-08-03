//
//  FeedbackViews.swift
//  tankuj100
//
//  Sdílené prvky pro hodnocení: hvězdičky, přehled hodnocení, řádek komentáře,
//  karta hlasování o typu benzínu.
//

import SwiftUI

// MARK: - Hvězdičky

/// Hvězdičky jen na čtení.
struct StarsView: View {
    let rating: Double
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: 1.5) {
            ForEach(1...5, id: \.self) { index in
                Image(systemName: symbol(for: index))
                    .font(.system(size: size))
                    .foregroundStyle(Double(index) - 0.5 <= rating ? Color.yellow : Color.secondary.opacity(0.35))
            }
        }
        .accessibilityLabel("Hodnocení \(String(format: "%.1f", rating)) z 5")
    }

    private func symbol(for index: Int) -> String {
        let value = Double(index)
        if rating >= value { return "star.fill" }
        if rating >= value - 0.5 { return "star.leadinghalf.filled" }
        return "star"
    }
}

/// Hvězdičky, které jde naklikat – použité v hodnotícím sheetu.
struct StarPickerView: View {
    @Binding var rating: Int

    var body: some View {
        HStack(spacing: 10) {
            ForEach(1...5, id: \.self) { index in
                Button {
                    rating = index
                } label: {
                    Image(systemName: index <= rating ? "star.fill" : "star")
                        .font(.system(size: 32))
                        .foregroundStyle(index <= rating ? Color.yellow : Color.secondary.opacity(0.4))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(index) z 5")
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Přehled hodnocení

/// Průměr + rozložení hvězdiček. Sloupečky ukazujeme jen když je co ukazovat.
struct RatingSummaryView: View {
    let summary: RatingSummary

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            VStack(spacing: 2) {
                Text(summary.averageText)
                    .font(.system(size: 34, weight: .semibold))
                    .monospacedDigit()
                StarsView(rating: summary.average ?? 0, size: 11)
                Text(summary.countText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(minWidth: 78)

            if summary.count > 0 {
                VStack(spacing: 3) {
                    ForEach((1...5).reversed(), id: \.self) { stars in
                        HStack(spacing: 6) {
                            Text("\(stars)")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 8)
                            ProgressView(value: Double(summary.count(forStars: stars)), total: Double(max(summary.count, 1)))
                                .tint(.yellow)
                            Text("\(summary.count(forStars: stars))")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .frame(width: 16, alignment: .trailing)
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Komentář

struct ReviewRowView: View {
    let review: StationReview

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                StarsView(rating: Double(review.rating), size: 11)
                Text(review.authorText)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text(review.dateText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if let comment = review.comment, !comment.isEmpty {
                Text(comment)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Karta typu benzínu (E5 / E10)

/// Hlavní přidaná hodnota appky: ověřuje, jestli se na stanici čepuje E5.
/// Data nikde nekoupíme, takže je hlásí sami řidiči.
struct FuelKindCard: View {
    let summary: FuelSummary
    let myVote: FuelKind?
    let isSubmitting: Bool
    let onVote: (FuelKind) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: summary.verdict.symbol)
                    .foregroundStyle(summary.verdict.tint)
                Text(summary.verdict.title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text(summary.votesText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(summary.verdict.detail)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 6) {
                Text(myVote == nil ? "Co je u pumpy napsané?" : "Tvoje odpověď")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    ForEach(FuelKind.allCases) { kind in
                        Button {
                            onVote(kind)
                        } label: {
                            Text(kind.label)
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(myVote == kind ? Color.accentColor : Color.secondary.opacity(0.14))
                                .foregroundStyle(myVote == kind ? Color.white : Color.primary)
                                .clipShape(RoundedRectangle(cornerRadius: 9))
                        }
                        .buttonStyle(.plain)
                        .disabled(isSubmitting)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Potvrzovací hláška

/// Nenápadné potvrzení akce dole na obrazovce – lepší než alert, který se musí odklikat.
struct SuccessToast: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .background(Color.black.opacity(0.85), in: Capsule())
            .shadow(radius: 8, y: 3)
            .padding(.bottom, 28)
            .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

extension View {
    /// Zobrazí potvrzovací hlášku a po chvíli ji sama schová.
    func successToast(_ message: Binding<String?>) -> some View {
        overlay(alignment: .bottom) {
            if let text = message.wrappedValue {
                SuccessToast(message: text)
                    .task(id: text) {
                        try? await Task.sleep(for: .seconds(2.5))
                        withAnimation { message.wrappedValue = nil }
                    }
            }
        }
        .animation(.spring(duration: 0.3), value: message.wrappedValue)
    }
}
