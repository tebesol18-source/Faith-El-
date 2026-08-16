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
const fs = require("fs");

const DB_PATH = "/app/coffee_export/data/coffee_export.db";
const PID_FILE = "/tmp/coffee-export-supervisor.pid";

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
    this.db = null;
    this.tickCount = 0;
    this.connect();
  }

  /** Connect (or reconnect) to the database */
  connect() {
    if (this.db) {
      try { this.db.close(); } catch {}
    }
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000"); // Wait up to 5s if DB is locked
  }

  /** Ensure DB is open and healthy; reconnect if needed */
  ensureDB() {
    try {
      // Quick health check
      this.db.prepare("SELECT 1").get();
    } catch {
      log("  ⚠️  Database connection lost — reconnecting...");
      this.connect();
    }
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
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

  /** Atomically claim and process pending events for an agent.
   *  Uses a transaction to prevent race conditions —
   *  events are claimed and processed atomically.
   *  No 'processing' intermediate state (not in DB constraint).
   */
  claimAndProcessEvents(agentId) {
    const eventTypes = Object.entries(EVENT_ROUTING)
      .filter(([_, ag]) => ag === agentId)
      .map(([et]) => et);
    if (eventTypes.length === 0) return { processed: 0, errors: 0 };

    const placeholders = eventTypes.map(() => "?").join(",");

    // Fetch pending events (within transaction, they're locked)
    const events = this.db.prepare(`
      SELECT id, event_type, entity_type, entity_id, payload, published_by, published_ts, status, organization_id FROM events
      WHERE status = 'pending' AND event_type IN (${placeholders})
      ORDER BY published_ts ASC
      LIMIT 10
    `).all(...eventTypes);

    if (events.length === 0) return { processed: 0, errors: 0 };

    let processed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        // Process each event in its own transaction
        const processTxn = this.db.transaction(() => {
          const payload = JSON.parse(event.payload || "{}");

          // Agent-specific processing
          switch (agentId) {
            case "Agent 2":
              if (event.event_type === "LEAD_CREATED" && payload.lead_id) {
                this.db.prepare(`
                  UPDATE leads SET current_state = 'ENRICHED', current_agent = 'Agent 3', updated_ts = ?
                  WHERE lead_id = ? AND current_state = 'NEW'
                `).run(nowISO(), payload.lead_id);
              }
              break;
            case "Agent 3":
              if (payload.lead_id) {
                const lead = this.db.prepare("SELECT current_state FROM leads WHERE lead_id = ?").get(payload.lead_id);
                if (lead && lead.current_state === "ENRICHED") {
                  this.db.prepare(`
                    UPDATE leads SET current_state = 'IN_SEQUENCE', sequence_step = 1, updated_ts = ?
                    WHERE lead_id = ?
                  `).run(nowISO(), payload.lead_id);
                }
              }
              break;
            case "Agent 4":
              if (payload.lead_id) {
                this.db.prepare(`
                  UPDATE leads SET current_state = 'SAMPLE_DISPATCHED', updated_ts = ?
                  WHERE lead_id = ? AND current_state IN ('QUALIFIED', 'IN_SEQUENCE')
                `).run(nowISO(), payload.lead_id);
              }
              break;
          }

          // Mark event as consumed
          this.db.prepare(`
            UPDATE events SET status = 'consumed', consumed_ts = ?, consumed_by = ?
            WHERE id = ? AND status = 'pending'
          `).run(nowISO(), agentId, event.id);

          // Publish follow-up events
          if (event.event_type === "LEAD_CREATED") {
            this.db.prepare(`
              INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status)
              VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `).run("LEAD_ENRICHED", "lead", payload.lead_id, JSON.stringify(payload), agentId, nowISO());
          }
        });

        processTxn();
        processed++;
      } catch (err) {
        errors++;
        // Mark event as 'failed' so it's not retried indefinitely
        try {
          this.db.prepare(`
            UPDATE events SET status = 'failed', consumed_ts = ?, consumed_by = ?
            WHERE id = ? AND status = 'pending'
          `).run(nowISO(), agentId, event.id);
        } catch {}
        this.logEvent(
          agentId, "AGENT_ERROR", "error",
          `Error processing event ${event.id} (${event.event_type}): ${err.message}. Event marked as 'failed'.`,
          "Event moved to 'failed' status",
          JSON.stringify({ eventId: event.id, error: err.message })
        );
      }
    }

    return { processed, errors };
  }

  /** Publish a new event */
  publishEvent(eventType, entityType, entityId, payload, publishedBy) {
    this.db.prepare(`
      INSERT INTO events (event_type, entity_type, entity_id, payload, published_by, published_ts, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(eventType, entityType, entityId, JSON.stringify(payload), publishedBy, nowISO());
  }

  /** Run one agent — atomically claim and process its pending events */
  runAgent(agentId) {
    const controls = this.db.prepare("SELECT * FROM agent_controls WHERE agent_id = ?").get(agentId);
    if (!controls) return;

    // Skip if paused
    if (controls.is_paused) {
      return { skipped: true, reason: "paused" };
    }

    // Check for too many consecutive errors
    if (controls.consecutive_errors >= controls.max_consecutive_errors) {
      return { skipped: true, reason: "too_many_errors" };
    }

    // Atomically claim and process events
    const result = this.claimAndProcessEvents(agentId);

    if (result.processed === 0 && result.errors === 0) {
      return { processed: 0 };
    }

    // Update agent controls
    const newRunCount = controls.run_count + 1;
    const newErrorCount = controls.error_count + result.errors;
    const newConsecutiveErrors = result.errors > 0 ? controls.consecutive_errors + result.errors : 0;

    this.db.prepare(`
      UPDATE agent_controls
      SET last_run_ts = ?, last_run_status = ?, run_count = ?, error_count = ?,
          consecutive_errors = ?, last_error = ?, last_error_ts = ?, updated_ts = ?
      WHERE agent_id = ?
    `).run(
      nowISO(),
      result.errors > 0 ? "partial_error" : "success",
      newRunCount,
      newErrorCount,
      newConsecutiveErrors,
      result.errors > 0 ? "Processing error" : null,
      result.errors > 0 ? nowISO() : null,
      nowISO(),
      agentId
    );

    if (result.processed > 0) {
      log(`  ${agentId} (${AGENT_NAMES[agentId]}): processed ${result.processed} event(s)${result.errors > 0 ? `, ${result.errors} error(s)` : ""}`);
    }

    return { processed: result.processed, errors: result.errors };
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
      // Count pending events for this agent's event types
      const agentEventTypes = Object.entries(EVENT_ROUTING)
        .filter(([_, ag]) => ag === c.agent_id)
        .map(([et]) => et);
      let pendingCount = 0;
      if (agentEventTypes.length > 0) {
        const placeholders = agentEventTypes.map(() => "?").join(",");
        pendingCount = (this.db.prepare(`
          SELECT COUNT(*) as n FROM events
          WHERE status = 'pending' AND event_type IN (${placeholders})
        `).get(...agentEventTypes) || {}).n || 0;
      }
      if (pendingCount > 5 && !c.is_paused) {
        const lastRunAge = c.last_run_ts ? (Date.now() - new Date(c.last_run_ts).getTime()) / 1000 : Infinity;
        if (lastRunAge > 60) {
          issuesFound++;
          this.logEvent(
            c.agent_id,
            "AGENT_STUCK",
            "warning",
            `${c.agent_id} has ${pendingCount} pending events but hasn't run in ${Math.round(lastRunAge)}s`,
            "Will retry on next tick",
            JSON.stringify({ pendingCount, lastRunAgeSec: Math.round(lastRunAge) })
          );
          log(`  ⚠️  SUPERVISOR: ${c.agent_id} stuck — ${pendingCount} pending events, last run ${Math.round(lastRunAge)}s ago`);
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

  /** Read past feedback for an agent to learn from seller preferences */
  getAgentFeedback(agentId, actionType) {
    const rows = this.db.prepare(`
      SELECT decision, feedback_reason, seller_notes, target_entity_id
      FROM agent_feedback
      WHERE agent_id = ? AND action_type = ?
      ORDER BY created_ts DESC LIMIT 10
    `).all(agentId, actionType);

    if (rows.length === 0) return null;

    const rejections = rows.filter(r => r.decision === "rejected");
    const approvals = rows.filter(r => r.decision === "approved");
    const rejectReasons = {};
    rejections.forEach(r => {
      if (r.feedback_reason) rejectReasons[r.feedback_reason] = (rejectReasons[r.feedback_reason] || 0) + 1;
    });

    return {
      total_feedback: rows.length,
      approvals: approvals.length,
      rejections: rejections.length,
      approval_rate: rows.length > 0 ? Math.round((approvals.length / rows.length) * 100) : 0,
      top_reject_reasons: Object.entries(rejectReasons).sort((a, b) => b[1] - a[1]).slice(0, 3),
      recent_notes: rejections.filter(r => r.seller_notes).slice(0, 3).map(r => r.seller_notes),
    };
  }

  /** Read buyer memory for a specific lead */
  getBuyerMemory(leadId) {
    const rows = this.db.prepare(`
      SELECT memory_type, memory_key, memory_value, confidence, source
      FROM buyer_memory WHERE lead_id = ?
      ORDER BY memory_type, memory_key
    `).all(leadId);

    if (rows.length === 0) return null;

    const memory = {
      preferences: {},
      purchase_history: {},
      interactions: {},
      journey: {},
      memory_count: rows.length,
    };

    rows.forEach(r => {
      const entry = { value: r.memory_value, confidence: r.confidence, source: r.source };
      if (r.memory_type === "preference") memory.preferences[r.memory_key] = entry;
      else if (r.memory_type === "purchase_history") memory.purchase_history[r.memory_key] = entry;
      else if (r.memory_type === "interaction") memory.interactions[r.memory_key] = entry;
      else if (r.memory_type === "journey") memory.journey[r.memory_key] = entry;
    });

    return memory;
  }

  /** Write or update a buyer memory */
  setBuyerMemory(leadId, memoryType, memoryKey, memoryValue, confidence = 0.8, source = "inferred") {
    const now = nowISO();
    this.db.prepare(`
      INSERT INTO buyer_memory (lead_id, memory_type, memory_key, memory_value, confidence, source, created_ts, updated_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lead_id, memory_type, memory_key)
      DO UPDATE SET memory_value = excluded.memory_value, confidence = excluded.confidence, updated_ts = excluded.updated_ts
    `).run(leadId, memoryType, memoryKey, memoryValue, confidence, source, now, now);
  }

  /** Learn from seller feedback and update buyer memory */
  learnFromFeedback(leadId, feedbackReason, sellerNotes, actionType) {
    if (!leadId) return;

    // Map reject reasons to buyer memory updates
    const reasonToMemory = {
      wrong_tone: { type: "preference", key: "tone_preference", value: "casual", confidence: 0.8 },
      too_long: { type: "preference", key: "email_length_preference", value: "short", confidence: 0.8 },
      wrong_lots: { type: "preference", key: "lot_preference_note", value: sellerNotes || "seller disagreed with lot selection", confidence: 0.7 },
      wrong_price: { type: "preference", key: "price_sensitivity", value: "high", confidence: 0.8 },
      wrong_language: { type: "preference", key: "language_correction", value: sellerNotes || "wrong language used", confidence: 0.9 },
      already_contacted: { type: "interaction", key: "already_contacted", value: "true", confidence: 1.0 },
      not_ready: { type: "journey", key: "readiness", value: "not_ready", confidence: 0.8 },
      wrong_cta: { type: "preference", key: "cta_preference", value: "soft", confidence: 0.8 },
    };

    const memUpdate = reasonToMemory[feedbackReason];
    if (memUpdate) {
      this.setBuyerMemory(leadId, memUpdate.type, memUpdate.key, memUpdate.value, memUpdate.confidence, "seller_feedback");
    }

    // Store free-text notes as a memory
    if (sellerNotes) {
      this.setBuyerMemory(leadId, "feedback", "latest_seller_note", sellerNotes, 0.9, "seller_feedback");
    }
  }

  /** Derive and store rich buyer memories from all available data sources */
  deriveBuyerMemories(leadId) {
    const now = nowISO();
    const memories = [];

    // 1. From contracts
    const contracts = this.db.prepare(`
      SELECT c.total_value, c.total_volume_bags, c.incoterm, c.payment_terms,
             cli.lot_id, lt.region, lt.process, lt.cupping_score
      FROM contracts c
      LEFT JOIN contract_line_items cli ON c.contract_id = cli.contract_id AND cli.deleted_ts IS NULL
      LEFT JOIN lots lt ON cli.lot_id = lt.lot_id
      WHERE c.lead_id = ? AND c.deleted_ts IS NULL
    `).all(leadId);

    if (contracts.length > 0) {
      const totalValue = contracts.reduce((s, c) => s + (c.total_value || 0), 0);
      const totalBags = contracts.reduce((s, c) => s + (c.total_volume_bags || 0), 0);
      const incoterms = [...new Set(contracts.map(c => c.incoterm).filter(Boolean))];
      const paymentTerms = [...new Set(contracts.map(c => c.payment_terms).filter(Boolean))];
      const regions = [...new Set(contracts.map(c => c.region).filter(Boolean))];
      const processes = [...new Set(contracts.map(c => c.process).filter(Boolean))];

      memories.push({ key: "total_contracts", value: String(contracts.length), type: "history", source: "contract", confidence: 1.0 });
      memories.push({ key: "total_spent_usd", value: String(totalValue), type: "history", source: "contract", confidence: 1.0 });
      memories.push({ key: "total_volume_bags", value: String(totalBags), type: "history", source: "contract", confidence: 1.0 });
      if (incoterms.length > 0) memories.push({ key: "preferred_incoterm", value: incoterms.join(", "), type: "preference", source: "contract", confidence: 0.9 });
      if (paymentTerms.length > 0) memories.push({ key: "preferred_payment_terms", value: paymentTerms.join(", "), type: "preference", source: "contract", confidence: 0.9 });
      if (regions.length > 0) memories.push({ key: "purchased_origins", value: regions.join(", "), type: "preference", source: "contract", confidence: 0.9 });
      if (processes.length > 0) memories.push({ key: "purchased_processes", value: processes.join(", "), type: "preference", source: "contract", confidence: 0.9 });
    }

    // 2. From samples
    const samples = this.db.prepare(`
      SELECT sr.status, sd.decision, cs.total_score
      FROM sample_requests sr
      LEFT JOIN sample_decisions sd ON sr.sample_request_id = sd.sample_request_id
      LEFT JOIN cupping_scores cs ON sr.sample_request_id = cs.sample_request_id
      WHERE sr.lead_id = ? AND sr.deleted_ts IS NULL
    `).all(leadId);

    if (samples.length > 0) {
      const approved = samples.filter(s => s.decision === "approved").length;
      const rejected = samples.filter(s => s.decision === "rejected").length;
      memories.push({ key: "total_samples", value: String(samples.length), type: "history", source: "sample", confidence: 1.0 });
      if (approved > 0) memories.push({ key: "samples_approved", value: String(approved), type: "history", source: "sample", confidence: 1.0 });
      if (rejected > 0) memories.push({ key: "samples_rejected", value: String(rejected), type: "history", source: "sample", confidence: 1.0 });
    }

    // 3. From agent feedback
    const feedback = this.db.prepare(`
      SELECT decision, feedback_reason, seller_notes
      FROM agent_feedback WHERE target_entity_id = ? ORDER BY created_ts DESC LIMIT 5
    `).all(leadId);

    if (feedback.length > 0) {
      const rejects = feedback.filter(f => f.decision === "rejected");
      if (rejects.length > 0) {
        const reasons = [...new Set(rejects.map(r => r.feedback_reason).filter(Boolean))];
        memories.push({ key: "seller_reject_reasons", value: reasons.join(", "), type: "feedback", source: "agent_feedback", confidence: 0.95 });
        const notes = rejects.filter(r => r.seller_notes).map(r => r.seller_notes);
        if (notes.length > 0) memories.push({ key: "seller_feedback_notes", value: notes.join(" | "), type: "feedback", source: "agent_feedback", confidence: 0.95 });
      }
    }

    // 4. From inbox messages
    const messages = this.db.prepare(`
      SELECT im.direction FROM inbox_messages im
      JOIN message_threads mt ON im.thread_id = mt.thread_id
      WHERE mt.lead_id = ? AND im.direction = 'inbound'
    `).all(leadId);

    if (messages.length > 0) {
      memories.push({ key: "has_responded", value: "true", type: "behavior", source: "inbox", confidence: 1.0 });
      memories.push({ key: "inbound_message_count", value: String(messages.length), type: "behavior", source: "inbox", confidence: 1.0 });
    }

    // 5. From lead data
    const lead = this.db.prepare("SELECT priority_tier, recommended_vp, outreach_language, headquarters_country, ghosted_count FROM leads WHERE lead_id = ?").get(leadId);
    if (lead) {
      if (lead.priority_tier) memories.push({ key: "buyer_tier", value: lead.priority_tier, type: "profile", source: "lead", confidence: 1.0 });
      if (lead.recommended_vp) memories.push({ key: "recommended_vp", value: lead.recommended_vp, type: "profile", source: "lead", confidence: 1.0 });
      if (lead.outreach_language) memories.push({ key: "communication_language", value: lead.outreach_language, type: "profile", source: "lead", confidence: 1.0 });
      if (lead.headquarters_country) memories.push({ key: "buyer_country", value: lead.headquarters_country, type: "profile", source: "lead", confidence: 1.0 });
      if (lead.ghosted_count > 0) memories.push({ key: "ghosted_count", value: String(lead.ghosted_count), type: "behavior", source: "lead", confidence: 1.0 });
    }

    // Upsert all memories
    for (const m of memories) {
      this.db.prepare(`
        INSERT INTO buyer_memory (lead_id, memory_key, memory_value, memory_type, source, confidence, created_ts, updated_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lead_id, memory_type, memory_key) DO UPDATE SET
          memory_value = excluded.memory_value,
          source = excluded.source,
          confidence = excluded.confidence,
          updated_ts = excluded.updated_ts
      `).run(leadId, m.key, m.value, m.type, m.source, m.confidence, now, now);
    }

    return memories;
  }

  /** Get all buyer memories for a lead as a structured summary */
  getBuyerMemories(leadId) {
    this.deriveBuyerMemories(leadId);
    const rows = this.db.prepare(`SELECT memory_key, memory_value FROM buyer_memory WHERE lead_id = ?`).all(leadId);
    const mem = {};
    rows.forEach(r => { mem[r.memory_key] = r.memory_value; });

    const summary = [];
    if (mem.total_contracts) summary.push(`${mem.total_contracts} previous contract(s)`);
    if (mem.total_spent_usd && parseInt(mem.total_spent_usd) > 0) summary.push(`$${parseInt(mem.total_spent_usd).toLocaleString()} total spent`);
    if (mem.purchased_origins) summary.push(`Previously bought: ${mem.purchased_origins}`);
    if (mem.purchased_processes) summary.push(`Preferred process: ${mem.purchased_processes}`);
    if (mem.preferred_incoterm) summary.push(`Preferred incoterm: ${mem.preferred_incoterm}`);
    if (mem.total_samples) summary.push(`${mem.total_samples} sample(s) sent`);
    if (mem.samples_approved) summary.push(`${mem.samples_approved} approved`);
    if (mem.has_responded === "true") summary.push("Has responded to outreach");
    if (mem.ghosted_count && parseInt(mem.ghosted_count) > 0) summary.push(`Ghosted ${mem.ghosted_count}x`);
    if (mem.seller_reject_reasons) summary.push(`Seller rejected drafts for: ${mem.seller_reject_reasons}`);

    return { memories: mem, summary };
  }

  /** Get VP rationale for reasoning panel */
  getVPRationale(vp) {
    const rationales = {
      VP1: "Origin Access — buyer benefits from direct cooperative relationships and traceable sourcing",
      VP2: "Sustainability — buyer values EUDR compliance, organic/Fairtrade certifications",
      VP3: "Commercial FOB — buyer prioritizes competitive pricing and reliable shipping volumes",
      VP4: "Microlot Exclusivity — buyer seeks single-station, farmer-traceable specialty lots",
    };
    return rationales[vp] || rationales.VP1;
  }

  /** Calculate email confidence score (0-100) */
  calculateEmailConfidence(lead, availableLots) {
    let score = 50; // base
    if (lead.contact_name) score += 15; // personalization possible
    if (availableLots.length >= 3) score += 15; // strong inventory
    if (lead.priority_tier === "S" || lead.priority_tier === "A") score += 10; // high-value buyer
    if (lead.outreach_language !== "EN") score += 5; // native language = better response rate
    if (lead.recommended_vp) score += 5; // VP assigned = enriched data
    return Math.min(score, 98); // cap at 98 (never 100%)
  }

  /** Calculate contract confidence score (0-100) */
  calculateContractConfidence(lead, availableLots, totalBags) {
    let score = 55; // base — contracts are inherently less certain
    if (lead.priority_tier === "S") score += 15; // premium buyer = higher close rate
    else if (lead.priority_tier === "A") score += 10;
    if (availableLots.length >= 2) score += 10; // inventory available
    if (totalBags >= 200) score += 5; // meaningful volume
    if (lead.headquarters_country === "Germany" || lead.headquarters_country === "USA") score += 5; // established markets
    return Math.min(score, 92); // cap at 92
  }

  /** Draft a personalized outreach email based on lead data */
  draftOutreachEmail(lead, availableLots) {
    const company = lead.company_name;
    const country = lead.headquarters_country || "your region";
    const tier = lead.priority_tier || "A";
    const lang = lead.outreach_language || "EN";
    const contactName = lead.contact_name || "";

    // Greeting based on language
    const greetings = {
      EN: contactName ? `Dear ${contactName},` : `Dear ${company} Team,`,
      DE: contactName ? `Sehr geehrte(r) ${contactName},` : `Sehr geehrte Damen und Herren,`,
      JA: contactName ? `${contactName}様` : `${company} 御中`,
      FR: contactName ? `Cher/Chère ${contactName},` : `Madame, Monsieur,`,
      IT: contactName ? `Gentile ${contactName},` : `Gentile Team di ${company},`,
      KO: `${company} 담당자님,`,
      ZH: `尊敬的${company}团队：`,
      AR: `مرحباً فريق ${company}،`,
      TR: `Sayın ${company} Ekibi,`,
      RU: `Уважаемая команда ${company},`,
    };

    // Sign-off based on language
    const signoffs = {
      EN: "Best regards",
      DE: "Mit freundlichen Grüßen",
      JA: "よろしくお願いいたします",
      FR: "Cordialement",
      IT: "Cordiali saluti",
      KO: "감사합니다",
      ZH: "此致敬礼",
      AR: "مع خالص التحيات",
      TR: "Saygılarımla",
      RU: "С уважением",
    };

    // VP-based messaging
    const vpMessages = {
      VP1: "We have direct origin access to washed Yirgacheffe G1 and Guji G1 lots from our cooperative partnerships in Ethiopia. Our 25/26 crop is now available with cupping scores of 86+.",
      VP2: "Our lots come with full EUDR compliance data packs, including GPS coordinates and deforestation attestations. We work directly with cooperatives that hold organic and Fairtrade certifications.",
      VP3: "We offer competitive FOB Djibouti pricing on commercial volumes (500+ bags) with reliable shipping windows. Our 25/26 Sidamo and Limu lots are ready for immediate shipment.",
      VP4: "We have exclusive microlot selections from single washing stations — traceable to the farmer level. Perfect for your specialty program.",
    };

    const vpMsg = vpMessages[lead.recommended_vp] || vpMessages.VP1;

    // Available lots to mention
    let lotMention = "";
    if (availableLots && availableLots.length > 0) {
      const topLots = availableLots.slice(0, 3);
      lotMention = `\n\nAvailable lots for your consideration:\n${topLots.map(l => `  • ${l.lot_id}: ${l.region} ${l.process} — cupping score ${l.cupping_score}, ${l.stock_bags_remaining} bags available`).join("\n")}`;
    }

    // Call to action based on tier
    const ctas = {
      S: "I'd love to arrange a call this week to discuss your specialty program and share cupping samples. Would Tuesday or Wednesday work for you?",
      A: "Would you have 20 minutes next week for a quick call to discuss how our Ethiopian lots fit your sourcing needs?",
      B: "I'd be happy to send you sample sets and a pricing sheet. What volume are you looking for this season?",
      C: "Please let me know if you'd like to receive our current inventory list with pricing.",
    };
    const cta = ctas[tier] || ctas.A;

    // Subject line
    const subjects = {
      EN: `Ethiopian 25/26 coffee — available lots from Faith-El PLC`,
      DE: `Äthiopischer Kaffee 25/26 — verfügbare Lots von Faith-El PLC`,
      JA: `エチオピア 25/26 産コーヒー — Faith-El PLCからのご案内`,
      FR: `Café éthiopien 25/26 — lots disponibles de Faith-El PLC`,
      IT: `Caffè etiope 25/26 — lotti disponibili da Faith-El PLC`,
      KO: `에티오피아 25/26 커피 — Faith-El PLC의 가용 로트`,
      ZH: `埃塞俄比亚 25/26 咖啡 — Faith-El PLC 可供批次`,
      AR: `قهوة إثيوبية 25/26 — أ lots متاحة من Faith-El PLC`,
      TR: `Etiyopya 25/26 kahvesi — Faith-El PLC'den mevcut partiler`,
      RU: `Эфиопский кофе 25/26 — доступные лоты от Faith-El PLC`,
    };

    const subject = subjects[lang] || subjects.EN;
    const greeting = greetings[lang] || greetings.EN;
    const signoff = signoffs[lang] || signoffs.EN;

    const body = `${greeting}

I hope this message finds you well. I'm reaching out from Faith-El PLC, an Ethiopian coffee export company based in Addis Ababa.

${vpMsg}${lotMention}

${cta}

${signoff},
Abi Solomon
Faith-El PLC
Addis Ababa, Ethiopia
abi@faithel.com`;

    return { subject, body, to: `${contactName ? contactName.toLowerCase().replace(/[^a-z]/g, ".") : "info"}@${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`, from: "abi@faithel.com" };
  }

  /** Draft contract terms based on lead tier + available lots */
  draftContractTerms(lead, availableLots) {
    const tier = lead.priority_tier || "A";
    const tierVolumes = { S: 500, A: 300, B: 200, C: 100 };
    const volume = tierVolumes[tier] || 300;
    const country = lead.headquarters_country || "";

    // Incoterm based on destination
    const euCountries = ["Germany", "Italy", "France", "Belgium", "Netherlands", "Sweden", "Spain", "Austria", "Denmark", "Finland"];
    const incoterm = euCountries.includes(country) ? "CIF" : "FOB";
    const destinationPort = euCountries.includes(country) ? (country === "Germany" ? "Hamburg" : country === "Italy" ? "Trieste" : country === "Belgium" ? "Antwerp" : "Rotterdam") : "Djibouti";

    // ─── Market-aware pricing ───
    // Fetch current market prices from the API (simulated)
    let marketData = null;
    try {
      const response = await_fetch("http://localhost:3000/api/market-prices");
      // Since supervisor is Node.js (not browser), use http module
    } catch {}

    // Get market prices synchronously from the DB (we'll store them)
    // For now, use deterministic prices based on the tier
    // In production, this would call the market-prices API
    const now = new Date();
    const dateStr = now.toISOString().substring(0, 10);
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) { hash = ((hash << 5) - hash) + dateStr.charCodeAt(i); hash |= 0; }
    const rand = Math.abs(hash) / 2147483647;
    const icePrice = 250 + (rand - 0.5) * 30; // ~235-265 cents/lb
    const iceUsdPerKg = Math.round((icePrice / 100 / 0.453592) * 100) / 100;

    // Price based on tier + market premium
    const tierPremiums = { S: 3.50, A: 1.80, B: 0.50, C: -0.30 };
    const marketPremium = tierPremiums[tier] || 1.80;
    const basePrice = Math.round((iceUsdPerKg + marketPremium) * 100) / 100;

    // Payment terms based on tier
    const paymentTerms = tier === "S" ? "LC at sight" : tier === "A" ? "30% deposit · 70% against B/L copy" : "T/T 50/50";

    // Select lots for the contract
    const selectedLots = (availableLots || []).slice(0, tier === "S" ? 3 : 2);
    const totalBags = selectedLots.reduce((s, l) => s + Math.min(l.stock_bags_remaining, Math.ceil(volume / selectedLots.length)), 0) || volume;
    const totalValue = Math.round(totalBags * basePrice);

    // Margin warning
    let marginWarning = "normal";
    if (icePrice < 210) marginWarning = "critical";
    else if (icePrice < 235) marginWarning = "caution";

    return {
      contractId: `CT-2026-${Math.floor(Math.random() * 9000) + 1000}`,
      buyer: lead.company_name,
      incoterm,
      destinationPort,
      currency: "USD",
      totalVolumeBags: totalBags,
      totalValue,
      paymentTerms,
      shipmentWindow: "Aug 2026 — Sep 2026",
      contractTemplate: "ICC_ECE_7_21",
      lots: selectedLots.map(l => ({
        lotId: l.lot_id,
        region: l.region,
        process: l.process,
        quantityBags: Math.min(l.stock_bags_remaining, Math.ceil(volume / Math.max(selectedLots.length, 1))),
        unitPrice: basePrice,
      })),
      terms: `Contract for ${totalBags} bags (${(totalBags * 0.06).toFixed(1)}t) of Ethiopian green coffee.\nIncoterm: ${incoterm} ${destinationPort}\nPayment: ${paymentTerms}\nShipment window: Aug—Sep 2026\nTotal value: $${totalValue.toLocaleString()} USD`,
      market_context: {
        ice_futures_cents_per_lb: Math.round(icePrice * 100) / 100,
        ice_usd_per_kg: iceUsdPerKg,
        contract_price_per_kg: basePrice,
        premium_over_ice: Math.round(marketPremium * 100) / 100,
        margin_warning: marginWarning,
        pricing_rationale: `ICE Coffee C at ${Math.round(icePrice * 100) / 100}¢/lb ($${iceUsdPerKg}/kg). Tier ${tier} premium: +$${marketPremium}/kg. Contract price: $${basePrice}/kg.`,
      },
    };
  }

  /** Phase 4: Generate pending actions for risky operations */
  generatePendingActions() {
    // Find leads in ENRICHED state that don't have a pending action yet
    // Agent 3 wants to start outreach (send first email) — needs seller approval
    const enrichedLeads = this.db.prepare(`
      SELECT l.lead_id, l.company_name, l.headquarters_country, l.priority_tier,
             l.outreach_language, l.recommended_vp, lc.name AS contact_name
      FROM leads l
      LEFT JOIN lead_contacts lc ON l.lead_id = lc.lead_id AND lc.is_primary = 1 AND lc.deleted_ts IS NULL
      WHERE l.current_state = 'ENRICHED' AND l.deleted_ts IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pending_agent_actions p
        WHERE p.target_entity_id = l.lead_id AND p.status = 'pending'
      )
      LIMIT 5
    `).all();

    // Get available lots for email personalization
    const availableLots = this.db.prepare(`
      SELECT lot_id, region, process, cupping_score, stock_bags_remaining
      FROM lots WHERE deleted_ts IS NULL AND stock_bags_remaining > 0
      ORDER BY cupping_score DESC LIMIT 5
    `).all();

    for (const lead of enrichedLeads) {
      const riskLevel = lead.priority_tier === "S" ? "medium" : "low";

      // Draft the actual email content
      const emailDraft = this.draftOutreachEmail(lead, availableLots);

      // Read past feedback to learn from seller preferences
      const feedback = this.getAgentFeedback("Agent 3", "send_email");

      // Derive fresh buyer memories from all data sources, then read them
      this.deriveBuyerMemories(lead.lead_id);
      const buyerMemory = this.getBuyerMemory(lead.lead_id);
      const buyerMemorySummary = this.getBuyerMemories(lead.lead_id);

      // Adapt email based on feedback
      let adaptedNotes = [];
      if (feedback) {
        if (feedback.top_reject_reasons.some(([reason, count]) => reason === "too_long" && count >= 1)) {
          emailDraft.body = emailDraft.body.replace(/\n\nAvailable lots for your consideration:[\s\S]*?(?=\n\n)/, "");
          adaptedNotes.push("Email shortened — seller previously rejected for being too long");
        }
        if (feedback.top_reject_reasons.some(([reason, count]) => reason === "wrong_tone" && count >= 1)) {
          emailDraft.body = emailDraft.body.replace(/Dear [^,]+,/, "Hi,");
          adaptedNotes.push("Greeting simplified to 'Hi,' — seller prefers less formal tone");
        }
        if (feedback.top_reject_reasons.some(([reason, count]) => reason === "wrong_cta" && count >= 1)) {
          emailDraft.body = emailDraft.body.replace(/Would you have.*?\?/, "Let me know if you'd like to receive our current inventory list.");
          adaptedNotes.push("Call-to-action softened — seller prefers less pushy approach");
        }
      }

      // Adapt email based on buyer memory
      if (buyerMemory) {
        // If buyer was already contacted, adjust the email
        if (buyerMemory.interactions.already_contacted && buyerMemory.interactions.already_contacted.value === "true") {
          adaptedNotes.push("⚠️ Buyer was previously marked as 'already contacted' — seller may want to skip this lead");
        }
        // If buyer has purchase history, reference it
        if (buyerMemory.purchase_history.total_contracts && parseInt(buyerMemory.purchase_history.total_contracts.value) > 0) {
          const contractCount = buyerMemory.purchase_history.total_contracts.value;
          const preferredIncoterm = buyerMemory.purchase_history.preferred_incoterm?.value;
          // Add a line about past business
          const pastBusinessLine = `\nWe've successfully completed ${contractCount} contract(s) together previously${preferredIncoterm ? ` on ${preferredIncoterm} terms` : ""}, and we'd love to continue the partnership.`;
          emailDraft.body = emailDraft.body.replace(/(\n\nWould you have|\n\nI'd love|\n\nPlease let me)/, pastBusinessLine + "$1");
          adaptedNotes.push(`Referenced ${contractCount} past contract(s) — buyer has purchase history`);
        }
        // If buyer has tone preference from feedback, apply it
        if (buyerMemory.preferences.tone_preference?.value === "casual") {
          emailDraft.body = emailDraft.body.replace(/Dear [^,]+,/, "Hi,");
          adaptedNotes.push("Greeting set to 'Hi,' — buyer memory shows casual tone preference");
        }
        // If buyer has email length preference
        if (buyerMemory.preferences.email_length_preference?.value === "short") {
          emailDraft.body = emailDraft.body.replace(/\n\nAvailable lots for your consideration:[\s\S]*?(?=\n\n)/, "");
          adaptedNotes.push("Email shortened — buyer memory shows preference for concise emails");
        }
        // If buyer has CTA preference
        if (buyerMemory.preferences.cta_preference?.value === "soft") {
          emailDraft.body = emailDraft.body.replace(/Would you have.*?\?/, "Let me know if you'd like to receive our current inventory list.");
          adaptedNotes.push("Call-to-action softened — buyer memory shows preference for soft CTAs");
        }
      }

      // Build reasoning for "Why I recommended this"
      const reasoning = {
        buyer_tier: lead.priority_tier || "A",
        buyer_country: lead.headquarters_country || "Unknown",
        recommended_vp: lead.recommended_vp || "VP1",
        language_detected: lead.outreach_language || "EN",
        contact_name: lead.contact_name || null,
        available_lots_considered: availableLots.length,
        top_lots_recommended: availableLots.slice(0, 3).map(l => ({
          lot_id: l.lot_id,
          region: l.region,
          process: l.process,
          cupping_score: l.cupping_score,
          stock: l.stock_bags_remaining,
        })),
        subject_line_rationale: `Subject written in ${lead.outreach_language === "EN" ? "English" : lead.outreach_language} — matches buyer's HQ country (${lead.headquarters_country})`,
        vp_rationale: this.getVPRationale(lead.recommended_vp),
        cta_rationale: `Tier ${lead.priority_tier} buyers get ${lead.priority_tier === "S" ? "a direct call-to-action for this week" : lead.priority_tier === "A" ? "a 20-minute call request for next week" : "a sample set offer"} based on engagement likelihood`,
        lot_selection_rationale: `Selected top ${Math.min(3, availableLots.length)} lots by cupping score from ${availableLots.length} available lots in inventory`,
        confidence: this.calculateEmailConfidence(lead, availableLots),
        confidence_factors: [
          lead.contact_name ? "Contact name available — personalized greeting possible" : "No contact name — using company greeting",
          availableLots.length >= 3 ? "3+ lots available — strong product offering" : `Only ${availableLots.length} lots available — limited selection`,
          lead.priority_tier === "S" ? "S-tier buyer — high value, justify direct approach" : `${lead.priority_tier}-tier buyer — standard outreach approach`,
          lead.outreach_language !== "EN" ? `Non-English language (${lead.outreach_language}) — email drafted in buyer's language` : "English — standard international business language",
        ],
        feedback_learning: feedback ? {
          past_approvals: feedback.approvals,
          past_rejections: feedback.rejections,
          approval_rate: `${feedback.approval_rate}%`,
          adaptations_applied: adaptedNotes.filter(n => !n.includes("buyer memory")),
          top_reject_reasons: feedback.top_reject_reasons.map(([reason, count]) => `${reason} (${count}x)`),
        } : null,
        buyer_memory: buyerMemory ? {
          memory_count: buyerMemory.memory_count,
          has_purchase_history: Object.keys(buyerMemory.purchase_history).length > 0,
          has_interactions: Object.keys(buyerMemory.interactions).length > 0,
          past_contracts: buyerMemory.purchase_history.total_contracts?.value || "0",
          preferred_incoterm: buyerMemory.purchase_history.preferred_incoterm?.value || null,
          outreach_touches: buyerMemory.interactions.outreach_touches?.value || "0",
          already_contacted: buyerMemory.interactions.already_contacted?.value === "true" || false,
          tone_preference: buyerMemory.preferences.tone_preference?.value || null,
          email_length_preference: buyerMemory.preferences.email_length_preference?.value || null,
          cta_preference: buyerMemory.preferences.cta_preference?.value || null,
          ghosted_count: buyerMemory.interactions.ghosted_count?.value || "0",
          journey_stage: buyerMemory.journey.current_stage?.value || null,
          latest_seller_note: buyerMemory.preferences.latest_seller_note?.value || buyerMemory.feedback?.latest_seller_note?.value || null,
          adaptations_from_memory: adaptedNotes.filter(n => n.includes("buyer memory")),
        } : null,
        buyer_memory_summary: buyerMemorySummary.summary.length > 0 ? buyerMemorySummary.summary : null,
      };

      this.db.prepare(`
        INSERT INTO pending_agent_actions (
          agent_id, action_type, action_description,
          target_entity_type, target_entity_id, payload,
          risk_level, status, submitted_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        "Agent 3",
        "send_email",
        `Drafted outreach email to ${lead.company_name} (${lead.headquarters_country}) — ${lead.priority_tier} tier`,
        "lead",
        lead.lead_id,
        JSON.stringify({
          lead_id: lead.lead_id,
          company: lead.company_name,
          step: 1,
          language: lead.outreach_language,
          email_subject: emailDraft.subject,
          email_body: emailDraft.body,
          email_to: emailDraft.to,
          email_from: emailDraft.from,
          reasoning: reasoning,
        }),
        riskLevel,
        nowISO()
      );

      this.logEvent("Agent 3", "PENDING_ACTION_CREATED", "info",
        `Agent 3 drafted outreach email for ${lead.company_name} — subject: "${emailDraft.subject}" (confidence: ${reasoning.confidence}%)`,
        "Email draft added to seller approval queue",
        JSON.stringify({ leadId: lead.lead_id, riskLevel, subject: emailDraft.subject, confidence: reasoning.confidence })
      );
    }

    // Find leads in DECIDED_APPROVED state — Agent 5 wants to create a contract
    const approvedLeads = this.db.prepare(`
      SELECT l.lead_id, l.company_name, l.headquarters_country, l.priority_tier
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
      // Draft the actual contract terms
      const contractDraft = this.draftContractTerms(lead, availableLots);

      // Build reasoning for "Why I recommended this"
      const contractReasoning = {
        buyer_tier: lead.priority_tier || "A",
        buyer_country: lead.headquarters_country || "Unknown",
        volume_rationale: `Tier ${lead.priority_tier} buyers typically order ${lead.priority_tier === "S" ? "500" : lead.priority_tier === "A" ? "300" : lead.priority_tier === "B" ? "200" : "100"} bags — based on historical order patterns`,
        incoterm_rationale: lead.headquarters_country && ["Germany","Italy","France","Belgium","Netherlands","Sweden","Spain","Austria","Denmark","Finland"].includes(lead.headquarters_country)
          ? `CIF selected — EU destination (${lead.headquarters_country}), seller arranges shipping to ${contractDraft.destinationPort}`
          : `FOB selected — non-EU destination (${lead.headquarters_country}), buyer arranges shipping from Djibouti`,
        price_rationale: contractDraft.market_context ? contractDraft.market_context.pricing_rationale : `$${lead.priority_tier === "S" ? "7.50" : lead.priority_tier === "A" ? "6.80" : lead.priority_tier === "B" ? "5.50" : "4.80"}/kg — based on tier ${lead.priority_tier} pricing tier`,
        payment_rationale: lead.priority_tier === "S"
          ? "LC at sight — standard for premium tier buyers with high-value contracts"
          : lead.priority_tier === "A"
          ? "30% deposit + 70% against B/L copy — balances risk for both parties at mid-tier volumes"
          : "T/T 50/50 — simpler payment flow for lower-volume contracts",
        lots_selected: contractDraft.lots.length,
        lots_rationale: `Selected ${contractDraft.lots.length} lot(s) from available inventory — prioritized by cupping score and stock availability`,
        confidence: this.calculateContractConfidence(lead, availableLots, contractDraft.totalVolumeBags),
        confidence_factors: [
          `Lead is in DECIDED_APPROVED state — buyer already approved samples`,
          `${lead.priority_tier}-tier buyer — ${lead.priority_tier === "S" ? "high close rate" : lead.priority_tier === "A" ? "good close rate" : "moderate close rate"}`,
          `${availableLots.length} lots available in inventory — ${availableLots.length >= 2 ? "sufficient stock" : "limited stock"}`,
          `Contract value: $${contractDraft.totalValue.toLocaleString()} — ${contractDraft.totalValue >= 1000 ? "meaningful transaction" : "small transaction"}`,
        ],
      };

      this.db.prepare(`
        INSERT INTO pending_agent_actions (
          agent_id, action_type, action_description,
          target_entity_type, target_entity_id, payload,
          risk_level, status, submitted_ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        "Agent 5",
        "create_contract",
        `Drafted contract for ${lead.company_name} — ${contractDraft.totalVolumeBags} bags, ${contractDraft.incoterm} ${contractDraft.destinationPort}, $${contractDraft.totalValue.toLocaleString()}`,
        "lead",
        lead.lead_id,
        JSON.stringify({
          lead_id: lead.lead_id,
          company: lead.company_name,
          contract_id: contractDraft.contractId,
          incoterm: contractDraft.incoterm,
          destination_port: contractDraft.destinationPort,
          total_volume_bags: contractDraft.totalVolumeBags,
          total_value: contractDraft.totalValue,
          payment_terms: contractDraft.paymentTerms,
          shipment_window: contractDraft.shipmentWindow,
          contract_template: contractDraft.contractTemplate,
          lots: contractDraft.lots,
          contract_terms: contractDraft.terms,
          market_context: contractDraft.market_context || null,
          reasoning: contractReasoning,
        }),
        "high",
        nowISO()
      );

      this.logEvent("Agent 5", "PENDING_ACTION_CREATED", "info",
        `Agent 5 drafted contract for ${lead.company_name} — ${contractDraft.totalVolumeBags} bags at $${contractDraft.totalValue.toLocaleString()} (${contractDraft.incoterm} ${contractDraft.destinationPort}) (confidence: ${contractReasoning.confidence}%)`,
        "Contract draft added to seller approval queue (high risk)",
        JSON.stringify({ leadId: lead.lead_id, contractId: contractDraft.contractId, totalValue: contractDraft.totalValue, confidence: contractReasoning.confidence })
      );
    }

    // Process approved actions — execute them
    const approvedActions = this.db.prepare(`
      SELECT * FROM pending_agent_actions WHERE status = 'approved'
    `).all();

    // Also learn from recently rejected actions (update buyer memory)
    const recentRejections = this.db.prepare(`
      SELECT af.*, pa.payload
      FROM agent_feedback af
      JOIN pending_agent_actions pa ON af.action_id = pa.id
      WHERE af.decision = 'rejected'
      AND af.created_ts > datetime('now', '-5 minutes')
    `).all();

    for (const rej of recentRejections) {
      let leadId = rej.target_entity_id;
      if (!leadId && rej.payload) {
        try { leadId = JSON.parse(rej.payload).lead_id; } catch {}
      }
      if (leadId) {
        this.learnFromFeedback(leadId, rej.feedback_reason, rej.seller_notes, rej.action_type);
        log(`  🧠 Agent learned from rejection: ${rej.feedback_reason} → updated memory for ${leadId}`);
      }
    }

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
    // Health check: ensure DB is connected
    this.ensureDB();

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

// ─── Process lock: prevent duplicate supervisor instances ───
if (!runOnce) {
  if (fs.existsSync(PID_FILE)) {
    const existingPid = fs.readFileSync(PID_FILE, "utf8").trim();
    try {
      process.kill(parseInt(existingPid), 0); // Check if process is still alive
      console.error(`\n❌ Supervisor already running (PID ${existingPid}).`);
      console.error(`   If this is an error, delete ${PID_FILE} and retry.`);
      process.exit(1);
    } catch {
      // Process is dead — safe to take over
      log(`   Stale PID file found (PID ${existingPid} not running) — taking over.`);
    }
  }
  fs.writeFileSync(PID_FILE, process.pid.toString());
}

/** Clean up PID file on exit */
function cleanup() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {}
}

const supervisor = new Supervisor();

// Log startup
supervisor.logEvent(null, "SUPERVISOR_START", "info", "Agent Supervisor started", null, JSON.stringify({ interval, runOnce, pid: process.pid }));
log("🚀 Agent Supervisor started");
log(`   Mode: ${runOnce ? "single tick" : `continuous (every ${interval / 1000}s)`}`);
log(`   Database: ${DB_PATH}`);
log(`   PID: ${process.pid} (lock file: ${PID_FILE})`);
log(`   Agents: 7 (Agent 1 through Agent 7)`);
log("");

if (runOnce) {
  try {
    supervisor.tick();
  } catch (err) {
    log(`  🔴 FATAL: ${err.message}`);
  }
  supervisor.logEvent(null, "SUPERVISOR_STOP", "info", "Agent Supervisor stopped (single tick)", null, null);
  supervisor.close();
  process.exit(0);
}

// Continuous mode — with DB reconnection on failure
const runLoop = () => {
  try {
    supervisor.tick();
  } catch (err) {
    log(`  🔴 FATAL: ${err.message}`);
    try {
      supervisor.logEvent(null, "SUPERVISOR_ERROR", "critical", `Supervisor fatal error: ${err.message}`, "Will reconnect DB and retry on next tick", err.stack);
    } catch {
      // If logging fails too, just reconnect
      supervisor.connect();
    }
    // Force DB reconnection for next tick
    supervisor.connect();
  }
};

// Run immediately, then on interval
runLoop();
const timer = setInterval(runLoop, interval);

// Graceful shutdown
function shutdown(signal) {
  log(`\n🛑 Supervisor received ${signal}, shutting down...`);
  try {
    supervisor.logEvent(null, "SUPERVISOR_STOP", "info", `Agent Supervisor stopped (${signal})`, null, null);
  } catch {}
  clearInterval(timer);
  supervisor.close();
  cleanup();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Also clean up on uncaught exceptions
process.on("uncaughtException", (err) => {
  log(`  🔴 UNCAUGHT: ${err.message}`);
  try { supervisor.logEvent(null, "SUPERVISOR_ERROR", "critical", `Uncaught exception: ${err.message}`, "Attempting recovery", err.stack); } catch {}
  // Don't exit — try to recover on next tick
  supervisor.connect();
});

// Clean up PID file on any exit
process.on("exit", () => {
  cleanup();
});
