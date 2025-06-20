//
//  WindowManager.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import SwiftUI
import AppKit
import Combine

// Window positioning helper
struct WindowAccessor: NSViewRepresentable {
    let windowType: WindowType
    @Binding var mainWindow: NSWindow?
    @Binding var secondaryWindow: NSWindow?
    
    enum WindowType {
        case main, secondary
    }
    
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async { [weak view] in
            guard let window = view?.window else { return }
            
            switch windowType {
            case .main:
                mainWindow = window
                // Position main window at a standard location
                window.setFrameOrigin(NSPoint(x: 200, y: 400))
                window.title = "LaserFocus - Main"
                print("🔍 Main window configured")
                
            case .secondary:
                secondaryWindow = window
                // Configure secondary window properties
                window.title = "LaserFocus - Input"
                window.level = .floating
                window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
                
                // Position secondary window below and to the right of main window
                if let mainWin = mainWindow {
                    let mainFrame = mainWin.frame
                    let offset: CGFloat = 30
                    let newOrigin = NSPoint(
                        x: mainFrame.origin.x + mainFrame.width + offset,
                        y: mainFrame.origin.y - offset
                    )
                    window.setFrameOrigin(newOrigin)
                    print("🔍 Secondary window positioned relative to main")
                } else {
                    // Fallback position if main window isn't available yet
                    window.setFrameOrigin(NSPoint(x: 600, y: 300))
                    print("🔍 Secondary window positioned at fallback location")
                }
            }
        }
        return view
    }
    
    func updateNSView(_ nsView: NSView, context: Context) {}
}

// Global window manager to coordinate window positions and lifecycle
class WindowManager: ObservableObject {
    @Published var mainWindow: NSWindow?
    @Published var secondaryWindow: NSWindow?
    @Published var isMainWindowReady: Bool = false
    @Published var isSecondaryWindowReady: Bool = false
    
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        print("🔍 WindowManager initializing...")
        setupWindowObservers()
    }
    
    func openSecondaryWindow() {
        print("🔍 WindowManager.openSecondaryWindow() called")
        
        // Use NSApplication to open a new window
        if NSApplication.shared.delegate != nil {
            print("🔍 Found app delegate, attempting to open window")
        }
        
        // Alternative approach: Use URL to open window
        if let url = URL(string: "laserfocus://secondary") {
            NSWorkspace.shared.open(url)
            print("🔍 Attempted to open secondary window via URL")
        }
        
        // Try direct NSApp approach
        DispatchQueue.main.async {
            NSApp.sendAction(#selector(NSApp.orderFrontStandardAboutPanel(_:)), to: nil, from: nil)
            print("🔍 Sent orderFront action")
        }
    }
    
    private func setupWindowObservers() {
        print("🔍 Setting up window observers...")
        
        // Observe main window changes
        $mainWindow
            .sink { [weak self] window in
                print("🔍 Main window changed: \(window != nil ? "available" : "nil")")
                self?.isMainWindowReady = window != nil
                if window != nil {
                    self?.configureMainWindow()
                }
            }
            .store(in: &cancellables)
        
        // Observe secondary window changes
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
    }
    
    private func configureSecondaryWindow() {
        guard let secWin = secondaryWindow else { return }
        
        print("🔍 Configuring secondary window...")
        // Secondary window configuration
        secWin.minSize = NSSize(width: 500, height: 56)
        secWin.maxSize = NSSize(width: 700, height: 100)
        secWin.isMovableByWindowBackground = true
        secWin.setFrameAutosaveName("SecondaryWindow")
        
        // Hide traffic light buttons (red, yellow, green)
        secWin.standardWindowButton(.closeButton)?.isHidden = true
        secWin.standardWindowButton(.miniaturizeButton)?.isHidden = true
        secWin.standardWindowButton(.zoomButton)?.isHidden = true
        
        // Position relative to main window if available
        positionSecondaryWindow()
    }
    
    func positionSecondaryWindow() {
        guard let mainWin = mainWindow, let secWin = secondaryWindow else { return }
        
        print("🔍 Positioning secondary window...")
        let mainFrame = mainWin.frame
        let offset: CGFloat = 30
        let newOrigin = NSPoint(
            x: mainFrame.origin.x + mainFrame.width + offset,
            y: mainFrame.origin.y - offset
        )
        secWin.setFrameOrigin(newOrigin)
    }
    
    // Window management methods
    func bringMainWindowToFront() {
        print("🔍 Bringing main window to front...")
        mainWindow?.makeKeyAndOrderFront(nil)
    }
    
    func bringSecondaryWindowToFront() {
        print("🔍 Bringing secondary window to front...")
        secondaryWindow?.makeKeyAndOrderFront(nil)
    }
    
    func closeSecondaryWindow() {
        print("🔍 Closing secondary window...")
        secondaryWindow?.close()
    }
}