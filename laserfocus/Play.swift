import FoundationModels
import SwiftUI
import Playgrounds

#Playground {
    Task {
        let session = LanguageModelSession()
        
        do {
            let response = try await session.respond(to: "Hello")
        } catch {
            print("Error: \(error)")
        }
    }
}
