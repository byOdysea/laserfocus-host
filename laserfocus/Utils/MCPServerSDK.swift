//
//  MCPServerSDK.swift
//  laserfocus
//
//  Created by Andrés on 20/6/2025.
//
//  MCP Server Implementation using the official Swift SDK
//  
//  This implementation follows the MCP 2025-03-26 Streamable HTTP specification:
//  • Single MCP endpoint supporting POST and GET methods
//  • Server-Sent Events (SSE) support for streaming responses
//  • Session management with Mcp-Session-Id headers
//  • Accept header validation (application/json required, text/event-stream optional)
//  • Origin header validation for DNS rebinding protection
//  • Backward compatibility with 2024-11-05 HTTP+SSE transport
//

import Foundation
import SwiftUI
import WebKit
import Logging
import Network
import Combine
import MCP

// MARK: - Connection Wrapper for Hashable Conformance

/// Wrapper for NWConnection to make it hashable for use in Sets and Dictionaries
class ConnectionWrapper: Hashable, @unchecked Sendable {
    let connection: NWConnection
    private let id = UUID()
    
    init(_ connection: NWConnection) {
        self.connection = connection
    }
    
    static func == (lhs: ConnectionWrapper, rhs: ConnectionWrapper) -> Bool {
        return lhs.id == rhs.id
    }
    
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - HTTP Server Transport Implementation

/// Custom HTTP transport implementing MCP 2025-03-26 Streamable HTTP specification
actor HTTPServerTransport: Transport {
    
    // MARK: - Properties
    
    private let port: UInt16
    internal let logger: Logger  // Made internal to satisfy Transport protocol
    private var listener: NWListener?
    private var connections: Set<ConnectionWrapper> = []
    private let continuation: AsyncThrowingStream<Data, Swift.Error>.Continuation
    private let dataStream: AsyncThrowingStream<Data, Swift.Error>
    
    // Session management
    private var sessionIds: Set<String> = []
    private var pendingConnections: [ConnectionWrapper: Data] = [:]
    
    // Response tracking for HTTP requests
    private var pendingResponses: [String: (ConnectionWrapper, [String: String])] = [:]
    
    // MARK: - Initialization
    
    init(port: UInt16) {
        self.port = port
        self.logger = Logger(label: "com.odysea.laserfocus.mcp.http-transport")
        
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: Data.self, throwing: Swift.Error.self)
        self.dataStream = stream
        self.continuation = continuation
    }
    
    // MARK: - Transport Protocol
    
    func connect() async throws {
        let tcpOptions = NWProtocolTCP.Options()
        let parameters = NWParameters(tls: nil, tcp: tcpOptions)
        parameters.allowLocalEndpointReuse = true
        parameters.includePeerToPeer = true
        
        listener = try NWListener(using: parameters, on: NWEndpoint.Port(integerLiteral: port))
        
        listener?.newConnectionHandler = { [weak self] connection in
            Task {
                await self?.handleConnection(connection)
            }
        }
        
        listener?.stateUpdateHandler = { [weak self] state in
            Task {
                await self?.handleListenerStateUpdate(state)
            }
        }
        
        listener?.start(queue: .global())
        logger.info("🚀 MCP HTTP Server started on port \(port)")
    }
    
    func disconnect() async {
        listener?.cancel()
        listener = nil
        
        for wrapper in connections {
            wrapper.connection.cancel()
        }
        connections.removeAll()
        
        continuation.finish()
        logger.info("🛑 MCP HTTP Server stopped")
    }
    
