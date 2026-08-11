import SwiftUI
import UIKit

extension View {

    @ViewBuilder
    func sheetBackground(_ color: Color) -> some View {
        if #available(iOS 16.4, *) {
            presentationBackground(color)
        } else {
            ZStack {
                color.ignoresSafeArea()
                self
            }
        }
    }

    @ViewBuilder
    func tightListTop() -> some View {
        if #available(iOS 17.0, *) {
            contentMargins(.top, 8, for: .scrollContent)
        } else {
            self
        }
    }

    @ViewBuilder
    func onValueChange<V: Equatable>(of value: V, perform action: @escaping (V) -> Void) -> some View {
        if #available(iOS 17.0, *) {
            onChange(of: value) { _, newValue in action(newValue) }
        } else {
            onChange(of: value, perform: action)
        }
    }
}

struct FloatingMapButton: View {
    let systemImage: String
    var pointSize: CGFloat = 28
    var accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: pointSize, weight: .semibold))
                .foregroundColor(.accentColor)
                .frame(width: 60, height: 60)
        }
        .modifier(FloatingButtonBackground())
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct FloatingButtonBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.clear.tint(Color.accentColor.opacity(0.2)))
        } else {
            content
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(Color.accentColor.opacity(0.25), lineWidth: 1))
        }
    }
}

extension UIColor {
    /// Akcentní barva z asset katalogu. `UIColor(Color.accentColor)` ji mimo SwiftUI
    /// nenajde a vrátí systémovou modrou, proto ji bereme jménem.
    static let brandAccent = UIColor(named: "AccentColor") ?? .systemRed
}
