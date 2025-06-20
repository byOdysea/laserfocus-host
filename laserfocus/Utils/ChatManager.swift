//
//  ChatManager.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import Foundation
import SwiftData
import Combine

@MainActor
class ChatManager: ObservableObject {
    @Published var selectedChat: Chat?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    
    private let apiService = APIService.shared
    private var modelContext: ModelContext?
    
    func setModelContext(_ context: ModelContext) {
        self.modelContext = context
    }
    
    func createNewChat() -> Chat {
        guard let modelContext = modelContext else {
            fatalError("ModelContext not set")
        }
        
        let newChat = Chat(title: "New Chat")
        modelContext.insert(newChat)
        
        do {
            try modelContext.save()
        } catch {
            print("Error saving new chat: \(error)")
        }
        
        return newChat
    }
    
    func sendMessage(_ content: String, to chat: Chat) async {
        guard let modelContext = modelContext else {
            print("ModelContext not set")
            return
        }
        
        // Add user message
        let userMessage = Message(role: "user", content: content)
        chat.messages.append(userMessage)
        
        // Update chat title if it's the first message
        if chat.title == "New Chat" && !content.isEmpty {
            chat.title = String(content.prefix(50))
        }
        
        // Save user message
        do {
            try modelContext.save()
        } catch {
            print("Error saving user message: \(error)")
        }
        
        // Set loading state
        isLoading = true
        errorMessage = nil
        
        do {
            // Call API with existing thread_id if available
            let apiResponse = try await apiService.invokeAthena(message: content, threadId: chat.threadId)
            
            // Update chat's thread_id if not set
            if chat.threadId == nil {
                chat.threadId = apiResponse.thread_id
            }
            
            // Add AI response using only the message content
            let aiMessage = Message(role: "assistant", content: apiResponse.response)
            chat.messages.append(aiMessage)
            
            // Save AI message
            try modelContext.save()
            
        } catch {
            errorMessage = error.localizedDescription
            print("Error calling API: \(error)")
        }
        
        isLoading = false
    }
    
    func selectChat(_ chat: Chat) {
        selectedChat = chat
    }
    
    func findChatByThreadId(_ threadId: String) -> Chat? {
        guard let modelContext = modelContext else {
            return nil
        }
        
        let descriptor = FetchDescriptor<Chat>()
        do {
            let chats = try modelContext.fetch(descriptor)
            return chats.first { $0.threadId == threadId }
        } catch {
            print("Error fetching chats: \(error)")
            return nil
        }
    }
    
    func deleteChat(_ chat: Chat) {
        guard let modelContext = modelContext else {
            print("ModelContext not set")
            return
        }
        
        if selectedChat?.id == chat.id {
            selectedChat = nil
        }
        
        modelContext.delete(chat)
        
        do {
            try modelContext.save()
        } catch {
            print("Error deleting chat: \(error)")
        }
    }
} 