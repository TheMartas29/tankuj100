//
//  tankuj100UITests.swift
//  tankuj100
//
//  Created by Roman Martínek on 23.10.2025.
//

import XCTest

final class tankuj100UITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    func testMenuButtonOpensMenuSheet() throws {
        // Najdi tlačítko menu podle system image (používá SF Symbol "line.3.horizontal")
        let menuButton = app.buttons["line.3.horizontal"]
        XCTAssertTrue(menuButton.waitForExistence(timeout: 3), "Menu button not found")

        // Klikni na něj
        menuButton.tap()

        // Ověř, že se objeví sheet s textem "O aplikaci"
        let aboutButton = app.buttons["O aplikaci"]
        XCTAssertTrue(aboutButton.waitForExistence(timeout: 3), "Menu sheet did not appear")
    }

    func testAddButtonShowsAddSheet() throws {
        let addButton = app.buttons["plus"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 3), "Add button not found")

        addButton.tap()

        // Ověř, že se objeví text
        let label = app.staticTexts["Přidání nové benzínky"]
        XCTAssertTrue(label.waitForExistence(timeout: 3))
    }
}
