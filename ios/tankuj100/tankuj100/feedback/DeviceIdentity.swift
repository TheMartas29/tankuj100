//
//  DeviceIdentity.swift
//  tankuj100
//
//  Anonymní identifikátor zařízení pro hodnocení a hlášení.
//

import Foundation

/// Náhodné ID, kterým server pozná, že hodnocení patří tomuhle zařízení
/// (aby šlo vlastní hodnocení upravit a aby jeden telefon nehlasoval stokrát).
///
/// Záměrně **není** vázané na uživatele ani na Apple ID – je to jen UUID v UserDefaults.
/// Po smazání aplikace se vygeneruje nové, což je z hlediska soukromí správně: nikde
/// neukládáme nic, čím by se dal uživatel zpětně identifikovat.
enum DeviceIdentity {

    private static let key = "anonymousDeviceID"

    static let current: String = {
        if let existing = UserDefaults.standard.string(forKey: key), existing.count >= 8 {
            return existing
        }
        let fresh = UUID().uuidString
        UserDefaults.standard.set(fresh, forKey: key)
        return fresh
    }()
}
