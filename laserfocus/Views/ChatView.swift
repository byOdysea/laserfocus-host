//
//  ChatView.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import SwiftUI
import SwiftData
import AppKit
import Combine

struct ChatView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.openWindow) private var openWindow
    @EnvironmentObject private var windowManager: WindowManager
    @EnvironmentObject private var chatManager: ChatManager
    @Query(sort: \Chat.timestamp, order: .reverse) private var chats: [Chat]

    var body: some View {
        NavigationSplitView {
            // Sidebar with chat list
            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack {
                    Text("Chats")
                        .font(.headline)
                        .foregroundColor(.primary)
                    Spacer()
                    Button(action: createNewChat) {
                        Image(systemName: "plus")
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("New Chat")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                
                Divider()
                
                // Chat list
                List(chats, id: \.id, selection: $chatManager.selectedChat) { chat in
                    ChatListItem(chat: chat)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                }
                .listStyle(.sidebar)
                .scrollContentBackground(.hidden)
            }
            .navigationSplitViewColumnWidth(min: 240, ideal: 280)
            .background(Color(NSColor.controlBackgroundColor))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Open Input Window") {
                        windowManager.createSecondaryWindow()
                    }
                }
            }
        } detail: {
            // Main chat area
            if let selectedChat = chatManager.selectedChat {
                ChatDetailView(chat: selectedChat)
            } else {
                ChatEmptyState()
            }
        }
        .onAppear {
            chatManager.setModelContext(modelContext)
            // Select the first chat if available and none is selected
            if chatManager.selectedChat == nil && !chats.isEmpty {
                chatManager.selectChat(chats.first!)
            }
            // Provide ChatManager to WindowManager so it can create secondary window
            windowManager.setChatManager(chatManager)
        }
        .background(
            WindowAccessor(windowType: .main, windowManager: windowManager)
        )
    }

    private func createNewChat() {
        withAnimation {
            let newChat = chatManager.createNewChat()
            chatManager.selectChat(newChat)
        }
    }
}

struct ChatListItem: View {
    let chat: Chat
    @EnvironmentObject private var chatManager: ChatManager
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(chat.title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(1)
            
            Text(chat.timestamp, style: .relative)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button("Delete Chat", role: .destructive) {
                withAnimation {
                    chatManager.deleteChat(chat)
                }
            }
        }
    }
}

struct ChatDetailView: View {
    let chat: Chat
    @EnvironmentObject private var chatManager: ChatManager
    
    var body: some View {
        VStack {
            // Chat header
            HStack {
                VStack(alignment: .leading) {
                    Text(chat.title)
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text("Created \(chat.timestamp, style: .relative)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                
                // Delete button in header
                Button(action: {
                    withAnimation {
                        chatManager.deleteChat(chat)
                    }
                }) {
                    Image(systemName: "trash")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .help("Delete Chat")
            }
            .padding()
            .background(Color(NSColor.controlBackgroundColor))
            
            Divider()
            
            // Messages area
            if chat.messages.isEmpty {
                Spacer()
                VStack(spacing: 16) {
                    Image(systemName: "message")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text("No messages yet")
                        .font(.title3)
                        .foregroundColor(.secondary)
                    Text("Start a conversation to see messages here")
                        .font(.body)
                        .foregroundColor(.secondary)
                }
                Spacer()
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            ForEach(Array(chat.messages.enumerated()), id: \.offset) { index, message in
                                MessageBubble(message: message)
                                    .id(index) // Add ID for scrolling
                            }
                            
                            // Invisible spacer at the bottom to ensure proper scrolling
                            Color.clear
                                .frame(height: 1)
                                .id("bottom")
                        }
                        .padding(.horizontal, 32)
                        .padding(.top, 20)
                        .padding(.bottom, 40)
                    }
                    .onChange(of: chat.messages.count) { oldValue, newValue in
                        // Auto-scroll to bottom when new messages are added
                        if newValue > oldValue {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                withAnimation(.easeOut(duration: 0.3)) {
                                    proxy.scrollTo("bottom", anchor: .bottom)
                                }
                            }
                        }
                    }
                    .onAppear {
                        // Scroll to bottom when view appears
                        if !chat.messages.isEmpty {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                proxy.scrollTo("bottom", anchor: .bottom)
                            }
                        }
                    }
                }
            }
        }
        .background(Color(NSColor.textBackgroundColor))
    }
}

struct MessageBubble: View {
    let message: Message
    
    // Athena's brand color from assets
    private let athenaColor = Color("AthenaColor")
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if message.role == "user" {
                Spacer(minLength: 60)
                
                VStack(alignment: .trailing, spacing: 6) {
                    Text(message.content)
                        .font(.system(size: 15, weight: .medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .cornerRadius(18)
                    
                    Text(message.timestamp, style: .time)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            } else {
                // Athena's avatar
                VStack {
                    Circle()
                        .fill(athenaColor.opacity(0.12))
                        .frame(width: 36, height: 36)
                        .overlay(
                            Circle()
                                .stroke(athenaColor.opacity(0.3), lineWidth: 1.5)
                        )
                        .overlay(
                            Image("AthenaIcon")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 24, height: 24)
                        )
                        .shadow(color: athenaColor.opacity(0.2), radius: 3, x: 0, y: 1)
                    Spacer()
                }
                
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Athena")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(athenaColor)
                        Spacer()
                    }
                    
                    Text(message.content)
                        .font(.system(size: 15))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 18)
                                .fill(athenaColor.opacity(0.08))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 18)
                                        .stroke(athenaColor.opacity(0.2), lineWidth: 1)
                                )
                        )
                        .foregroundColor(.primary)
                    
                    Text(message.timestamp, style: .time)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                
                Spacer(minLength: 60)
            }
        }
        .padding(.horizontal, 4)
    }
}

struct ChatEmptyState: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 64))
                .foregroundColor(Color("AccentColor"))
            
            VStack(spacing: 8) {
                Text("laserfocus")
                    .font(.title)
                    .fontWeight(.semibold)
                
                Text("Dream out loud")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
    }
}
