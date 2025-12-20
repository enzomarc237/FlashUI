
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wraps an async function with retry logic and exponential backoff.
 * Specifically handles 429 RESOURCE_EXHAUSTED errors.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 2000
): Promise<T> {
    let lastError: any;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const errorText = error?.message || String(error);
            const isRateLimit = errorText.includes('429') || errorText.includes('RESOURCE_EXHAUSTED');
            
            if (isRateLimit && i < maxRetries) {
                const waitTime = baseDelay * Math.pow(2, i) + (Math.random() * 1000);
                console.warn(`Rate limit hit (429). Retrying in ${Math.round(waitTime)}ms... (Attempt ${i + 1}/${maxRetries})`);
                await delay(waitTime);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}
