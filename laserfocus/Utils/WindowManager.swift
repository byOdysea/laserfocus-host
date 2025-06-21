//
//  WindowManager.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import SwiftUI
import AppKit
import Combine
import WebKit

// MARK: - WindowAccessor for capturing the main window

struct WindowAccessor: NSViewRepresentable {
    enum WindowType {
        case main
    }
    
    let windowType: WindowType
    @ObservedObject var windowManager: WindowManager
    
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        
        DispatchQueue.main.async {
            if let window = view.window {
                switch windowType {
                case .main:
                    // Assign only if we haven't captured the main window yet
                    if windowManager.mainWindow == nil {
                        windowManager.mainWindow = window
                    }
                }
            }
        }
        
        return view
    }
    
    func updateNSView(_ nsView: NSView, context: Context) {
        // Check if window is available and assign if needed
        if let window = nsView.window {
            switch windowType {
            case .main:
                // Assign only if we haven't captured the main window yet
                if windowManager.mainWindow == nil {
                    windowManager.mainWindow = window
                }
            }
        }
    }
}

// Global window manager to coordinate window positions and lifecycle
class WindowManager: ObservableObject {
    static let shared = WindowManager()  // Singleton for MCP server access
    
    @Published var mainWindow: NSWindow?
    @Published var secondaryWindow: NSWindow?
    @Published var isMainWindowReady: Bool = false
    @Published var isSecondaryWindowReady: Bool = false
    // Map of window IDs to auxiliary web windows created via the MCP "open_window" tool
    @Published private(set) var webWindows: [String: NSWindow] = [:]
    
    private var cancellables = Set<AnyCancellable>()
    
    private var chatManager: ChatManager?
    
    init() {
        print("🔍 WindowManager initializing...")
        setupWindowObservers()
    }
    
    func setChatManager(_ chatManager: ChatManager) {
        self.chatManager = chatManager
    }
    
    func createSecondaryWindow() {
        guard secondaryWindow == nil else {
            bringSecondaryWindowToFront()
            return
        }
        
        guard let chatManager = chatManager else {
            print("🔍 ChatManager not available for secondary window")
            return
        }
        
        // Create the InputPillView with environment objects
        let inputPillView = InputPillView()
            .environmentObject(self)
            .environmentObject(chatManager)
        
        // Create hosting view
        let hostingView = NSHostingView(rootView: inputPillView)
        hostingView.frame = NSRect(x: 0, y: 0, width: 700, height: 100)
        
        // Create the window with proper frame
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 700, height: 100),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        
        window.title = "LaserFocus - Input"
        window.contentView = hostingView
        window.isReleasedWhenClosed = false
        window.level = .floating
        
        // Center the window on screen
        if let screen = NSScreen.main {
            let screenFrame = screen.visibleFrame
            let windowFrame = window.frame
            let centeredX = screenFrame.origin.x + (screenFrame.width - windowFrame.width) / 2
            let centeredY = screenFrame.origin.y + (screenFrame.height - windowFrame.height) / 2
            window.setFrameOrigin(NSPoint(x: centeredX, y: centeredY))
        }
        
        // Set the secondary window
        secondaryWindow = window
        
        // Show the window
        window.makeKeyAndOrderFront(nil)
        
