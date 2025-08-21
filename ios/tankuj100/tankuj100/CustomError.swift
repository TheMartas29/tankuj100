//
//  CustomError.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.08.2025.
//


import Foundation

enum CustomError: Swift.Error {
    case defaultError(message: String = "Něco se nepovedlo, zkuste to prosím později.")
    case parseError
    case widgetAlreadyAdded
    case ciselnikError
    case fileError
    case unknownError
    case authenticationError
    case cancelled
}

extension CustomError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .defaultError(let message):
            return NSLocalizedString(message, comment: "")
        case .parseError:
            return NSLocalizedString("Odpověď serveru se nepodařilo zpracovat", comment: "")
        case .widgetAlreadyAdded:
            return NSLocalizedString("Widget už byl připnut", comment: "")
        case .ciselnikError:
            return NSLocalizedString("Nepodařilo se zpracovat data", comment: "")
        case .fileError:
            return NSLocalizedString("Soubor se nepodařilo zpracovat", comment: "")
        case .unknownError:
            return NSLocalizedString("Vyskytla se neznámá chyba", comment: "")
        case .authenticationError:
            return NSLocalizedString("Neexistuje platné dlouhodobé přihlášení", comment: "")
        case .cancelled:
            return NSLocalizedString("Request byl zrušen", comment: "")
        }
    }
}

extension CustomError: Equatable {
    static func == (lhs: CustomError, rhs: CustomError) -> Bool {
        switch (lhs, rhs) {
        case (.defaultError(let lhsMsg), .defaultError(let rhsMsg)):
            return lhsMsg == rhsMsg
        case (.parseError, .parseError),
             (.widgetAlreadyAdded, .widgetAlreadyAdded),
             (.ciselnikError, .ciselnikError),
             (.fileError, .fileError),
             (.unknownError, .unknownError),
             (.cancelled, .cancelled),
             (.authenticationError, .authenticationError):
            return true
        default:
            return false
        }
    }
}
