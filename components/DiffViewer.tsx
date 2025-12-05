import React from 'react';
import * as diff from 'diff';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface DiffViewerProps {
    oldText: string;
    newText: string;
    className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ oldText, newText, className }) => {
    const diffs = diff.diffWords(oldText, newText);

    return (
        <div className={cn("font-mono text-sm leading-relaxed whitespace-pre-wrap", className)}>
            {diffs.map((part, index) => {
                const color = part.added ? 'text-green-400 bg-green-400/10' :
                    part.removed ? 'text-red-400 bg-red-400/10 line-through decoration-red-400/50' :
                        'text-foreground/80';

                return (
                    <span key={index} className={cn(color, "px-0.5 rounded-sm transition-colors duration-300")}>
                        {part.value}
                    </span>
                );
            })}
        </div>
    );
};
