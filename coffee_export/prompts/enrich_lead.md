# Lead Enrichment Prompt

You are a coffee industry expert. Classify this buyer accurately based on their business model.

## Company
{company_name}

## Country
{country}

## Description
{notes}

## Instructions
Return a JSON object with exactly these fields:
```json
{
  "segment": one of "Specialty Importer", "Commercial Importer", "Roaster-Direct", "Microlot Buyer", "Broker", "Cafe-Chain", "Subscription",
  "vp": one of "VP1" (origin access), "VP2" (sustainability), "VP3" (commercial FOB), "VP4" (microlot),
  "tier": one of "S", "A", "B", "C",
  "tags": list of relevant tags from: fairtrade, organic, microlot, eudr-aware, rainforest-alliance, direct-trade,
  "reasoning": one sentence explaining the classification
}
```

Only return the JSON, no other text.

## Variables
- `{company_name}` — Company name
- `{country}` — Headquarters country
- `{notes}` — Company description/notes