        print("🔍 Secondary window created programmatically")
    }
    
    private func setupWindowObservers() {
        print("🔍 Setting up window observers...")
        
        // Listen for main window changes
        $mainWindow
            .sink { [weak self] window in
                print("🔍 Main window changed: \(window != nil ? "available" : "nil")")
                self?.isMainWindowReady = window != nil
                if window != nil {
                    self?.configureMainWindow()
                }
            }
            .store(in: &cancellables)
        
        // Listen for secondary window changes
        $secondaryWindow
            .sink { [weak self] window in
                print("🔍 Secondary window changed: \(window != nil ? "available" : "nil")")
                self?.isSecondaryWindowReady = window != nil
                if window != nil {
                    self?.configureSecondaryWindow()
                }
            }
            .store(in: &cancellables)
    }
    
    private func configureMainWindow() {
        guard let mainWin = mainWindow else { return }
        
        print("🔍 Configuring main window...")
        // Main window configuration
        mainWin.minSize = NSSize(width: 800, height: 600)
        mainWin.setFrameAutosaveName("MainWindow")
        
        print("🔍 Main window configured")
    }
    
    private func configureSecondaryWindow() {
        guard let secWin = secondaryWindow else { return }
        
        print("🔍 Configuring secondary window...")
        
        // Configure window properties
        secWin.minSize = NSSize(width: 600, height: 80)
        secWin.maxSize = NSSize(width: 800, height: 120)
        
        // Opt-out of macOS automatic window restoration
        secWin.isRestorable = false
        
        print("🔍 Secondary window configured")
    }
    
    private func positionSecondaryWindow() {
        guard let secWin = secondaryWindow else { return }
        
        if let mainWin = mainWindow {
            // Position relative to main window
            let mainFrame = mainWin.frame
            let secFrame = secWin.frame
            
            let newX = mainFrame.midX - secFrame.width / 2
            let newY = mainFrame.minY - secFrame.height - 20
            
            secWin.setFrameOrigin(NSPoint(x: newX, y: newY))
            print("🔍 Secondary window positioned relative to main window")
        } else {
            // Position at bottom center of screen
            if let screen = NSScreen.main {
                let screenFrame = screen.visibleFrame
                let secFrame = secWin.frame
                
                let newX = screenFrame.midX - secFrame.width / 2
                let newY = screenFrame.minY + 100
                
                secWin.setFrameOrigin(NSPoint(x: newX, y: newY))
                print("🔍 Secondary window positioned at fallback location")
            }
        }
    }
    
    func bringSecondaryWindowToFront() {
        guard let secWin = secondaryWindow else { return }
        secWin.makeKeyAndOrderFront(nil)
        print("🔍 Secondary window brought to front")
    }
    
    func closeSecondaryWindow() {
        secondaryWindow?.close()
        secondaryWindow = nil
        print("🔍 Secondary window closed")
    }
    
    // MARK: - MCP Server Integration Methods
    
    func getMainWindowBounds() async -> NSRect {
        await MainActor.run {
            return mainWindow?.frame ?? NSRect.zero
        }
    }
    
    func getSecondaryWindowBounds() async -> NSRect {
        await MainActor.run {
            return secondaryWindow?.frame ?? NSRect.zero
        }
    }
    
    func isMainWindowVisible() async -> Bool {
        await MainActor.run {
            return mainWindow?.isVisible ?? false
        }
    }
    
    func isSecondaryWindowVisible() async -> Bool {
        await MainActor.run {
            return secondaryWindow?.isVisible ?? false
        }
    }
    
    // MARK: - Window Position Control
    
    func setMainWindowPosition(x: CGFloat, y: CGFloat) async -> Bool {
        await MainActor.run {
            guard let window = mainWindow else { return false }
            window.setFrameOrigin(NSPoint(x: x, y: y))
            print("🔍 Main window position set to (\(x), \(y))")
            return true
        }
    }
    
    func setSecondaryWindowPosition(x: CGFloat, y: CGFloat) async -> Bool {
        await MainActor.run {
            guard let window = secondaryWindow else { return false }
            window.setFrameOrigin(NSPoint(x: x, y: y))
            print("🔍 Secondary window position set to (\(x), \(y))")
            return true
        }
    }
    
    func setMainWindowSize(width: CGFloat, height: CGFloat) async -> Bool {
        await MainActor.run {
            guard let window = mainWindow else { return false }
            let currentFrame = window.frame
            let newFrame = NSRect(x: currentFrame.origin.x, y: currentFrame.origin.y, width: width, height: height)
            window.setFrame(newFrame, display: true)
            print("🔍 Main window size set to \(width)x\(height)")
            return true
        }
    }
    
    func setSecondaryWindowSize(width: CGFloat, height: CGFloat) async -> Bool {
        await MainActor.run {
            guard let window = secondaryWindow else { return false }
            let currentFrame = window.frame
            let newFrame = NSRect(x: currentFrame.origin.x, y: currentFrame.origin.y, width: width, height: height)
            window.setFrame(newFrame, display: true)
            print("🔍 Secondary window size set to \(width)x\(height)")
            return true
        }
    }
    
    func setMainWindowFrame(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) async -> Bool {
        await MainActor.run {
            guard let window = mainWindow else { return false }
            let newFrame = NSRect(x: x, y: y, width: width, height: height)
            window.setFrame(newFrame, display: true)
            print("🔍 Main window frame set to (\(x), \(y)) \(width)x\(height)")
            return true
        }
    }
    
    func setSecondaryWindowFrame(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) async -> Bool {
        await MainActor.run {
            guard let window = secondaryWindow else { return false }
            let newFrame = NSRect(x: x, y: y, width: width, height: height)
            window.setFrame(newFrame, display: true)
            print("🔍 Secondary window frame set to (\(x), \(y)) \(width)x\(height)")
            return true
        }
    }
    
    func centerMainWindow() async -> Bool {
        await MainActor.run {
            guard let window = mainWindow else { return false }
            window.center()
            print("🔍 Main window centered")
            return true
        }
    }
    
    func centerSecondaryWindow() async -> Bool {
        await MainActor.run {
            guard let window = secondaryWindow else { return false }
            window.center()
            print("🔍 Secondary window centered")
            return true
        }
    }
    
    func minimizeMainWindow() async -> Bool {
        await MainActor.run {
            guard let window = mainWindow else { return false }
            window.miniaturize(nil)
            print("🔍 Main window minimized")
            return true
        }
    }
    
    func minimizeSecondaryWindow() async -> Bool {
        await MainActor.run {
            guard let window = secondaryWindow else { return false }
            window.miniaturize(nil)
            print("🔍 Secondary window minimized")
            return true
        }
    }
    
    /// Open a floating web window and return its identifier.
    @MainActor
    func openWebWindow(url: String, width: CGFloat, height: CGFloat, x: CGFloat, y: CGFloat) -> String {
        let windowID = UUID().uuidString

        // Create the WKWebView
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height))
        if let u = URL(string: url) {
            webView.load(URLRequest(url: u))
        }

        // Create a borderless window
        let styleMask: NSWindow.StyleMask = [.titled, .closable, .resizable, .miniaturizable]
        let window = NSWindow(contentRect: NSRect(x: x, y: y, width: width, height: height),
                               styleMask: styleMask,
                               backing: .buffered,
                               defer: false)
        window.level = .floating
        window.title = "Athena Web View"
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)

        webWindows[windowID] = window
        return windowID
    }

    /// Remove and close a previously created web window.
    @MainActor
    func closeWebWindow(id: String) -> Bool {
        guard let window = webWindows[id] else { return false }
        window.close()
        webWindows.removeValue(forKey: id)
        return true
    }
}