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

// MARK: - iOS 15

/// `NavigationStack` je až iOS 16. Níž ho zastoupí `NavigationView` ve stack stylu –
/// výchozí styl by na velkém displeji udělal split view, což tahle aplikace nechce.
///
/// Díky obalu zůstává na iOS 16+ všechno přesně jako dřív; starou cestou projde jen
/// ten, kdo je opravdu na patnáctce.
struct NavStack<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        if #available(iOS 16.0, *) {
            NavigationStack { content() }
        } else {
            NavigationView { content() }
                .navigationViewStyle(.stack)
        }
    }
}

/// Sdílení odkazu. `ShareLink` je iOS 16, níž se otevře `UIActivityViewController`.
struct ShareButton<Label: View>: View {
    let item: URL
    @ViewBuilder var label: () -> Label

    var body: some View {
        if #available(iOS 16.0, *) {
            ShareLink(item: item, label: label)
                .buttonStyle(.plain)
        } else {
            Button(action: present, label: label)
                .buttonStyle(.plain)
        }
    }

    private func present() {
        guard let presenter = Self.topViewController() else { return }
        let sheet = UIActivityViewController(activityItems: [item], applicationActivities: nil)
        // Na iPadu by bez kotvy spadlo; aplikace je sice jen pro iPhone, ale stojí
        // to jeden řádek.
        sheet.popoverPresentationController?.sourceView = presenter.view
        presenter.present(sheet, animated: true)
    }

    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

extension View {

    /// Tažení po formuláři zavře klávesnici. iOS 15 to neumí – tam zbude klepnutí
    /// mimo pole, které si aplikace řeší vlastním rozpoznávačem.
    @ViewBuilder
    func interactiveKeyboardDismiss() -> some View {
        if #available(iOS 16.0, *) {
            scrollDismissesKeyboard(.interactively)
        } else {
            self
        }
    }

    /// Sheet na půl obrazovky s úchytem. Na iOS 15 detenty nejsou a nic je
    /// nenahradí, tak se ukáže přes celou výšku.
    @ViewBuilder
    func mediumSheet() -> some View {
        if #available(iOS 16.0, *) {
            presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        } else {
            self
        }
    }

    /// Vynutí, aby řádek `List` vznikl znovu.
    ///
    /// iOS 15 si obsah řádku pamatuje a nepřekreslí ho, když se uvnitř jen prohodí
    /// větev `switch` a počet řádků zůstane stejný. Ověřeno na detailu benzínky:
    /// hodnocení už bylo načtené, ale sekce „Benzín pro starší auta“ visela na
    /// „Zjišťuji…“ – obě přitom čtou tentýž stav. Vlastní identita řádek zahodí
    /// a postaví nový. Od iOS 16 se překresluje sám, takže se tam nemění nic.
    @ViewBuilder
    func listRowRedraw(on value: some Hashable) -> some View {
        if #available(iOS 16.0, *) {
            self
        } else {
            id(value)
        }
    }

    /// `navigationDestination(for:)` je iOS 16. Na patnáctce se cíl otevírá přímo
    /// z `NavigationLink`, takže není co registrovat.
    @ViewBuilder
    func navigationDestinationBackport<D: Hashable, C: View>(
        for data: D.Type, @ViewBuilder destination: @escaping (D) -> C
    ) -> some View {
        if #available(iOS 16.0, *) {
            navigationDestination(for: data, destination: destination)
        } else {
            self
        }
    }
}

/// Jména symbolů, která na patnáctce ještě neexistují.
///
/// `Image(systemName:)` u neznámého jména nenakreslí **nic** – po ikoně zbude
/// v řádku prázdné místo. Chybějící symbol se tedy neohlásí, musí se najít předem
/// a náhrada vybrat ručně.
enum SymbolName {

    /// Toalety v detailu benzínky. Mísa (`toilet`) přišla s SF Symbols 4 (iOS 16).
    static let toiletsRow = ios16("toilet", or: legacyToilets)

    /// Toalety jako odznak ve filtru. Dvojice postav s dělicí čarou
    /// (`figure.dress.line.vertical.figure`) je taky až SF Symbols 4.
    static let toiletsBadge = ios16("figure.dress.line.vertical.figure", or: legacyToilets)

    /// Nejbližší, co patnáctka umí: dvojice stojících postav. Není to piktogram
    /// z dveří záchodů, ale čte se jako „lidi“ a hlavně je vidět.
    private static let legacyToilets = "figure.stand.line.dotted.figure.stand"

    private static func ios16(_ modern: String, or legacy: String) -> String {
        if #available(iOS 16.0, *) { return modern }
        return legacy
    }
}

extension Binding where Value == String {

    /// Ustřihne text už při zápisu, ne až po něm.
    ///
    /// Hlídat délku v `onChange` nestačí: `TextEditor` si na iOS 15 drží vlastní
    /// kopii textu, a když se stav pod ním zkrátí, zapíše si tu svou zpátky. Pole
    /// se pak ustálí **o jeden znak nad stropem** – ověřeno na poznámce, kde se
    /// počitadlo zaseklo na „1 001/1 000“. Server má u poznámky i komentáře přesně
    /// stejné číslo a delší text odmítá chybou, takže ten jeden znak stačil na
    /// zahozenou žádost. V setteru se zkrácení stane dřív, než hodnota vůbec
    /// vznikne, takže se přes strop nedostane ani na jeden snímek.
    func limited(to limit: Int) -> Binding<String> {
        Binding(get: { wrappedValue },
                set: { new in wrappedValue = new.count > limit ? String(new.prefix(limit)) : new })
    }
}

/// Víceřádkové pole, které roste s textem. `TextField(_:text:axis:)` i
/// `lineLimit(_:)` s rozsahem jsou iOS 16; na patnáctce je zastoupí `TextEditor`
/// s minimální výškou a vlastním popiskem – ten `TextEditor` sám nemá.
///
/// Zaměření se předává dovnitř, ne modifikátorem zvenčí: `focused` musí sedět na
/// samotném poli, na obalu by se nechytlo.
struct MultilineTextField: View {
    let title: String
    @Binding var text: String
    var lines: ClosedRange<Int>
    /// Strop délky. Hlídá si ho samo pole, ať se na něj nedá zapomenout na místě,
    /// kde se používá.
    var limit: Int
    @FocusState.Binding var isFocused: Bool

    private var capped: Binding<String> { $text.limited(to: limit) }

    var body: some View {
        if #available(iOS 16.0, *) {
            TextField(title, text: capped, axis: .vertical)
                .lineLimit(lines)
                .focused($isFocused)
        } else {
            legacy
        }
    }

    /// O kolik `UITextView` odsazuje text od svého okraje (`lineFragmentPadding`).
    /// Bez vyrovnání začíná poznámka o kus vpravo než ostatní pole ve formuláři.
    private static let textInset: CGFloat = 5

    private var legacy: some View {
        TextEditor(text: capped)
            .focused($isFocused)
            // Bez pevné výšky by `TextEditor` ve formuláři spadl na jeden řádek.
            .frame(minHeight: CGFloat(lines.lowerBound) * 20,
                   maxHeight: CGFloat(lines.upperBound) * 20)
            // Záporné odsazení posune celé pole tak, aby jeho text seděl na stejné
            // svislici jako `TextField` v sousedních řádcích.
            .padding(.horizontal, -Self.textInset)
            .overlay(alignment: .topLeading) {
                if text.isEmpty {
                    Text(title)
                        .foregroundColor(Color(.placeholderText))
                        .padding(.top, 8)
                        .allowsHitTesting(false)
                }
            }
    }
}
