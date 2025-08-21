//
//  GasStationDetail.swift
//  tankuj100
//
//  Created by Roman Martínek on 21.08.2025.
//

import SwiftUI

struct GasStationDetailView: View {
    
    @State private var benzinkaDetailResult: Result<GasStationDetail, Error>? = nil
    @State private var currentPricesResult: Result<[FuelPrice], Error>? = nil
    @State private var error: CustomError?
    
    @Binding public var selectedBenzinka: BenzinkaAnnotation?
    
    var body: some View {
        NavigationView {
            List {
                switch benzinkaDetailResult {
                case .success(let response):
                    Text("\(response.brandName ?? "")")
                        .font(.title)
                        .bold()
                    
                    HStack {
                        Text("\(response.city), \(response.address), \(response.zip)")
                            .foregroundStyle(.blue)
                            .font(.footnote)
                            .underline()
                            .onTapGesture {
                                self.error = GeneralViewModel.shared.openAppleMaps(latitude: response.lat, longitude: response.lon, name: response.brandName ?? "")
                            }
                        Spacer()
                    }
                    
                    Section(content: {
                        switch currentPricesResult {
                        case .success(let pricesResponse):
                            ForEach(pricesResponse) { item in
                                HStack {
                                    Text(item.name)
                                    Spacer()
                                    Text(item.price.formatted(.currency(code: "CZK")))
                                        .bold()
                                }
                            }
                        case .failure(let failure):
                            Text(failure.localizedDescription)
                        case nil:
                            ProgressView()
                        }
                    }, header: {
                        Text("Ceny paliv")
                            .bold()
                            .font(.title3)
                    })
                    
                    
                    Section(content: {
                        if let phone = response.phone {
                            HStack {
                                Text("Telefon")
                                Spacer()
                                Text(phone)
                                    .underline()
                                    .foregroundStyle(.blue)
                            }
                        }
                        if let worktime = response.worktime, !worktime.isEmpty {
                            HStack {
                                Text("Pracovní doba")
                                Spacer()
                                Text(worktime)
                            }
                        }
                        if let services = response.services, !services.isEmpty {
                            HStack {
                                Text("Služby")
                                Spacer()
                                Text(services)
                                    .underline()
                                    .foregroundStyle(.blue)
                            }
                        }
                        if let payments = response.payments, !payments.isEmpty {
                            HStack {
                                Text("Možnosti platby")
                                Spacer()
                                Text(payments)
                                    .underline()
                                    .foregroundStyle(.blue)
                            }
                        }
                    }, header: {
                        Text("Další informace")
                            .bold()
                            .font(.title3)
                    })
                    
                case .failure(let failure):
                    Text(failure.localizedDescription)
                case nil:
                    ProgressView()
                }
            }
            .errorAlert($error)
            .onAppear {
                Task {
                    if let selectedBenzinka = selectedBenzinka {
                        self.benzinkaDetailResult = await NetworkClient().gasStationDetail(id: selectedBenzinka.gasStation.id.description)
                        self.currentPricesResult = await NetworkClient().getCurrentPrices(id: selectedBenzinka.gasStation.id.description)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading, content: {
                    Button {
                        withAnimation {
                            self.selectedBenzinka = nil
                        }
                    } label: {
                        Image(systemName: "xmark")
                    }
                })
                ToolbarItem(placement: .topBarTrailing, content: {
                    Button {
                        //přidat do oblíbených?
                    } label: {
                        Image(systemName: "heart")
                    }
                })
                ToolbarItem(placement: .topBarTrailing, content: {
                    Button {
                        //TOOD: share
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                })
            }
        }
    }
}

#Preview {
    GasStationDetailView(selectedBenzinka: .constant(.init(coordinate: .init(latitude: 1, longitude: 1), gasStation: .init(id: 5085, lat: 1, lon: 1, brandName: "název benzínky", brandId: 1))))
}
