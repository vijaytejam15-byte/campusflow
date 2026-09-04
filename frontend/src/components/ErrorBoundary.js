import React from "react";

/**
 * Top-level React error boundary.
 * Catches any unhandled render errors and shows a friendly fallback
 * instead of a blank white screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error, info) {
    // Log for debugging — could also send to an error-reporting service
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: "" });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="cf-center">
          <div
            style={{
              textAlign: "center",
              maxWidth: 420,
              padding: "0 20px",
            }}
          >
            <h1 style={{ fontSize: 22, marginBottom: 10 }}>
              Something went wrong
            </h1>
            <p
              style={{
                color: "var(--cf-muted)",
                fontSize: 14,
                marginBottom: 24,
              }}
            >
              An unexpected error occurred. Reloading the page usually fixes
              this.
            </p>
            {process.env.NODE_ENV !== "production" && (
              <pre
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 24,
                  overflowX: "auto",
                  color: "var(--cf-danger)",
                }}
              >
                {this.state.message}
              </pre>
            )}
            <button className="cf-btn cf-btn--auto" onClick={this.handleReload}>
              Reload application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
