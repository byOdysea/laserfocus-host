//
//  APIService.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import Foundation
import Combine

class APIService: ObservableObject {
    static let shared = APIService()
    
    private let baseURL = APIConfig.baseURL
    private let session = URLSession.shared
    
    // JWT token management
    @Published private var accessToken: String?
    private var tokenExpirationDate: Date?
    
    private init() {}
    
    func invokeAthena(message: String) async throws -> String {
        // Ensure we have a valid JWT token
        try await ensureValidToken()
        
        guard let url = URL(string: "\(baseURL)/athena/invoke") else {
            throw APIError.invalidURL
        }
        
        guard let token = accessToken else {
            throw APIError.authenticationRequired
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let payload = ["message": message]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        do {
            let (data, response) = try await session.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }
            
            if httpResponse.statusCode == 401 {
                // Token might be expired, try to refresh and retry once
                accessToken = nil
                tokenExpirationDate = nil
                try await ensureValidToken()
                
                // Retry the request with new token
                request.setValue("Bearer \(accessToken!)", forHTTPHeaderField: "Authorization")
                let (retryData, retryResponse) = try await session.data(for: request)
                
                guard let retryHttpResponse = retryResponse as? HTTPURLResponse else {
                    throw APIError.invalidResponse
                }
                
                guard retryHttpResponse.statusCode == 200 else {
                    throw APIError.serverError(retryHttpResponse.statusCode)
                }
                
                if let responseString = String(data: retryData, encoding: .utf8) {
                    return responseString
                } else {
                    throw APIError.invalidData
                }
            }
            
            guard httpResponse.statusCode == 200 else {
                throw APIError.serverError(httpResponse.statusCode)
            }
            
            if let responseString = String(data: data, encoding: .utf8) {
                return responseString
            } else {
                throw APIError.invalidData
            }
            
        } catch {
            if error is APIError {
                throw error
            } else {
                throw APIError.networkError(error)
            }
        }
    }
    
    private func ensureValidToken() async throws {
        // Check if we have a valid token that hasn't expired
        if let token = accessToken,
           let expirationDate = tokenExpirationDate,
           Date() < expirationDate.addingTimeInterval(-APIConfig.tokenRefreshBuffer) {
            return
        }
        
        // Get a new token
        try await authenticateAndGetToken()
    }
    
    private func authenticateAndGetToken() async throws {
        guard let url = URL(string: "\(baseURL)/token") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload = [
            "token": APIConfig.authenticationToken,
            "scopes": APIConfig.scopes
        ] as [String : Any]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        
        do {
            let (data, response) = try await session.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }
            
            guard httpResponse.statusCode == 200 else {
                throw APIError.authenticationFailed
            }
            
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let token = json["access_token"] as? String,
                  let expiresIn = json["expires_in"] as? Int else {
                throw APIError.invalidData
            }
            
            self.accessToken = token
            self.tokenExpirationDate = Date().addingTimeInterval(TimeInterval(expiresIn))
            
        } catch {
            if error is APIError {
                throw error
            } else {
                throw APIError.networkError(error)
            }
        }
    }
}

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case invalidData
    case serverError(Int)
    case networkError(Error)
    case authenticationRequired
    case authenticationFailed
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response"
        case .invalidData:
            return "Invalid data received"
        case .serverError(let code):
            return "Server error: \(code)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .authenticationRequired:
            return "Authentication token required"
        case .authenticationFailed:
            return "Authentication failed - check your credentials"
        }
    }
} 