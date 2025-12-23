
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`Uncaught error in ${this.props.name || 'component'}:`, error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-4 m-2 bg-red-50 border border-red-200 rounded-lg text-red-800 overflow-auto max-h-[300px] text-left">
                    <h2 className="text-lg font-bold mb-2">Something went wrong.</h2>
                    <p className="font-mono text-sm mb-2 font-bold">{this.state.error?.message}</p>
                    <details className="whitespace-pre-wrap text-xs font-mono text-red-600">
                        <summary className="cursor-pointer mb-1 underline">Stack Trace</summary>
                        {this.state.errorInfo?.componentStack}
                    </details>
                    <div className="mt-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
