/**
 * Retry & Circuit Breaker Utilities
 * 
 * Provides retry logic with exponential backoff and circuit breaker pattern
 * for reliable device communication.
 * 
 * Phase 4: Network failure handling improvements
 */

/**
 * Retry options configuration
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: ((error: any) => boolean);
  onRetry?: (error: any, attempt: number) => void;
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',         // Failing - reject requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;       // Time in ms before trying half-open
  resetTimeout?: number;  // Time to wait before reset
}

/**
 * Circuit Breaker class
 * Prevents cascading failures by stopping requests to failing services
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private nextAttempt: number = Date.now();
  private lastFailureTime: number = 0;
  
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly resetTimeout: number;
  
  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 60000; // 1 minute
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successes = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        return CircuitBreakerState.HALF_OPEN;
      }
    }
    return this.state;
  }
  
  /**
   * Check if circuit is closed (allowing requests)
   */
  isAvailable(): boolean {
    return this.getState() !== CircuitBreakerState.OPEN;
  }
  
  /**
   * Get time until next attempt
   */
  getTimeUntilRetry(): number {
    if (this.state !== CircuitBreakerState.OPEN) return 0;
    return Math.max(0, this.nextAttempt - Date.now());
  }
  
  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
  }
  
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.successes = 0;
      }
    }
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.resetTimeout;
    } else if (this.failures >= this.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

/**
 * Retry queue for offline operations
 */
export interface QueuedOperation {
  id: string;
  operation: () => Promise<any>;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
}

/**
 * Retry Queue - stores operations for retry when offline
 */
export class RetryQueue {
  private queue: QueuedOperation[] = [];
  private processing: boolean = false;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  
  constructor(maxRetries: number = 3, retryDelay: number = 5000) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }
  
  /**
   * Add operation to queue
   */
  add(operation: () => Promise<any>, priority: number = 1): string {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.queue.push({
      id,
      operation,
      priority,
      retries: 0,
      maxRetries: this.maxRetries,
      createdAt: Date.now()
    });
    
    // Sort by priority (higher first)
    this.queue.sort((a, b) => b.priority - a.priority);
    
    return id;
  }
  
  /**
   * Process queue
   */
  async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        item.lastAttempt = Date.now();
        
        try {
          await item.operation();
          // Remove successful operation
          this.queue.shift();
        } catch (error: any) {
          item.retries++;
          item.error = error.message;
          
          if (item.retries >= item.maxRetries) {
            // Remove failed operation after max retries
            console.error(`Operation ${item.id} failed after ${item.maxRetries} retries:`, error);
            this.queue.shift();
          } else {
            // Move to end of queue for retry
            const failed = this.queue.shift()!;
            this.queue.push(failed);
            
            // Wait before retry
            await this.delay(this.retryDelay);
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }
  
  /**
   * Get queue status
   */
  getStatus(): { pending: number; processing: boolean } {
    return {
      pending: this.queue.length,
      processing: this.processing
    };
  }
  
  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableErrors = () => true,
    onRetry
  } = options;
  
  let lastError: any;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      if (!retryableErrors(error)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt < maxRetries) {
        if (onRetry) {
          onRetry(error, attempt + 1);
        }
        
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Calculate next delay
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Default retryable error checker
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  // Network errors
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.message?.includes('network')) {
    return true;
  }
  
  // HTTP errors that should retry
  if (error.status >= 500 || error.status === 429) {
    return true;
  }
  
  return false;
}

/**
 * Create a circuit breaker for a specific service
 */
export function createCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  return new CircuitBreaker(options);
}

// Export singleton instances for common services
const circuitBreakers: Map<string, CircuitBreaker> = new Map();

export function getCircuitBreaker(name: string): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker());
  }
  return circuitBreakers.get(name)!;
}

const retryUtils = {
  CircuitBreaker,
  RetryQueue,
  withRetry,
  isNetworkError,
  createCircuitBreaker,
  getCircuitBreaker
};
export default retryUtils;
