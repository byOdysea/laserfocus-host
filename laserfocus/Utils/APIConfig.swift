//
//  APIConfig.swift
//  laserfocus
//
//  Created by Andrés on 19/6/2025.
//

import Foundation

struct APIConfig {
    // MARK: - Authentication Configuration
    
    // TODO: Replace with your actual authentication token from the Flask server
    // This should match the AUTHENTICATION_TOKEN environment variable in your Flask app
    static let authenticationToken = "N1alnmexA5ki16YP"
    
    // TODO: Configure the scopes you need for your application
    static let scopes = ["all"]
    
    // MARK: - Server Configuration
    static let baseURL = "http://127.0.0.1:8080"
    
    // MARK: - Token Management
    static let tokenRefreshBuffer: TimeInterval = 60 // Refresh token 1 minute before expiry
}

// MARK: - Security Note
/*
 For production apps, consider:
 1. Storing the authentication token in Keychain
 2. Using environment variables or a secure configuration system
 3. Implementing proper token refresh mechanisms
 4. Using HTTPS in production
 */ 
