import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="cf-center">
      <div style={{ textAlign: "center", padding: "0 20px", maxWidth: 420 }}>
        <p
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "var(--cf-primary)",
            margin: "0 0 8px",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          404
        </p>
        <h1
          style={{
            fontSize: 22,
            margin: "0 0 10px",
            letterSpacing: "-0.02em",
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            color: "var(--cf-muted)",
            fontSize: 14,
            margin: "0 0 28px",
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="cf-btn"
          style={{ display: "inline-block", width: "auto", textDecoration: "none" }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
