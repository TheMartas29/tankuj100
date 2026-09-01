import SwiftUI

/// Odznak na položce menu. `dot` je „něco nového", `count` je „kolik".
enum FloatingMenuBadge: Equatable {
    case none
    case dot
    case count(Int)

    var isVisible: Bool {
        switch self {
        case .none: return false
        case .dot: return true
        case .count(let value): return value > 0
        }
    }

    /// Do hlasového popisu, aby odznak nebyl jen pro oči.
    var spokenSuffix: String {
        switch self {
        case .none: return ""
        case .dot: return ", novinka"
        case .count(let value): return value > 0 ? ", aktivních podmínek: \(value)" : ""
        }
    }
}

struct FloatingMenuItem: Identifiable {
    let id: String
    let systemImage: String
    /// Popisek se nekreslí – nese ho hlasový výstup. Tlačítka jsou záměrně jen
    /// ikony, ať menu nezabírá půl mapy.
    let title: String
    var pointSize: CGFloat = 26
    var badge: FloatingMenuBadge = .none
    let action: () -> Void
}

/// Plovoucí menu v levém dolním rohu mapy. Sbalené je to jeden kroužek s „hamburgerem";
/// při rozbalení hamburger **zmizí** a na jeho místě vyrostou kroužky s ikonami.
/// Nejspodnější sedí přesně tam, kde byl hamburger, takže to působí, jako by se z něj
/// položky vylily.
///
/// Na iOS 26 tenhle dojem dělá sklo samo: tlačítko i položky jsou ve stejném
/// `GlassEffectContainer` a mají identitu (`glassEffectID`), takže se jeden tvar
/// přelije do druhých. Proto se tam **nesmí** vrstvit vlastní posuny ani prodlevy –
/// přebily by morph a zbylo by obyčejné probliknutí. Níž než iOS 26 se to poskládá
/// ručně: škálování od spodní hrany a položky odspodu po řadě.
///
/// Kreslí se přes celou plochu, ne jen do rohu, protože si sám drží vrstvu na
/// zachytávání klepnutí: rozbalené menu se zavírá klepnutím kamkoli vedle.
struct FloatingMenu: View {

    let items: [FloatingMenuItem]

    @State private var isExpanded = false
    @Namespace private var glass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let diameter: CGFloat = 60
    private let spacing: CGFloat = 10

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if isExpanded { scrim }

