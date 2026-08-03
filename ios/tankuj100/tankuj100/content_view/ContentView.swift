//
//  ContentView.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.8.2025.
//

import MapKit
import SwiftUI
import Foundation
import ClusterMap

struct ContentView: View {

    @StateObject private var viewModel = ContentViewModel()

    /// Odkaz sdílený přes "Doporučit přátelům". Až bude appka na App Store, doplň App Store URL.
    private let shareURL = URL(string: "https://tankuj100.cz")!

    var body: some View {
        ZStack {
            Map(initialPosition: .region(viewModel.currentRegion), interactionModes: .all, selection: $viewModel.selectedBenzinka) {
                ForEach(viewModel.annotations) { item in
                    Annotation(
                        item.gasStation.brandName ?? "",
                        coordinate: item.coordinate
                    ) {
                        StationMarkerView(station: item.gasStation)
                    }
                    .tag(item)
                }
                ForEach(viewModel.clusters) { item in
                    Marker("", monogram: Text("\(item.count)"), coordinate: item.coordinate)
                        .tint(.accent.opacity(0.5))
                }
                UserAnnotation()
            }
            .mapControls {
                MapUserLocationButton()
                MapCompass()
            }
            .sheet(item: $viewModel.selectedBenzinka, content: { annotation in
                NavigationStack {
                    GasStationDetailView(
                        gasStation: annotation.gasStation,
                        userLocation: viewModel.userLocation,
                        favorites: viewModel.favorites,
                        onClose: { viewModel.selectedBenzinka = nil }
                    )
                }
            })
            .readSize(onChange: { newValue in viewModel.mapSizeChanged(newValue) })
            .onMapCameraChange { context in
                viewModel.cameraRegionChanged(context.region)
            }
            .onMapCameraChange(frequency: .onEnd) { _ in
                viewModel.cameraRegionChangeEnded()
            }
            .onAppear { viewModel.onAppear() }
            
            VStack {
                Spacer()
                HStack {
                    if #available(iOS 26.0, *) {
                        GlassEffectContainer(spacing: 18) {
                            VStack(spacing: 18) {
                                Button {
                                    viewModel.openStationsList()
                                } label: {
                                    Image(systemName: "list.bullet")
                                        .tint(.accent)
                                        .frame(width: 60, height: 60)
                                        .font(.system(size: 26))
                                        .fontWeight(.semibold)
                                }
                                .glassEffect(.clear.tint(.accent.opacity(0.2)))

                                Button {
                                    viewModel.openMenu()
                                } label: {
                                    Image(systemName: "line.3.horizontal")
                                        .tint(.accent)
                                        .frame(width: 60, height: 60)
                                        .font(.system(size: 30))
                                        .fontWeight(.semibold)
                                }
                                .glassEffect(.clear.tint(.accent.opacity(0.2)))
                            }
                        }
                        .shadow(radius: 3)
                    }
                    Spacer()
                }
                .padding(.bottom, 12)
                .padding(.leading, 20)
            }
        }
        .sheet(isPresented: $viewModel.showMenuSheet, content: {
            NavigationStack {
                List {
                    NavigationLink {
                        AboutView()
                    } label: {
                        MenuRow(icon: "info.circle", title: "O aplikaci")
                    }

                    ShareLink(item: shareURL) {
                        MenuRow(icon: "person.2", title: "Doporučit přátelům")
                    }
                    .buttonStyle(.plain)
                }
                .navigationTitle("Menu")
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        })
        .sheet(isPresented: $viewModel.showStationsList) {
            StationsListView(
                stations: viewModel.allStations,
                userLocation: viewModel.userLocation,
                favorites: viewModel.favorites
            )
        }
        .sheet(isPresented: $viewModel.showAddBenzinkaSheet, content: {
            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    HStack {
                        Text("Přidání nové benzínky")
                            .font(.title)
                            .fontWeight(.bold)
                        Spacer()
                    }
                    .padding(.horizontal, 30)
                    
                    Text("Tato funkce bude k dispozici v další verzi aplikace.")
                        .font(.headline)
                        .fontWeight(.regular)
                        .padding(.horizontal, 30)
                    
                    if #available(iOS 26.0, *) {
                        Button {
                            //TODO: doimplementovat
                        } label: {
                            Text("Pokračovat")
                                .font(.title3)
                                .fontWeight(.bold)
                                .foregroundColor(Color.gray)
                                .frame(height: 38)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(.gray.opacity(0.3))
                                .cornerRadius(50)
                                .padding(5)
                        }
                        .padding(.horizontal, 20)
                        .disabled(true)

                    }
                }
                .padding(.top, 40)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        })
        .errorAlert($viewModel.error)
    }
}

/// Řádek v menu se sjednoceným vzhledem (ikona červená, text černý/adaptivní).
private struct MenuRow: View {
    let icon: String
    let title: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .bold()
                .foregroundStyle(.accent)
                .font(.title2)
            Text(title)
                .bold()
                .foregroundStyle(.primary)
                .font(.title2)
            Spacer()
        }
    }
}

