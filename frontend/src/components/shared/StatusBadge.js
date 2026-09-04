import React from "react";

/**
 * StatusBadge — displays a coloured pill for a request status value.
 *
 * Uses only CSS custom properties already defined in index.css so no
 * new dependencies are needed.
 *
 * Props
 * ─────
 * status  {string}  one of: pending | in_review | approved | rejected | closed
 * small   {boolean} render a smaller variant (default false)
 */

const CONFIG = {
  pending:   { label: "Pending",   bg: "#fef9c3", color: "#854d0e", border: "#fde68a" },
  in_review: { label: "In Review", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  approved:  { label: "Approved",  bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  rejected:  { label: "Rejected",  bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
  escalated: { label: "Escalated", bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
  closed:    { label: "Closed",    bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
};

const FALLBACK = { label: "Unknown", bg: "#f8fafc", color: "#475569", border: "#e2e8f0" };

export default function StatusBadge({ status, small = false }) {
  const cfg = CONFIG[status] ?? FALLBACK;

  return (
    <span
      style={{
        display:       "inline-block",
        padding:       small ? "2px 8px" : "3px 10px",
        borderRadius:  "999px",
        fontSize:      small ? "11px" : "12px",
        fontWeight:    700,
        letterSpacing: "0.02em",
        background:    cfg.bg,
        color:         cfg.color,
        border:        `1px solid ${cfg.border}`,
        whiteSpace:    "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}
