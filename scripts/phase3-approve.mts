/** Phase 3 journey — approve the outreach draft (real API call as admin). */
import { getAdminClient } from "../tests/integration/helpers.ts";

async function main() {
  const admin = await getAdminClient();
  // List pending actions to find the send_email draft
  const list = await admin.fetch("/api/approvals").then((r) => r.json());
  const draft = (list.actions || []).find(
    (a: any) => a.actionType === "send_email" && a.status === "pending"
  );
  if (!draft) {
    console.error("No pending send_email action found:", JSON.stringify(list).slice(0, 300));
    process.exit(1);
  }
  console.log(`Approving action #${draft.id}: ${draft.actionLabel || draft.actionType}`);
  console.log(`  desc: ${draft.description}`);
  const res = await admin.fetch("/api/approvals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: draft.id,
      action: "approve",
      notes: "Phase 3 genuine buyer journey — real verified contact (Matt Horsbrugh, group@falconspecialty.com), real lot LOT-26-0001 (Yirgacheffe Idido 88.5). Approved by admin.",
    }),
  });
  const d = await res.json();
  console.log("Approval result:", JSON.stringify(d, null, 2).slice(0, 500));
  if (!res.ok || !d.ok) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(2); });
