/**
 * WorkflowTracker — displays the current state of a configurable workflow
 * instance inside the Request/Leave details view.
 *
 * Props:
 *   workflow  { instanceId, templateName, currentStageIndex, overallStatus,
 *               stages, currentStage, isTerminal }
 *   entityType  "request" | "leave"
 */
import React from "react";

const STATUS_LABEL = {
  pending:     "Pending",
  in_progress: "In Progress",
  completed:   "Completed",
  skipped:     "Skipped",
};

const ACTION_LABEL = {
  approve:      "Approved",
  reject:       "Rejected",
  escalate:     "Escalated",
  close:        "Closed",
  request_info: "Info Requested",
};

const OVERALL_COLOR = {
  in_progress: "#4f46e5",
  approved:    "#16a34a",
  rejected:    "#dc2626",
  closed:      "#6b7280",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function StageRow({ stage, isCurrent }) {
  const isCompleted  = stage.status === "completed";
  const isInProgress = stage.status === "in_progress";
  const isSkipped    = stage.status === "skipped";

  let icon = "○";
  if (isCompleted)  icon = "✓";
  if (isInProgress) icon = "●";
  if (isSkipped)    icon = "—";

  const rowStyle = {
    display:       "flex",
    gap:           12,
    alignItems:    "flex-start",
    padding:       "10px 0",
    borderBottom:  "1px solid var(--cf-border, #e5e7eb)",
    opacity:       isSkipped ? 0.45 : 1,
  };

  const iconStyle = {
    flexShrink:  0,
    width:       24,
    height:      24,
    borderRadius: "50%",
    display:     "flex",
    alignItems:  "center",
    justifyContent: "center",
    fontWeight:  700,
    fontSize:    13,
    background:  isCompleted ? "#16a34a"
               : isInProgress ? "#4f46e5"
               : "#d1d5db",
    color:       isSkipped ? "#6b7280" : "#fff",
  };

  return (
    <div style={rowStyle}>
      <div style={iconStyle} aria-hidden="true">{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <strong style={{ fontSize: 14 }}>{stage.stageName}</strong>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {STATUS_LABEL[stage.status] || stage.status}
            {isCurrent && (
              <span style={{
                marginLeft: 6,
                background: "#e0e7ff",
                color: "#4f46e5",
                borderRadius: 4,
                padding: "1px 6px",
                fontSize: 11,
                fontWeight: 600,
              }}>Current</span>
            )}
          </span>
        </div>

        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
          Role: <strong style={{ textTransform: "capitalize" }}>{stage.assigneeRole}</strong>
        </div>

        {isInProgress && stage.slaDeadline && (
          <div style={{ fontSize: 12, color: new Date(stage.slaDeadline) < new Date() ? "#dc2626" : "#b45309", marginTop: 2 }}>
            {stage.slaBreached ? "⚠ SLA Breached" : `Due: ${fmtDate(stage.slaDeadline)}`}
          </div>
        )}

        {isCompleted && stage.action && (
          <div style={{ fontSize: 12, marginTop: 2 }}>
            <span style={{ color: "#374151" }}>
              Action: <strong>{ACTION_LABEL[stage.action] || stage.action}</strong>
              {stage.actorName && <> by <em>{stage.actorName}</em></>}
            </span>
            {stage.comment && (
              <div style={{ color: "#6b7280", fontStyle: "italic", marginTop: 2 }}>
                &ldquo;{stage.comment}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkflowTracker({ workflow }) {
  if (!workflow) return null;

  const overallColor = OVERALL_COLOR[workflow.overallStatus] || "#6b7280";

  return (
    <section className="cf-tile" style={{ marginBottom: 20 }} aria-label="Workflow progress">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 className="cf-tile__title" style={{ margin: 0 }}>Workflow</h2>
        <span style={{
          fontSize:    12,
          fontWeight:  700,
          color:       overallColor,
          background:  overallColor + "18",
          borderRadius: 4,
          padding:     "2px 8px",
          textTransform: "capitalize",
        }}>
          {workflow.overallStatus.replace("_", " ")}
        </span>
      </div>

      {workflow.templateName && (
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
          Template: <em>{workflow.templateName}</em>
        </p>
      )}

      <div role="list" aria-label="Workflow stages">
        {(workflow.stages || []).map((stage, idx) => (
          <StageRow
            key={stage._id || idx}
            stage={stage}
            isCurrent={idx === workflow.currentStageIndex && !workflow.isTerminal}
          />
        ))}
      </div>
    </section>
  );
}
