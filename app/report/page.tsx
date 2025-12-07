'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisResult } from '@/lib/api';
import { useContractStore } from '@/lib/contract-store';
import ReportDashboard from '@/components/ReportDashboard';

export default function ReportPage() {
    const router = useRouter();
    const [data, setData] = useState<AnalysisResult | null>(null);

    // Get data from Zustand store
    const { analysisResult, file } = useContractStore();

    useEffect(() => {
        if (analysisResult) {
            setData(analysisResult);
        } else {
            router.push('/'); // Redirect if no data
        }
    }, [analysisResult, router]);

    if (!data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#020617] text-white">
                <div className="flex flex-col items-center space-y-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground animate-pulse">Loading Analysis...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] text-foreground p-8">
            <div className="max-w-7xl mx-auto">
                <header className="flex items-center justify-between mb-12">
                    <div className="flex items-center gap-4">
                        <img src="/logo.png" alt="LegalSay" className="h-12 w-12" />
                        <div className="h-6 w-px bg-white/10"></div>
                        <span className="text-sm font-medium text-muted-foreground">Report</span>
                    </div>
                    <button className="text-sm font-medium text-primary hover:text-secondary transition-colors">
                        Export PDF
                    </button>
                </header>

                <ReportDashboard data={data} originalFile={file} jurisdiction={data.jurisdiction || "Not Specified"} />
            </div>
        </div>
    );
}
