/**
 * API Key Validation Utilities
 * 
 * Centralized validation logic for API keys from different AI providers.
 * These utilities provide format validation and basic security checks.
 */

/**
 * Validation constants
 */
export const API_KEY_VALIDATION = {
    MIN_LENGTH: 10,
    MASKED_PATTERNS: ['*', '...', '••••']
} as const;

export interface ApiKeyValidationResult {
    isValid: boolean;
    message: string;
}

/**
 * Validate API key format based on provider
 */
export function validateApiKey(apiKey: string, provider: string): ApiKeyValidationResult {
    if (!apiKey || apiKey.trim().length < API_KEY_VALIDATION.MIN_LENGTH) {
        return {
            isValid: false,
            message: 'API key is missing or too short'
        };
    }

    // Check for masked keys
    if (API_KEY_VALIDATION.MASKED_PATTERNS.some(pattern => apiKey.includes(pattern))) {
        return {
            isValid: false,
            message: 'API key is masked or invalid'
        };
    }

    // Provider-specific format validation
    const formatChecks = {
        google: () => apiKey.startsWith('AIza'),
        openai: () => apiKey.startsWith('sk-'),
        anthropic: () => apiKey.startsWith('sk-ant-'),
        ollama: () => true, // No API key needed
        custom: () => true  // Accept any format
    };

    const checker = formatChecks[provider as keyof typeof formatChecks];
    if (!checker || !checker()) {
        const expectedFormats = {
            google: 'AIza...',
            openai: 'sk-...',
            anthropic: 'sk-ant-...'
        };
        const expected = expectedFormats[provider as keyof typeof expectedFormats];
        return {
            isValid: false,
            message: expected ? `${provider} API keys should start with "${expected}"` : 'Invalid API key format'
        };
    }

    return {
        isValid: true,
        message: 'API key format looks correct'
    };
}

/**
 * Simple API key validation (for backwards compatibility)
 */
export function isValidApiKey(apiKey: string): boolean {
    if (!apiKey || apiKey.trim().length < API_KEY_VALIDATION.MIN_LENGTH) {
        return false;
    }
    
    // Basic validation for common API key formats
    const patterns = [
        /^AIza[0-9A-Za-z-_]{35}$/, // Google AI
        /^sk-[a-zA-Z0-9]{32,}$/, // OpenAI
        /^sk-ant-[a-zA-Z0-9-_]{32,}$/, // Anthropic
        /^[a-zA-Z0-9-_]{32,}$/, // Generic pattern
    ];
    
    return patterns.some(pattern => pattern.test(apiKey.trim()));
}

/**
 * Check if an API key appears to be masked/redacted
 */
export function isApiKeyMasked(apiKey: string): boolean {
    if (!apiKey) return false;
    
    return API_KEY_VALIDATION.MASKED_PATTERNS.some(pattern => 
        apiKey.includes(pattern)
    );
}

/**
 * Get expected format hint for a provider
 */
export function getApiKeyFormatHint(provider: string): string {
    const hints = {
        google: 'Should start with "AIza" (e.g., AIza...)',
        openai: 'Should start with "sk-" (e.g., sk-...)',
        anthropic: 'Should start with "sk-ant-" (e.g., sk-ant-...)',
        ollama: 'No API key required for local Ollama',
        custom: 'Depends on your provider'
    };
    
    return hints[provider as keyof typeof hints] || 'Check your provider documentation';
} 