import Foundation
import UIKit

enum MapsLauncher {
    static func openAppleMaps(latitude: Double, longitude: Double, name: String) -> CustomError? {
        let query = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: "http://maps.apple.com/?ll=\(latitude),\(longitude)&q=\(query)") else {
            return .defaultError(message: "Neplatná adresa pro Mapy.")
        }
        guard UIApplication.shared.canOpenURL(url) else {
            return .defaultError(message: "Apple Mapy se nepodařilo otevřít.")
        }
        UIApplication.shared.open(url)
        return nil
    }
}
