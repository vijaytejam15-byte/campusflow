/**
 * WorkflowTracker — Feature 1/3: displays workflow state including parallel votes.
 */
import React from "react";

const STATUS_LABEL = { pending:"Pending", in_progress:"In Progress", completed:"Completed", skipped:"Skipped" };
const ACTION_LABEL = { approve:"Approved", reject:"Rejected", escalate:"Escalated", close:"Closed", request_info:"Info Requested" };
const OVERALL_COLOR = { in_progress:"#4f46e5", approved:"#16a34a", rejected:"#dc2626", closed:"#6b7280" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function ParallelVotes({ votes, quorum, assigneeCount }) {
  if (!votes || votes.length === 0) return <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>No votes yet.</p>;
  const needed = quorum > 0 ? quorum : assigneeCount || 1;
  const approved = votes.filter((v) => v.action === "approve").length;
  return (
    <div style={{ marginTop: 6 }}>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>
        Parallel votes: {approved}/{needed} approvals needed
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {votes.map((v, i) => (
          <span key={i} style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 4,
            background: v.action === "approve" ? "#dcfce7" : "#fee2e2",
            color:      v.action === "approve" ? "#15803d" : "#dc2626",
          }}>
            {v.actorName || "User"}: {v.action}
            {v.comment ? ` — "${v.comment}"` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function StageRow({ stage, isCurrent }) {
  const isCompleted  = stage.status === "completed";
  const isInProgress = stage.status === "in_progress";
  const isSkipped    = stage.status === "skipped";
  const isParallel   = stage.stageType === "parallel";

  let icon = "○";
  if (isCompleted)  icon = "✓";
  if (isInProgress) icon = isParallel ? "⟳" : "●";
  if (isSkipped)    icon = "—";

  const iconStyle = {
    flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: 13,
    background: isCompleted ? "#16a34a" : isInProgress ? "#4f46e5" : "#d1d5db",
    color: isSkipped ? "#6b7280" : "#fff",
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0",
      borderBottom: "1px solid var(--cf-border, #e5e7eb)", opacity: isSkipped ? 0.45 : 1 }}>
      <div style={iconStyle} aria-hidden="true">{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <strong style={{ fontSize: 14 }}>
            {stage.stageName}
            {isParallel && <span style={{ marginLeft: 6, fontSize: 11, background: "#e0e7ff", color: "#4f46e5", borderRadius: 4, padding: "1px 6px" }}>Parallel</span>}
          </strong>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {STATUS_LABEL[stage.status] || stage.status}
            {isCurrent && <span style={{ marginLeft: 6, background: "#e0e7ff", color: "#4f46e5", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 600 }}>Current</span>}
          </span>
        </div>

        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
          Role: <strong style={{ textTransform: "capitalize" }}>{stage.assigneeRole}</strong>
        </div>

        {isInProgress && stage.slaDeadline && (
          <div style={{ fontSize: 12, color: new Date(stage.slaDeadline) < new Date() ? "#dc2626" : "#b45309", marginTop: 2 }}>
            {stage.slaBreached ? "⚠ SLA Breached" : `SLA due: ${fmtDate(stage.slaDeadline)}`}
            {stage.slaWarned && !stage.slaBreached && <span style={{ marginLeft: 6, color: "#b45309" }}>⚠ Warning sent</span>}
          </div>
        )}

        {/* Parallel votes (Feature 3) */}
        {isParallel && isInProgress && (
          <ParallelVotes
            votes={stage.parallelVotes || []}
            quorum={stage.parallelQuorum}
            assigneeCount={(stage.parallelAssignees || []).length}
          />
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

        {/* Conditional routing indicators */}
        {isInProgress && (stage.conditions || []).length > 0 && (
          <div style={{ fontSize: 11, color: "#8b5cf6", marginTop: 3 }}>
            ⚡ {stage.conditions.length} conditional routing rule(s) active
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
        <span style={{ fontSize: 12, fontWeight: 700, color: overallColor,
          background: overallColor + "18", borderRadius: 4, padding: "2px 8px", textTransform: "capitalize" }}>
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
