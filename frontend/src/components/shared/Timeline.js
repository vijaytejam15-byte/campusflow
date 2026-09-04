import React from "react";

/**
 * Timeline — visual milestone strip showing where a request is in its lifecycle.
 *
 * Props
 * ─────
 * currentStatus  {string}  active status value from the request
 * comments       {array}   request.comments audit log (for timestamps)
 *
 * The milestones are ordered: Submitted → In Review → HOD Review → Outcome
 * Each step lights up when the request has passed through or reached that state.
 */

// Ordered milestone definitions
// `matchStatuses` = the request statuses that mean this step is "reached"
const MILESTONES = [
  {
    key:           "submitted",
    label:         "Submitted",
    icon:          "📝",
    matchStatuses: ["pending", "in_review", "escalated", "approved", "rejected", "closed"],
  },
  {
    key:           "in_review",
    label:         "Faculty Review",
    icon:          "🔍",
    matchStatuses: ["in_review", "escalated", "approved", "rejected", "closed"],
  },
  {
    key:           "escalated",
    label:         "HOD Review",
    icon:          "📋",
    matchStatuses: ["escalated", "approved", "rejected", "closed"],
    // Only shown as active if actually escalated; otherwise faded
    optional:      true,
  },
  {
    key:           "outcome",
    label:         "Outcome",
    icon:          "✅",
    matchStatuses: ["approved", "rejected", "closed"],
    // Colour changes based on final status
    terminal:      true,
  },
];

// Outcome icon/colour overrides
function outcomeIcon(status) {
  if (status === "approved") return "✅";
  if (status === "rejected") return "❌";
  if (status === "closed")   return "🔒";
  return "⏳";
}
function outcomeLabel(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "closed")   return "Closed";
  return "Pending Outcome";
}

// Find the ISO timestamp for a milestone from the comments log
function milestoneDate(comments, matchStatuses) {
  if (!Array.isArray(comments)) return null;
  const entry = comments.find((c) => matchStatuses.includes(c.statusSnapshot));
  return entry?.createdAt || null;
}

function fmtShort(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Timeline({ currentStatus, comments = [] }) {
  const isTerminal = ["approved", "rejected", "closed"].includes(currentStatus);

  return (
    <div className="cf-timeline" role="list" aria-label="Request progress">
      {MILESTONES.map((ms, idx) => {
        // Determine whether this step is reached / active / pending
        let state; // "done" | "active" | "pending"
        if (ms.terminal) {
          state = isTerminal ? "done" : "pending";
        } else if (ms.optional && ms.key === "escalated") {
          // Only mark escalated step if the request was actually escalated
          const wasEscalated = Array.isArray(comments) &&
            comments.some((c) => c.statusSnapshot === "escalated");
          state = wasEscalated ? "done"
                : currentStatus === "escalated" ? "active"
                : "pending";
        } else {
          state = ms.matchStatuses.includes(currentStatus) ? "done" : "pending";
        }

        // The "active" step is the one matching the current status exactly
        if (ms.key === "in_review" && currentStatus === "in_review") state = "active";
        if (ms.key === "submitted" && currentStatus === "pending")    state = "active";
        if (ms.key === "escalated" && currentStatus === "escalated")  state = "active";
        if (ms.terminal && isTerminal)                                state = "done";

        const date = fmtShort(milestoneDate(comments, ms.matchStatuses));

        // Last milestone gets dynamic icon/label
        const icon  = ms.terminal ? outcomeIcon(currentStatus)  : ms.icon;
        const label = ms.terminal ? outcomeLabel(currentStatus) : ms.label;
        const isLast = idx === MILESTONES.length - 1;

        return (
          <React.Fragment key={ms.key}>
            <div
              className={`cf-timeline__step cf-timeline__step--${state}`}
              role="listitem"
            >
              <div className="cf-timeline__dot" aria-hidden="true">
                <span className="cf-timeline__icon">{icon}</span>
              </div>
              <div className="cf-timeline__label">{label}</div>
              {date && state !== "pending" && (
                <div className="cf-timeline__date">{date}</div>
              )}
            </div>
            {/* Connector line between steps */}
            {!isLast && (
              <div
                className={`cf-timeline__line cf-timeline__line--${state === "pending" ? "pending" : "done"}`}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