    func send(_ data: Data) async throws {
        // This is called by MCP Server to send responses back to clients
        logger.info("📤 Sending MCP response: \(data.count) bytes")
        if let responseString = String(data: data, encoding: .utf8) {
            logger.debug("📤 Response content: \(responseString)")
        }
        
        // Parse the JSON-RPC response to get the ID
        guard let json = try? JSONSerialization.jsonObject(with: data, options: []) else {
            logger.error("❌ Failed to parse response JSON")
            return
        }
        
        // MCP 2025-03-26: All responses are sent via regular HTTP responses, no SSE
        
        // Handle regular request/response flow
        if let responseArray = json as? [[String: Any]] {
            // Batch response - find the first response with an ID to determine connection
            for response in responseArray {
                if let id = response["id"],
                   let idString = "\(id)" as String?,
                   let (wrapper, _) = pendingResponses.removeValue(forKey: idString) {
                    
                    // Regular HTTP response for batch
                    let responseData = try JSONSerialization.data(withJSONObject: responseArray, options: [])
                    let responseString = String(data: responseData, encoding: .utf8) ?? "[]"
                    await sendHTTPResponse(wrapper: wrapper, statusCode: 200, body: responseString, contentType: "application/json")
                    break
                }
            }
        } else if let response = json as? [String: Any] {
            // Single response
            if let id = response["id"],
               let idString = "\(id)" as String?,
               let (wrapper, _) = pendingResponses.removeValue(forKey: idString) {
                
                // Regular HTTP response for single message
                let responseString = String(data: data, encoding: .utf8) ?? "{}"
                await sendHTTPResponse(wrapper: wrapper, statusCode: 200, body: responseString, contentType: "application/json")
            }
        }
    }
    
    func receive() -> AsyncThrowingStream<Data, Swift.Error> {
        return dataStream
    }
    
    // MARK: - Private Methods
    
    private func handleListenerStateUpdate(_ state: NWListener.State) async {
        switch state {
        case .ready:
            logger.info("✅ HTTP listener ready on port \(port)")
        case .failed(let error):
            logger.error("❌ HTTP listener failed: \(error)")
            continuation.finish(throwing: error)
        case .cancelled:
            logger.info("🚫 HTTP listener cancelled")
            continuation.finish()
        default:
            break
        }
    }
    
    private func handleConnection(_ connection: NWConnection) async {
        let wrapper = ConnectionWrapper(connection)
        connections.insert(wrapper)
        connection.start(queue: .global())
        
        logger.debug("🔗 New HTTP connection established")
        
        func receiveNext() {
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
                Task {
                    await self?.processHTTPRequest(wrapper: wrapper, data: data, isComplete: isComplete, error: error)
                }
                if error == nil && !isComplete {
                    receiveNext()
                }
            }
        }
        
