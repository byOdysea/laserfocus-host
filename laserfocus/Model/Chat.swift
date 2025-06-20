//
//  Chat.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import Foundation
import SwiftData

struct Message: Codable {
    var role: String
    var content: String
    var timestamp: Date
    
    init(role: String, content: String, timestamp: Date = Date()) {
        self.role = role
        self.content = content
        self.timestamp = timestamp
    }
}

@Model
final class Chat {
    var id: UUID
    var title: String
    var timestamp: Date
    var messages: [Message]
    
    init(title: String = "New Chat", timestamp: Date = Date(), messages: [Message] = []) {
        self.id = UUID()
        self.title = title
        self.timestamp = timestamp
        self.messages = messages
    }
}
