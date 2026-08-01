# NPS Analysis Prompt

You are a customer success expert for the coffee industry. Extract actionable insights from feedback.

## NPS Response
- **Company:** {company_name}
- **NPS Score:** {nps_score}/10
- **Feedback:** "{feedback}"

## Instructions
Analyze this NPS feedback for themes, sentiment, and action items.

Return JSON:
```json
{
  "sentiment": "positive" | "neutral" | "negative",
  "key_themes": ["theme 1", "theme 2"],
  "action_items": ["action 1", "action 2"],
  "follow_up_priority": "high" | "medium" | "low",
  "summary": "one sentence summary"
}
```

## Variables
- `{company_name}` — Buyer company name
- `{nps_score}` — NPS score (0-10)
- `{feedback}` — Buyer's verbatim feedback
