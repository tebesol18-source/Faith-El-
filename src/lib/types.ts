/**
 * Shared TypeScript types used across all page components.
 * All types are exported so individual page files can import only what they need.
 */

export type Page = "dashboard" | "inbox" | "leads" | "deals" | "inventory" | "samples" | "quotes" | "contracts" | "shipments" | "compliance" | "finance" | "coach" | "admin";

export type QuoteLineItem = {
  lotId: string;
  origin: string;
  process: string;
  grade: string;
  weightKg: number;
  pricePerKg: number;
  costPerKg: number;
};

export type Quote = {
  id: string;
  lead: string;
  leadId: string;
  version: number;
  status: "ai_draft" | "pending_review" | "pending_approval" | "sent" | "accepted" | "rejected" | "revised" | "expired";
  incoterm: string;
  destination: string;
  currency: string;
  paymentTerms: string;
  validUntil: string;
  createdAt: string;
  sentAt: string | null;
  respondedAt: string | null;
  lines: QuoteLineItem[];
  freight: number;
  insurance: number;
  commissionPct: number;
  aiDrafted: boolean;
  aiConfidence: number;
  aiSuggestion: string;
  buyerNote: string | null;
  daysToExpiry: number | null;
};

export type DocStatus = "missing" | "in_progress" | "submitted" | "approved" | "expiring" | "expired";

export type DocType = "phytosanitary" | "ecx_grade" | "export_permit" | "certificate_of_origin" | "ico_certificate" | "fumigation" | "quality_inspection" | "bill_of_lading";

export type ComplianceDoc = {
  type: DocType;
  status: DocStatus;
  issuedDate: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  issuedBy: string | null;
  refNumber: string | null;
  fileName: string | null;
};

export type ComplianceShipment = {
  id: string;
  destination: string;
  flag: string;
  eta: string;
  lots: string[];
  contractValue: number;
  vessel: string;
  docs: ComplianceDoc[];
};

export type ShipmentStage = "processing" | "to_port" | "at_port" | "loaded" | "in_transit" | "arrived" | "customs" | "delivered";

export type ShipmentStatus = "on_schedule" | "delayed" | "demurrage_risk" | "arrived" | "delivered" | "loading";

export type ShipmentMilestone = {
  stage: ShipmentStage;
  label: string;
  date: string | null;
  completed: boolean;
  note?: string;
};

export type TempReading = {
  day: string;
  temp: number;
  humidity: number;
};

export type Shipment = {
  id: string;
  containerNo: string;
  sealNo: string;
  bookingRef: string;
  vessel: string;
  voyage: string;
  originPort: string;
  destinationPort: string;
  destinationCity: string;
  destinationCountry: string;
  flag: string;
  buyer: string;
  contractId: string;
  contractValue: number;
  weightKg: number;
  lots: string[];
  departureDate: string;
  etaDate: string;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  status: ShipmentStatus;
  stage: ShipmentStage;
  stageProgress: number; // 0-100
  temperature: number;
  humidity: number;
  tempOk: boolean;
  insuranceValue: number;
  demurrageRisk: number | null; // days until demurrage starts
  docReadiness: number; // 0-100, links to compliance
  milestones: ShipmentMilestone[];
  tempLog: TempReading[];
  events: { date: string; text: string; type: "info" | "warning" | "success" }[];
};

export type ContractStatus = "draft" | "pending_buyer_sig" | "pending_seller_sig" | "executed" | "in_progress" | "completed" | "expired" | "cancelled";

export type PaymentMilestone = {
  label: string;
  pct: number;
  amount: number;
  dueDate: string | null;
  status: "pending" | "due" | "paid" | "late";
  paidDate?: string | null;
};

export type Contract = {
  id: string;
  quoteId: string;
  buyer: string;
  buyerCountry: string;
  buyerContact: string;
  buyerEmail: string;
  seller: string;
  sellerContact: string;
  agent: string;
  commissionPct: number;
  status: ContractStatus;
  incoterm: string;
  destinationPort: string;
  destinationCity: string;
  flag: string;
  currency: string;
  totalValue: number;
  weightKg: number;
  lots: { lotId: string; origin: string; process: string; grade: string; pricePerKg: number; weightKg: number }[];
  paymentTerms: string;
  paymentSchedule: PaymentMilestone[];
  validFrom: string;
  validUntil: string;
  buyerSigned: boolean;
  buyerSignedDate: string | null;
  sellerSigned: boolean;
  sellerSignedDate: string | null;
  shipmentId: string | null;
  shipmentStatus: string | null;
  createdDate: string;
  executedDate: string | null;
  marginPct: number;
  notes?: string;
};

export type TxnType = "invoice" | "payment_in" | "cost_coffee" | "cost_freight" | "cost_insurance" | "cost_commission" | "cost_other";

export type TxnStatus = "paid" | "pending" | "overdue" | "due_soon";

export type Transaction = {
  id: string;
  type: TxnType;
  description: string;
  counterparty: string;
  amount: number;  // positive = money in, negative = money out
  currency: string;
  date: string;
  dueDate: string | null;
  status: TxnStatus;
  contractId: string | null;
  shipmentId: string | null;
  invoiceRef: string | null;
  category: string;
  notes?: string;
};

