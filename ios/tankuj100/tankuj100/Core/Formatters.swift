import CoreLocation
import Foundation

enum DistanceFormatter {
    static func text(for distance: CLLocationDistance) -> String {
        distance < 1000
            ? "\(Int(distance)) m"
            : String(format: "%.1f km", distance / 1000)
    }
}

enum PhoneFormatter {
    static func format(_ raw: String) -> (display: String, dialURL: URL?) {
        var digits = raw.filter(\.isNumber)
        if digits.hasPrefix("420") { digits = String(digits.dropFirst(3)) }

        if digits.count == 9 {
            let a = digits.prefix(3)
            let b = digits.dropFirst(3).prefix(3)
            let c = digits.dropFirst(6)
            return ("+420 \(a) \(b) \(c)", URL(string: "tel://+420\(digits)"))
        }

        let onlyDigits = raw.filter(\.isNumber)
        return (raw, onlyDigits.isEmpty ? nil : URL(string: "tel://\(onlyDigits)"))
    }
}
