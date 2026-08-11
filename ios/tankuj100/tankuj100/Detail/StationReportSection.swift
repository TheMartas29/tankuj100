import SwiftUI

struct StationReportSection: View {
    let openReports: Int
    let onReport: () -> Void

    var body: some View {
        Section {
            Button(action: onReport) {
                Label("Nahlásit nesrovnalost", systemImage: "exclamationmark.bubble")
                    .foregroundColor(.accentColor)
            }
        } footer: {
            if openReports > 0 {
                Text("U téhle benzínky už řešíme \(openReports) hlášení.")
            } else {
                Text("Nesedí paliva, otevírací doba nebo poloha? Dejte nám vědět a opravíme to.")
            }
        }
    }
}
