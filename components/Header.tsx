'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Header() {
    const router = useRouter();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navigateToPlayground = () => {
        router.push('/negotiation');
        setIsMobileMenuOpen(false);
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/')}>
                        <img src="/logo.png" alt="LegalSay Logo" className="h-14 w-auto" />
                        <span className="text-xl font-serif font-bold text-foreground hidden sm:inline">
                            LegalSay
                        </span>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-4">
                        <button
                            onClick={navigateToPlayground}
                            className="px-6 py-2 rounded-full bg-gradient-to-r from-primary to-slate-800 text-white font-semibold hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
                        >
                            Playground
                        </button>
                    </nav>

                    {/* Mobile Hamburger Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="md:hidden p-2 rounded-lg hover:bg-accent/20 transition-colors"
                        aria-label="Toggle menu"
                    >
                        {isMobileMenuOpen ? (
                            // Close icon
                            <svg className="w-6 h-6 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            // Hamburger icon
                            <svg className="w-6 h-6 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {isMobileMenuOpen && (
                <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-md">
                    <nav className="px-4 py-4 space-y-3">
                        <button
                            onClick={navigateToPlayground}
                            className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-primary to-slate-800 text-white font-semibold hover:shadow-lg transition-all duration-200"
                        >
                            Playground
                        </button>
                    </nav>
                </div>
            )}
        </header>
    );
}
