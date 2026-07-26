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
      EN: `Ethiopian 25/26 coffee — available lots from Coelrodan PLC`,
      DE: `Äthiopischer Kaffee 25/26 — verfügbare Lots von Coelrodan PLC`,
      JA: `エチオピア 25/26 産コーヒー — Coelrodan PLCからのご案内`,
      FR: `Café éthiopien 25/26 — lots disponibles de Coelrodan PLC`,
      IT: `Caffè etiope 25/26 — lotti disponibili da Coelrodan PLC`,
      KO: `에티오피아 25/26 커피 — Coelrodan PLC의 가용 로트`,
      ZH: `埃塞俄比亚 25/26 咖啡 — Coelrodan PLC 可供批次`,
      AR: `قهوة إثيوبية 25/26 — أ lots متاحة من Coelrodan PLC`,
      TR: `Etiyopya 25/26 kahvesi — Coelrodan PLC'den mevcut partiler`,
      RU: `Эфиопский кофе 25/26 — доступные лоты от Coelrodan PLC`,
    };

    const subject = subjects[lang] || subjects.EN;
    const greeting = greetings[lang] || greetings.EN;
    const signoff = signoffs[lang] || signoffs.EN;

    const body = `${greeting}

I hope this message finds you well. I'm reaching out from Coelrodan PLC, an Ethiopian coffee export company based in Addis Ababa.

${vpMsg}${lotMention}

${cta}

${signoff},
Abi Solomon
Coelrodan PLC
Addis Ababa, Ethiopia
abi@coelrodan.com`;

    return { subject, body, to: `${contactName ? contactName.toLowerCase().replace(/[^a-z]/g, ".") : "info"}@${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`, from: "abi@coelrodan.com" };
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

    // Price based on tier and available lots
    const tierPrices = { S: 7.50, A: 6.80, B: 5.50, C: 4.80 };
    const basePrice = tierPrices[tier] || 6.80;

    // Payment terms based on tier
    const paymentTerms = tier === "S" ? "LC at sight" : tier === "A" ? "30% deposit · 70% against B/L copy" : "T/T 50/50";

    // Select lots for the contract
    const selectedLots = (availableLots || []).slice(0, tier === "S" ? 3 : 2);
    const totalBags = selectedLots.reduce((s, l) => s + Math.min(l.stock_bags_remaining, Math.ceil(volume / selectedLots.length)), 0) || volume;
    const totalValue = Math.round(totalBags * basePrice);

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
        price_rationale: `$${lead.priority_tier === "S" ? "7.50" : lead.priority_tier === "A" ? "6.80" : lead.priority_tier === "B" ? "5.50" : "4.80"}/kg — based on tier ${lead.priority_tier} pricing tier (reflects cupping score expectations and volume commitment)`,
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
