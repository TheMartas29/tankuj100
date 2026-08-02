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
                            .foregroundStyle(.accent)
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
                                    Text(item.price.formatted(.currency(code: item.currency)))
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
                        if let phone = response.phone, !phone.isEmpty {
                            HStack {
                                Text("Telefon")
                                Spacer()
                                if let telURL = URL(string: "tel://\(phone.filter { !$0.isWhitespace })") {
                                    Link(phone, destination: telURL)
                                        .foregroundStyle(.accent)
                                } else {
                                    Text(phone)
                                }
                            }
                        }
                        if let worktime = response.worktime, !worktime.isEmpty {
                            HStack {
                                Text("Pracovní doba")
                                Spacer()
                                Text(worktime)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if let services = response.services, !services.isEmpty {
                            HStack(alignment: .top) {
                                Text("Služby")
                                Spacer()
                                Text(services)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                        if let payments = response.payments, !payments.isEmpty {
                            HStack(alignment: .top) {
                                Text("Možnosti platby")
                                Spacer()
                                Text(payments)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.trailing)
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
                        self.currentPricesResult = await NetworkClient().getCurrentPrices(id: selectedBenzinka.gasStation.stationId.description)
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
                 
                /** TODO: doimplementovat
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
                 */
            }
        }
    }
}

#Preview {
    GasStationDetailView(selectedBenzinka: .constant(.init(coordinate: .init(latitude: 1, longitude: 1), gasStation: .init(id: 100, lat: 1, lon: 1, brandName: "název benzínky", brandId: 1, stationId: 5085))))
}
