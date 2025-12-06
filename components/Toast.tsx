'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    message: string;
    type: ToastType;
    duration?: number;
    onClose: () => void;
}

export function Toast({ message, type, duration = 5000, onClose }: ToastProps) {
    const [isVisible, setIsVisible] = useState(true);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(onClose, 300); // Wait for exit animation
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const getStyles = () => {
        switch (type) {
            case 'success':
                return 'bg-green-500/90 border-green-400';
            case 'error':
                return 'bg-red-500/90 border-red-400';
            case 'warning':
                return 'bg-yellow-500/90 border-yellow-400';
            case 'info':
                return 'bg-blue-500/90 border-blue-400';
            default:
                return 'bg-gray-500/90 border-gray-400';
        }
    };

    const getIcon = () => {
        switch (type) {
            case 'success':
                return (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                );
            case 'error':
                return (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                );
            case 'warning':
                return (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                );
            case 'info':
                return (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
        }
    };

    if (!isVisible) return null;

    return (
        <div
            className={`fixed bottom-4 right-4 z-[9999] max-w-md w-full sm:w-auto transition-all duration-300 ${isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
                }`}
        >
            <div className={`${getStyles()} border backdrop-blur-md rounded-lg shadow-lg p-4 flex items-start gap-3`}>
                <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
                <div className="flex-1 text-white text-sm leading-relaxed">{message}</div>
                <button
                    onClick={() => {
                        setIsExiting(true);
                        setTimeout(onClose, 300);
                    }}
                    className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

// Toast Container Component
interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
}

export function ToastContainer() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    useEffect(() => {
        // Listen for custom toast events
        const handleToast = (event: CustomEvent) => {
            const { message, type } = event.detail;
            const id = Date.now().toString();
            setToasts((prev) => [...prev, { id, message, type }]);
        };

        window.addEventListener('show-toast' as any, handleToast);
        return () => window.removeEventListener('show-toast' as any, handleToast);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    };

    return (
        <div className="fixed bottom-4 right-4 z-[9999] space-y-2 pointer-events-none">
            {toasts.map((toast) => (
                <div key={toast.id} className="pointer-events-auto">
                    <Toast message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
                </div>
            ))}
        </div>
    );
}

// Helper function to show toast
export function showToast(message: string, type: ToastType = 'info') {
    if (typeof window !== 'undefined') {
        const event = new CustomEvent('show-toast', {
            detail: { message, type },
        });
        window.dispatchEvent(event);
    }
}
