import SwiftUI

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
    func successToast(_ message: Binding<String?>) -> some View {
        overlay(alignment: .bottom) {
            if let text = message.wrappedValue {
                SuccessToast(message: text)
                    .task(id: text) {
                        try? await Task.sleep(nanoseconds: 2_500_000_000)
                        withAnimation { message.wrappedValue = nil }
                    }
            }
        }
        .animation(.spring(duration: 0.3), value: message.wrappedValue)
    }
}
