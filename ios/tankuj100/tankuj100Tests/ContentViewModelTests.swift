//
//  tankuj100Tests.swift
//  tankuj100Tests
//
//  Created by Roman Martínek on 23.10.2025.
//

import Testing
@testable import tankuj100
import MapKit

struct ContentViewModelTests {

    @Test func openMenu_shouldShowMenuSheet() async throws {
        let viewModel = ContentViewModel()
        viewModel.openMenu()
        #expect(viewModel.showMenuSheet == true)
    }

    @Test func openAddBenzinka_shouldShowAddBenzinkaSheet() async throws {
        let viewModel = ContentViewModel()
        viewModel.openAddBenzinka()
        #expect(viewModel.showAddBenzinkaSheet == true)
    }

    @Test func closeSheets_shouldHideAllSheets() async throws {
        let viewModel = ContentViewModel()
        viewModel.showMenuSheet = true
        viewModel.showAddBenzinkaSheet = true

        viewModel.closeSheets()

        #expect(viewModel.showMenuSheet == false)
        #expect(viewModel.showAddBenzinkaSheet == false)
    }
}
