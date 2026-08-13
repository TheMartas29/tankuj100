import SwiftUI
import UIKit

extension View {
    /// Klepnutí mimo textové pole zavře klávesnici, stejně jako tažení po formuláři.
    func dismissesKeyboardOnTap() -> some View {
        scrollDismissesKeyboard(.interactively)
            .background(KeyboardDismissGesture())
    }
}

/// Rozpoznávač klepnutí pověšený na okno aplikace.
///
/// SwiftUI cestou to nejde: `onTapGesture` ani `simultaneousGesture` na formuláři
/// spolknou klepnutí na řádky, takže přestane fungovat výběr v pickeru (ověřeno).
/// UIKit rozpoznávač s `cancelsTouchesInView = false` klepnutí jen pozoruje.
private struct KeyboardDismissGesture: UIViewRepresentable {

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let probe = UIView(frame: .zero)
        probe.isUserInteractionEnabled = false

        // Okno je k dispozici až po vložení do hierarchie.
        DispatchQueue.main.async {
            guard let window = probe.window else { return }
            context.coordinator.install(on: window)
        }
        return probe
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.remove()
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        private weak var window: UIWindow?
        private var recognizer: UITapGestureRecognizer?

        func install(on window: UIWindow) {
            guard recognizer == nil else { return }
            let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
            tap.cancelsTouchesInView = false
            tap.delegate = self
            window.addGestureRecognizer(tap)
            self.window = window
            recognizer = tap
        }

        func remove() {
            if let recognizer { window?.removeGestureRecognizer(recognizer) }
            recognizer = nil
        }

        @objc private func dismissKeyboard() {
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }

        /// Klepnutí do textového pole musí projít bez zavření – jinak by klávesnice
        /// zmizela hned, jak se ji uživatel snaží vyvolat. Klávesnice sama je v jiném
        /// okně, takže se sem její dotyky nedostanou.
        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch
        ) -> Bool {
            var view = touch.view
            while let current = view {
                if current is UITextField || current is UITextView { return false }
                view = current.superview
            }
            return true
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
