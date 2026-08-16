import Foundation
import Network

/// Čekání na okamžik, kdy má telefon zase kudy ven.
///
/// Bez toho zůstane po výpadku prázdná mapa prázdná, dokud si uživatel nevzpomene
/// na tlačítko „Zkusit znovu“ – a to je na obrazovce, kterou musí nejdřív najít.
/// Po návratu ze suterénu nebo z tunelu má mapa naskočit sama.
///
/// `NWPathMonitor` říká jen tolik, že nějaká cesta ven existuje. Že na jejím konci
/// odpovídá i náš server, ověří teprve samotný dotaz – tohle je podnět ke zkusení,
/// ne záruka úspěchu.
enum NetworkMonitor {

    /// Vrátí se, jakmile systém hlásí dostupnou síť. Když ji hlásí už teď, vrací se hned.
    ///
    /// Monitor je vlastní pro každé čekání schválně: běží jen po dobu, kdy na něj
    /// někdo čeká, a zrušením úlohy se zastaví. Trvale běžící singleton by hlídal
    /// síť i ve chvílích, kdy to nikoho nezajímá.
    static func waitUntilOnline() async {
        let monitor = NWPathMonitor()
        let gate = OnceGate {
            monitor.cancel()
        }

        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                gate.attach(continuation)
                monitor.pathUpdateHandler = { path in
                    guard path.status == .satisfied else { return }
                    gate.finish()
                }
                monitor.start(queue: DispatchQueue(label: "cz.silkroad.tankuj100.network"))
            }
        } onCancel: {
            gate.finish()
        }
    }
}

/// Hlídá, aby se čekání probudilo právě jednou. Ozvat se může jak monitor sítě,
/// tak zrušení úlohy – a dvojí `resume` continuation je pád, ne varování.
private final class OnceGate: @unchecked Sendable {

    private let lock = NSLock()
    private let onFinish: () -> Void
    private var continuation: CheckedContinuation<Void, Never>?
    private var isFinished = false

    init(onFinish: @escaping () -> Void) {
        self.onFinish = onFinish
    }

    /// Zrušení může přijít dřív, než se stihne uložit continuation. V tom případě
    /// se probudí rovnou.
    func attach(_ continuation: CheckedContinuation<Void, Never>) {
        lock.lock()
        guard !isFinished else {
            lock.unlock()
            continuation.resume()
            return
        }
        self.continuation = continuation
        lock.unlock()
    }

    func finish() {
        lock.lock()
        guard !isFinished else {
            lock.unlock()
            return
        }
        isFinished = true
        let pending = continuation
        continuation = nil
        lock.unlock()

        onFinish()
        pending?.resume()
    }
}
