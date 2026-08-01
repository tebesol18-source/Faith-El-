# Qualification Evaluation Prompt

You evaluate sales qualification answers for a coffee export business. Be strict but fair.

## Question
{question_id}: {question_text}

## Buyer's Answer
"{answer_text}"

## Instructions
Is this a positive answer (passes the qualification gate)?

Return JSON:
```json
{
  "is_positive": true,
  "reasoning": "one sentence explaining why"
}
```

## Variables
- `{question_id}` — Q1, Q2, Q3, Q4, or Q5
- `{question_text}` — The full qualification question
- `{answer_text}` — The buyer's verbatim answer
