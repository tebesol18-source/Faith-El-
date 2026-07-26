/**
 * Coffee Export ERP — Agent Supervisor & Scheduler
 *
 * This is the "manager of managers" that sits above all 7 AI agents.
 * It runs continuously in the background, doing two jobs:
 *
 * 1. SCHEDULER: For each agent, checks if there's pending work (events
 *    in the events table) and triggers the agent to process them.
 *
 * 2. SUPERVISOR: Monitors all agents for health issues:
 *    - Agent crashed (consecutive_errors >= max)
 *    - Agent stuck (hasn't run in too long despite pending work)
 *    - Events piling up unconsumed
 *    - Auto-corrects by resetting failed agents, clearing stuck states
 *    - Logs all findings to supervisor_log table
 *
 * Usage:
 *   node scripts/supervisor.js              # Run continuously (every 10s)
 *   node scripts/supervisor.js --once       # Run one tick and exit
 *   node scripts/supervisor.js --interval 5 # Run every 5 seconds
 */

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = "/home/z/my-project/coffee_export/data/coffee_export.db";

// ─── Event → Agent routing ───
// Which agent handles which event type
const EVENT_ROUTING = {
  LEAD_CREATED: "Agent 2",
  LEAD_ENRICHED: "Agent 3",
  LEAD_STATE_CHANGED: "Agent 3",
  MESSAGE_SENT: "Agent 3",
  MESSAGE_RECEIVED: "Agent 3",
  THREAD_OPENED: "Agent 3",
  SAMPLE_REQUESTED: "Agent 1",
  LOT_CONFIRMED: "Agent 4",
  LOT_CONFIRMATION_FAILED: "Agent 4",
  CONTRACT_SIGNED: "Agent 5",
  SHIPMENT_DEPARTED: "Agent 6",
  SHIPMENT_ARRIVED: "Agent 6",
  LEAD_NURTURED: "Agent 7",
  LEAD_QUALIFIED: "Agent 7",
  LEAD_GHOSTED: "Agent 7",
};

// Agent descriptions (for logging)
const AGENT_NAMES = {
  "Agent 1": "Supplier & Inventory",
  "Agent 2": "Lead Research & Enrichment",
  "Agent 3": "Outreach & Qualification",
  "Agent 4": "Sample Management",
  "Agent 5": "Legal & Compliance",
  "Agent 6": "Logistics & Shipping",
  "Agent 7": "Sales & Relationship Management",
};

function nowISO() {
  return new Date().toISOString();
}

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