            GlassGroup(spacing: spacing) {
                VStack(alignment: .leading, spacing: spacing) {
                    if isExpanded {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            itemButton(item)
                                .transition(itemTransition)
                                .animation(animation(forItemAt: index), value: isExpanded)
                        }
                    } else {
                        toggleButton
                    }
                }
            }
            // Odznaky se kreslí **mimo** skleněný kontejner. Uvnitř to nešlo ani
            // jedním pořadím: před `glassEffectID` si je iOS 26 přibere do
            // skleněného tvaru a rozmaže je, za ním je zase kontejner ořízne.
            // Zvenčí je proto drží vrstva prázdných rámečků stejné geometrie.
            .overlay(alignment: .bottomLeading) { badgeLayer }
            // Dole vlevo si Apple Mapy kreslí povinný podpis („Maps · Legal“),
            // menu ho nesmí překrývat.
            .padding(.leading, 20)
            .padding(.bottom, 46)
            .shadow(radius: 3)
        }
        .onAppear(perform: applyDebugLaunchOptions)
    }

    // MARK: - Části

    private var scrim: some View {
        // Schválně bez ztmavení: mapa je to hlavní, co má být vidět, a rozbalené
        // menu jí zabírá jen roh. Zavře ho klepnutí kamkoli i výběr položky.
        Color.black.opacity(0.001)
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { setExpanded(false) }
            .accessibilityLabel("Zavřít menu")
            .accessibilityAddTraits(.isButton)
            .transition(.opacity)
    }

    private var toggleButton: some View {
        circleButton(systemImage: "line.3.horizontal", pointSize: 26) {
            setExpanded(true)
        }
        .glassMorphID("toggle", in: glass)
        .accessibilityLabel(toggleAccessibilityLabel)
        .accessibilityHint("Rozbalí nabídku")
    }

    /// Kopie rozvržení tlačítek, ve které jsou místo nich prázdné rámečky. Odznaky
    /// tak sedí přesně na svých kolečkách, ale kreslí se až nad sklem.
    private var badgeLayer: some View {
        VStack(alignment: .leading, spacing: spacing) {
            if isExpanded {
                ForEach(items) { item in
                    badgeSlot {
                        badge(item.badge)
                    }
                }
            } else {
                badgeSlot {
                    badge(collapsedCount)
                } leading: {
                    // Tečka na druhé straně, aby si s číslem nelezly do cesty.
                    if collapsedHasNews { badge(.dot, at: .leading) }
                }
            }
        }
        // Klepnutí musí projít skrz na tlačítka pod vrstvou.
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func badgeSlot<Trailing: View, Leading: View>(
        @ViewBuilder _ trailing: () -> Trailing,
        @ViewBuilder leading: () -> Leading = { EmptyView() }
    ) -> some View {
        Color.clear
            .frame(width: diameter, height: diameter)
            .overlay(alignment: .topTrailing, content: trailing)
            .overlay(alignment: .topLeading, content: leading)
    }

    private func itemButton(_ item: FloatingMenuItem) -> some View {
        circleButton(systemImage: item.systemImage, pointSize: item.pointSize) {
            // Nejdřív sbalit, pak teprve akci: sheet se otevírá nad mapou a menu by
            // pod ním zůstalo viset rozbalené až do dalšího klepnutí.
            setExpanded(false)
            item.action()
        }
        .glassMorphID(item.id, in: glass)
        // Odznak sem nepatří – kreslí ho `badgeLayer` mimo sklo. Zůstává tu ale
        // v hlasovém popisu, aby ho VoiceOver nepřeskočil.
        .accessibilityLabel(item.title + item.badge.spokenSuffix)
    }

    private func circleButton(systemImage: String,
                              pointSize: CGFloat,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: pointSize, weight: .semibold))
                .foregroundColor(.accentColor)
                .frame(width: diameter, height: diameter)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(FloatingButtonBackground())
    }

    /// Jak daleko od rohu rámečku sedí střed odznaku, aby ležel na **obvodu kruhu**
    /// a ne v prázdném rohu opsaného čtverce. Roh čtverce je od kruhu vzdálený
    /// `r·(√2−1)`, tedy u šedesátibodového kolečka skoro devět bodů – přesně o to
    /// odznak vypadal odlepeně a „za tlačítkem“.
    ///
    /// Bod na 45° leží v `r·(1−1/√2)` od hrany rámečku; pro odznak vysoký `h` z toho
    /// po odečtení jeho poloviny vyjde tohle. U osmnáctibodového odznaku je to skoro
    /// nula, proto se počítá a nehádá.
    /// Ke kterému rohu kolečka odznak patří. Znaménko posunu si drží `badge` sám –
    /// když ho přidával ještě volající, sečetly se dva posuny a tečka skončila
    /// nad hamburgerem místo v levém horním rohu.
    private enum BadgeCorner {
        case trailing
        case leading

        var dx: CGFloat { self == .trailing ? -1 : 1 }
    }

    private func badgeInset(height: CGFloat) -> CGFloat {
        let radius = diameter / 2
        return radius * (1 - 1 / 2.squareRoot()) - height / 2
    }

    private var badgeInset: CGFloat { badgeInset(height: 12) }

    @ViewBuilder
    private func badge(_ badge: FloatingMenuBadge, at corner: BadgeCorner = .trailing) -> some View {
        if badge.isVisible {
            switch badge {
            case .count(let value):
                Text("\(min(value, 99))")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .frame(minWidth: 18, minHeight: 18)
                    .padding(.horizontal, 3)
                    .background(Color.red, in: Capsule())
                    .modifier(BadgeLift())
                    .offset(x: corner.dx * badgeInset(height: 18), y: badgeInset(height: 18))
                    .accessibilityHidden(true)
            default:
                Circle()
                    .fill(Color.red)
                    .frame(width: 12, height: 12)
                    .modifier(BadgeLift())
                    .offset(x: corner.dx * badgeInset, y: badgeInset)
                    .accessibilityHidden(true)
            }
        }
    }

    // MARK: - Sbalený stav

    /// Sbalené menu musí prozradit, že je něco zapnuté nebo nové – jinak filtr tiše
    /// schová půlku benzínek a uživatel hledá chybu v aplikaci. Číslo a tečka mají
    /// každý svůj roh, ať se nepřebíjejí.
    private var collapsedCount: FloatingMenuBadge {
        let total = items.reduce(0) { sum, item in
            if case .count(let value) = item.badge { return sum + max(value, 0) }
            return sum
        }
        return total > 0 ? .count(total) : .none
    }

    private var collapsedHasNews: Bool {
        items.contains { $0.badge == .dot }
    }

    private var toggleAccessibilityLabel: String {
        var label = "Menu"
        if case .count(let value) = collapsedCount { label += ", aktivních podmínek filtru: \(value)" }
        if collapsedHasNews { label += ", novinka v žádostech" }
        return label
    }

    // MARK: - Pohyb

    /// Na iOS 26 jen prolnutí – tvar i pozici si přebírá `GlassEffectContainer`
    /// a vlastní škálování by mu do toho mluvilo. Níž se posun musí udělat sám.
    private var itemTransition: AnyTransition {
        guard !reduceMotion else { return .opacity }
        if hasGlassMorph { return .opacity }
        return .asymmetric(
            insertion: .scale(scale: 0.4, anchor: .bottom).combined(with: .opacity),
            removal: .scale(scale: 0.7, anchor: .bottom).combined(with: .opacity)
        )
    }

    /// Bez skla nevyjedou položky naráz, ale odspodu po řadě – oko tak stihne
    /// přečíst, co přibylo. Se sklem je prodleva na škodu: přelití je jeden pohyb.
    /// Zavírání je vždycky bez prodlev a svižnější, čekat na zavření nikdo nechce.
    private func animation(forItemAt index: Int) -> Animation {
        guard !reduceMotion else { return .easeOut(duration: 0.15) }
        guard isExpanded else { return .easeOut(duration: 0.16) }
        guard !hasGlassMorph else { return expandAnimation }
        let fromBottom = items.count - 1 - index
        return expandAnimation.delay(Double(fromBottom) * 0.045)
    }

    private var expandAnimation: Animation {
        .spring(response: 0.34, dampingFraction: 0.72)
    }

    private func applyDebugLaunchOptions() {
        #if DEBUG
        if DebugLaunch.expandMenu { isExpanded = true }
        #endif
    }

    private func setExpanded(_ value: Bool) {
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : expandAnimation) {
            isExpanded = value
        }
    }
}

/// Odznak se od skla odděluje stínem, ne obrysem. Obrys v barvě pozadí vypadal
/// v tmavém režimu jako tmavá svatozář a odznak působil, že leží pod tlačítkem.
private struct BadgeLift: ViewModifier {
    func body(content: Content) -> some View {
        content.shadow(color: .black.opacity(0.35), radius: 1.5, y: 0.5)
    }
}

#Preview {
    ZStack {
        LinearGradient(colors: [.green.opacity(0.3), .blue.opacity(0.3)],
                       startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
        FloatingMenu(items: [
            FloatingMenuItem(id: "menu", systemImage: "ellipsis", title: "Další") {},
            FloatingMenuItem(id: "add", systemImage: "plus", title: "Přidat benzínku",
                             badge: .dot) {},
            FloatingMenuItem(id: "filter", systemImage: "line.3.horizontal.decrease",
                             title: "Filtr", badge: .count(2)) {},
            FloatingMenuItem(id: "list", systemImage: "list.bullet", title: "Seznam benzínek") {},
        ])
    }
}
