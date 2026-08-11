import SwiftUI
import UIKit

/// Značky kreslíme jako hotové obrázky – při pár stovkách bodů je to znatelně
/// rychlejší než hostovat v anotacích živá SwiftUI views.
enum StationMarkerImages {

    static let diameter: CGFloat = 30
    static let pointerHeight: CGFloat = 6

    private static var cache: [String: UIImage] = [:]

    static func image(forBrand brandName: String?) -> UIImage {
        let key = brandName ?? ""
        if let cached = cache[key] { return cached }

        let image = draw(brandName: brandName)
        cache[key] = image
        return image
    }

    private static func draw(brandName: String?) -> UIImage {
        let canvasColor = BrandLogos.canvasColor(for: brandName).map(UIColor.init)
        let logo = BrandLogos.assetName(for: brandName).flatMap(UIImage.init(named:))
        let accent = UIColor.brandAccent

        let size = CGSize(width: diameter, height: diameter + pointerHeight)
        return UIGraphicsImageRenderer(size: size).image { context in
            let cgContext = context.cgContext
            let circle = CGRect(x: 0, y: 0, width: diameter, height: diameter)

            cgContext.saveGState()
            cgContext.addEllipse(in: circle)
            cgContext.clip()

            (canvasColor ?? .white).setFill()
            cgContext.fill(circle)

            if let logo {
                // Celoplošná loga vyplní kolečko, průhledná dostanou okraj,
                // aby nekoukala až na obrys.
                let inset: CGFloat = canvasColor == nil ? 5 : 0
                logo.draw(in: aspectFit(logo.size, in: circle.insetBy(dx: inset, dy: inset)))
            } else {
                drawFallbackGlyph(in: circle, color: accent)
            }
            cgContext.restoreGState()

            accent.setStroke()
            cgContext.setLineWidth(1.5)
            cgContext.strokeEllipse(in: circle.insetBy(dx: 0.75, dy: 0.75))

            accent.setFill()
            let pointer = UIBezierPath()
            pointer.move(to: CGPoint(x: diameter / 2 - 4.5, y: diameter - 1))
            pointer.addLine(to: CGPoint(x: diameter / 2 + 4.5, y: diameter - 1))
            pointer.addLine(to: CGPoint(x: diameter / 2, y: diameter + pointerHeight))
            pointer.close()
            pointer.fill()
        }
    }

    private static func drawFallbackGlyph(in rect: CGRect, color: UIColor) {
        let configuration = UIImage.SymbolConfiguration(pointSize: rect.width * 0.6)
        guard let symbol = UIImage(systemName: "fuelpump.fill", withConfiguration: configuration)?
            .withTintColor(color, renderingMode: .alwaysOriginal) else { return }
        symbol.draw(in: aspectFit(symbol.size, in: rect.insetBy(dx: 6, dy: 6)))
    }

    private static func aspectFit(_ size: CGSize, in rect: CGRect) -> CGRect {
        guard size.width > 0, size.height > 0 else { return rect }
        let scale = min(rect.width / size.width, rect.height / size.height)
        let fitted = CGSize(width: size.width * scale, height: size.height * scale)
        return CGRect(
            x: rect.midX - fitted.width / 2,
            y: rect.midY - fitted.height / 2,
            width: fitted.width,
            height: fitted.height)
    }
}
