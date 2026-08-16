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
    let title: String
    var pointSize: CGFloat = 22
    var badge: FloatingMenuBadge = .none
    let action: () -> Void
}

/// Plovoucí menu v levém dolním rohu mapy. Sbalené je to jeden kroužek s „hamburgerem",
/// rozbalené se nad ním vyrolují položky s ikonou i popiskem.
///
/// Proč popisky: čtyři samostatné ikony vedle sebe nutily uživatele hádat, co která dělá.
/// Rozbalené menu má na text místo, tak ho využijeme – sbalený stav zabírá stejně jen
/// jedno tlačítko.
///
/// Kreslí se přes celou plochu, ne jen do rohu, protože si sám drží ztmavovací vrstvu:
/// rozbalené menu se musí dát zavřít klepnutím kamkoli vedle, jinak uživatel neví, jak ven.
struct FloatingMenu: View {

    let items: [FloatingMenuItem]

    @State private var isExpanded = false
    @Namespace private var glass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let diameter: CGFloat = 60

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if isExpanded { scrim }

            GlassGroup(spacing: 12) {
                VStack(alignment: .leading, spacing: 10) {
                    if isExpanded {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            itemButton(item)
                                .transition(itemTransition)
                                .animation(animation(forItemAt: index), value: isExpanded)
                                .zIndex(Double(items.count - index))
                        }
                    }
                    toggleButton
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
        Color.black.opacity(0.001)
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture { setExpanded(false) }
            // Sbalení už je „zpět“, systémové gesto by zavřelo něco jiného.
            .accessibilityLabel("Zavřít menu")
            .accessibilityAddTraits(.isButton)
            .transition(.opacity)
    }

    private var toggleButton: some View {
        Button {
            setExpanded(!isExpanded)
        } label: {
            Image(systemName: isExpanded ? "xmark" : "line.3.horizontal")
                .font(.system(size: isExpanded ? 22 : 26, weight: .semibold))
                .foregroundColor(.accentColor)
                .rotationEffect(.degrees(isExpanded ? 90 : 0))
                .frame(width: diameter, height: diameter)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(FloatingButtonBackground())
        // Sbalené menu musí prozradit, že je něco zapnuté nebo nové – jinak filtr
        // tiše schová půlku benzínek a uživatel hledá chybu v aplikaci.
        // Číslo a tečka mají každý svůj roh, ať se nepřebíjejí.
        .overlay(alignment: .topTrailing) { if !isExpanded { badge(collapsedCount) } }
        .overlay(alignment: .topLeading) {
            if !isExpanded && collapsedHasNews { badge(.dot).offset(x: -10) }
        }
        .glassMorphID("toggle", in: glass)
        .accessibilityLabel(toggleAccessibilityLabel)
        .accessibilityHint(isExpanded ? "" : "Rozbalí nabídku")
    }

    /// Součet čísel z položek. Dneska ho dává jen filtr, ale kdyby přibyla další
    /// číselná položka, sečte se – dvě čísla na jedno kolečko nepatří.
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
        guard !isExpanded else { return "Zavřít menu" }
        var label = "Menu"
        if case .count(let value) = collapsedCount { label += ", aktivních podmínek filtru: \(value)" }
        if collapsedHasNews { label += ", novinka v žádostech" }
        return label
    }

    private func itemButton(_ item: FloatingMenuItem) -> some View {
        Button {
            // Nejdřív sbalit, pak teprve akci: sheet se otevírá nad mapou a menu by
            // pod ním zůstalo viset rozbalené až do dalšího klepnutí.
            setExpanded(false)
            item.action()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: item.systemImage)
                    .font(.system(size: item.pointSize, weight: .semibold))
                    .frame(width: diameter - 22)
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .fixedSize()
            }
            .foregroundColor(.accentColor)
            .padding(.trailing, 18)
            .frame(height: diameter - 8)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .modifier(FloatingItemBackground())
        .overlay(alignment: .topTrailing) { badge(item.badge) }
        .glassMorphID(item.id, in: glass)
        .accessibilityLabel(item.title + item.badge.spokenSuffix)
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

    // MARK: - Pohyb

    private var itemTransition: AnyTransition {
        guard !reduceMotion else { return .opacity }
        return .asymmetric(
            insertion: .scale(scale: 0.55, anchor: .bottomLeading)
                .combined(with: .offset(y: 14))
                .combined(with: .opacity),
            removal: .scale(scale: 0.8, anchor: .bottomLeading).combined(with: .opacity)
        )
    }

    /// Položky nevyjedou naráz, ale odspodu po řadě – oko tak stihne přečíst, co přibylo.
    /// Zavírání je bez prodlev a svižnější; čekat na zavření nikdo nechce.
    private func animation(forItemAt index: Int) -> Animation {
        guard !reduceMotion else { return .easeOut(duration: 0.15) }
        let fromBottom = items.count - 1 - index
        return isExpanded
            ? .spring(response: 0.34, dampingFraction: 0.72).delay(Double(fromBottom) * 0.045)
            : .easeOut(duration: 0.16)
    }

    private func applyDebugLaunchOptions() {
        #if DEBUG
        if DebugLaunch.expandMenu { isExpanded = true }
        #endif
    }

    private func setExpanded(_ value: Bool) {
        // Přepínač a ztmavení se hýbou hned, prodlevu si nesou jen položky samy.
        withAnimation(reduceMotion ? .easeOut(duration: 0.15)
                                   : .spring(response: 0.32, dampingFraction: 0.8)) {
            isExpanded = value
        }
    }
}

/// Totéž co `FloatingButtonBackground`, ale v kapsli – položky menu nejsou kulaté.
private struct FloatingItemBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.clear.tint(Color.accentColor.opacity(0.2)), in: .capsule)
        } else {
            content
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(Color.accentColor.opacity(0.25), lineWidth: 1))
        }
    }
}

#Preview {
    ZStack {
        LinearGradient(colors: [.green.opacity(0.3), .blue.opacity(0.3)],
                       startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
        FloatingMenu(items: [
            FloatingMenuItem(id: "add", systemImage: "plus", title: "Přidat benzínku",
                             badge: .dot) {},
            FloatingMenuItem(id: "list", systemImage: "list.bullet", title: "Seznam benzínek") {},
            FloatingMenuItem(id: "filter", systemImage: "line.3.horizontal.decrease",
                             title: "Filtr", badge: .count(2)) {},
            FloatingMenuItem(id: "menu", systemImage: "ellipsis", title: "Další") {},
        ])
    }
}
