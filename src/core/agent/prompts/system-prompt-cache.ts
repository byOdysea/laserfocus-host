/**
 * System Prompt Cache
 * Prevents rebuilding system prompts on every message in a conversation
 */

import { ProviderConfig } from '@/core/infrastructure/config/config';
import logger from '@/lib/utils/logger';

interface CachedPrompt {
    prompt: string;
    canvasHash: string;
    providerHash: string;
    mcpToolsHash: string;
    timestamp: number;
}

export class SystemPromptCache {
    private cache = new Map<string, CachedPrompt>();
    private readonly MAX_CACHE_SIZE = 10; // Keep last 10 conversation prompts
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    
    /**
     * Get cached prompt if valid
     */
    getCachedPrompt(
        threadId: string, 
        canvasHash: string, 
        providerConfig: ProviderConfig,
        mcpToolsCount: number
    ): string | null {
        const cached = this.cache.get(threadId);
        if (!cached) return null;
        
        const now = Date.now();
        const providerHash = this.hashProvider(providerConfig);
        const mcpToolsHash = mcpToolsCount.toString();
        
        // Check if cache is still valid
        if (cached.canvasHash === canvasHash &&
            cached.providerHash === providerHash &&
            cached.mcpToolsHash === mcpToolsHash &&
            (now - cached.timestamp) < this.CACHE_TTL_MS) {
            logger.debug(`[SystemPromptCache] Cache hit for thread ${threadId}`);
            return cached.prompt;
        }
        
        logger.debug(`[SystemPromptCache] Cache miss for thread ${threadId} - stale data`);
        return null;
    }
    
    /**
     * Cache a system prompt
     */
    setCachedPrompt(
        threadId: string,
        prompt: string,
        canvasHash: string,
        providerConfig: ProviderConfig,
        mcpToolsCount: number
    ): void {
        // Enforce cache size limit
        if (this.cache.size >= this.MAX_CACHE_SIZE && !this.cache.has(threadId)) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        
        this.cache.set(threadId, {
            prompt,
            canvasHash,
            providerHash: this.hashProvider(providerConfig),
            mcpToolsHash: mcpToolsCount.toString(),
            timestamp: Date.now()
        });
        
        logger.debug(`[SystemPromptCache] Cached prompt for thread ${threadId}`);
    }
    
    /**
     * Invalidate cache for a thread
     */
    invalidate(threadId: string): void {
        this.cache.delete(threadId);
        logger.debug(`[SystemPromptCache] Invalidated cache for thread ${threadId}`);
    }
    
    /**
     * Clear all cached prompts
     */
    clear(): void {
        this.cache.clear();
        logger.debug('[SystemPromptCache] Cleared all cached prompts');
    }
    
    /**
     * Hash provider config for comparison
     */
    private hashProvider(config: ProviderConfig): string {
        return `${config.service}:${config.model}:${config.temperature}`;
    }
}

// Singleton instance
let cacheInstance: SystemPromptCache | null = null;

/**
 * Get or create the singleton cache instance
 */
export function getSystemPromptCache(): SystemPromptCache {
    if (!cacheInstance) {
        cacheInstance = new SystemPromptCache();
    }
    return cacheInstance;
} 