//
//  MCPServiceManager.swift
//  laserfocus
//
//  Created by Andrés on 20/6/2025.
//

import Foundation
import Logging
import MCP
import Combine

/// Simple MCP service manager for development
/// Starts the MCP server on port 8080 without any registration complexity
@MainActor
class MCPServiceManager: ObservableObject {
    static let shared = MCPServiceManager()
    
    @Published var isRunning = false
    @Published var connectionCount = 0
    
    private var mcpService: MCPServiceSDK?
    private let logger = Logger(label: "com.odysea.laserfocus.mcp.manager")
    
    private init() {
        logger.info("🔧 MCP Service Manager initialized")
    }
    
    /// Start the MCP service on port 8080
    func startService() async {
        guard mcpService == nil else {
            logger.warning("⚠️ MCP Service already running")
            return
        }
        
        logger.info("🚀 Starting MCP Server on port 8080...")
        logger.info("💡 Athena can connect via manual refresh to localhost:8080/mcp")
        
        // Create and start the MCP service
        mcpService = MCPServiceSDK()
        
        // Start the service in background task
        Task.detached { [weak self] in
            do {
                guard let self = self else { return }
                try await self.mcpService?.start()
            } catch {
                await MainActor.run { [weak self] in
                    guard let self = self else { return }
                    self.logger.error("❌ MCP Service failed: \(error)")
                    self.isRunning = false
                }
            }
        }
        
        // Update UI state
        isRunning = true
        logger.info("✅ MCP Server started - Ready for connections!")
        logger.info("🔗 To connect Athena: Send POST to <athena_host>:3000/mcp/refresh")
    }
    
    /// Stop the MCP service
    func stopService() async {
        guard let service = mcpService else {
            logger.warning("⚠️ No MCP Service to stop")
            return
        }
        
        logger.info("🛑 Stopping MCP Server...")
        
        await service.stop()
        mcpService = nil
        
        // Update UI state
        isRunning = false
        connectionCount = 0
        
        logger.info("✅ MCP Service stopped")
    }
    
    /// Check if service is healthy
    var isHealthy: Bool {
        return isRunning && mcpService != nil
    }
    
    /// Get service status for UI display
    var statusMessage: String {
        if isHealthy {
            return "🟢 MCP Server Running (Port 8080)"
        } else {
            return "🔴 MCP Server Stopped"
        }
    }
}

// MARK: - Application Lifecycle

extension MCPServiceManager {
    
    /// Handle application will terminate
    func handleApplicationWillTerminate() async {
        logger.info("📱 Application terminating - stopping MCP service")
        await stopService()
    }
    
    /// Handle application did become active
    func handleApplicationDidBecomeActive() async {
        if !isRunning {
            logger.info("📱 Application activated - starting MCP service")
            await startService()
        }
    }
} 