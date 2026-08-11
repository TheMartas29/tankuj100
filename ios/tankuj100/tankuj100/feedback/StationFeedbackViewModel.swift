import Foundation
import SwiftUI

@MainActor
final class StationFeedbackViewModel: ObservableObject {

    enum LoadState: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .loading
    @Published private(set) var feedback: StationFeedback?
    @Published private(set) var isSubmitting = false
    @Published var successMessage: String?
    @Published var error: CustomError?

    let stationId: Int
    private let client = APIClient.shared

    init(stationId: Int) {
        self.stationId = stationId
    }

    var rating: RatingSummary { feedback?.rating ?? .empty }
    /// Hlasy o palivu se uživateli neukazují (dokud jich není dost, byly by
    /// zavádějící) – držíme je tu pro chvíli, až se odznak zapne.
    var fuel: FuelSummary { feedback.flatMap(\.fuel) ?? .empty }
    var reviews: [StationReview] { feedback?.reviews ?? [] }
    var myReview: MyReview? { feedback?.mine?.review }
    var myFuelKind: FuelKind? { feedback?.mine?.fuelKind }
    var openReports: Int { feedback?.openReports ?? 0 }

    func load() async {
        if feedback == nil { state = .loading }
        switch await client.stationFeedback(stationId: stationId) {
        case .success(let value):
            feedback = value
            state = .loaded
        case .failure(let failure):
            // Když už něco máme, necháme to na obrazovce a chybu nevnucujeme.
            state = feedback == nil ? .failed(failure.localizedDescription) : .loaded
        }
    }

    /// Znovu načte data, ale bez blikání „Načítám…“ (po zápisu).
    private func reload() async {
        if case .success(let value) = await client.stationFeedback(stationId: stationId) {
            feedback = value
        }
    }

    func vote(_ kind: FuelKind) async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        switch await client.submitFuelVote(stationId: stationId, kind: kind) {
        case .success(let response):
            await reload()
            successMessage = response.message ?? "Díky, vaše info pomůže ostatním."
        case .failure(let failure):
            error = customError(from: failure)
        }
    }

    /// Vrací true při úspěchu, aby si sheet mohl sám zavřít.
    func submitReview(rating: Int, comment: String, author: String) async -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        defer { isSubmitting = false }

        let result = await client.submitReview(
            stationId: stationId,
            rating: rating,
            comment: comment.trimmingCharacters(in: .whitespacesAndNewlines),
            author: author.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        switch result {
        case .success(let response):
            await reload()
            successMessage = response.message ?? "Díky za hodnocení!"
            return true
        case .failure(let failure):
            error = customError(from: failure)
            return false
        }
    }

    func deleteMyReview() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        switch await client.deleteMyReview(stationId: stationId) {
        case .success:
            await reload()
            successMessage = "Hodnocení smazáno."
        case .failure(let failure):
            error = customError(from: failure)
        }
    }

    func submitReport(
        type: ReportType,
        fuelName: String?,
        note: String,
        reviewId: Int? = nil
    ) async -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        defer { isSubmitting = false }

        let result = await client.submitReport(
            stationId: stationId,
            type: type,
            fuelName: fuelName,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines),
            reviewId: reviewId
        )

        switch result {
        case .success(let response):
            await reload()
            successMessage = response.message ?? "Díky! Hlášení jsme přijali."
            return true
        case .failure(let failure):
            error = customError(from: failure)
            return false
        }
    }

    func reportReview(_ review: StationReview) async {
        _ = await submitReport(
            type: .content,
            fuelName: nil,
            note: "",
            reviewId: review.id
        )
    }

    private func customError(from failure: Error) -> CustomError {
        (failure as? CustomError) ?? .defaultError(message: failure.localizedDescription)
    }
}