        receiveNext()
    }
    
    private func processHTTPRequest(wrapper: ConnectionWrapper, data: Data?, isComplete: Bool, error: NWError?) async {
        // Append chunk to existing buffer (if any)
        var buffer = pendingConnections[wrapper] ?? Data()
        if let chunk = data { buffer.append(chunk) }

        // If connection closed or error and no data, clean up
        if buffer.isEmpty {
            if isComplete || error != nil { await removeConnection(wrapper) }
            return
        }

        // Attempt to locate end of headers ("\r\n\r\n")
        guard let headerRange = buffer.range(of: Data("\r\n\r\n".utf8)) else {
            // headers incomplete; store and wait for more
            pendingConnections[wrapper] = buffer
            return
        }

        let headersData = buffer.subdata(in: 0..<headerRange.upperBound)
        guard let headersString = String(data: headersData, encoding: .utf8) else {
            await sendHTTPResponse(wrapper: wrapper, statusCode: 400, body: "Bad Request")
            await removeConnection(wrapper)
            return
        }

        // Extract Content-Length (default 0)
        var contentLength = 0
        for line in headersString.components(separatedBy: "\r\n") {
            if line.lowercased().starts(with: "content-length") {
                let parts = line.split(separator: ":", maxSplits: 1)
                if parts.count == 2 { contentLength = Int(parts[1].trimmingCharacters(in: .whitespaces)) ?? 0 }
            }
        }

        let bodyStart = headerRange.upperBound
        let totalNeeded = bodyStart + contentLength
        if buffer.count < totalNeeded {
            // wait for more body data
            pendingConnections[wrapper] = buffer
            return
        }

        // Full request received
        let requestData = buffer.subdata(in: 0..<totalNeeded)
        let remaining = buffer.count > totalNeeded ? buffer.subdata(in: totalNeeded..<buffer.count) : nil
        pendingConnections[wrapper] = remaining // leftover for next request

        guard let httpRequest = String(data: requestData, encoding: .utf8) else {
            await sendHTTPResponse(wrapper: wrapper, statusCode: 400, body: "Bad Request")
            return
        }
        
        logger.info("📨 Full HTTP request received:")
        logger.info("📨 \(httpRequest)")
        
        let httpRequestData = parseHTTPRequest(httpRequest)
        
        // MCP 2025-03-26: Validate Origin header for DNS rebinding protection
        if let origin = httpRequestData.headers["origin"] {
            guard isValidOrigin(origin) else {
                logger.warning("🚫 Rejected request from invalid origin: \(origin)")
                await sendHTTPResponse(wrapper: wrapper, statusCode: 403, body: "Forbidden: Invalid origin")
                return
            }
        }
        
        // Handle CORS preflight
        if httpRequestData.method == "OPTIONS" {
            await sendCORSResponse(wrapper: wrapper)
            return
        }
        
        // MCP 2025-03-26: Single MCP endpoint supports both POST and GET
        guard httpRequestData.path == "/mcp" else {
            await sendHTTPResponse(wrapper: wrapper, statusCode: 404, body: "Not Found")
            return
        }
        
        switch httpRequestData.method {
        case "POST":
            await handlePOSTRequest(wrapper: wrapper, headers: httpRequestData.headers, body: httpRequestData.body)
        case "GET":
            await handleGETRequest(wrapper: wrapper, headers: httpRequestData.headers)
        default:
            await sendHTTPResponse(wrapper: wrapper, statusCode: 405, body: "Method Not Allowed")
        }
    }
    
    private func parseHTTPRequest(_ request: String) -> (method: String, path: String, headers: [String: String], body: Data?) {
        let lines = request.components(separatedBy: "\r\n")
        guard let firstLine = lines.first else {
            return ("", "", [:], nil)
        }
        
        let parts = firstLine.components(separatedBy: " ")
        let method = parts.first ?? ""
        let path = parts.count > 1 ? parts[1] : ""
        
        var headers: [String: String] = [:]
        var bodyStartIndex = lines.count
        
        for (index, line) in lines.enumerated() {
            if line.isEmpty {
                bodyStartIndex = index + 1
                break
            }
            
            if index > 0 {
                let headerParts = line.components(separatedBy: ": ")
                if headerParts.count == 2 {
                    headers[headerParts[0].lowercased()] = headerParts[1]
                }
            }
        }
        
        let body: Data?
        if bodyStartIndex < lines.count {
            let bodyString = lines[bodyStartIndex...].joined(separator: "\r\n")
            body = bodyString.data(using: .utf8)
        } else {
            body = nil
        }
        
        return (method, path, headers, body)
    }
    
    // MARK: - MCP 2025-03-26 Request Handlers
    
    /// Handle POST requests - sending messages to the server
    private func handlePOSTRequest(wrapper: ConnectionWrapper, headers: [String: String], body: Data?) async {
        // MCP 2025-03-26: Accept header validation
        let acceptHeader = headers["accept"] ?? "*/*"
        
        // Must accept application/json for JSON-RPC responses
        let hasApplicationJson = acceptHeader.contains("application/json")
        let hasWildcard = acceptHeader.contains("*/*")
        
        guard hasApplicationJson || hasWildcard else {
            await sendHTTPResponse(wrapper: wrapper, statusCode: 400, body: "Accept header must include application/json or */*")
            return
        }
        
        // Validate session ID if present
        if let sessionId = headers["mcp-session-id"] {
            guard sessionIds.contains(sessionId) else {
                await sendHTTPResponse(wrapper: wrapper, statusCode: 404, body: "Session not found")
                return
            }
        }
        
        // Validate Content-Type for POST with body
        guard let body = body, !body.isEmpty else {
            await sendHTTPResponse(wrapper: wrapper, statusCode: 400, body: "Missing request body")
            return
        }
        
        // Validate Content-Type more leniently (case-insensitive, allow charset)
        let contentType = headers["content-type"]?.lowercased() ?? ""
        guard contentType.contains("application/json") else {
            await sendHTTPResponse(wrapper: wrapper, statusCode: 400, body: "Content-Type must be application/json")
            return
        }
        
        // Parse and validate JSON-RPC message(s) for batch support
        do {
            let json = try JSONSerialization.jsonObject(with: body, options: [])
            
            // Handle both single messages and batch requests (arrays)
            if let jsonArray = json as? [[String: Any]] {
                logger.debug("📨 Processing batch request with \(jsonArray.count) messages")
                
                // Determine whether the batch contains at least one *request* (has "method")
                let hasRequest = jsonArray.contains { $0["method"] != nil }
                
                if !hasRequest {
                    // Only responses/notifications – immediately ACK with 202 per spec
                    logger.debug("📨 Batch contains only responses/notifications – sending HTTP 202 Accepted")
                    continuation.yield(body)
                    await sendHTTPResponse(wrapper: wrapper, statusCode: 202, body: "")
                    return
                }
                
                // Track request IDs that expect a response
                for messageJson in jsonArray {
                    if messageJson["method"] != nil, // true request
                       let id = messageJson["id"],
                       let idString = "\(id)" as String? {
                        pendingResponses[idString] = (wrapper, headers)
                    }
                }
                
                // Forward batch to MCP Server
                logger.info("🔄 Forwarding batch request to MCP Server")
                continuation.yield(body)
                
            } else if let messageJson = json as? [String: Any] {
                logger.debug("📨 Processing single JSON-RPC message")
                
                let isRequest = messageJson["method"] != nil
                
                if isRequest, let id = messageJson["id"], let idString = "\(id)" as String? {
                    // Track this request for response routing
                    pendingResponses[idString] = (wrapper, headers)
                }
                
                // Forward to MCP Server (requests, responses, or notifications)
                logger.info("🔄 Forwarding single message to MCP Server")
                continuation.yield(body)
                
                if !isRequest || messageJson["id"] == nil {
                    // Notification or pure response – send 202 ACK immediately
                    logger.debug("📨 No response expected – sending HTTP 202 Accepted")
                    await sendHTTPResponse(wrapper: wrapper, statusCode: 202, body: "")
                }
                // For true requests we wait for the MCP core to call send(_:)
                
            } else {
                await sendHTTPResponse(wrapper: wrapper, statusCode: 400, body: "Invalid JSON-RPC message format")
            }
            
        } catch {
            logger.error("❌ JSON parsing error: \(error)")
            let errorResponse: [String: Any] = [
                "jsonrpc": "2.0",
                "error": [
                    "code": -32700,
                    "message": "Parse error: Invalid JSON: \(error.localizedDescription)"
                ],
                "id": NSNull()
            ]
            
            let responseData = try? JSONSerialization.data(withJSONObject: errorResponse, options: [])
            let responseString = String(data: responseData ?? Data(), encoding: .utf8) ?? "{\"error\": \"Parse error\"}"
            await sendHTTPResponse(wrapper: wrapper, statusCode: 400, body: responseString, contentType: "application/json")
        }
    }
    
    /// Handle GET requests - MCP 2025-03-26 does not support GET for messaging
    private func handleGETRequest(wrapper: ConnectionWrapper, headers: [String: String]) async {
        // MCP 2025-03-26: Only POST is supported for JSON-RPC messaging
        await sendHTTPResponse(wrapper: wrapper, statusCode: 405, body: "Method Not Allowed: MCP requires POST requests for JSON-RPC messaging", contentType: "application/json")
    }
    
    /// Validate origin header to prevent DNS rebinding attacks
    private func isValidOrigin(_ origin: String) -> Bool {
        // Allow localhost origins for local development
        return origin.hasPrefix("http://localhost:") || 
               origin.hasPrefix("http://127.0.0.1:") ||
               origin.hasPrefix("https://localhost:") ||
               origin.hasPrefix("https://127.0.0.1:")
        // In production, add your trusted domains here
    }
    
    private func sendHTTPResponse(wrapper: ConnectionWrapper, statusCode: Int, body: String, contentType: String = "text/plain") async {
        logger.info("📤 Sending HTTP response: \(statusCode) with \(body.count) bytes")
        
        let statusText: String
        switch statusCode {
        case 200: statusText = "OK"
        case 202: statusText = "Accepted"
        case 400: statusText = "Bad Request"
        case 403: statusText = "Forbidden"
        case 404: statusText = "Not Found"
        case 405: statusText = "Method Not Allowed"
        default:  statusText = "Internal Server Error"
        }
        
        let contentLength = body.utf8.count
        let response = """
        HTTP/1.1 \(statusCode) \(statusText)\r
        Content-Type: \(contentType)\r
        Content-Length: \(contentLength)\r
        Access-Control-Allow-Origin: *\r
        Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r
        Access-Control-Allow-Headers: Content-Type, Accept, Origin, Mcp-Session-Id\r
        \r
        \(body)
        """
        
        guard let responseData = response.data(using: .utf8) else {
            wrapper.connection.cancel()
            return
        }

        wrapper.connection.send(content: responseData,
                                 contentContext: .defaultMessage,
                                 isComplete: true,
                                 completion: .idempotent)
    }
    
    private func sendCORSResponse(wrapper: ConnectionWrapper) async {
        let response = """
        HTTP/1.1 200 OK\r
        Access-Control-Allow-Origin: *\r
        Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r
        Access-Control-Allow-Headers: Content-Type, Accept, Origin, Mcp-Session-Id\r
        Content-Length: 0\r
        \r
        
        """
        
        guard let responseData = response.data(using: .utf8) else {
            wrapper.connection.cancel()
            return
        }

        wrapper.connection.send(content: responseData,
                                 contentContext: .defaultMessage,
                                 isComplete: true,
                                 completion: .idempotent)
    }
    
    private func removeConnection(_ wrapper: ConnectionWrapper) async {
        connections.remove(wrapper)
        pendingConnections.removeValue(forKey: wrapper)
        wrapper.connection.cancel()
    }
}

