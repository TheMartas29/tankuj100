import SwiftUI

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
