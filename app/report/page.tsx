'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisResult } from '@/lib/api';
import ReportDashboard from '@/components/ReportDashboard';
import { fileStore } from '@/lib/store';

export default function ReportPage() {
    const router = useRouter();
    const [data, setData] = useState<AnalysisResult | null>(null);
    const [originalFile, setOriginalFile] = useState<File | null>(null); // We can't easily get the File object back from localStorage across pages without re-upload or context.
    // Actually, in a real app, we'd use a Context or State Manager.
    // For this MVP, we are stuck. The File object cannot be stored in localStorage.
    // However, the user *just* uploaded it in the previous step.
    // If we want to support Redlining, we need the file.

    // HACK: For the demo, we will assume the user is still in the same session and we might have passed it via state?
    // Next.js router state is tricky.

    // Alternative: The `analyzeContract` in `page.tsx` could store the file in a global context?
    // Or, we can't do it easily without a backend storage (which we have but didn't fully hook up for file persistence yet).

    // Let's check `page.tsx`. It calls `analyzeContract` and then pushes to `/report`.
    // The file is lost.

    // FIX: We need to persist the file. 
    // Since we don't have a backend "File ID" yet (just raw analysis), we can't download it from backend.
    // We need to upload it again? No, that's bad UX.

    // Let's assume for this "Agentic" demo, we will mock the file persistence or use a global variable (unreliable but works for single-page demo).
    // Better: Use a React Context.

    // For now, I'll add a placeholder comment. The user needs to know this limitation.
    // Wait, I can use a simple client-side singleton/store for the session.

    const [jurisdiction, setJurisdiction] = useState("United States (General)");

    useEffect(() => {
        // Load analysis
        const storedData = localStorage.getItem('analysisResult');
        if (storedData) {
            setData(JSON.parse(storedData));
        } else {
            router.push('/'); // Redirect if no data
        }

        // Load file from store
        setOriginalFile(fileStore.file);
        setJurisdiction(fileStore.jurisdiction);
    }, []);

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
                        <img src="/logo.png" alt="LegalSay" className="h-10 w-auto" />
                        <div className="h-6 w-px bg-white/10"></div>
                        <span className="text-sm font-medium text-muted-foreground">Report</span>
                    </div>
                    <button className="text-sm font-medium text-primary hover:text-secondary transition-colors">
                        Export PDF
                    </button>
                </header>

                <ReportDashboard data={data} originalFile={originalFile} jurisdiction={jurisdiction} />
            </div>
        </div>
    );
}
