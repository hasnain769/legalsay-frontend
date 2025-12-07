import { ApiError, logError } from './errorHandler';

// Centralized API Base URL Configuration
// Uses localhost in development, production URL otherwise
const API_BASE_URL: string =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? "http://localhost:8000"
        : "https://api.legalsay.ai");

// Export for use in components if needed
export { API_BASE_URL };

// API timeout in milliseconds
const API_TIMEOUT = 60000; // 60 seconds for AI processing

export interface KeyDetail {
    label: string;
    value: string;
}

export interface FlagWithText {
    analysis: string;
    original_text: string;
}

export interface AnalysisResult {
    contract_type: string;
    jurisdiction: string;
    key_details: Array<{ label: string; value: string }>;
    red_flags: FlagWithText[];
    yellow_flags: FlagWithText[];
    green_flags: FlagWithText[];
    plain_english_summary: string;
    total_health_score: number;
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number = API_TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new ApiError('Request timed out. The analysis is taking longer than expected. Please try again.', 408);
        }
        throw error;
    }
}

/**
 * Check if API is reachable
 */
export async function checkApiHealth(): Promise<boolean> {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/`, {}, 5000);
        return response.ok;
    } catch {
        return false;
    }
}

export async function analyzeContract(file: File | string): Promise<AnalysisResult> {
    const formData = new FormData();

    if (typeof file === 'string') {
        if (!file.trim()) {
            throw new ApiError('Contract text cannot be empty', 400);
        }
        formData.append('text', file);
    } else {
        if (file.size === 0) {
            throw new ApiError('Uploaded file is empty', 400);
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            throw new ApiError('File size exceeds 10MB limit', 400);
        }
        formData.append('file', file);
    }


    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/analyze_contract/`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            let errorMessage = `Analysis failed (${response.status})`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorData.message || errorMessage;
            } catch {
                const errorText = await response.text();
                if (errorText) errorMessage = errorText;
            }

            throw new ApiError(errorMessage, response.status);
        }

        const data = await response.json();

        // The backend returns { "analysis": "JSON_STRING" } or { "analysis": JSON_OBJECT }
        let analysis = data.analysis;
        if (typeof analysis === 'string') {
            try {
                analysis = JSON.parse(analysis);
            } catch (e) {
                logError('JSON Parse Error', e, { rawAnalysis: analysis });
                throw new ApiError('Invalid response format from server', 500);
            }
        }

        // Validate response structure
        if (!analysis || typeof analysis !== 'object') {
            throw new ApiError('Invalid analysis result structure', 500);
        }

        return analysis;
    } catch (error) {
        if (error instanceof ApiError) throw error;

        if (error instanceof Error) {
            if (error.message.includes('Failed to fetch')) {
                throw new ApiError(
                    `Cannot connect to server. Please check:\n1. Your internet connection\n2. API server is running at ${API_BASE_URL}`,
                    0
                );
            }
        }

        throw new ApiError('An unexpected error occurred during analysis', 500);
    }
}

export async function explainRisk(riskText: string, contractContext: string): Promise<string> {
    if (!riskText.trim()) {
        throw new ApiError('Risk text cannot be empty', 400);
    }

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/explain_risk/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                risk_text: riskText,
                contract_context: contractContext,
            }),
        }, 30000); // 30 second timeout for explanations

        if (!response.ok) {
            throw new ApiError('Failed to generate risk explanation', response.status);
        }

        const data = await response.json();
        return data.explanation || 'No explanation available';
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('Failed to explain risk. Please try again.', 500);
    }
}

export async function redlineClause(file: File, originalText: string, jurisdiction: string, riskContext: string): Promise<Blob> {
    if (!file || file.size === 0) {
        throw new ApiError('Valid file is required for redlining', 400);
    }

    if (!file.name.endsWith('.docx')) {
        throw new ApiError('Only DOCX files are supported for redlining', 400);
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('original_text', originalText);
    formData.append('jurisdiction', jurisdiction);
    formData.append('risk_context', riskContext);

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/redline_clause/`, {
            method: 'POST',
            body: formData,
        }, 45000); // 45 second timeout

        if (!response.ok) {
            let errorMessage = 'Redlining failed';
            try {
                const errorText = await response.text();
                if (errorText) errorMessage = errorText;
            } catch { }

            throw new ApiError(errorMessage, response.status);
        }

        return await response.blob();
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('Failed to redline document. Please try again.', 500);
    }
}

/**
 * Extract text from a file
 */
export async function extractText(file: File): Promise<string> {
    if (!file || file.size === 0) {
        throw new ApiError('Valid file is required for text extraction', 400);
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/extract_text/`, {
            method: 'POST',
            body: formData,
        }, 30000); // 30 second timeout

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new ApiError(errorText || 'Failed to extract text', response.status);
        }

        const data = await response.json();

        if (!data.text || data.text.trim().length === 0) {
            throw new ApiError('No text could be extracted from the file', 500);
        }

        return data.text;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('Failed to extract text. Please try again.', 500);
    }
}

/**
 * Negotiation chat payload
 */
export interface NegotiationPayload {
    message: string;
    contract_context: string;
    jurisdiction: string;
    analysis_context?: any;
    selected_clause?: string;
    history?: Array<{ role: string; content: string }>;
}

/**
 * Negotiate chat - returns raw Response for streaming
 */
export async function negotiateChat(payload: NegotiationPayload): Promise<Response> {
    if (!payload.message.trim()) {
        throw new ApiError('Message cannot be empty', 400);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/negotiate/chat/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new ApiError('Negotiation failed', response.status);
        }

        return response;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error instanceof Error && error.message.includes('Failed to fetch')) {
            throw new ApiError(
                `Cannot connect to server at ${API_BASE_URL}. Please check your connection.`,
                0
            );
        }
        throw new ApiError('Failed to process negotiation. Please try again.', 500);
    }
}
