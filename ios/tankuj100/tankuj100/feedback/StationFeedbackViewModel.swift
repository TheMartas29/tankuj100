//
//  StationFeedbackViewModel.swift
//  tankuj100
//
//  Stav feedbacku jedné benzínky – načítání, hlasování, hodnocení, hlášení.
//

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

    /// Probíhá zápis (hlasování/hodnocení) – blokujeme tlačítka, ať se nic neposílá dvakrát.
    @Published private(set) var isSubmitting = false

    /// Krátká potvrzovací hláška („Díky za hodnocení!“).
    @Published var successMessage: String?

    /// Chyba k zobrazení v alertu (sdílíme mechanismus s ostatními obrazovkami).
    @Published var error: CustomError?

    let stationId: Int
    private let client = NetworkClient()

    init(stationId: Int) {
        self.stationId = stationId
    }

    // MARK: - Odvozené hodnoty pro view

    var rating: RatingSummary { feedback?.rating ?? .empty }
    var fuel: FuelSummary { feedback?.fuel ?? .empty }
    var reviews: [StationReview] { feedback?.reviews ?? [] }
    var myReview: MyReview? { feedback?.mine?.review }
    var myFuelKind: FuelKind? { feedback?.mine?.fuelKind }
    var openReports: Int { feedback?.openReports ?? 0 }

    // MARK: - Načtení

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

    // MARK: - Hlasování o typu benzínu

    func vote(_ kind: FuelKind) async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        switch await client.submitFuelVote(stationId: stationId, kind: kind) {
        case .success(let response):
            await reload()
            successMessage = response.message ?? "Díky, tvoje info pomůže ostatním."
        case .failure(let failure):
            error = customError(from: failure)
        }
    }

    // MARK: - Hodnocení

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

    // MARK: - Hlášení nesrovnalosti

    func submitReport(
        type: ReportType,
        fuelName: String?,
        claimedPrice: Double?,
        note: String
    ) async -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        defer { isSubmitting = false }

        let result = await client.submitReport(
            stationId: stationId,
            type: type,
            fuelName: fuelName,
            claimedPrice: claimedPrice,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines)
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

    // MARK: - Pomůcky

    private func customError(from failure: Error) -> CustomError {
        (failure as? CustomError) ?? .defaultError(message: failure.localizedDescription)
    }
}
