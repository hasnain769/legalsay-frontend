'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fileStore } from '@/lib/store';
import { jsPDF } from 'jspdf';
import { analyzeContract } from '@/lib/api';

interface ClauseItem {
    id: number;
    title: string;
    text: string;
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
    const [selectedClauseIds, setSelectedClauseIds] = useState<number[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isReanalyzing, setIsReanalyzing] = useState(false);
    const [analysisResults, setAnalysisResults] = useState<any>(null);

    // Mobile tab state
    const [activeTab, setActiveTab] = useState<'clauses' | 'contract' | 'copilot'>('clauses');

    // Copilot chat state
    const [chatInput, setChatInput] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const announcedClausesRef = useRef<Set<number>>(new Set()); // Track announced clauses

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load contract and convert negotiation items to clauses
    useEffect(() => {
        const loadFile = async () => {
            if (!fileStore.file) {
                router.push('/');
                return;
            }

            // Load analysis results from localStorage
            const storedAnalysis = localStorage.getItem('analysisResult');
            if (storedAnalysis) {
                setAnalysisResults(JSON.parse(storedAnalysis));
            }

            let extractedText = "";
            try {
                const formData = new FormData();
                formData.append('file', fileStore.file);

                const res = await fetch('https//api.legalsay.ai/extract_text/', {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) throw new Error("Failed to extract text");

                const data = await res.json();
                extractedText = data.text;

                // Clean messy text
                const lines = extractedText.split('\n');
                const singleWordLines = lines.filter(l => l.trim().split(' ').length === 1 && l.trim().length > 0).length;
                if (singleWordLines / lines.length > 0.3) {
                    extractedText = extractedText.replace(/([^\n])\n\n([^\n])/g, '$1 $2');
                    extractedText = extractedText.replace(/([^\n])\n([^\n])/g, '$1 $2');
                }

                setContractText(extractedText);
            } catch (e) {
                console.error("Extraction error:", e);
                setContractText("Could not extract text from file.");
                return;
            }

            // Convert negotiation list to clauses
            if (fileStore.negotiationList.length > 0) {
                const clauseItems: ClauseItem[] = fileStore.negotiationList.map((item, idx) => ({
                    id: idx + 1,
                    title: item.text.split(':')[0] || `Clause ${idx + 1}`,
                    text: item.text,
                    riskLevel: item.type === 'high' ? 'high' : item.type === 'medium' ? 'medium' : 'low'
                }));
                setClauses(clauseItems);
            }
        };

        loadFile();
    }, []);

    // Toggle clause selection
    const toggleClauseSelection = (clauseId: number) => {
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
                            msg.text !== `📌 Selected: ${clause.title}`
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
                            text: `📌 Selected: ${clause.title}`
                        }]);
                    }
                }
                return [...prev, clauseId];
            }
        });
    };

    // Process single clause
    const processClause = async (clauseId: number) => {
        const clause = clauses.find(c => c.id === clauseId);
        if (!clause) return;

        const message = chatInput.trim() || `Analyze and negotiate a better version of: "${clause.text}"`;
        await processNegotiation([clause], message);
        setChatInput(""); // Clear input after processing

        // Remove from selection
        setSelectedClauseIds(prev => prev.filter(id => id !== clauseId));

        // Remove from clause list after negotiation
        setClauses(prev => prev.filter(c => c.id !== clauseId));

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

        // Clear selection and tracking
        selectedClauseIds.forEach(id => announcedClausesRef.current.delete(id));
        setSelectedClauseIds([]);
    };

    // Core negotiation processing with streaming
    const processNegotiation = async (clauses: ClauseItem[], message: string) => {
        setIsProcessing(true);
        // Don't add message here - already added by toggleClauseSelection or handleChatSend

        try {
            const response = await fetch('http//api.legalsay.ai/negotiate/chat/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    contract_context: contractText,
                    jurisdiction: fileStore.jurisdiction,
                    analysis_context: analysisResults || {},
                    selected_clause: clauses.map(c => c.text).join('\n\n'),
                    history: messages.map(m => ({ role: m.role, content: m.text }))
                })
            });

            if (!response.ok) throw new Error("Negotiation failed");
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let agentResponse = "";
            let fullProposedEdit = "";
            let isEditMode = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'edit_start') {
                            isEditMode = true;
                            fullProposedEdit = "";
                            // Auto-switch to contract tab on mobile to show real-time updates
                            setActiveTab('contract');
                        } else if (data.type === 'edit_delta' && isEditMode) {
                            fullProposedEdit += data.content;
                            // STREAM UPDATE: Show real-time contract changes
                            setContractText(fullProposedEdit);
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
                        } else if (data.type === 'done') {
                            isEditMode = false;
                        }
                    } catch (e) {
                        console.error("Parse error:", e);
                    }
                }
            }
        } catch (error) {
            console.error("Negotiation error:", error);
            setMessages(prev => [...prev, { role: 'agent', text: "Sorry, something went wrong." }]);
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
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, margin + 10);

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

        setIsReanalyzing(true);

        try {
            // Create a new File object from contract text
            const blob = new Blob([contractText], { type: 'text/plain' });
            const fileToAnalyze = new File([blob], 'contract.txt', { type: 'text/plain' });

            // Use the same analyzeContract function as the home page
            const result = await analyzeContract(fileToAnalyze, fileStore.jurisdiction || 'California');

            // Update file store
            fileStore.file = fileToAnalyze;
            fileStore.jurisdiction = fileStore.jurisdiction || 'California';

            // Store result in localStorage for the report page
            localStorage.setItem('analysisResult', JSON.stringify(result));

            // Navigate to report
            router.push('/report');
        } catch (error) {
            console.error('Re-analysis error:', error);
            alert(`Failed to re-analyze contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Highlight selected clauses in document
    const highlightedText = () => {
        if (selectedClauseIds.length === 0) return contractText;

        const selectedClauses = clauses.filter(c => selectedClauseIds.includes(c.id));
        let highlightedContract: React.ReactNode = contractText;

        selectedClauses.forEach(clause => {
            const parts = String(highlightedContract).split(clause.text);
            if (parts.length >= 2) {
                highlightedContract = (
                    <>
                        {parts[0]}
                        <span className="bg-red-500/30 text-white px-1 rounded">{clause.text}</span>
                        {parts.slice(1).join(clause.text)}
                    </>
                );
            }
        });

        return highlightedContract;
    };

    return (
        <>
            {/* Desktop View (3 columns) - hidden on mobile/tablet */}
            <div className="hidden lg:flex h-screen bg-[#0a0f1c] text-white overflow-hidden">
                {/* Left Panel - Clause Analysis */}
                <div className="w-72 bg-[#13151f] border-r border-white/10 flex flex-col h-full">
                    <div className="p-4 border-b border-white/10 flex-shrink-0">
                        <div className="flex items-center gap-3 mb-3">
                            <img src="/logo.png" alt="LegalSay" className="w-8 h-8" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Negotiation</h2>
                        </div>
                        <p className="text-[10px] text-white/40 uppercase tracking-wide">
                            {clauses.length} Clauses • {selectedClauseIds.length} Selected
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        {clauses.map((clause) => (
                            <div key={clause.id} className="mb-2">
                                <button
                                    onClick={() => toggleClauseSelection(clause.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-white/5 ${selectedClauseIds.includes(clause.id) ? 'bg-red-500/20 border border-red-500/50' : 'border border-transparent'
                                        }`}
                                >
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getRiskColor(clause.riskLevel)}`}></div>
                                    <span className="flex-1 text-left text-xs text-white/90">{clause.id}. {clause.title}</span>
                                    {selectedClauseIds.includes(clause.id) && (
                                        <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                                        </svg>
                                    )}
                                </button>

                                {/* Individual Negotiate Button */}
                                <button
                                    onClick={() => toggleClauseSelection(clause.id)}
                                    className={`w-full mt-1 ${selectedClauseIds.includes(clause.id)
                                        ? 'bg-[#d4af37] text-[#0a0f1c] border border-[#d4af37]'
                                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                        } py-2 px-3 rounded-lg text-[10px] font-semibold hover:opacity-80 transition-all flex items-center justify-center gap-1`}
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                    </svg>
                                    {selectedClauseIds.includes(clause.id) ? 'Selected' : 'Negotiate'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center Panel - Document */}
                <div className="flex-1 flex flex-col bg-[#0a0f1c] h-full">
                    <div className="border-b border-white/10 p-4 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            <span className="text-sm text-white/70">CONTRACT (Live Updates)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={downloadPDF}
                                className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-xs font-medium transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                                Download PDF
                            </button>
                            <button
                                onClick={handleReanalyze}
                                disabled={isReanalyzing}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37] rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                            >
                                {isReanalyzing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                        </svg>
                                        Re-analyze
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="max-w-4xl mx-auto">
                            <div className="font-serif text-sm leading-[1.8] text-white/70 whitespace-pre-wrap">
                                {highlightedText()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Negotiator Copilot */}
                <div className="w-96 bg-[#13151f] border-l border-white/10 flex flex-col h-full">
                    <div className="p-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-white/70">Negotiator Copilot</h2>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 ? (
                            <p className="text-xs text-white/40 text-center italic">Select clauses or send a message...</p>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed ${msg.role === 'user'
                                        ? 'bg-[#d4af37] text-[#0a0f1c] rounded-br-none'
                                        : 'bg-white/5 text-white/90 rounded-bl-none'
                                        }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Proceed Button(s) */}
                    {selectedClauseIds.length > 0 && (
                        <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
                            <button
                                onClick={selectedClauseIds.length === 1 ? () => processClause(selectedClauseIds[0]) : processAllClauses}
                                disabled={isProcessing}
                                className="w-full bg-blue-500 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                        </svg>
                                        {selectedClauseIds.length === 1 ? 'Proceed' : `Proceed with All (${selectedClauseIds.length})`}
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Chat Input */}
                    <div className="p-4 border-t border-white/10 flex-shrink-0 bg-[#0a0f1c]">
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
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#d4af37]/50 text-white placeholder:text-white/30 resize-none"
                                rows={2}
                                disabled={isProcessing}
                            />
                            <button
                                onClick={handleChatSend}
                                disabled={isProcessing || !chatInput.trim()}
                                className="bg-[#d4af37] text-[#0a0f1c] p-2 rounded-lg hover:bg-[#e5bd3d] transition-all disabled:opacity-50 h-fit"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile/Tablet View - visible on md and below */}
            <div className="lg:hidden flex flex-col h-screen bg-[#0a0f1c] text-white">
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
                                <div key={clause.id} className="mb-3">
                                    <button
                                        onClick={() => toggleClauseSelection(clause.id)}
                                        className={`w-full flex items-center gap-3 p-4 rounded-lg transition-all ${selectedClauseIds.includes(clause.id) ? 'bg-red-500/20 border-2 border-red-500/50' : 'bg-white/5 border-2 border-transparent'
                                            }`}
                                    >
                                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getRiskColor(clause.riskLevel)}`}></div>
                                        <span className="flex-1 text-left text-sm text-white/90">{clause.id}. {clause.title}</span>
                                        {selectedClauseIds.includes(clause.id) && (
                                            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                                            </svg>
                                        )}
                                    </button>

                                    {/* Individual Negotiate Button */}
                                    <button
                                        onClick={() => toggleClauseSelection(clause.id)}
                                        className={`w-full mt-2 ${selectedClauseIds.includes(clause.id)
                                            ? 'bg-[#d4af37] text-[#0a0f1c] border-2 border-[#d4af37]'
                                            : 'bg-blue-500/20 border-2 border-blue-500/50 text-blue-400'
                                            } py-3 px-4 rounded-lg text-sm font-semibold hover:opacity-80 transition-all flex items-center justify-center gap-2`}
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
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${msg.role === 'user'
                                                ? 'bg-[#d4af37] text-[#0a0f1c] rounded-br-none'
                                                : 'bg-white/5 text-white/90 rounded-bl-none'
                                                }`}>
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
                                                {selectedClauseIds.length === 1 ? 'Proceed' : `Proceed with All (${selectedClauseIds.length})`}
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
                            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${activeTab === 'clauses' ? 'text-[#d4af37]' : 'text-white/40'
                                }`}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                            </svg>
                            <span className="text-xs font-semibold">Clauses</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('contract')}
                            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${activeTab === 'contract' ? 'text-[#d4af37]' : 'text-white/40'
                                }`}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            <span className="text-xs font-semibold">Contract</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('copilot')}
                            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${activeTab === 'copilot' ? 'text-[#d4af37]' : 'text-white/40'
                                }`}
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
