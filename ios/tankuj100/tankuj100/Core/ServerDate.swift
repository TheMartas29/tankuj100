import Foundation

enum ServerDate {
    // Server posílá čas s milisekundami (`2026-08-03T15:53:27.564Z`), ale nespoléháme
    // se na to – zkusíme i variantu bez nich.
    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain = ISO8601DateFormatter()

    static func parse(_ string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }
}
