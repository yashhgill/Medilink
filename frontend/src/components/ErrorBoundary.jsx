import React from "react";

/**
 * Catches render-time crashes anywhere below it and shows a graceful recovery
 * screen instead of a blank white page — critical for a live demo. A crash in
 * one view no longer takes down the whole app; the user can reload or go home.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log for debugging; never throw from here.
    // eslint-disable-next-line no-console
    console.error("MediLink caught a render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F4F9F9] p-6">
          <div className="max-w-md w-full rounded-2xl border border-[#DCE8E9] bg-white p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#EAF5F5] flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="font-display text-xl text-[#0A3D62] mb-1">Something went wrong</h1>
            <p className="text-sm text-[#5A6B70] mb-5">
              The clinic system hit an unexpected error on this screen. Your data is safe.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl bg-[#0B7C8C] text-white text-sm font-medium hover:bg-[#075F6C]"
              >
                Reload
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                className="px-5 py-2.5 rounded-xl border border-[#DCE8E9] text-[#0B7C8C] text-sm font-medium hover:bg-[#EAF5F5]"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
