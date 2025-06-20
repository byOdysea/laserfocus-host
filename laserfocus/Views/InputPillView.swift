//
//  InputPillView.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import SwiftUI
import SwiftData
import AppKit

struct InputPillView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var windowManager: WindowManager
    @EnvironmentObject private var chatManager: ChatManager
    @State private var inputText: String = ""
    @State private var isRecording: Bool = false
    
    var body: some View {
        HStack(spacing: 12) {
            // Left side icon buttons
            HStack(spacing: 8) {
            }
            
            // Text input field
            TextField("Ask anything", text: $inputText)
                .textFieldStyle(PlainTextFieldStyle())
                .font(.system(size: 16))
                .frame(maxWidth: .infinity)
                .onSubmit {
                    sendMessage()
                }
                .disabled(chatManager.isLoading)
            
            // Right side action buttons
            HStack(spacing: 8) {
                Button(action: {
                    // Microphone action
                    isRecording.toggle()
                    print("🔍 Microphone tapped - recording: \(isRecording)")
                }) {
                    Image(systemName: isRecording ? "mic.fill" : "mic")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(isRecording ? .red : .white)
                }
                .buttonStyle(PlainButtonStyle())
                .frame(width: 32, height: 32)
                .background(Color("AccentColor"))
                .clipShape(Circle())
                
                Button(action: sendMessage) {
                    if chatManager.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: inputText.isEmpty ? "waveform" : "arrow.up")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                    }
                }
                .buttonStyle(PlainButtonStyle())
                .frame(width: 32, height: 32)
                .background(Color("AccentColor"))
                .clipShape(Circle())
                .disabled(inputText.isEmpty || chatManager.isLoading)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(height: 56)
        .frame(minWidth: 500, maxWidth: 700)
        .background(
            RoundedRectangle(cornerRadius: 28)
                .fill(Color(NSColor.controlBackgroundColor))
                .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 2)
        )
        .background(
            WindowAccessor(
                windowType: .secondary,
                mainWindow: $windowManager.mainWindow,
                secondaryWindow: $windowManager.secondaryWindow
            )
        )
        .onAppear {
            print("🔍 InputPillView onAppear called")
            chatManager.setModelContext(modelContext)
        }
        .onDisappear {
            print("🔍 InputPillView onDisappear called")
        }
    }
    
    private func sendMessage() {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        
        let messageText = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Get or create selected chat
        let targetChat: Chat
        if let selectedChat = chatManager.selectedChat {
            targetChat = selectedChat
        } else {
            targetChat = chatManager.createNewChat()
            chatManager.selectChat(targetChat)
        }
        
        // Clear input
        inputText = ""
        
        // Send message
        Task {
            await chatManager.sendMessage(messageText, to: targetChat)
        }
    }
}
