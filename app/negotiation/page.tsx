'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useContractStore } from '@/lib/contract-store';
import { cleanPdfText } from '@/lib/textUtils';
import { jsPDF } from 'jspdf';
import { analyzeContract, negotiateChat, NegotiationPayload } from '@/lib/api';
import { handleError, logError } from '@/lib/errorHandler';
import { showToast } from '@/components/Toast';

interface ClauseItem {
    id: string; // Changed to string to match flag IDs
    title: string;
    text: string;
    original_text: string;
    riskLevel: 'high' | 'medium' | 'low';
}

interface ChatMessage {
    role: 'user' | 'agent';
    text: string;
}



export default function NegotiationPage() {
    const router = useRouter();
    const [contractText, setContractText] = useState<string>("");
    const [clauses, setClauses] = useState<ClauseItem[]>([]);
    const [selectedClauseIds, setSelectedClauseIds] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isReanalyzing, setIsReanalyzing] = useState(false);
    const [analysisResults, setAnalysisResults] = useState<any>(null);

    // Mobile tab state
    const [activeTab, setActiveTab] = useState<'clauses' | 'contract' | 'copilot'>('clauses');

    // Copilot chat state
    const [chatInput, setChatInput] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const announcedClausesRef = useRef<Set<string>>(new Set()); // Track announced clauses

    // Zustand store
    const { contractContent, flags, analysisResult, jurisdiction, removeNegotiatedClause, updateContractContent } = useContractStore();

    // Track if Zustand has hydrated from localStorage
    const [hasHydrated, setHasHydrated] = useState(false);

    // Wait for Zustand to hydrate
    useEffect(() => {
        setHasHydrated(true);
    }, []);


    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load contract and convert flags to clauses
    useEffect(() => {
        // Don't check until Zustand has hydrated from localStorage
        if (!hasHydrated) return;

        // Load contract content from store
        if (contractContent) {
            // Clean the text (in case it wasn't cleaned during upload)
            const cleanedText = cleanPdfText(contractContent);
            setContractText(cleanedText);
        } else {
            router.push('/'); // Redirect if no contract
            return;
        }

        // Load analysis results
        if (analysisResult) {
            setAnalysisResults(analysisResult);
        }

        // Convert flags to clauses (only red and yellow flags for negotiation)
        const redAndYellowFlags = flags.filter(f => f.type === 'red' || f.type === 'yellow');
        const clauseItems: ClauseItem[] = redAndYellowFlags.map((flag) => ({
            id: flag.id,
            title: flag.analysis.substring(0, 50) + '...',
            text: flag.analysis,
            original_text: flag.original_text,
            riskLevel: flag.type === 'red' ? 'high' : 'medium',
        }));
        setClauses(clauseItems);
    }, [contractContent, flags, analysisResult, router, hasHydrated]);

    // Toggle clause selection
    const toggleClauseSelection = (clauseId: string) => {
        setSelectedClauseIds(prev => {
            const isCurrentlySelected = prev.includes(clauseId);

            if (isCurrentlySelected) {
                // Deselecting - remove from array and tracking
                announcedClausesRef.current.delete(clauseId);

                // Remove the selection message from chat
                const clause = clauses.find(c => c.id === clauseId);
                if (clause) {
                    setMessages(prevMessages =>
                        prevMessages.filter(msg =>
                            msg.text !== `📌 Selected: ${clause.title} `
                        )
                    );
                }

                return prev.filter(id => id !== clauseId);
            } else {
                // Selecting - add to array and add message (only once)
                if (!announcedClausesRef.current.has(clauseId)) {
                    const clause = clauses.find(c => c.id === clauseId);
                    if (clause) {
                        announcedClausesRef.current.add(clauseId);
                        setMessages(prevMessages => [...prevMessages, {
                            role: 'user',
                            text: `📌 Selected: ${clause.title} `
                        }]);
                    }
                }
                return [...prev, clauseId];
            }
        });
    };

    // Process single clause
    const processClause = async (clauseId: string) => {
        const clause = clauses.find(c => c.id === clauseId);
        if (!clause) return;

        const message = chatInput.trim() || `Analyze and negotiate a better version of: "${clause.text}"`;
        await processNegotiation([clause], message);
        setChatInput(""); // Clear input after processing

        // Remove from selection
        setSelectedClauseIds(prev => prev.filter(id => id !== clauseId));

        // Remove from clause list after negotiation
        setClauses(prev => prev.filter(c => c.id !== clauseId));

        // Remove from Zustand store
        removeNegotiatedClause(clauseId);

        // Remove from announced tracking
        announcedClausesRef.current.delete(clauseId);
    };

    // Process all selected clauses
    const processAllClauses = async () => {
        const selectedClauses = clauses.filter(c => selectedClauseIds.includes(c.id));
        if (selectedClauses.length === 0) return;

        const message = chatInput.trim() || `Negotiate better versions of all selected clauses.`;
        await processNegotiation(selectedClauses, message);
        setChatInput(""); // Clear input after processing

        // Remove all selected clauses from list after negotiation
        setClauses(prev => prev.filter(c => !selectedClauseIds.includes(c.id)));

        // Remove from Zustand store
        selectedClauseIds.forEach(id => removeNegotiatedClause(id));

        // Clear selection and tracking
        selectedClauseIds.forEach(id => announcedClausesRef.current.delete(id));
        setSelectedClauseIds([]);
    };

    // Core negotiation processing with streaming
    const processNegotiation = async (clauses: ClauseItem[], message: string) => {
        setIsProcessing(true);
        // Don't add message here - already added by toggleClauseSelection or handleChatSend

        try {
            const payload: NegotiationPayload = {
                message: message,
                contract_context: contractText,
                jurisdiction: jurisdiction || 'United States (General)',
                analysis_context: analysisResults || {},
                selected_clause: clauses.map(c => c.text).join('\n\n'),
                history: messages.map(m => ({ role: m.role, content: m.text }))
            };

            const response = await negotiateChat(payload);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let agentResponse = "";
            let fullProposedEdit = "";
            let isEditMode = false;
            let hasShownMessage = false; // Track if we've completed showing the message

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'strategy') {
                            // Strategy comes first - ignore for now or handle if needed
                        } else if (data.type === 'text_delta') {
                            agentResponse += data.content;
                            // Update agent message in real-time
                            setMessages(prev => {
                                const newArr = [...prev];
                                if (newArr[newArr.length - 1]?.role === 'agent') {
                                    newArr[newArr.length - 1] = { role: 'agent', text: agentResponse };
                                } else {
                                    newArr.push({ role: 'agent', text: agentResponse });
                                }
                                return newArr;
                            });
                        } else if (data.type === 'edit_start') {
                            // Message is complete, now we'll start showing edits
                            if (!hasShownMessage) {
                                hasShownMessage = true;
                                // Wait a moment for user to see the message
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                // NOW switch to contract tab to show real-time updates
                                setActiveTab('contract');
                            }
                            isEditMode = true;
                            fullProposedEdit = "";
                        } else if (data.type === 'edit_delta' && isEditMode) {
                            fullProposedEdit += data.content;
                            // STREAM UPDATE: Show real-time contract changes
                            setContractText(fullProposedEdit);
                        } else if (data.type === 'done') {
                            isEditMode = false;
                        }
                    } catch (e) {
                        console.error("Parse error:", e);
                    }
                }
            }
        } catch (error) {
            logError('Negotiation Processing', error);
            const errorMsg = handleError(error, 'Negotiation');
            setMessages(prev => [...prev, {
                role: 'agent',
                text: `❌ ${errorMsg} \n\nPlease try again or rephrase your request.`
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    // Send custom chat message
    const handleChatSend = async () => {
        if (!chatInput.trim() || isProcessing) return;

        const message = chatInput.trim();
        setMessages(prev => [...prev, { role: 'user', text: message }]);
        setChatInput("");
        await processNegotiation([], message);
    };

    // Download contract as PDF
    const downloadPDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const maxWidth = pageWidth - 2 * margin;

        // Add title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Contract Document', margin, margin);

        // Add date
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${new Date().toLocaleDateString()} `, margin, margin + 10);

        // Add contract content
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(contractText, maxWidth);

        let yPosition = margin + 20;
        const lineHeight = 7;

        for (let i = 0; i < lines.length; i++) {
            if (yPosition + lineHeight > pageHeight - margin) {
                doc.addPage();
                yPosition = margin;
            }
            doc.text(lines[i], margin, yPosition);
            yPosition += lineHeight;
        }

        // Download
        doc.save('contract.pdf');
    };

    // Re-analyze current contract
    const handleReanalyze = async () => {
        if (!contractText || isReanalyzing) return;

        if (!contractText.trim()) {
            showToast('Contract text is empty. Cannot re-analyze.', 'warning');
            return;
        }

        setIsReanalyzing(true);
        showToast('🔄 Re-analyzing with fresh AI insights...', 'info');

        try {
            // Create a new File object from contract text
            const blob = new Blob([contractText], { type: 'text/plain' });
            const fileToAnalyze = new File([blob], 'contract.txt', { type: 'text/plain' });

            // Use the same analyzeContract function as the home page
            const result = await analyzeContract(fileToAnalyze);

            if (!result) {
                throw new Error('Analysis returned no results');
            }

            // Update Zustand store with new analysis
            const { setContract, setAnalysis } = useContractStore.getState();
            setContract(fileToAnalyze, contractText);
            setAnalysis(result);

            showToast('✅ Fresh analysis ready! Redirecting to your report...', 'success');

            // Small delay to show success message
            setTimeout(() => {
                router.push('/report');
            }, 500);
        } catch (error) {
            logError('Re-analysis Failed', error, {
                jurisdiction: jurisdiction || 'United States (General)',
                textLength: contractText.length
            });
            handleError(error, 'Re-analysis');
        } finally {
            setIsReanalyzing(false);
        }
    };

    // Get risk color
    const getRiskColor = (level: string) => {
        switch (level) {
            case 'high': return 'bg-red-500';
            case 'medium': return 'bg-yellow-500';
            case 'low': return 'bg-green-500';
            default: return 'bg-gray-500';
        }
    };

    // Helper to create a flexible regex pattern from clause text (allows whitespace variations)
    const createFlexiblePattern = (text: string): RegExp => {
        // Escape special regex characters
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Replace any whitespace sequence with flexible whitespace matcher
        const flexible = escaped.replace(/\s+/g, '\\s+');
        return new RegExp(flexible, 'i'); // Case insensitive
    };

    const highlightedText = () => {
        if (clauses.length === 0) return contractText;

        // Create segments with their positions and highlighting info
        const segments: Array<{ start: number; end: number; clauseIdx?: number }> = [];

        // Find all clause matches in the contract
        clauses.forEach((clause, clauseIdx) => {
            if (!clause.original_text || clause.original_text === 'N/A') return;

            const pattern = createFlexiblePattern(clause.original_text);
            const match = contractText.match(pattern);

            if (match && match.index !== undefined) {
                segments.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    clauseIdx
                });
            }
        });

        // Sort segments by start position
        segments.sort((a, b) => a.start - b.start);

        // Build result with highlights
        const result: React.ReactNode[] = [];
        let lastEnd = 0;

        segments.forEach((segment, segmentIdx) => {
            // Add text before this highlight
            if (segment.start > lastEnd) {
                result.push(contractText.substring(lastEnd, segment.start));
            }

            // Add highlighted text
            if (segment.clauseIdx !== undefined) {
                const clause = clauses[segment.clauseIdx];

                // Determine background color
                let bgClass = '';
                if (selectedClauseIds.includes(clause.id)) {
                    bgClass = 'bg-blue-500/40 border-2 border-blue-400';
                } else if (clause.riskLevel === 'high') {
                    bgClass = 'bg-red-500/20';
                } else if (clause.riskLevel === 'medium') {
                    bgClass = 'bg-yellow-500/20';
                } else {
                    bgClass = 'bg-green-500/20';
                }

                result.push(
                    <span
                        key={`clause-${segment.clauseIdx}-${segmentIdx}`}
                        className={`${bgClass} text-white px-1 rounded transition-all`}
                    >
                        {contractText.substring(segment.start, segment.end)}
                    </span>
                );
            }

            lastEnd = segment.end;
        });

        // Add remaining text
        if (lastEnd < contractText.length) {
            result.push(contractText.substring(lastEnd));
        }

        return <>{result}</>;
    };


    // Copilot expansion state
    const [isCopilotExpanded, setIsCopilotExpanded] = useState(false);

    return (
        <>
            {/* Desktop View (Two Equal Panels + Bottom Copilot) - hidden on mobile/tablet */}
            <div className="hidden lg:flex h-screen bg-[#0a0f1c] text-white overflow-hidden flex-col">
                {/* Top Header */}
                <div className="w-full bg-[#13151f] border-b border-white/20 p-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <img src="/logo.png" alt="LegalSay" className="w-10 h-10" />
                        <div className="h-6 w-px bg-white/20"></div>
                        <h1 className="text-lg font-semibold text-white">Playground</h1>
                    </div>
                    <button
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                        </svg>
                        Dashboard
                    </button>
                </div>

                {/* Top Section - Two Equal Panels */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left Panel - Flagged Clauses (50%) */}
                    <div className="w-1/2 bg-[#13151f] border-r border-white/20 flex flex-col">
                        <div className="p-4  border-white/20 flex-shrink-0">
                            <h2 className="text-base font-semibold text-white mb-2">Flagged Clauses</h2>
                            <p className="text-xs text-white/50">
                                {clauses.length} total • {selectedClauseIds.length} selected
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {clauses.map((clause) => (
                                <div key={clause.id} className="mb-4 w-full">
                                    <button
                                        onClick={() => toggleClauseSelection(clause.id)}
                                        className={`w-full text-left p-5 rounded-xl transition-all duration-200 border-2 ${selectedClauseIds.includes(clause.id)
                                            ? 'bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/60 shadow-lg shadow-red-500/20'
                                            : 'bg-[#1a1d2e] border-white/10 hover:border-white/20 hover:bg-[#1e2132]'
                                            }`}
                                    >
                                        <div className="flex items-start gap-4">
                                            {/* Risk Indicator */}
                                            <div className="mt-1 flex-shrink-0">
                                                <div className={`w-2 h-2 rounded-full ${clause.riskLevel === 'high' ? 'bg-red-500' :
                                                    clause.riskLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                                    }`} />
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                    <h3 className="text-sm font-semibold text-white truncate">{clause.title}</h3>
                                                    {selectedClauseIds.includes(clause.id) && (
                                                        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                                                        </svg>
                                                    )}
                                                </div>

                                                <p className="text-xs text-white/70 leading-relaxed line-clamp-2 mb-2">
                                                    {clause.text}
                                                </p>

                                                {/* Original Text Expandable Section */}
                                                {clause.original_text && clause.original_text !== "N/A" && (
                                                    <details className="mt-3 group">
                                                        <summary className="text-xs text-[#d4af37] cursor-pointer hover:text-[#e5bd3d] font-medium flex items-center gap-2 transition-colors">
                                                            <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                            View Original Clause Text
                                                        </summary>
                                                        <div className="mt-3 p-4 bg-black/20 rounded-lg border-l-4 border-[#d4af37]/60">
                                                            <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">
                                                                {clause.original_text}
                                                            </p>
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            ))}

                        </div>
                    </div>

                    {/* Right Panel - Editable Contract View (50%) */}
                    <div className="w-1/2 bg-[#0a0f1c] flex flex-col">
                        <div className="p-4  border-white/20 flex items-center justify-between flex-shrink-0">
                            <h2 className="text-base font-semibold text-white">Editable Contract View</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={downloadPDF}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 rounded text-xs transition-all"
                                >
                                    Download
                                </button>
                                <button
                                    onClick={handleReanalyze}
                                    disabled={isReanalyzing}
                                    className="px-3 py-1.5 bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37] rounded text-xs transition-all disabled:opacity-50"
                                >
                                    Re-analyze
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            <div className="max-w-4xl mx-auto">
                                <div className="font-serif text-sm leading-[2.2] text-white/70 whitespace-pre-wrap" style={{ wordSpacing: '0.1em' }}>
                                    {highlightedText()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Floating Copilot Agent */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
                    <button
                        onClick={() => setIsCopilotExpanded(!isCopilotExpanded)}
                        className="bg-[#d4af37] hover:bg-[#e5bd3d] text-[#0a0f1c] px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                        </svg>
                        <span className="font-medium">Negotiator Agent</span>
                        {selectedClauseIds.length > 0 && (
                            <span className="bg-black/20 px-2 py-0.5 rounded-full text-xs">{selectedClauseIds.length}</span>
                        )}
                        <span className="text-sm">Expand</span>
                    </button>
                </div>

                {/* Expanded Copilot Panel */}
                {isCopilotExpanded && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] bg-[#13151f] border-t border-x border-white/20 shadow-2xl z-50 flex flex-col max-h-[50vh] animate-in slide-in-from-bottom duration-300">
                        <div className="p-4 border-b border-white/20 flex items-center justify-between flex-shrink-0">
                            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                                </svg>
                                Negotiator Agent
                            </h2>
                            <button
                                onClick={() => setIsCopilotExpanded(false)}
                                className="text-white/50 hover:text-white p-2 hover:bg-white/10 rounded transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {messages.length === 0 ? (
                                <p className="text-xs text-white/40 text-center italic">Select clauses to begin negotiation...</p>
                            ) : (
                                messages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} `}>
                                        <div className={`max - w - [85 %] p - 3 rounded - xl text - xs leading - relaxed ${msg.role === 'user'
                                            ? 'bg-[#3b82f6] text-white rounded-br-none'
                                            : 'bg-white/5 text-white/90 rounded-bl-none'
                                            } `}>
                                            {msg.text}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {selectedClauseIds.length > 0 && (
                            <div className="px-4 py-3 border-t border-white/20 flex-shrink-0">
                                <button
                                    onClick={selectedClauseIds.length === 1 ? () => processClause(selectedClauseIds[0]) : processAllClauses}
                                    disabled={isProcessing}
                                    className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (<>Processing...</>) : (<>Negotiate {selectedClauseIds.length === 1 ? 'Clause' : `${selectedClauseIds.length} Clauses`}</>)}
                                </button>
                            </div>
                        )}

                        <div className="p-4 border-t border-white/20 flex-shrink-0">
                            <div className="flex gap-2">
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleChatSend();
                                        }
                                    }}
                                    placeholder="Add custom instructions..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#3b82f6] text-white placeholder:text-white/30 resize-none"
                                    rows={2}
                                    disabled={isProcessing}
                                />
                                <button
                                    onClick={handleChatSend}
                                    disabled={isProcessing || !chatInput.trim()}
                                    className="bg-[#3b82f6] hover:bg-[#2563eb] text-white p-2 rounded-lg transition-all disabled:opacity-50 h-fit"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile/Tablet View - visible on md and below */}
            <div className="lg:hidden fixed inset-0 flex flex-col bg-[#0a0f1c] text-white">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="LegalSay" className="w-10 h-10" />
                        <div className="flex-1">
                            <h2 className="text-base font-bold text-white">Negotiation Playground</h2>
                            <p className="text-[10px] text-white/40">
                                {clauses.length} Clauses • {selectedClauseIds.length} Selected
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-hidden">
                    {/* Clauses Tab */}
                    {activeTab === 'clauses' && (
                        <div className="h-full overflow-y-auto p-4">
                            {clauses.map((clause) => (
                                <div key={clause.id} className="mb-4 w-full">
                                    <button
                                        onClick={() => toggleClauseSelection(clause.id)}
                                        className={`w-full p-5 rounded-xl transition-all duration-200 border-2 ${selectedClauseIds.includes(clause.id)
                                            ? 'bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/60 shadow-lg shadow-red-500/20'
                                            : 'bg-[#1a1d2e] border-white/10 hover:border-white/20'
                                            }`}
                                    >
                                        <div className="flex items-start gap-4">
                                            {/* Risk Indicator */}
                                            <div className="mt-1 flex-shrink-0">
                                                <div className={`w-2 h-2 rounded-full ${getRiskColor(clause.riskLevel)}`} />
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0 text-left">
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <h3 className="text-sm font-semibold text-white line-clamp-2">{clause.title}</h3>
                                                    {selectedClauseIds.includes(clause.id) && (
                                                        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                                                        </svg>
                                                    )}
                                                </div>
                                                <p className="text-xs text-white/70 leading-relaxed line-clamp-2">
                                                    {clause.text}
                                                </p>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Individual Negotiate Button */}
                                    <button
                                        onClick={() => toggleClauseSelection(clause.id)}
                                        className={`w-full mt-3 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 border-2 ${selectedClauseIds.includes(clause.id)
                                            ? 'bg-gradient-to-r from-[#d4af37] to-[#e5bd3d] text-[#0a0f1c] border-[#d4af37] shadow-lg shadow-[#d4af37]/30'
                                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50'
                                            }`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                        </svg>
                                        {selectedClauseIds.includes(clause.id) ? 'Selected' : 'Negotiate'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Contract Tab */}
                    {activeTab === 'contract' && (
                        <div className="h-full flex flex-col">
                            <div className="flex-1 overflow-y-auto p-4">
                                <div className="font-serif text-sm leading-[1.8] text-white/70 whitespace-pre-wrap">
                                    {highlightedText()}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="p-4 border-t border-white/10 flex gap-2">
                                <button
                                    onClick={downloadPDF}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-sm font-medium transition-all"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                    </svg>
                                    Download PDF
                                </button>
                                <button
                                    onClick={handleReanalyze}
                                    disabled={isReanalyzing}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37] rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                >
                                    {isReanalyzing ? (
                                        <>
                                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Analyzing...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                            </svg>
                                            Re-analyze
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Copilot Tab */}
                    {activeTab === 'copilot' && (
                        <div className="h-full flex flex-col">
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {messages.length === 0 ? (
                                    <p className="text-xs text-white/40 text-center italic">Select clauses or send a message...</p>
                                ) : (
                                    messages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} `}>
                                            <div className={`max - w - [85 %] p - 3 rounded - xl text - sm leading - relaxed ${msg.role === 'user'
                                                ? 'bg-[#d4af37] text-[#0a0f1c] rounded-br-none'
                                                : 'bg-white/5 text-white/90 rounded-bl-none'
                                                } `}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Proceed Button */}
                            {selectedClauseIds.length > 0 && (
                                <div className="px-4 py-3 border-t border-white/10">
                                    <button
                                        onClick={selectedClauseIds.length === 1 ? () => processClause(selectedClauseIds[0]) : processAllClauses}
                                        disabled={isProcessing}
                                        className="w-full bg-blue-500 text-white py-4 rounded-lg text-base font-semibold hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isProcessing ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                                </svg>
                                                {selectedClauseIds.length === 1 ? 'Proceed' : `Proceed with All(${selectedClauseIds.length})`}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Input */}
                            <div className="p-4 border-t border-white/10 bg-[#0a0f1c]">
                                <div className="flex gap-2">
                                    <textarea
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleChatSend();
                                            }
                                        }}
                                        placeholder="Optional custom instructions..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#d4af37]/50 text-white placeholder:text-white/30 resize-none"
                                        rows={3}
                                        disabled={isProcessing}
                                    />
                                    <button
                                        onClick={handleChatSend}
                                        disabled={isProcessing || !chatInput.trim()}
                                        className="bg-[#d4af37] text-[#0a0f1c] p-3 rounded-lg hover:bg-[#e5bd3d] transition-all disabled:opacity-50 h-fit"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Tab Navigation */}
                <div className="border-t border-white/10 bg-[#13151f] flex-shrink-0">
                    <div className="flex items-center justify-around">
                        <button
                            onClick={() => setActiveTab('clauses')}
                            className={`flex - 1 flex flex - col items - center gap - 1 py - 3 transition - colors ${activeTab === 'clauses' ? 'text-[#d4af37]' : 'text-white/40'
                                } `}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                            </svg>
                            <span className="text-xs font-semibold">Clauses</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('contract')}
                            className={`flex - 1 flex flex - col items - center gap - 1 py - 3 transition - colors ${activeTab === 'contract' ? 'text-[#d4af37]' : 'text-white/40'
                                } `}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            <span className="text-xs font-semibold">Contract</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('copilot')}
                            className={`flex - 1 flex flex - col items - center gap - 1 py - 3 transition - colors relative ${activeTab === 'copilot' ? 'text-[#d4af37]' : 'text-white/40'
                                } `}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                            </svg>
                            <span className="text-xs font-semibold">Copilot</span>
                            {selectedClauseIds.length > 0 && (
                                <div className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                    {selectedClauseIds.length}
                                </div>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
