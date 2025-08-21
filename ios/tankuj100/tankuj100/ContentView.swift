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

    var body: some View {
        Map(initialPosition: .region(viewModel.currentRegion), interactionModes: .all, selection: $selectedBenzinka) {
            ForEach(viewModel.annotations) { item in
                Marker(
                    item.gasStation.brandName ?? "",
                    systemImage: "fuelpump",
                    coordinate: item.coordinate
                )
                .tint(.blue)
                .annotationTitles(.automatic)
                .tag(item)
            }
            ForEach(viewModel.clusters) { item in
                Marker(
                    "\(item.count)",
                    systemImage: "square.3.layers.3d",
                    coordinate: item.coordinate
                )
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
    }
}

#Preview {
    ContentView()
}
