# IncidentLens Demo Script

## 1. Opening

Say:

> IncidentLens is an AI-powered incident investigation tool. Instead of asking an engineer to manually describe an incident, they can submit application or server logs and get an automatically generated investigation.

## 2. Submit logs

Click **Use example**.

Explain:

> These are synthetic application logs showing repeated login failures, database connection timeouts, and an exhausted connection pool.

Click **Analyze Logs**.

## 3. Explain the workflow

While it is loading:

> The request is handled by a Cloudflare Worker. The Worker starts a Cloudflare Workflow. The Workflow first extracts basic log signals, then sends the evidence to Llama 3.3 through Workers AI, and finally generates the incident assessment.

## 4. Show the report

When complete:

> The important part is that the model is not just summarizing the logs. It is producing an incident assessment: severity, diagnosis, confidence, evidence, recommended actions, and next steps.

Point out that the result is based only on the submitted logs.

## 5. Demonstrate memory

Ask:

> Why was this incident classified as high severity?

Then ask:

> What evidence supports the database connection hypothesis?

Explain:

> These follow-up questions use the incident context stored in the Durable Object. The Durable Object gives each incident persistent state and memory.

## 6. Cloudflare mapping

Say:

> The application uses four main Cloudflare primitives: Workers for the API, Workers AI for Llama 3.3, Workflows for durable multi-step investigation, and Durable Objects for incident memory. The frontend is hosted separately on Pages.

## 7. Closing

Say:

> This is intentionally a focused prototype rather than a full SIEM. The key idea is turning raw logs into an automatically investigated incident while keeping the investigation state durable and available for follow-up questions.
