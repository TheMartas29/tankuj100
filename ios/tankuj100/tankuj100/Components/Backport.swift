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

struct FloatingButtonBackground: ViewModifier {
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

/// Obal pro skupinu skleněných tlačítek. Na iOS 26 díky němu sklo mezi sousedními
/// tlačítky splývá a při rozbalování se přelévá místo toho, aby každé žilo samo za
/// sebe. Níž je to průhledný kontejner, který nic nedělá.
struct GlassGroup<Content: View>: View {
    var spacing: CGFloat = 10
    @ViewBuilder var content: () -> Content

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content() }
        } else {
            content()
        }
    }
}

extension View {
    /// Přiřadí prvku identitu ve skupině skla, aby si iOS 26 uměl při animaci
    /// pohlídat, co se v co přelévá. Na starších verzích se neděje nic.
    @ViewBuilder
    func glassMorphID(_ id: some Hashable, in namespace: Namespace.ID) -> some View {
        if #available(iOS 26.0, *) {
            glassEffectID(id, in: namespace)
        } else {
            self
        }
    }
}

/// Umí systém přelít sklo z jednoho tvaru do druhého? Rozhoduje o tom, jestli
/// se animace nechá na `GlassEffectContainer`, nebo se musí poskládat ručně –
/// a to je obyčejné rozhodnutí, ne pohled, takže `#available` patří sem.
var hasGlassMorph: Bool {
    if #available(iOS 26.0, *) { return true }
    return false
}

extension UIColor {
    /// Akcentní barva z asset katalogu. `UIColor(Color.accentColor)` ji mimo SwiftUI
    /// nenajde a vrátí systémovou modrou, proto ji bereme jménem.
    static let brandAccent = UIColor(named: "AccentColor") ?? .systemRed
}
