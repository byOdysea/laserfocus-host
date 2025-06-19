//
//  Item.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
