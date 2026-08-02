//
//  ContentView.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.8.2025.
//

import MapKit
import SwiftUI
import Foundation
import StoreKit
import ClusterMap

struct ContentView: View {

    @StateObject private var viewModel = ContentViewModel()
    @Environment(\.requestReview) private var requestReview
    @State private var showAbout = false

    /// Odkaz sdílený přes "Doporučit přátelům". Až bude appka na App Store, doplň App Store URL.
    private let shareURL = URL(string: "https://tankuj100.cz")!

    var body: some View {
        ZStack {
            Map(initialPosition: .region(viewModel.currentRegion), interactionModes: .all, selection: $viewModel.selectedBenzinka) {
                ForEach(viewModel.annotations) { item in
                    Marker(
                        item.gasStation.brandName ?? "",
                        systemImage: "fuelpump",
                        coordinate: item.coordinate
                    )
                    .tint(.accent)
                    .annotationTitles(.automatic)
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
            .sheet(item: $viewModel.selectedBenzinka, content: { _ in
                GasStationDetailView(selectedBenzinka: $viewModel.selectedBenzinka)
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
                        GlassEffectContainer(spacing: 30) {
                            VStack(spacing: 30) {
                                Button {
                                    viewModel.openAddBenzinka()
                                } label: {
                                    Image(systemName: "plus")
                                        .tint(.accent)
                                        .frame(width: 60, height: 60)
                                        .font(.system(size: 30))
                                        .fontWeight(.semibold)
                                }
                                .glassEffect(.clear.tint(.accent.opacity(0.2)))
                                .glassEffectTransition(.matchedGeometry)

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
                                .offset(x: 0.0, y: -30.0)
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
            List {
                Button {
                    showAbout = true
                } label: {
                    MenuRow(icon: "info.circle", title: "O aplikaci")
                }

                Button {
                    viewModel.closeSheets()
                    requestReview()
                } label: {
                    MenuRow(icon: "hand.thumbsup", title: "Hodnotit aplikaci")
                }

                ShareLink(item: shareURL) {
                    MenuRow(icon: "person.2", title: "Doporučit přátelům")
                }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        })
        .sheet(isPresented: $showAbout) {
            AboutView()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
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

/// Řádek v menu se sjednoceným vzhledem (ikona + název + šipka).
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
            Image(systemName: "chevron.right")
                .foregroundStyle(.gray)
                .fontWeight(.bold)
        }
    }
}

/// Obrazovka "O aplikaci".
struct AboutView: View {
    @Environment(\.dismiss) private var dismiss

    private var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        NavigationStack {
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Hotovo") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