class Supervisor {
  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.tickCount = 0;
  }

  close() {
    this.db.close();
  }

  /** Write to supervisor_log table */
  logEvent(agentId, eventType, severity, message, actionTaken, details) {
    this.db.prepare(`
      INSERT INTO supervisor_log (timestamp, agent_id, event_type, severity, message, action_taken, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nowISO(), agentId, eventType, severity, message, actionTaken || null, details || null);
  }

  /** Get all agent controls */
  getAgentControls() {
    return this.db.prepare("SELECT * FROM agent_controls ORDER BY agent_id").all();
  }

  /** Get pending events for an agent */
  getPendingEvents(agentId) {
    const eventTypes = Object.entries(EVENT_ROUTING)
      .filter(([_, ag]) => ag === agentId)
      .map(([et]) => et);
    if (eventTypes.length === 0) return [];

    const placeholders = eventTypes.map(() => "?").join(",");
    return this.db.prepare(`
      SELECT * FROM events
      WHERE status = 'pending' AND event_type IN (${placeholders})
      ORDER BY published_ts ASC
      LIMIT 10
    `).all(...eventTypes);
  }

  /** Process one event as if the agent handled it */
  processEvent(agentId, event) {
    const payload = JSON.parse(event.payload || "{}");

    // Agent-specific processing logic
    switch (agentId) {
      case "Agent 2":
        // Lead enrichment: mark lead as ENRICHED (if still NEW)
        if (event.event_type === "LEAD_CREATED" && payload.lead_id) {
          this.db.prepare(`
            UPDATE leads SET current_state = 'ENRICHED', current_agent = 'Agent 3', updated_ts = ?
            WHERE lead_id = ? AND current_state = 'NEW'
          `).run(nowISO(), payload.lead_id);
        }
        break;

      case "Agent 3":
        // Outreach: advance sequence step or mark as IN_SEQUENCE
        if (payload.lead_id) {
          const lead = this.db.prepare("SELECT current_state, sequence_step FROM leads WHERE lead_id = ?").get(payload.lead_id);
          if (lead && lead.current_state === "ENRICHED") {
            this.db.prepare(`
              UPDATE leads SET current_state = 'IN_SEQUENCE', sequence_step = 1, updated_ts = ?
              WHERE lead_id = ?
            `).run(nowISO(), payload.lead_id);
          }
        }
        break;

      case "Agent 1":
        // Lot confirmation: just acknowledge
        break;

      case "Agent 4":
        // Sample management: update lead to SAMPLE_DISPATCHED
        if (payload.lead_id) {
          this.db.prepare(`
            UPDATE leads SET current_state = 'SAMPLE_DISPATCHED', updated_ts = ?
            WHERE lead_id = ? AND current_state IN ('QUALIFIED', 'IN_SEQUENCE')
          `).run(nowISO(), payload.lead_id);
        }
        break;

      case "Agent 7":
        // Sales: handle nurture/qualify/ghost transitions
        if (payload.lead_id) {
          // Already handled by event type
        }
        break;
    }

    // Mark event as consumed
    this.db.prepare(`
      UPDATE events SET status = 'consumed', consumed_ts = ?, consumed_by = ?
      WHERE id = ?
    `).run(nowISO(), agentId, event.id);

    // Publish follow-up event if applicable
    if (event.event_type === "LEAD_CREATED") {
      this.publishEvent("LEAD_ENRICHED", "lead", payload.lead_id, payload, agentId);
    }
  }

  /** Publish a new event */
  publishEvent(eventType, entityType, entityId, payload, publishedBy) {
    this.db.prepare(`
      INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(eventType, entityType, entityId, JSON.stringify(payload), publishedBy, nowISO());
  }

  /** Run one agent — process its pending events */
  runAgent(agentId) {
    const controls = this.db.prepare("SELECT * FROM agent_controls WHERE agent_id = ?").get(agentId);
    if (!controls) return;

    // Skip if paused
    if (controls.is_paused) {
      return { skipped: true, reason: "paused" };
    }

    // Check for too many consecutive errors
    if (controls.consecutive_errors >= controls.max_consecutive_errors) {
      // Supervisor will handle this — skip for now
      return { skipped: true, reason: "too_many_errors" };
    }

    const events = this.getPendingEvents(agentId);
    if (events.length === 0) {
      return { processed: 0 };
    }

    let processed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        this.processEvent(agentId, event);
        processed++;
      } catch (err) {
        errors++;
        this.logEvent(
          agentId,
          "AGENT_ERROR",
          "error",
          `Error processing event ${event.id} (${event.event_type}): ${err.message}`,
          null,
          JSON.stringify({ eventId: event.id, error: err.message })
        );
      }
    }

    // Update agent controls
    const newRunCount = controls.run_count + 1;
    const newErrorCount = controls.error_count + errors;
    const newConsecutiveErrors = errors > 0 ? controls.consecutive_errors + errors : 0;
    const lastError = errors > 0 ? "Processing error" : null;
    const lastErrorTs = errors > 0 ? nowISO() : null;

    this.db.prepare(`
      UPDATE agent_controls
      SET last_run_ts = ?, last_run_status = ?, run_count = ?, error_count = ?,
          consecutive_errors = ?, last_error = ?, last_error_ts = ?, updated_ts = ?
      WHERE agent_id = ?
    `).run(
      nowISO(),
      errors > 0 ? "partial_error" : "success",
      newRunCount,
      newErrorCount,
      newConsecutiveErrors,
      lastError,
      lastErrorTs,
      nowISO(),
      agentId
    );

    if (processed > 0) {
      log(`  ${agentId} (${AGENT_NAMES[agentId]}): processed ${processed} event(s)${errors > 0 ? `, ${errors} error(s)` : ""}`);
    }

    return { processed, errors };
  }

  /** Supervisor check — monitor all agents for issues */
  runSupervisorCheck() {
    const controls = this.getAgentControls();
    let issuesFound = 0;
    let autoCorrected = 0;

    for (const c of controls) {
      // Check 1: Too many consecutive errors → auto-restart if enabled
      if (c.consecutive_errors >= c.max_consecutive_errors) {
        issuesFound++;
        if (c.auto_restart_enabled) {
          this.db.prepare(`
            UPDATE agent_controls
            SET consecutive_errors = 0, last_error = NULL, last_error_ts = NULL,
                last_run_status = 'auto_restarted', updated_ts = ?
            WHERE agent_id = ?
          `).run(nowISO(), c.agent_id);

          this.logEvent(
            c.agent_id,
            "AUTO_RESTART",
            "warning",
            `${c.agent_id} (${AGENT_NAMES[c.agent_id]}) had ${c.consecutive_errors} consecutive errors — auto-restarted`,
            "Reset consecutive_errors to 0, cleared error state",
            JSON.stringify({ previousErrors: c.consecutive_errors, threshold: c.max_consecutive_errors })
          );
          autoCorrected++;
          log(`  ⚠️  SUPERVISOR: Auto-restarted ${c.agent_id} (${c.consecutive_errors} consecutive errors)`);
        } else {
          this.logEvent(
            c.agent_id,
            "AGENT_FAILED",
            "critical",
            `${c.agent_id} has ${c.consecutive_errors} consecutive errors and auto-restart is disabled`,
            "No action taken — manual intervention required",
            null
          );
          log(`  🔴 SUPERVISOR: ${c.agent_id} FAILED — auto-restart disabled, needs manual fix`);
        }
      }

      // Check 2: Agent hasn't run despite having pending events (stuck)
      const pendingEvents = this.getPendingEvents(c.agent_id);
      if (pendingEvents.length > 5 && !c.is_paused) {
        const lastRunAge = c.last_run_ts ? (Date.now() - new Date(c.last_run_ts).getTime()) / 1000 : Infinity;
        if (lastRunAge > 60) {
          issuesFound++;
          this.logEvent(
            c.agent_id,
            "AGENT_STUCK",
            "warning",
            `${c.agent_id} has ${pendingEvents.length} pending events but hasn't run in ${Math.round(lastRunAge)}s`,
            "Will retry on next tick",
            JSON.stringify({ pendingCount: pendingEvents.length, lastRunAgeSec: Math.round(lastRunAge) })
          );
          log(`  ⚠️  SUPERVISOR: ${c.agent_id} stuck — ${pendingEvents.length} pending events, last run ${Math.round(lastRunAge)}s ago`);
        }
      }

      // Check 3: Agent is paused — just log it (informational)
      if (c.is_paused && c.paused_ts) {
        const pausedAge = (Date.now() - new Date(c.paused_ts).getTime()) / 1000;
        if (pausedAge > 300) {
          // Paused for more than 5 minutes — informational
          // Only log once (check if we already logged recently)
          const recentLog = this.db.prepare(`
            SELECT COUNT(*) as n FROM supervisor_log
            WHERE agent_id = ? AND event_type = 'AGENT_PAUSED'
            AND timestamp > datetime('now', '-5 minutes')
          `).get(c.agent_id);
          if (recentLog.n === 0) {
            this.logEvent(
              c.agent_id,
              "AGENT_PAUSED",
              "info",
              `${c.agent_id} has been paused for ${Math.round(pausedAge / 60)} minutes`,
              null,
              null
            );
          }
        }
      }
    }

    // Check 4: Global event backlog
    const totalPending = this.db.prepare("SELECT COUNT(*) as n FROM events WHERE status = 'pending'").get().n;
    if (totalPending > 20) {
      issuesFound++;
      this.logEvent(
        null,
        "EVENT_BACKLOG",
        "warning",
        `${totalPending} events are pending across all agents — possible bottleneck`,
        "Supervisor will prioritize processing on next tick",
        JSON.stringify({ totalPending })
      );
      log(`  ⚠️  SUPERVISOR: Event backlog — ${totalPending} pending events`);
    }

    return { issuesFound, autoCorrected, totalPending };
  }

  /** Phase 4: Generate pending actions for risky operations */
  generatePendingActions() {
    // Find leads in ENRICHED state that don't have a pending action yet
    // Agent 3 wants to start outreach (send first email) — needs admin approval
    const enrichedLeads = this.db.prepare(`
      SELECT l.lead_id, l.company_name, l.headquarters_country, l.priority_tier, l.outreach_language
      FROM leads l
      WHERE l.current_state = 'ENRICHED' AND l.deleted_ts IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pending_agent_actions p
        WHERE p.target_entity_id = l.lead_id AND p.status = 'pending'
      )
      LIMIT 5
    `).all();

    for (const lead of enrichedLeads) {
      const riskLevel = lead.priority_tier === "S" ? "medium" : "low";
      this.db.prepare(`
        INSERT INTO pending_agent_actions (
          agent_id, action_type, action_description,
          target_entity_type, target_entity_id, payload,
          risk_level, status, submitted_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        "Agent 3",
        "send_email",
        `Send first outreach email to ${lead.company_name} (${lead.headquarters_country}) — ${lead.priority_tier} tier, ${lead.outreach_language}`,
        "lead",
        lead.lead_id,
        JSON.stringify({ lead_id: lead.lead_id, company: lead.company_name, step: 1, language: lead.outreach_language }),
        riskLevel,
        nowISO()
      );

      this.logEvent("Agent 3", "PENDING_ACTION_CREATED", "info",
        `Agent 3 queued outreach email for ${lead.company_name} — awaiting admin approval`,
        "Action added to approval queue",
        JSON.stringify({ leadId: lead.lead_id, riskLevel })
      );
    }

    // Find leads in DECIDED_APPROVED state — Agent 5 wants to create a contract
    const approvedLeads = this.db.prepare(`
      SELECT l.lead_id, l.company_name, l.headquarters_country
      FROM leads l
      WHERE l.current_state = 'DECIDED_APPROVED' AND l.deleted_ts IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pending_agent_actions p
        WHERE p.target_entity_id = l.lead_id AND p.action_type = 'create_contract' AND p.status = 'pending'
      )
      AND NOT EXISTS (
        SELECT 1 FROM contracts c WHERE c.lead_id = l.lead_id AND c.deleted_ts IS NULL
      )
      LIMIT 3
    `).all();

    for (const lead of approvedLeads) {
      this.db.prepare(`
        INSERT INTO pending_agent_actions (
          agent_id, action_type, action_description,
          target_entity_type, target_entity_id, payload,
          risk_level, status, submitted_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        "Agent 5",
        "create_contract",
        `Create contract for ${lead.company_name} (${lead.headquarters_country}) — sample approved`,
        "lead",
        lead.lead_id,
        JSON.stringify({ lead_id: lead.lead_id, company: lead.company_name }),
        "high",
        nowISO()
      );

      this.logEvent("Agent 5", "PENDING_ACTION_CREATED", "info",
        `Agent 5 queued contract creation for ${lead.company_name} — awaiting admin approval`,
        "Action added to approval queue (high risk)",
        JSON.stringify({ leadId: lead.lead_id })
      );
    }

    // Process approved actions — execute them
    const approvedActions = this.db.prepare(`
      SELECT * FROM pending_agent_actions WHERE status = 'approved'
    `).all();

    for (const action of approvedActions) {
      const payload = JSON.parse(action.payload || "{}");

      if (action.action_type === "send_email" && payload.lead_id) {
        // Execute: advance lead from ENRICHED to IN_SEQUENCE
        this.db.prepare(`
          UPDATE leads SET current_state = 'IN_SEQUENCE', sequence_step = 1, updated_ts = ?
          WHERE lead_id = ? AND current_state = 'ENRICHED'
        `).run(nowISO(), payload.lead_id);

        // Publish MESSAGE_SENT event
        this.publishEvent("MESSAGE_SENT", "inbox_message", payload.lead_id, payload, "Agent 3");

        this.logEvent("Agent 3", "ACTION_EXECUTED", "info",
          `Outreach email sent to ${payload.company || payload.lead_id} (approved by admin)`,
          "Lead advanced to IN_SEQUENCE",
          JSON.stringify({ leadId: payload.lead_id })
        );
        log(`  ✅ Agent 3: Executed approved action — outreach email to ${payload.company || payload.lead_id}`);
      }

      if (action.action_type === "create_contract" && payload.lead_id) {
        // Execute: create a contract record
        const contractId = `CT-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        this.db.prepare(`
          INSERT INTO contracts (
            contract_id, lead_id, contract_number, contract_date,
            contract_template, incoterm, currency, total_volume_bags,
            total_value, status, signed_ts, is_repeat,
            created_ts, updated_ts, deleted_ts
          ) VALUES (?, ?, ?, ?, 'ICC_ECE_7_21', 'FOB', 'USD', 100, 500, 'draft', NULL, 0, ?, ?, NULL)
        `).run(contractId, payload.lead_id, contractId, nowISO().substring(0, 10), nowISO(), nowISO());

        this.logEvent("Agent 5", "ACTION_EXECUTED", "info",
          `Contract ${contractId} created for ${payload.company || payload.lead_id} (approved by admin)`,
          "Contract inserted in draft status",
          JSON.stringify({ contractId, leadId: payload.lead_id })
        );
        log(`  ✅ Agent 5: Executed approved action — contract ${contractId} for ${payload.company || payload.lead_id}`);
      }

      // Mark action as executed
      this.db.prepare("UPDATE pending_agent_actions SET status = 'executed' WHERE id = ?").run(action.id);
    }

    return { created: enrichedLeads.length + approvedLeads.length, executed: approvedActions.length };
  }

  /** Run one complete tick: scheduler + supervisor + pending actions + heartbeat */
  tick() {
    this.tickCount++;
    log(`--- Tick #${this.tickCount} ---`);

    // Phase 1: Run each agent
    let totalProcessed = 0;
    const controls = this.getAgentControls();
    for (const c of controls) {
      const result = this.runAgent(c.agent_id);
      if (result && result.processed) totalProcessed += result.processed;
    }

    // Phase 2: Supervisor check
    const supervisorResult = this.runSupervisorCheck();

    // Phase 3: Generate + process pending actions (approval queue)
    const pendingResult = this.generatePendingActions();

    // Phase 4: Heartbeat (every 6 ticks = once per minute)
    if (this.tickCount % 6 === 0) {
      this.logEvent(null, "HEARTBEAT", "info",
        `Supervisor heartbeat — tick #${this.tickCount}, ${totalProcessed} processed, ${supervisorResult.totalPending} pending`,
        null, JSON.stringify({ tick: this.tickCount, processed: totalProcessed, pending: supervisorResult.totalPending })
      );
    }

    log(`  Tick complete: ${totalProcessed} events processed, ${supervisorResult.issuesFound} issues found, ${supervisorResult.autoCorrected} auto-corrected, ${supervisorResult.totalPending} pending`);

    return { totalProcessed, ...supervisorResult };
  }
}

// ─── Main loop ───
const args = process.argv.slice(2);
const runOnce = args.includes("--once");
const intervalArg = args[args.indexOf("--interval") + 1];
const interval = intervalArg ? parseInt(intervalArg) * 1000 : 10000; // default 10s

const supervisor = new Supervisor();

// Log startup
supervisor.logEvent(null, "SUPERVISOR_START", "info", "Agent Supervisor started", null, JSON.stringify({ interval, runOnce }));
log("🚀 Agent Supervisor started");
log(`   Mode: ${runOnce ? "single tick" : `continuous (every ${interval / 1000}s)`}`);
log(`   Database: ${DB_PATH}`);
log(`   Agents: 7 (Agent 1 through Agent 7)`);
log("");

if (runOnce) {
  supervisor.tick();
  supervisor.logEvent(null, "SUPERVISOR_STOP", "info", "Agent Supervisor stopped (single tick)", null, null);
  supervisor.close();
  process.exit(0);
}

// Continuous mode
const runLoop = () => {
  try {
    supervisor.tick();
  } catch (err) {
    log(`  🔴 FATAL: ${err.message}`);
    supervisor.logEvent(null, "SUPERVISOR_ERROR", "critical", `Supervisor fatal error: ${err.message}`, "Will retry on next tick", err.stack);
  }
};

// Run immediately, then on interval
runLoop();
const timer = setInterval(runLoop, interval);

// Graceful shutdown
process.on("SIGINT", () => {
  log("\n🛑 Supervisor shutting down...");
  supervisor.logEvent(null, "SUPERVISOR_STOP", "info", "Agent Supervisor stopped (SIGINT)", null, null);
  clearInterval(timer);
  supervisor.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("\n🛑 Supervisor received SIGTERM, shutting down...");
  supervisor.logEvent(null, "SUPERVISOR_STOP", "info", "Agent Supervisor stopped (SIGTERM)", null, null);
  clearInterval(timer);
  supervisor.close();
  process.exit(0);
});
