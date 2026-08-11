import SwiftUI

/// Verdikt ani počty hlasů se uživatelům zatím **nezobrazují** – dokud hlasů není
/// dost, byly by zavádějící. Odpovědi se jen sbírají.
struct FuelKindCard: View {
    let myVote: FuelKind?
    let isSubmitting: Bool
    let onVote: (FuelKind) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Běžné palivo obsahuje až 10 % etanolu (E10), který starším motorům nesvědčí. Pomozte ostatním – u pumpy se podívejte, co tam mají.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 6) {
                Text(myVote == nil ? "Co je u pumpy napsané?" : "Vaše odpověď")
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
