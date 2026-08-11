import Foundation

final class FavoritesStore: ObservableObject {

    @Published private(set) var ids: Set<Int>

    private let key = "favoriteStationIDs"

    init() {
        ids = Set(UserDefaults.standard.array(forKey: key) as? [Int] ?? [])
    }

    func contains(_ id: Int) -> Bool {
        ids.contains(id)
    }

    func toggle(_ id: Int) {
        if ids.contains(id) {
            ids.remove(id)
        } else {
            ids.insert(id)
        }
        UserDefaults.standard.set(Array(ids), forKey: key)
    }
}
