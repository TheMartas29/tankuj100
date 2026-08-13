import SwiftUI

struct FuelReportView: View {
    let report: FuelReport

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: report.symbol)
                .font(.system(size: 17))
                .foregroundColor(report.tint)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 3) {
                Text(report.title)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(report.detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(report.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
    }
}
