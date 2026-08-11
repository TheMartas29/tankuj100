import Foundation
import Security
import UIKit

/// Proč Keychain a ne `UserDefaults`: hodnota v UserDefaults se smaže spolu s aplikací,
/// takže stačilo appku přeinstalovat a duplicitní hodnocení prošlo. Keychain přežije
/// odinstalaci, takže obcházení stojí aspoň reset zařízení.
///
/// `identifierForVendor` je jen záložní zdroj náhodnosti při prvním spuštění – skládat
/// vlastní identifikátor z vlastností zařízení porušuje App Store Guideline 5.1.1.
enum DeviceIdentity {

    private static let service = "cz.silkroad.tankuj100"
    private static let account = "anonymousDeviceID"
    private static let legacyDefaultsKey = "anonymousDeviceID"

    static let current: String = {
        if let stored = readFromKeychain(), stored.count >= 8 {
            return stored
        }

        // Migrace: kdo appku už má, drží ID v UserDefaults. Přesuneme ho, jinak by
        // po aktualizaci ztratil možnost upravit vlastní hodnocení.
        if let legacy = UserDefaults.standard.string(forKey: legacyDefaultsKey), legacy.count >= 8 {
            saveToKeychain(legacy)
            return legacy
        }

        let fresh = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        saveToKeychain(fresh)
        UserDefaults.standard.set(fresh, forKey: legacyDefaultsKey)
        return fresh
    }()

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    private static func readFromKeychain() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func saveToKeychain(_ value: String) {
        guard let data = value.data(using: .utf8) else { return }

        var query = baseQuery()
        // Bez zámku obrazovky se ke Keychainu nedostaneme; `AfterFirstUnlock` stačí,
        // aby ID bylo k dispozici i když appka běží na pozadí. Zálohy na jiné zařízení
        // schválně nepřenášíme (`ThisDeviceOnly`) – je to identita zařízení, ne účtu.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        SecItemAdd(query as CFDictionary, nil)
    }
}
