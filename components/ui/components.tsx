import React from 'react';

// --- Card Component ---
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`glass-panel rounded-xl transition-all duration-300 ${className}`}>
            {children}
        </div>
    );
}

// --- Badge Component ---
export function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'red' | 'yellow' | 'green' }) {
    const variants = {
        default: 'bg-accent/50 text-accent-foreground border-accent',
        red: 'bg-red-500/10 text-red-200 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]',
        yellow: 'bg-yellow-500/10 text-yellow-200 border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]',
        green: 'bg-green-500/10 text-green-200 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]',
    };

    return (
        <span className={`px-3 py-1 rounded-full text-xs font-medium border backdrop-blur-md ${variants[variant]}`}>
            {children}
        </span>
    );
}

// --- Gauge Component ---
export function HealthGauge({ score }: { score: number }) {
    const getColor = (s: number) => {
        if (s >= 80) return '#4ade80'; // Bright Green
        if (s >= 50) return '#facc15'; // Bright Yellow
        return '#f87171'; // Bright Red
    };

    const color = getColor(score);
    const radius = 45; // Slightly larger
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center w-40 h-40">
            {/* Glow Effect */}
            <div className="absolute inset-0 rounded-full blur-2xl opacity-20" style={{ backgroundColor: color }}></div>

            <svg className="transform -rotate-90 w-full h-full relative z-10">
                {/* Track */}
                <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    className="text-white/5"
                />
                {/* Indicator */}
                <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    stroke={color}
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                />
            </svg>
            <div className="absolute flex flex-col items-center z-20">
                <span className="text-4xl font-bold tracking-tighter" style={{ color }}>{score}</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mt-1">Health</span>
            </div>
        </div>
    );
}
