'use client';

import { AnalysisResult, explainRisk, redlineClause } from '@/lib/api';
import { Card, Badge, HealthGauge } from '@/components/ui/components';
import { useState } from 'react';

import { useRouter } from 'next/navigation';
import { fileStore } from '@/lib/store';

export default function ReportDashboard({ data, originalFile, jurisdiction }: { data: AnalysisResult, originalFile: File | null, jurisdiction: string }) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'risks' | 'details'>('risks');
    const [explainingRiskId, setExplainingRiskId] = useState<number | null>(null);
    const [explanations, setExplanations] = useState<Record<number, string>>({});

    // Negotiation List State
    const [negotiationList, setNegotiationList] = useState<{ text: string, type: string }[]>([]);

    const handleExplain = async (riskText: string, idx: number) => {
        if (explanations[idx]) return; // Already explained

        setExplainingRiskId(idx);
        try {
            const context = `Contract Type: ${data.contract_type}. Summary: ${data.plain_english_summary}`;
            const explanation = await explainRisk(riskText, context);
            setExplanations(prev => ({ ...prev, [idx]: explanation }));
        } catch (error) {
            console.error("Failed to explain risk:", error);
        } finally {
            setExplainingRiskId(null);
        }
    };

    const toggleNegotiationItem = (text: string, type: string) => {
        setNegotiationList(prev => {
            const exists = prev.find(item => item.text === text);
            if (exists) {
                return prev.filter(item => item.text !== text);
            } else {
                return [...prev, { text, type }];
            }
        });
    };

    const handleDraftNegotiation = () => {
        // Collect all red and yellow flags automatically
        const risksToNegotiate = [
            ...(data.red_flags || []).map(f => ({ text: f, type: 'high' })),
            ...(data.yellow_flags || []).map(f => ({ text: f, type: 'medium' })),
        ];

        // Save to store
        fileStore.negotiationList = risksToNegotiate;
        // Navigate
        router.push('/negotiation');
    };

    const allFlags = [
        ...(data.red_flags || []).map(f => ({ type: 'red', text: f })),
        ...(data.yellow_flags || []).map(f => ({ type: 'yellow', text: f })),
        ...(data.green_flags || []).map(f => ({ type: 'green', text: f })),
    ];

    return (
        <div className="space-y-12 animate-in fade-in duration-700 relative">

            {/* Floating Negotiation Button - Always Visible */}
            <div className="fixed bottom-8 right-8 z-50">
                <button
                    onClick={handleDraftNegotiation}
                    className="bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-2xl px-8 py-4 rounded-full font-bold text-lg flex items-center gap-3 transition-all transform hover:scale-105"
                >
                    <span>Draft Negotiation</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
            </div>

            {/* Top Section: Header & Health */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                {/* Header Card */}
                <Card className="lg:col-span-2 p-10 flex flex-col justify-center relative overflow-hidden group">
                    {/* Subtle background gradient */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <Badge variant="default">Contract Analysis</Badge>
                            <span className="text-xs text-muted-foreground uppercase tracking-widest">AI Generated</span>
                        </div>
                        <h1 className="text-5xl font-serif font-bold text-gradient-gold mb-6">{data.contract_type}</h1>
                        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                            {data.plain_english_summary}
                        </p>
                    </div>
                </Card>

                {/* Health Score Card */}
                <Card className="p-8 flex flex-col items-center justify-center bg-card/40 relative">
                    <HealthGauge score={data.total_health_score} />
                    <div className="mt-6 text-center">
                        <h3 className="text-xl font-serif font-medium text-foreground">
                            {data.total_health_score >= 80 ? 'Low Risk' : data.total_health_score >= 50 ? 'Moderate Risk' : 'High Risk'}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {allFlags.length} issues identified
                        </p>
                    </div>
                </Card>
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                {/* Left Column: Action Center (Flags) */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <h2 className="text-2xl font-serif font-bold text-foreground flex items-center gap-3">
                            Action Center
                        </h2>
                        <div className="flex p-1 bg-white/5 rounded-full">
                            <button
                                onClick={() => setActiveTab('risks')}
                                className={`px-6 py-2 text-sm font-medium rounded-full transition-all duration-300 ${activeTab === 'risks' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Risks
                            </button>
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`px-6 py-2 text-sm font-medium rounded-full transition-all duration-300 ${activeTab === 'details' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Details
                            </button>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {activeTab === 'risks' && (
                            <>
                                {allFlags.length === 0 && (
                                    <div className="p-12 text-center text-muted-foreground bg-white/5 rounded-2xl border border-dashed border-white/10">
                                        No significant flags found.
                                    </div>
                                )}
                                {allFlags.map((flag, idx) => {
                                    const isSelected = negotiationList.some(item => item.text === flag.text);
                                    return (
                                        <Card key={idx} className={`p-6 group transition-all duration-300 border-white/5 hover:border-white/10 ${isSelected ? 'bg-secondary/10 border-secondary/50' : 'hover:bg-white/10'}`}>
                                            <div className="flex items-start gap-5">
                                                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor] ${flag.type === 'red' ? 'text-red-500 bg-red-500' : flag.type === 'yellow' ? 'text-yellow-500 bg-yellow-500' : 'text-green-500 bg-green-500'
                                                    }`} />
                                                <div className="flex-1 space-y-4">
                                                    <div className="flex justify-between items-start gap-4">
                                                        <p className="text-foreground/90 font-medium leading-relaxed text-lg">{flag.text}</p>
                                                        <Badge variant={flag.type as any}>{flag.type.toUpperCase()}</Badge>
                                                    </div>

                                                    {/* Agentic Actions */}
                                                    {(flag.type === 'red' || flag.type === 'yellow') && (
                                                        <div className="flex flex-col gap-4 pt-2">
                                                            <div className="flex gap-4">
                                                                <button
                                                                    onClick={() => handleExplain(flag.text, idx)}
                                                                    disabled={explainingRiskId === idx}
                                                                    className="text-xs font-semibold text-primary/80 hover:text-secondary transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {explainingRiskId === idx ? (
                                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                        </svg>
                                                                    ) : (
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                                    )}
                                                                    Explain Risk
                                                                </button>
                                                            </div>

                                                            {/* Explanation Panel */}
                                                            {explanations[idx] && (
                                                                <div className="mt-2 p-4 rounded-lg bg-white/5 border-l-2 border-secondary animate-in slide-in-from-top-2 duration-300">
                                                                    <div className="flex items-center gap-2 mb-2 text-secondary text-xs font-bold uppercase tracking-widest">
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                                                                        LegalSay Analysis
                                                                    </div>
                                                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                                                        {explanations[idx]}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </>
                        )}

                        {activeTab === 'details' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {data.key_details.map((detail, idx) => (
                                    <Card key={idx} className="p-6 hover:bg-white/10">
                                        <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">{detail.label}</div>
                                        <div className="font-medium text-foreground text-lg break-words">{detail.value}</div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Fact Sheet */}
                <div className="space-y-8">
                    <div className="border-b border-white/5 pb-4">
                        <h2 className="text-2xl font-serif font-bold text-foreground">Key Facts</h2>
                    </div>

                    <Card className="p-0 overflow-hidden bg-card/30">
                        <div className="divide-y divide-white/5">
                            {data.key_details.slice(0, 6).map((detail, idx) => (
                                <div key={idx} className="p-5 hover:bg-white/5 transition-colors group">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-secondary transition-colors">{detail.label}</div>
                                    <div className="text-sm font-medium text-foreground truncate" title={detail.value}>{detail.value}</div>
                                </div>
                            ))}
                            <div className="p-4 bg-white/5 text-center">
                                <button onClick={() => setActiveTab('details')} className="text-xs font-bold text-primary hover:text-secondary transition-colors uppercase tracking-widest">
                                    View All Details →
                                </button>
                            </div>
                        </div>
                    </Card>
                </div>

            </div>
        </div>
    );
}
