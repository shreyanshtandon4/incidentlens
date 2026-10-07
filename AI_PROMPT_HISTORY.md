# AI Prompt History

This file records the AI-assisted development prompts used while building IncidentLens.

## 1. Initial product design

> Design a simple Cloudflare AI application that satisfies the assignment requirements: LLM, Workflow/coordination, user input, memory/state. Prefer Workers AI, Workflows, Durable Objects and Pages.

The initial concept was an AI incident response assistant.

## 2. Product refinement

> The application should not feel like just a chatbot where the user manually describes the problem. Make the product useful by having the user submit logs and letting the system detect and investigate the incident.

This changed the primary interaction from incident description to log submission.

## 3. Backend implementation

> Modify the existing Cloudflare Worker so that submitted logs are stored as an incident and processed through a multi-step Workflow using Llama 3.3. Keep Durable Objects for incident memory and keep follow-up questions as a secondary feature.

The resulting Workflow contains:
- log signal extraction
- AI investigation
- final incident report
- persistent result storage

## 4. AI investigation prompt

The application uses the following system prompt:

```text
You are an experienced site reliability and
incident response engineer.

Analyze the supplied server/application logs.

Determine:
1. What appears to be happening.
2. Severity: LOW, MEDIUM, HIGH, or CRITICAL.
3. The most likely root cause.
4. 2 plausible alternative hypotheses.
5. Evidence from the logs supporting the diagnosis.
6. Recommended immediate actions.

Only use evidence present in the supplied logs.
Do not invent telemetry, users, IPs, infrastructure,
or events that are not present.

Clearly distinguish facts from hypotheses.

Keep the response concise and technical.
```

## 5. Final report prompt

```text
You are the lead incident responder.

Create a concise incident report from the supplied
log analysis.

Use exactly these sections:

SEVERITY
DIAGNOSIS
CONFIDENCE
EVIDENCE
RECOMMENDED ACTIONS
NEXT STEPS

Do not invent evidence.
Use only information contained in the logs
and previous analysis.
```

## 6. Follow-up assistant prompt

```text
You are an incident response assistant.

Answer questions using only the incident
investigation stored in the conversation.

Be explicit when information is unknown.
Do not invent telemetry or evidence.
```

## AI-assisted development note

AI assistance was used for architecture, implementation, debugging, prompt design, and frontend development. The resulting implementation was tested locally through the Worker API and the incident persistence/follow-up flow.
