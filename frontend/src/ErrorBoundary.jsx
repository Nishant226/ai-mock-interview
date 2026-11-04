import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // State update karein taaki agli render mein fallback UI dikhe
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Aap yahan error logging service (jaise Sentry) ko error bhej sakte hain
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Custom Fallback UI jo crash hone par dikhegi
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-5 py-20 text-center font-sans">
          <div className="mx-auto mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full border border-red-200 bg-red-100 text-[30px] text-red-600">
            ⚠️
          </div>
          <h1 className="mb-2.5 text-[28px] font-black text-slate-900">Oops! Something went wrong.</h1>
          <p className="mx-auto mb-8 max-w-[500px] text-[15px] leading-relaxed text-slate-500">
           An unexpected error occurred during the interview session. No need to worry, your data is safe.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-full border-0 bg-slate-900 px-8 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_25px_rgba(15,23,42,0.2)] transition-colors hover:bg-slate-800"
          >
            🔄 Refresh App & Try Again
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;