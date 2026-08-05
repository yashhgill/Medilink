import React from "react";

/**
 * Catches any render/runtime error in the tree below it and shows a friendly
 * recovery card instead of a blank white screen — critical for a live demo.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }
  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error("MediLink caught a render error:", err, info);
  }
  reset = () => this.setState({ hasError: false, err: null });
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: "60vh", display: "flex", alignItems: "center",
        justifyContent: "center", padding: "24px", textAlign: "center",
      }}>
        <div style={{
          maxWidth: 420, background: "#fff", border: "1px solid #E2ECEC",
          borderRadius: 16, padding: "28px 24px", boxShadow: "0 8px 30px rgba(0,0,0,.06)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 18, color: "#12262B", marginBottom: 6 }}>
            Something hiccuped
          </div>
          <div style={{ fontSize: 14, color: "#5A6B70", marginBottom: 18 }}>
            This screen ran into an error. Your data is safe — just reload this view.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={this.reset} style={{
              background: "#0B7C8C", color: "#fff", border: 0, borderRadius: 10,
              padding: "10px 18px", fontWeight: 600, cursor: "pointer",
            }}>Try again</button>
            <button onClick={() => window.location.reload()} style={{
              background: "#EAF5F5", color: "#0B7C8C", border: 0, borderRadius: 10,
              padding: "10px 18px", fontWeight: 600, cursor: "pointer",
            }}>Reload page</button>
          </div>
        </div>
      </div>
    );
  }
}
