import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Admin ErrorBoundary]', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleClearData = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0A0B0E] text-white px-4">
          <div className="max-w-md w-full space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
              <p className="text-sm text-zinc-400">
                An unexpected error occurred. This has been logged for debugging.
              </p>
              {this.state.error && (
                <pre className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-red-300 overflow-auto max-h-32 text-left">
                  {this.state.error.message}
                </pre>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleRetry}
                className="w-full py-2.5 rounded-lg font-medium text-sm bg-brand hover:bg-brand/80 text-white transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleClearData}
                className="w-full py-2.5 rounded-lg font-medium text-sm bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 transition-colors"
              >
                Clear Cache & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
