//
//  GeneralViewModel.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.08.2025.
//

import Foundation
import UIKit

class GeneralViewModel {
    
    static let shared = GeneralViewModel()
    
    private init() {}
    
    public func openAppleMaps(latitude: Double, longitude: Double, name: String) -> CustomError? {
        guard let url = URL(string: "http://maps.apple.com/?ll=\(latitude),\(longitude)&q=\(name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") else {
            return CustomError.defaultError(message: "Chyba: Neplatná URL pro mapy")
        }

        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
            return nil
        } else {
            return CustomError.defaultError(message: "Chyba: Nelze otevřít Apple Mapy.")
        }
    }
    
}
