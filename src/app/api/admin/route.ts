/**
 * GET /api/admin
 *
 * Returns operators, AI agents, and audit/activity data for the Admin System tab.
 * Reads from the backend SQLite database.
 *
 * Backend: /home/z/my-project/coffee_export/data/coffee_export.db
 * Tables:  operators, agents, ai_call_logs, audit_log
 */

import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

function getDbPath(): string {
  const fs = require("fs");
  const candidates = [
    path.resolve(process.cwd(), "..", "coffee_export", "data", "coffee_export.db"),
    path.resolve(process.cwd(), "coffee_export", "data", "coffee_export.db"),
    "/home/z/my-project/coffee_export/data/coffee_export.db",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[candidates.length - 1];
}

function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffMs = now - then;
    if (diffMs < 0) return "Just now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  } catch {
    return "—";
  }
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

type FrontendOperator = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "disabled";
  lastActive: string;
  actionsToday: number;
};

type FrontendAIAgent = {
  id: string;
  name: string;
  model: string;
  status: "active" | "idle" | "error" | "paused";
  lastAction: string;
  lastActionTime: string;
  actionsToday: number;
  approvalsWaiting: number;
  description?: string;
};

type FrontendAuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actorType: "operator" | "agent";
  action: string;
  entityType: string;
  entityId: string;
};

export async function GET() {
  try {
    const db = new Database(getDbPath(), { readonly: true, fileMustExist: true });

    try {
      // ─── Operators ───
      const operatorRows = db.prepare(`
        SELECT operator_id, name, email, role, status, updated_ts, created_ts
        FROM operators
        WHERE 1=1
        ORDER BY created_ts ASC
      `).all() as any[];

      const operators: FrontendOperator[] = operatorRows.map((op) => ({
        id: op.operator_id,
        name: op.name,
        email: op.email,
        role: op.role,
        status: op.status === "active" ? "active" : "disabled",
        lastActive: relativeTime(op.updated_ts),
        actionsToday: 0, // backend doesn't track per-operator action counts yet
      }));

      // ─── AI Agents (with activity stats from ai_call_logs) ───
      const agentRows = db.prepare(`
        SELECT agent_id, name, description, status, created_ts, updated_ts
        FROM agents
        ORDER BY agent_id ASC
      `).all() as any[];

      // For each agent, get their last AI call + count of today's calls
      const lastCallStmt = db.prepare(`
        SELECT agent_id, task_type, response_preview, called_ts
        FROM ai_call_logs
        WHERE agent_id = ? AND success = 1
        ORDER BY called_ts DESC
        LIMIT 1
      `);
      const todayCountStmt = db.prepare(`
        SELECT COUNT(*) as n FROM ai_call_logs
        WHERE agent_id = ? AND date(called_ts) = date('now')
      `);

      const agents: FrontendAIAgent[] = agentRows.map((ag) => {
        const lastCall = (lastCallStmt.get(ag.agent_id) as any) || null;
        const todayCount = (todayCountStmt.get(ag.agent_id) as any)?.n || 0;

        // Derive a friendly "last action" description
        let lastAction = "No actions yet";
        if (lastCall) {
          const taskType = lastCall.task_type || "task";
          const preview = (lastCall.response_preview || "").substring(0, 60);
          lastAction = `${taskType} call — ${preview}...`;
        }

        return {
          id: ag.agent_id,
          name: ag.name,
          model: "Llama 3.3 70B", // static — backend doesn't track model per agent
          status: (ag.status === "active" ? "active" : "idle") as "active" | "idle",
          lastAction,
          lastActionTime: lastCall ? relativeTime(lastCall.called_ts) : "Never",
          actionsToday: todayCount,
          approvalsWaiting: 0, // no approvals table in backend
          description: ag.description,
        };
      });

      // ─── Audit/Activity log ───
      // Since audit_log is empty, use ai_call_logs as the activity stream
      const activityRows = db.prepare(`
        SELECT id, agent_id, provider, model, task_type, prompt_tokens, completion_tokens,
               cost_usd, latency_ms, success, error_message, response_preview, called_ts
        FROM ai_call_logs
        ORDER BY called_ts DESC
        LIMIT 20
      `).all() as any[];

      const audit: FrontendAuditEntry[] = activityRows.map((row) => ({
        id: `AI-${row.id}`,
        timestamp: formatTimestamp(row.called_ts),
        actor: row.agent_id || "Unknown Agent",
        actorType: "agent" as const,
        action: `${row.task_type || "AI"} call (${row.prompt_tokens || 0}+${row.completion_tokens || 0} tokens)`,
        entityType: "AI Call",
        entityId: row.agent_id || "—",
      }));

      return NextResponse.json({
        ok: true,
        source: "sqlite",
        operators,
        agents,
        audit,
        // No approvals data in backend — return empty array (frontend will show "no pending approvals")
        approvals: [],
        stats: {
          operatorCount: operators.length,
          activeOperators: operators.filter((o) => o.status === "active").length,
          agentCount: agents.length,
          activeAgents: agents.filter((a) => a.status === "active").length,
          auditCount: audit.length,
          pendingApprovals: 0,
        },
      });
    } finally {
      db.close();
    }
  } catch (error: any) {
    console.error("[/api/admin] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch admin data" },
      { status: 500 }
    );
  }
}
