import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalysisResult } from './api';

export interface FlagWithText {
    id: string;
    analysis: string;
    original_text: string;
    type: 'red' | 'yellow' | 'green';
}

export interface ContractState {
    // State
    contractId: string;
    file: File | null;
    contractContent: string;
    analysisResult: AnalysisResult | null;
    flags: FlagWithText[];
    jurisdiction: string;

    // Actions
    setContract: (file: File, content: string) => void;
    setAnalysis: (analysis: AnalysisResult) => void;
    removeNegotiatedClause: (clauseId: string) => void;
    updateContractContent: (content: string) => void;
    setJurisdiction: (jurisdiction: string) => void;
    reset: () => void;
}

// Helper to convert analysis flags to our flag format with IDs
const convertAnalysisToFlags = (analysis: AnalysisResult): FlagWithText[] => {
    const flags: FlagWithText[] = [];

    // Red flags
    if (analysis.red_flags) {
        analysis.red_flags.forEach((flag, idx) => {
            const flagData = typeof flag === 'string'
                ? { analysis: flag, original_text: 'N/A' }
                : flag;
            flags.push({
                id: `red-${idx}`,
                analysis: flagData.analysis,
                original_text: flagData.original_text,
                type: 'red'
            });
        });
    }

    // Yellow flags
    if (analysis.yellow_flags) {
        analysis.yellow_flags.forEach((flag, idx) => {
            const flagData = typeof flag === 'string'
                ? { analysis: flag, original_text: 'N/A' }
                : flag;
            flags.push({
                id: `yellow-${idx}`,
                analysis: flagData.analysis,
                original_text: flagData.original_text,
                type: 'yellow'
            });
        });
    }

    // Green flags
    if (analysis.green_flags) {
        analysis.green_flags.forEach((flag, idx) => {
            const flagData = typeof flag === 'string'
                ? { analysis: flag, original_text: 'N/A' }
                : flag;
            flags.push({
                id: `green-${idx}`,
                analysis: flagData.analysis,
                original_text: flagData.original_text,
                type: 'green'
            });
        });
    }

    return flags;
};

export const useContractStore = create<ContractState>()(
    persist(
        (set) => ({
            // Initial state
            contractId: '',
            file: null,
            contractContent: '',
            analysisResult: null,
            flags: [],
            jurisdiction: 'United States (General)',

            // Actions
            setContract: (file, content) => {
                const contractId = `${file.name}-${Date.now()}`;
                set({
                    contractId,
                    file,
                    contractContent: content,
                });
            },

            setAnalysis: (analysis) => {
                const flags = convertAnalysisToFlags(analysis);
                set({
                    analysisResult: analysis,
                    flags,
                });
            },

            removeNegotiatedClause: (clauseId) => {
                set((state) => ({
                    flags: state.flags.filter(flag => flag.id !== clauseId)
                }));
            },

            updateContractContent: (content) => {
                set({ contractContent: content });
            },

            setJurisdiction: (jurisdiction) => {
                set({ jurisdiction });
            },

            reset: () => {
                set({
                    contractId: '',
                    file: null,
                    contractContent: '',
                    analysisResult: null,
                    flags: [],
                    jurisdiction: 'United States (General)',
                });
            },
        }),
        {
            name: 'contract-storage',
            // Don't persist file object (not serializable)
            partialize: (state) => ({
                contractId: state.contractId,
                contractContent: state.contractContent,
                analysisResult: state.analysisResult,
                flags: state.flags,
                jurisdiction: state.jurisdiction,
            }),
        }
    )
);
