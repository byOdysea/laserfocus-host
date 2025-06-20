//
//  laserfocusApp.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import SwiftUI
import SwiftData

@main
struct laserfocusApp: App {
    // Shared instances
    @StateObject private var windowManager = WindowManager()
    @StateObject private var chatManager = ChatManager()
    
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
        // Main window
        WindowGroup(id: "main") {
            ChatView()
                .environmentObject(windowManager)
                .environmentObject(chatManager)
        }
        .modelContainer(sharedModelContainer)
        .defaultPosition(.topLeading)
        
        // Secondary window (InputPill)
        WindowGroup(id: "secondary") {
            InputPillView()
                .environmentObject(windowManager)
                .environmentObject(chatManager)
        }
        .modelContainer(sharedModelContainer)
        .defaultSize(width: 700, height: 100)
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .windowLevel(.floating)
        .defaultPosition(.topTrailing)
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
