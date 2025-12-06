'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { analyzeContract } from '@/lib/api';
import Header from '@/components/Header';
import { handleError, logError } from '@/lib/errorHandler';
import { showToast } from '@/components/Toast';

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'upload' | 'text'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState("United States (General)");

  const jurisdictions = [
    "United States (General)",
    "California",
    "New York",
    "Delaware",
    "United Kingdom",
    "European Union",
    "United Arab Emirates",
    "Singapore"
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let fileToUpload = file;

      if (activeTab === 'text') {
        if (!text.trim()) {
          throw new Error("Please enter some text to analyze.");
        }
        // Convert text to a file
        const blob = new Blob([text], { type: 'text/plain' });
        fileToUpload = new File([blob], "contract_text.txt", { type: 'text/plain' });
      } else {
        if (!fileToUpload) {
          throw new Error("Please select a file to upload.");
        }
      }

      showToast('🔍 Our AI is diving deep into your contract...', 'info');

      // Pass jurisdiction to the analyzeContract function
      const result = await analyzeContract(fileToUpload!, jurisdiction);

      // Store in global store for Report Page
      // @ts-ignore
      import('@/lib/store').then(mod => {
        mod.fileStore.file = fileToUpload;
        mod.fileStore.jurisdiction = jurisdiction;
      });

      // Store result in localStorage for the report page
      localStorage.setItem('analysisResult', JSON.stringify(result));

      showToast('✨ Analysis complete! Your insights are ready.', 'success');

      // Small delay to show success message
      setTimeout(() => {
        router.push('/report');
      }, 500);
    } catch (err: any) {
      logError('Analysis Error', err, { jurisdiction });
      const errorMessage = handleError(err, 'Contract Analysis', false);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // handleFileUpload from instruction, but it's not directly used in the current UI flow
  // The existing handleFileChange handles file selection.
  // Keeping it here as per instruction, but it might be redundant or intended for a different UI.
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]); // Set the file state
      setError(null);
      // If the intention was to immediately analyze on upload,
      // handleAnalyze() would be called here.
      // For now, it just sets the file, consistent with existing UI flow.
    }
  };

  return (
    <>
      <Header />
      <div className="min-h-screen flex flex-col items-center justify-center p-4 pt-24 bg-gradient-to-b from-background to-accent/20">
        <main className="w-full max-w-3xl space-y-8 text-center">

          {/* Hero Section */}
          <div className="space-y-6 flex flex-col items-center">
            <div className="relative w-32 h-32 md:w-48 md:h-48 mb-4">
              <img src="/logo.png" alt="LegalSay Logo" className="object-contain w-full h-full drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" />
            </div>
            {/* <h1 className="text-5xl md:text-7xl font-serif font-bold tracking-tight text-gradient-gold">
            LegalSay
          </h1> */}
            <p className="text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              AI-powered contract analysis. Instant clarity, reduced risk, and actionable insights.
            </p>

            {/* Jurisdiction Selector */}
            <div className="pt-4 flex justify-center">
              <div className="relative inline-block text-left">
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  className="appearance-none bg-white/5 border border-white/10 text-foreground py-2 pl-4 pr-10 rounded-full focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary transition-all cursor-pointer hover:bg-white/10 text-sm font-medium"
                >
                  {jurisdictions.map((j) => (
                    <option key={j} value={j} className="bg-card text-foreground">{j}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
                <div className="absolute -top-6 left-0 w-full text-center text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                  Governing Law
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Card */}
          <div className="glass-panel rounded-2xl p-8 shadow-xl border border-border/50 bg-card/80 backdrop-blur-md">

            {/* Tabs */}
            <div className="flex space-x-4 mb-8 justify-center">
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${activeTab === 'upload'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'bg-accent text-accent-foreground hover:bg-accent/80'
                  }`}
              >
                Upload File
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${activeTab === 'text'
                  ? 'bg-primary text-primary-foreground shadow-lg'
                  : 'bg-accent text-accent-foreground hover:bg-accent/80'
                  }`}
              >
                Paste Text
              </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[200px] flex flex-col items-center justify-center space-y-6">
              {activeTab === 'upload' ? (
                <div className="w-full">
                  <label
                    htmlFor="file-upload"
                    className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-muted-foreground/30 rounded-xl cursor-pointer bg-accent/10 hover:bg-accent/20 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-10 h-10 mb-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                      <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT</p>
                    </div>
                    <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.docx,.txt" />
                  </label>
                  {file && (
                    <div className="mt-4 p-3 bg-primary/5 rounded-lg flex items-center justify-between">
                      <span className="text-sm font-medium text-primary truncate">{file.name}</span>
                      <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <textarea
                  className="w-full h-48 p-4 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                  placeholder="Paste your contract text here..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={handleAnalyze}
              disabled={isLoading}
              className={`w-full mt-8 py-4 rounded-xl text-lg font-semibold text-white shadow-lg transition-all duration-300 ${isLoading
                ? 'bg-muted cursor-not-allowed'
                : 'bg-gradient-to-r from-primary to-slate-800 hover:shadow-xl hover:scale-[1.02]'
                }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing Contract...
                </span>
              ) : (
                'Analyze Contract'
              )}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            By uploading, you agree to our Terms of Service. Your data is processed securely.
          </p>
        </main>
      </div>
    </>
  );
}
