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
    
    @State private var viewModel = MapViewModel()
    @State private var isSheetPresented = true
    @State private var selectedBenzinka: BenzinkaAnnotation?
    @State private var showMenuSheet: Bool = false
    @State private var showAddBenzinkaSheet: Bool = false

    var body: some View {
        ZStack {
            Map(initialPosition: .region(viewModel.currentRegion), interactionModes: .all, selection: $selectedBenzinka) {
                ForEach(viewModel.annotations) { item in
                    Marker(
                        item.gasStation.brandName ?? "",
                        systemImage: "fuelpump",
                        coordinate: item.coordinate
                    )
                    .tint(.orange)
                    .annotationTitles(.automatic)
                    .tag(item)
                }
                ForEach(viewModel.clusters) { item in
                    Marker("", monogram: Text("\(item.count)"), coordinate: item.coordinate)
                        .tint(.orange.opacity(0.5))
                }
            }
            .sheet(item: $selectedBenzinka, content: { _ in
                GasStationDetailView(selectedBenzinka: $selectedBenzinka)
            })
            .readSize(onChange: { newValue in
                viewModel.mapSize = newValue
            })
            .onMapCameraChange { context in
                viewModel.currentRegion = context.region
            }
            .onMapCameraChange(frequency: .onEnd) { context in
                Task.detached { await viewModel.reloadAnnotations() }
            }
            .onAppear {
                viewModel.setup()
                Task.detached { await viewModel.load() }
            }
            
            VStack {
                Spacer()
                HStack {
                    if #available(iOS 26.0, *) {
                        GlassEffectContainer(spacing: 30) {
                            VStack(spacing: 30) {
                                Button {
                                    self.showAddBenzinkaSheet = true
                                } label: {
                                    Image(systemName: "plus")
                                        .tint(.orange)
                                        .frame(width: 60, height: 60)
                                        .font(.system(size: 30))
                                        .fontWeight(.semibold)
                                }
                                .glassEffect(.clear.tint(.yellow.opacity(0.3)))
                                .glassEffectTransition(.matchedGeometry)

                                Button {
                                    self.showMenuSheet = true
                                } label: {
                                    Image(systemName: "line.3.horizontal")
                                        .tint(.orange)
                                        .frame(width: 60, height: 60)
                                        .font(.system(size: 30))
                                        .fontWeight(.semibold)
                                }
                                .glassEffect(.clear.tint(.yellow.opacity(0.3)))
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
        .sheet(isPresented: $showMenuSheet, content: {
            List {
                Button {
                    //TODO: doimplementovat
                } label: {
                    HStack {
                        Image(systemName: "info.circle")
                            .bold()
                            .foregroundStyle(.orange)
                            .font(.title2)
                        Text("O aplikaci")
                            .bold()
                            .foregroundStyle(.black)
                            .font(.title2)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundStyle(.gray)
                            .fontWeight(.bold)
                    }
                }
                .listRowBackground(EmptyView())
                
                Button {
                    //TODO: doimplementovat
                } label: {
                    HStack {
                        Image(systemName: "hand.thumbsup")
                            .bold()
                            .foregroundStyle(.orange)
                            .font(.title2)
                        Text("Hodnotit aplikaci")
                            .bold()
                            .foregroundStyle(.black)
                            .font(.title2)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundStyle(.gray)
                            .fontWeight(.bold)
                    }
                }
                .listRowBackground(EmptyView())
                
                Button {
                    //TODO: doimplementovat
                } label: {
                    HStack {
                        Image(systemName: "person.2")
                            .bold()
                            .foregroundStyle(.orange)
                            .font(.title2)
                        Text("Doporučit přátelům")
                            .bold()
                            .foregroundStyle(.black)
                            .font(.title2)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundStyle(.gray)
                            .fontWeight(.bold)
                    }
                }
                .listRowBackground(EmptyView())
            }
            .scrollContentBackground(.hidden)
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        })
        .sheet(isPresented: $showAddBenzinkaSheet, content: {
            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    HStack {
                        Text("Přidání nové benzínky")
                            .font(.title)
                            .fontWeight(.bold)
                        Spacer()
                    }
                    .padding(.horizontal, 30)
                    
                    Text("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse quis justo semper, sodales ipsum id, fringilla nunc. In malesuada aliquet lacinia. Proin condimentum velit sollicitudin mauris blandit, id accumsan elit condimentum. Donec faucibus felis non cursus bibendum. Suspendisse eu erat massa. Donec condimentum tortor ut mi malesuada, in ultricies velit lobortis. Integer sed placerat dui. Proin eget convallis tellus, aliquet consequat odio.")
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
                                .foregroundColor(.white)
                                .frame(height: 38)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(.orange.opacity(0.8))
                                .cornerRadius(50)
                                .padding(5)
                        }
                        .padding(.horizontal, 20)

                    }
                }
                .padding(.top, 40)
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        })
    }
}

#Preview {
    ContentView()
}