/// Obrazovka "O aplikaci" – pushuje se do menu NavigationStacku.
struct AboutView: View {
    private var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Image(systemName: "fuelpump.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.accent)
                    Text("tankuj100")
                        .font(.title).bold()
                    Text("Verze \(version)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
            }

            Section("O co jde") {
                Text("Najdi benzínky, které nabízejí prémiové palivo – ideální pro starší vozy, kterým vadí vyšší podíl etanolu v běžném palivu.")
                    .font(.subheadline)
            }
        }
        .navigationTitle("O aplikaci")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Marker na mapě jako "mini náhled" – logo značky v bílém kolečku s pointerem.
/// U benzínek s potvrzeným E5 přidáme zelenou fajfku, ať jsou na mapě hned vidět.
private struct StationMarkerView: View {
    let station: GasStation

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topTrailing) {
                ZStack {
                    Circle()
                        .fill(.white)
                        .overlay(Circle().stroke(station.hasConfirmedE5 ? Color.green : Color.accentColor, lineWidth: 1.5))
                        .shadow(radius: 1.5)
                    BrandLogo(brandName: station.brandName, size: 20)
                        .padding(3)
                }
                .frame(width: 30, height: 30)

                if station.hasConfirmedE5 {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.green, .white)
                        .offset(x: 3, y: -3)
                }
            }
            // špička pointeru dolů
            Image(systemName: "triangle.fill")
                .resizable()
                .rotationEffect(.degrees(180))
                .frame(width: 9, height: 6)
                .foregroundStyle(station.hasConfirmedE5 ? Color.green : Color.accentColor)
                .offset(y: -1.5)
        }
    }
}

/// Řádek seznamu benzínek (logo + značka + vzdálenost + hodnocení + odznak E5).
private struct StationRow: View {
    let station: GasStation
    var distance: CLLocationDistance?
    var isFavorite: Bool

    private var distanceText: String? {
        guard let distance else { return nil }
        return distance < 1000 ? "\(Int(distance)) m" : String(format: "%.1f km", distance / 1000)
    }

    var body: some View {
        HStack(spacing: 12) {
            BrandLogo(brandName: station.brandName, size: 34)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(station.brandName ?? "Benzínka").fontWeight(.medium)
                    if station.hasConfirmedE5 {
                        Text("E5")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(.green.opacity(0.18))
                            .foregroundStyle(.green)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
                HStack(spacing: 10) {
                    if let distanceText {
                        Label(distanceText, systemImage: "location.fill")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if let average = station.ratingAvg, let count = station.ratingCount, count > 0 {
                        HStack(spacing: 3) {
                            StarsView(rating: average, size: 9)
                            Text("(\(count))")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Spacer()
            if isFavorite {
                Image(systemName: "heart.fill").foregroundStyle(.accent).font(.footnote)
            }
        }
    }
}

/// Seznam benzínek – segment Nejbližší / Oblíbené, řazeno dle vzdálenosti.
struct StationsListView: View {
    let stations: [GasStation]
    var userLocation: CLLocation?
    @ObservedObject var favorites: FavoritesStore

    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .nearest

    enum Mode: String, CaseIterable {
        case nearest = "Nejbližší"
        case e5 = "S E5"
        case favorites = "Oblíbené"
    }

    private func distance(_ s: GasStation) -> CLLocationDistance? {
        guard let userLocation else { return nil }
        return userLocation.distance(from: CLLocation(latitude: s.lat, longitude: s.lon))
    }

    private var displayed: [GasStation] {
        var list: [GasStation]
        switch mode {
        case .favorites: list = stations.filter { favorites.contains($0.id) }
        case .e5: list = stations.filter(\.hasConfirmedE5)
        case .nearest: list = stations
        }
        if userLocation != nil {
            list.sort { (distance($0) ?? .greatestFiniteMagnitude) < (distance($1) ?? .greatestFiniteMagnitude) }
        }
        if mode == .nearest { list = Array(list.prefix(50)) }
        return list
    }

    var body: some View {
        NavigationStack {
            Group {
                if mode == .favorites && displayed.isEmpty {
                    ContentUnavailableView("Žádné oblíbené", systemImage: "heart",
                        description: Text("Přidej si benzínku do oblíbených srdíčkem v detailu."))
                } else if mode == .e5 && displayed.isEmpty {
                    ContentUnavailableView("Žádné potvrzené E5", systemImage: "checkmark.seal",
                        description: Text("Typ benzínu hlásí sami řidiči. Až u pumpy zkontroluj, co tam mají, a dej to vědět v detailu benzínky."))
                } else if mode == .nearest && userLocation == nil {
                    ContentUnavailableView("Poloha není dostupná", systemImage: "location.slash",
                        description: Text("Povol přístup k poloze pro seznam nejbližších benzínek."))
                } else {
                    List(displayed) { station in
                        NavigationLink(value: station) {
                            StationRow(station: station,
                                       distance: distance(station),
                                       isFavorite: favorites.contains(station.id))
                        }
                    }
                }
            }
            .navigationTitle("Benzínky")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: GasStation.self) { station in
                GasStationDetailView(gasStation: station, userLocation: userLocation, favorites: favorites)
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Picker("", selection: $mode) {
                        ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