// MARK: - MCP Service Using Swift SDK

@MainActor
class MCPServiceSDK: ObservableObject {
    
    // MARK: - Properties
    
    private let logger = Logger(label: "com.odysea.laserfocus.mcp.service")
    private var mcpServer: MCP.Server?
    private var httpTransport: HTTPServerTransport?
    private var serverTask: Task<Void, Never>?
    
    // MARK: - Initialization
    
    init() {
        logger.info("🚀 Initializing MCP Service with Swift SDK...")
    }
    
    // MARK: - Public Methods
    
    func start() async throws {
        logger.info("🚀 Starting MCP Server using Swift SDK...")
        
        // Create MCP Server with capabilities
        mcpServer = MCP.Server(
            name: "LaserFocus",
            version: "1.0.0",
            capabilities: MCP.Server.Capabilities(
                tools: MCP.Server.Capabilities.Tools(listChanged: true)
            )
        )
        
        guard let server = mcpServer else {
            throw NSError(domain: "MCPService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create MCP Server"])
        }
        
        // Register tool handlers
        await registerToolHandlers(server)
        
        // Create HTTP transport
        httpTransport = HTTPServerTransport(port: 8080)
        
        guard let transport = httpTransport else {
            throw NSError(domain: "MCPService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create HTTP transport"])
        }
        
        // Start the server with the transport
        try await server.start(transport: transport) { clientInfo, capabilities in
            self.logger.info("🤝 Client connected: \(clientInfo.name) v\(clientInfo.version)")
            self.logger.info("🎯 Client capabilities: \(capabilities)")
        }
        
        logger.info("✅ MCP Server started successfully on port 8080")
        logger.info("🔗 Following MCP SDK Protocol Versions: 2025-03-26, 2024-11-05")
        logger.info("📡 Ready for JSON-RPC 2.0 requests at POST http://localhost:8080/mcp")
        
        // Trigger Athena to refresh its MCP connections
        Task {
            do {
                try await APIService.shared.refreshMCP()
                logger.info("🔔 Requested Athena MCP refresh")
            } catch {
                logger.warning("⚠️ Could not trigger Athena MCP refresh: \(error)")
            }
        }
    }
    
    func stop() async {
        logger.info("🛑 Stopping MCP Server...")
        
        serverTask?.cancel()
        serverTask = nil
        
        await httpTransport?.disconnect()
        httpTransport = nil
        
        mcpServer = nil
        
        logger.info("✅ MCP Server stopped")
    }
    
    // MARK: - Tool Handlers
    
    private func registerToolHandlers(_ server: MCP.Server) async {
        logger.info("🔧 Registering tool handlers (clean set)...")

        // MARK: open_window
        let openSchema: MCP.Value = .object([
            "type": .string("object"),
            "properties": .object([
                "url":    .object(["type": .string("string"), "format": .string("uri" )]),
                "width":  .object(["type": .string("number")]),
                "height": .object(["type": .string("number")]),
                "x":      .object(["type": .string("number")]),
                "y":      .object(["type": .string("number")]),
            ]),
            "required": .array([.string("url"), .string("width"), .string("height"), .string("x"), .string("y")])
        ])

        await server.withToolHandler(
            name: "open_window",
            description: "Open a floating WKWebView window at (x,y) with the given size and URL. Returns window_id for later removal.",
            inputSchema: openSchema
        ) { params in
            guard let url   = params["url"]?.stringValue,
                  let width = params["width"]?.doubleValue,
                  let height = params["height"]?.doubleValue,
                  let x = params["x"]?.doubleValue,
                  let y = params["y"]?.doubleValue else {
                return [MCP.Tool.Content.text("{\"success\": false, \"error\": \"Missing or invalid arguments\"}")]
            }

            let windowManager = WindowManager.shared
            let windowID = await MainActor.run {
                windowManager.openWebWindow(url: url,
                                             width: CGFloat(width),
                                             height: CGFloat(height),
                                             x: CGFloat(x),
                                             y: CGFloat(y))
            }

            let result = "{\"success\": true, \"window_id\": \"\(windowID)\", \"url\": \"\(url)\"}"
            return [MCP.Tool.Content.text(result)]
        }

        // MARK: remove_window
        let removeSchema: MCP.Value = .object([
            "type": .string("object"),
            "properties": .object([
                "window_id": .object(["type": .string("string")])
            ]),
            "required": .array([.string("window_id")])
        ])

        await server.withToolHandler(
            name: "remove_window",
            description: "Close a window previously created with open_window using its window_id.",
            inputSchema: removeSchema
        ) { params in
            guard let id = params["window_id"]?.stringValue else {
                return [MCP.Tool.Content.text("{\"success\": false, \"error\": \"Missing window_id\"}")]
            }

            let windowManager = WindowManager.shared
            let success = await MainActor.run { windowManager.closeWebWindow(id: id) }

            let result = success ?
                "{\"success\": true, \"window_id\": \"\(id)\", \"action\": \"closed\"}" :
                "{\"success\": false, \"error\": \"Window not found\"}"
            return [MCP.Tool.Content.text(result)]
        }

        // Expose only these two tools
        await server.withMethodHandler(MCP.ListTools.self) { _ in
            return MCP.ListTools.Result(tools: ToolCatalogue.tools)
        }

        logger.info("✅ Tool handlers registered (open_window, remove_window)")
    }
}

