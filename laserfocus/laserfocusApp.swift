//
//  laserfocusApp.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import SwiftUI
import SwiftData
import Logging

@main
struct laserfocusApp: App {
    // Shared instances
    @StateObject private var windowManager = WindowManager()
    @StateObject private var chatManager = ChatManager()
    @StateObject private var mcpServiceManager = MCPServiceManager.shared
    
    init() {
        // Configure logging following official MCP Swift SDK pattern
        LoggingSystem.bootstrap { label in
            var handler = StreamLogHandler.standardOutput(label: label)
            handler.logLevel = .info
            return handler
        }
    }

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Chat.self
        ])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        // Main window only
        WindowGroup(id: "main") {
            ChatView()
                .environmentObject(windowManager)
                .environmentObject(chatManager)
                .onAppear {
                    // Start MCP service when app appears
                    Task {
                        await mcpServiceManager.startService()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
                    // Graceful shutdown on app termination
                    Task {
                        await mcpServiceManager.handleApplicationWillTerminate()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
                    // Auto-restart service if needed
                    Task {
                        await mcpServiceManager.handleApplicationDidBecomeActive()
                    }
                }
        }
        .modelContainer(sharedModelContainer)
        .defaultPosition(.topLeading)
    }
}

// MARK: - Application Delegate for Enhanced Lifecycle Management

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillTerminate(_ notification: Notification) {
        // Ensure graceful shutdown
        Task {
            await MCPServiceManager.shared.handleApplicationWillTerminate()
        }
    }
    
    func applicationDidBecomeActive(_ notification: Notification) {
        // Auto-restart if needed
        Task {
            await MCPServiceManager.shared.handleApplicationDidBecomeActive()
        }
    }
}

// Wrapper view to handle window opening logic
struct MainWindowContentView: View {
    @Environment(\.openWindow) private var openWindow
    @EnvironmentObject private var windowManager: WindowManager
    
    var body: some View {
        ChatView()
            .onAppear {
                // Open secondary window when main window appears
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    openWindow(id: "secondary")
                }
            }
    }
}
