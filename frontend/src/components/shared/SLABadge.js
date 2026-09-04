import React from "react";

/**
 * SLABadge — shows SLA status for a request.
 *
 * Props
 * ─────
 * slaDeadline  {string|Date}  ISO deadline
 * slaBreached  {boolean}
 * status       {string}       request status
 * small        {boolean}
 */

const SLA_HOURS = { low: 72, normal: 48, high: 24, urgent: 4 };

function fmtRemaining(ms) {
  if (ms <= 0) return "Overdue";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h remaining`;
  if (h > 0)   return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

export default function SLABadge({ slaDeadline, slaBreached, status, small = false }) {
  // Don't show SLA on terminal statuses
  if (["approved", "rejected", "closed"].includes(status)) return null;
  if (!slaDeadline) return null;

  const deadline  = new Date(slaDeadline);
  const remaining = deadline - Date.now();
  const isBreached = slaBreached || remaining <= 0;
  const isWarning  = !isBreached && remaining <= 6 * 60 * 60 * 1000; // < 6h

  let bg, color, label;
  if (isBreached) {
    bg = "#fee2e2"; color = "#dc2626";
    label = "SLA Breached";
  } else if (isWarning) {
    bg = "#fef9c3"; color = "#b45309";
    label = fmtRemaining(remaining);
  } else {
    bg = "#f0fdf4"; color = "#15803d";
    label = fmtRemaining(remaining);
  }

  return (
    <span
      title={`SLA deadline: ${deadline.toLocaleString()}`}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           4,
        padding:       small ? "2px 8px" : "3px 10px",
        borderRadius:  "999px",
        fontSize:      small ? "11px" : "12px",
        fontWeight:    700,
        background:    bg,
        color,
        whiteSpace:    "nowrap",
        border:        `1px solid ${color}33`,
      }}
    >
      <span aria-hidden="true">{isBreached ? "🔴" : isWarning ? "🟡" : "🟢"}</span>
      {label}
    </span>
  );
}

/**
 * Compute SLA deadline from a priority string.
 * Useful when creating/displaying new requests.
 */
export function computeSLADeadline(priority, createdAt) {
  const hours = SLA_HOURS[priority] || 48;
  const base  = createdAt ? new Date(createdAt) : new Date();
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}
