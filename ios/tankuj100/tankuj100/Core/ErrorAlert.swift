import SwiftUI
import Foundation

struct ErrorAlert: ViewModifier {
    
    @Binding var error: CustomError?
    
    var isShowingError: Binding<Bool> {
        Binding {
            error != nil
        } set: { _ in
            error = nil
        }
    }
    
    func body(content: Content) -> some View {
        content
            .alert("Chyba", isPresented: isShowingError, actions: {
                Button ("Ok") {}
            }, message: {
                if let error = error {
                    let failure = error as Error
                    Text(failure.localizedDescription)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            })
    }
}

extension View {
    func errorAlert(_ error: Binding<CustomError?>) -> some View {
        self.modifier(ErrorAlert(error: error))
    }
}
