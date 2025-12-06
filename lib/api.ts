// Clean, standard environment variable check
const API_BASE_URL: string = 
  process.env.NEXT_PUBLIC_API_BASE_URL || // For Next.js
  (import.meta as any).env?.VITE_API_BASE_URL ||   // For Vite
  "https://api.legalsay.ai";              // Default / Fallback

export interface KeyDetail {
    label: string;
    value: string;
}

export interface AnalysisResult {
    contract_type: string;
    key_details: KeyDetail[];
    red_flags: string[];
    yellow_flags: string[];
    green_flags: string[];
    plain_english_summary: string;
    total_health_score: number;
}

export async function analyzeContract(file: File | string, jurisdiction: string = "United States (General)"): Promise<AnalysisResult> {
    const formData = new FormData();
    console.log(API_BASE_URL)
    if (typeof file === 'string') {
        formData.append('text', file);
    } else {
        formData.append('file', file);
    }

    formData.append('jurisdiction', jurisdiction);

    const response = await fetch(`${API_BASE_URL}/analyze_contract/`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analysis failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    // The backend returns { "analysis": "JSON_STRING" } or { "analysis": JSON_OBJECT }
    // We need to handle parsing if it's a string
    let analysis = data.analysis;
    if (typeof analysis === 'string') {
        try {
            analysis = JSON.parse(analysis);
        } catch (e) {
            console.error("Failed to parse analysis JSON string", e);
        }
    }

    return analysis;
}

export async function explainRisk(riskText: string, contractContext: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/explain_risk/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            risk_text: riskText,
            contract_context: contractContext,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to explain risk');
    }

    const data = await response.json();
    return data.explanation;
}

export async function redlineClause(file: File, originalText: string, jurisdiction: string, riskContext: string): Promise<Blob> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('original_text', originalText);
    formData.append('jurisdiction', jurisdiction);
    formData.append('risk_context', riskContext);

    const response = await fetch(`${API_BASE_URL}/redline_clause/`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Redlining failed: ${errorText}`);
    }

    return await response.blob();
}