export type Priority = {
  rank: number;
  category: "revenue" | "risk" | "relationship" | "operational";
  action: string;
  context: string;
  impact: string;
  eta: string;
  page: Page;
  urgency: "critical" | "high" | "medium";
};

export type Insight = {
  type: "pattern" | "opportunity" | "warning";
  title: string;
  body: string;
  metric?: string;
};

export type RiskItem = {
  title: string;
  severity: "critical" | "high" | "medium";
  probability: number;
  impact: string;
  mitigation: string;
  daysToImpact: number;
};

export type Opportunity = {
  title: string;
  buyer: string;
  potentialValue: number;
  action: string;
  deadline: string;
};

export type AIAction = {
  time: string;
  agent: string;
  action: string;
  status: "completed" | "pending_approval" | "in_progress";
  detail: string;
};

export type SellerRisk = "healthy" | "warning" | "critical";

export type Seller = {
  id: string;
  name: string;
  contact: string;
  email: string;
  region: string;
  dealsClosed: number;
  dealsActive: number;
  pipelineValue: number;
  revenueYTD: number;
  commissionEarned: number;   // 2% of revenueYTD — already received
  commissionPending: number;  // 2% of pipeline — will be received when deals close
  riskLevel: SellerRisk;
  atRiskDeals: number;
  overduePayments: number;
  missingDocs: number;
  avgMargin: number;
  lastActive: string;
  joinedDate: string;
  status: "active" | "warning" | "suspended";
  topBuyer: string;
  topOrigin: string;
};

export type SellerDeal = {
  id: string;
  buyer: string;
  value: number;
  margin: number;
  status: "completed" | "in_progress" | "at_risk" | "rejected";
  commission: number;
};

export type OperatorRole = "admin" | "manager" | "operator" | "viewer";

export type Operator = {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  status: "active" | "disabled";
  lastActive: string;
  actionsToday: number;
};

export type AIAgent = {
  id: string;
  name: string;
  status: "active" | "idle" | "error" | "paused";
  lastAction: string;
  lastActionTime: string;
  actionsToday: number;
  approvalsWaiting: number;
};

export type ApprovalItem = {
  id: string;
  agent: string;
  action: string;
  target: string;
  submittedAt: string;
  riskLevel: "low" | "medium" | "high";
  detail: string;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actorType: "operator" | "agent";
  action: string;
  entityType: string;
  entityId: string;
};


// ── Logistics Command Center (Resource & Shipment Management) ──────────────

export type LogisticsProvider = {
  id: number;
  organization_id: string | null; // null = global shared directory entry
  name: string;
  provider_type: string;
  country: string | null;
  city: string | null;
  service_area: string | null;
  services: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  booking_url: string | null;
  tracking_url: string | null;
  empty_container_url: string | null;
  address: string | null;
  official_source_url: string | null;
  supports_contact: number;
  supports_external_booking: number;
  supports_tracking: number;
  supports_quotation: number;
  supports_empty_container: number;
  supports_document_submission: number;
  integration_status: "external" | "api_connected";
  active: number;
  verified: number;
  last_verified_at: string | null;
  notes: string | null;
};

export type LogisticsBooking = {
  id: number;
  shipment_id: string | null;
  provider_id: number | null;
  provider_name: string;
  booking_reference: string;
  booked_date: string | null;
  container_type: string | null;
  quantity: number;
  pickup_location: string | null;
  depot: string | null;
  available_date: string | null;
  container_numbers: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  confirmation_document: string | null;
  status: "recorded" | "confirmed" | "cancelled";
  notes: string | null;
  created_by: string | null;
  created_ts: string;
};

export type LogisticsContainer = {
  id: number;
  shipment_id: string | null;
  booking_id: number | null;
  provider_id: number | null;
  container_number: string | null;
  container_type: string;
  seal_number: string | null;
  depot: string | null;
  pickup_date: string | null;
  loaded_date: string | null;
  stuffed_date: string | null;
  sealed_date: string | null;
  gate_in_date: string | null;
  port_arrival_date: string | null;
  vessel: string | null;
  voyage: string | null;
  bill_of_lading: string | null;
  status: string;
  notes: string | null;
};

export type LogisticsEvent = {
  id: number;
  shipment_id: string;
  container_id: number | null;
  event_type: string;
  title: string;
  detail: string | null;
  event_ts: string;
  source: string;
  created_by: string | null;
};

export type LogisticsChecklistItem = {
  id: number;
  shipment_id: string;
  position: number;
  title: string;
  detail: string | null;
  status: "pending" | "done" | "not_applicable";
  completed_ts: string | null;
  completed_by: string | null;
};

export type LogisticsTransportSegment = {
  id: number;
  shipment_id: string;
  container_id: number | null;
  segment_type: "trucking" | "rail" | "barge" | "port_handling" | "warehouse";
  provider_id: number | null;
  provider_name: string | null;
  origin: string | null;
  destination: string | null;
  planned_date: string | null;
  actual_date: string | null;
  reference: string | null;
  cost: number | null;
  currency: string | null;
  status: "planned" | "confirmed" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
};

export type LogisticsStats = {
  activeShipments: number;
  containersBooked: number;
  containersAwaitingBooking: number;
  inTransit: number;
  upcomingDepartures: number;
  delayedOrHolds: number;
  missingBookingDocs: number;
  completed: number;
};

export type LogisticsTask = {
  severity: "warning" | "info";
  title: string;
  detail: string;
};
