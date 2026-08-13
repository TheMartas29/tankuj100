import MapKit
import SwiftUI
import UIKit

final class StationAnnotation: NSObject, MKAnnotation {
    let station: GasStation

    var coordinate: CLLocationCoordinate2D { station.coordinate }
    var title: String? { station.brandName }

    init(station: GasStation) {
        self.station = station
    }
}

final class StationAnnotationView: MKAnnotationView {
    static let reuseID = "station"

    override var annotation: MKAnnotation? {
        didSet { refresh() }
    }

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        clusteringIdentifier = Self.reuseID
        collisionMode = .circle
        displayPriority = .defaultLow
        refresh()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) není podporován")
    }

    /// Shlukování se nastavuje při každém přiřazení anotace, ne jen v `init`: při rozpadu
    /// clusteru MapKit recyklovanému view `clusteringIdentifier` vynuluje a `init` už
    /// podruhé nezavolá. Bez toho by se body po přiblížení a odzoomování zpět neseskupily.
    ///
    /// `displayPriority` musí být nižší než výchozí `.required` – požadované anotace
    /// MapKit nikdy neschovává ani neshlukuje a kreslil by všech tisíc špendlíků přes sebe.
    private func refresh() {
        clusteringIdentifier = Self.reuseID
        displayPriority = .defaultLow

        guard let station = (annotation as? StationAnnotation)?.station else { return }
        image = StationMarkerImages.image(forBrand: station.brandName)
        // Špička ukazatele míří na souřadnici, takže obrázek posuneme nahoru o půlku výšky.
        centerOffset = CGPoint(
            x: 0,
            y: -(StationMarkerImages.diameter + StationMarkerImages.pointerHeight) / 2)
    }
}

final class StationClusterView: MKAnnotationView {
    static let reuseID = "stationCluster"

    private static let diameter: CGFloat = 34

    override var annotation: MKAnnotation? {
        didSet { refresh() }
    }

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        collisionMode = .circle
        displayPriority = .defaultHigh
        refresh()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) není podporován")
    }

    private func refresh() {
        guard let cluster = annotation as? MKClusterAnnotation else { return }
        image = Self.badge(count: cluster.memberAnnotations.count)
        centerOffset = .zero
    }

    private static func badge(count: Int) -> UIImage {
        let size = CGSize(width: diameter, height: diameter)
        return UIGraphicsImageRenderer(size: size).image { context in
            let rect = CGRect(origin: .zero, size: size)

            UIColor.brandAccent.withAlphaComponent(0.9).setFill()
            context.cgContext.fillEllipse(in: rect)
            UIColor.white.setStroke()
            context.cgContext.setLineWidth(2)
            context.cgContext.strokeEllipse(in: rect.insetBy(dx: 1, dy: 1))

            let text = count > 99 ? "99+" : String(count)
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: count > 99 ? 12 : 14, weight: .semibold),
                .foregroundColor: UIColor.white,
            ]
            let textSize = text.size(withAttributes: attributes)
            text.draw(
                at: CGPoint(x: rect.midX - textSize.width / 2, y: rect.midY - textSize.height / 2),
                withAttributes: attributes
            )
        }
    }
}
