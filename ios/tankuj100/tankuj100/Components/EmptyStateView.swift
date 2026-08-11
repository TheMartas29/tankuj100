import SwiftUI

/// Nahrazuje `ContentUnavailableView`, který je až od iOS 17.
struct EmptyStateView<Actions: View>: View {
    let title: String
    let systemImage: String
    var message: String?
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 46))
                .foregroundColor(.secondary)

            Text(title)
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)

            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            actions()
                .padding(.top, 4)
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension EmptyStateView where Actions == EmptyView {
    init(title: String, systemImage: String, message: String? = nil) {
        self.init(title: title, systemImage: systemImage, message: message, actions: { EmptyView() })
    }
}
