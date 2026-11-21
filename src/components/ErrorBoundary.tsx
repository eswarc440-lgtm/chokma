import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Chokma ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let displayDetail = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed.error) {
          displayDetail = `${parsed.operationType?.toUpperCase() || 'DATA'} error on ${parsed.path || 'workspace'}: ${parsed.error}`;
        }
      } catch {
        // Plain message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0B0F17] p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8">
            <div className="flex items-center gap-3 text-red-700 dark:text-red-400 mb-4">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Something went wrong in Chokma
              </h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed break-words">
              {displayDetail}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