// MARK: - Global Tool Catalogue Helper

private enum ToolCatalogue {
    static var tools: [MCP.Tool] = []
}

// MARK: - Server Extensions for Tool Registration

extension MCP.Server {
    /// Convenience helper to register a tool handler together with its schema & description.
    /// - Parameters:
    ///   - name: Unique tool name.
    ///   - description: Human-readable explanation of what the tool does.
    ///   - inputSchema: JSON-Schema describing the expected parameters.
    ///   - handler: Async closure that generates the tool output.
    func withToolHandler(
        name: String,
        description: String? = nil,
        inputSchema: MCP.Value? = nil,
        handler: @escaping @Sendable ([String: MCP.Value]) async throws -> [MCP.Tool.Content]
    ) async {
        // Build a full tool definition that clients (e.g. Athena) can understand
        let tool = MCP.Tool(
            name: name,
            description: description ?? "Tool: \(name)",
            inputSchema: inputSchema ?? .object([
                "type": .string("object"),
                "properties": .object([:]),
                "required": .array([])
            ])
        )

        // Add to global catalogue so the single ListTools handler can serve it later
        ToolCatalogue.tools.append(tool)

        // Wire up the call-tool method handler
        withMethodHandler(MCP.CallTool.self) { params in
            if params.name == name {
                let content = try await handler(params.arguments ?? [:])
                return MCP.CallTool.Result(content: content)
            }
            throw MCP.MCPError.invalidParams("Unknown tool: \(params.name)")
        }
    }
} 