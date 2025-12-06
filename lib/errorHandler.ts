import { showToast } from '@/components/Toast';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
    constructor(
        message: string,
        public statusCode?: number,
        public details?: any
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Gets a user-friendly error message from an error object
 */
export function getUserFriendlyMessage(error: unknown): string {
    if (error instanceof ApiError) {
        // API-specific errors
        if (error.statusCode === 404) {
            return 'The requested resource was not found. Please try again.';
        }
        if (error.statusCode === 500) {
            return 'Server error occurred. Our team has been notified. Please try again later.';
        }
        if (error.statusCode === 503) {
            return 'Service temporarily unavailable. Please try again in a few moments.';
        }
        return error.message;
    }

    if (error instanceof Error) {
        // Network errors
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            return 'Network connection error. Please check your internet connection and try again.';
        }

        // Timeout errors
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
            return 'Request timed out. Please try again.';
        }

        // CORS errors
        if (error.message.includes('CORS')) {
            return 'Connection blocked by security policy. Please contact support.';
        }

        return error.message || 'An unexpected error occurred.';
    }

    return 'An unexpected error occurred. Please try again.';
}

/**
 * Logs error for development purposes
 */
export function logError(context: string, error: unknown, additionalInfo?: any) {
    if (process.env.NODE_ENV === 'development') {
        console.group(`❌ Error in ${context}`);
        console.error('Error:', error);
        if (additionalInfo) {
            console.log('Additional Info:', additionalInfo);
        }
        console.groupEnd();
    } else {
        // In production, you might want to send to an error tracking service
        // e.g., Sentry, LogRocket, etc.
        console.error(`Error in ${context}:`, error);
    }
}

/**
 * Handles errors with user-friendly notifications
 */
export function handleError(error: unknown, context: string = 'Operation', showNotification: boolean = true) {
    logError(context, error);

    const userMessage = getUserFriendlyMessage(error);

    if (showNotification) {
        showToast(userMessage, 'error');
    }

    return userMessage;
}

/**
 * Wraps an async function with error handling
 */
export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string,
    onError?: (error: unknown) => void
): Promise<T | null> {
    try {
        return await operation();
    } catch (error) {
        handleError(error, context);
        onError?.(error);
        return null;
    }
}
