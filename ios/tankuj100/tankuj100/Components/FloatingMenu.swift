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
        .overlay(alignment: .topTrailing) { badge(collapsedCount) }
        .overlay(alignment: .topLeading) {
            if collapsedHasNews { badge(.dot).offset(x: -10, y: -3) }
        }
        .glassMorphID("toggle", in: glass)
        .accessibilityLabel(toggleAccessibilityLabel)
        .accessibilityHint("Rozbalí nabídku")
    }

    private func itemButton(_ item: FloatingMenuItem) -> some View {
        circleButton(systemImage: item.systemImage, pointSize: item.pointSize) {
            // Nejdřív sbalit, pak teprve akci: sheet se otevírá nad mapou a menu by
            // pod ním zůstalo viset rozbalené až do dalšího klepnutí.
            setExpanded(false)
            item.action()
        }
        .overlay(alignment: .topTrailing) { badge(item.badge) }
        .glassMorphID(item.id, in: glass)
        // Bez popisku je tohle jediné, co ikonu pojmenuje.
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

    @ViewBuilder
    private func badge(_ badge: FloatingMenuBadge) -> some View {
        if badge.isVisible {
            Group {
                switch badge {
                case .count(let value):
                    Text("\(min(value, 99))")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .frame(minWidth: 18, minHeight: 18)
                        .padding(.horizontal, 3)
                        .background(Color.red, in: Capsule())
                default:
                    Circle()
                        .fill(Color.red)
                        .frame(width: 12, height: 12)
                }
            }
            .overlay(Capsule().stroke(Color(.systemBackground), lineWidth: 1.5))
            .offset(x: 5, y: -5)
            // Odznak je jen obrázek stavu, do hlasového popisu ho přidává už tlačítko.
            .accessibilityHidden(true)
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
