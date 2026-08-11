import SwiftUI

struct BrandLogoView: View {
    let brandName: String?
    var size: CGFloat = 46

    var body: some View {
        Group {
            if let asset = BrandLogos.assetName(for: brandName) {
                Image(asset)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "fuelpump.circle.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundColor(.accentColor)
            }
        }
        .frame(width: size, height: size)
    }
}
