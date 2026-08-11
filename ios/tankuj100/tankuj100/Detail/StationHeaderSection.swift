import SwiftUI

struct StationHeaderSection: View {
    let detail: GasStationDetail
    let distanceText: String?
    let rating: RatingSummary
    @Binding var error: CustomError?

    private var title: String {
        for candidate in [detail.brandName, detail.name] {
            if let candidate, !candidate.isEmpty { return candidate }
        }
        return "Benzínka"
    }

    private var addressText: String? {
        let parts = [detail.address, detail.city, detail.zip]
            .compactMap { $0 }
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    var body: some View {
        Section {
            HStack(spacing: 14) {
                BrandLogoView(brandName: detail.brandName)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.title2).bold()
                    HStack(spacing: 10) {
                        if let distanceText {
                            Label(distanceText, systemImage: "location.fill")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if rating.count > 0 {
                            HStack(spacing: 4) {
                                StarsView(rating: rating.average ?? 0, size: 10)
                                Text("\(rating.averageText)")
                                    .font(.footnote.weight(.medium))
                                    .monospacedDigit()
                            }
                        }
                    }
                }
                Spacer()
            }

            if let addressText {
                Text(addressText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                error = MapsLauncher.openAppleMaps(
                    latitude: detail.lat, longitude: detail.lon,
                    name: detail.brandName ?? "")
            } label: {
                Text("Navigovat")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }
}
