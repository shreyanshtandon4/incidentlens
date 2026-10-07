# IncidentLens

IncidentLens is an AI-powered log investigation application built on Cloudflare.

It lets an engineer paste application/server logs and automatically:

1. Extract basic error and warning signals.
2. Investigate the logs with Llama 3.3 through Workers AI.
3. Generate a concise incident assessment.
4. Persist the incident and investigation history in a Durable Object.
5. Answer follow-up questions using the stored incident context.

## Architecture

```text
                         ┌──────────────────────┐
                         │   React / Pages UI   │
                         │    Log Submitter      │
                         └──────────┬───────────┘
                                    │ POST logs
                                    ▼
                         ┌──────────────────────┐
                         │   Cloudflare Worker  │
                         │      REST API        │
                         └───────┬──────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
          ┌──────────────────┐       ┌──────────────────┐
          │ Cloudflare       │       │ Durable Object   │
          │ Workflow         │       │ IncidentSession  │
          └────────┬─────────┘       └────────┬─────────┘
                   │                          │
          ┌────────▼─────────┐                │
          │ Workers AI       │                │
          │ Llama 3.3        │                │
          └────────┬─────────┘                │
                   │                          │
                   └──────────┬───────────────┘
                              ▼
                     Incident Report
```

## Cloudflare components

- **Workers** — API and request handling.
- **Workers AI** — Llama 3.3 inference.
- **Workflows** — durable multi-step investigation.
- **Durable Objects** — incident-specific persistent state and memory.
- **Pages** — frontend hosting.

Cloudflare documents Workers AI bindings through `env.AI`, and `wrangler deploy` is the standard Worker deployment command. Workflows provide durable multi-step execution and Durable Objects can use embedded SQLite for persistent state.

## Local development

### Backend

From `worker`:

```powershell
npm install
npm run dev
```

The Worker normally runs on:

```text
http://localhost:8787
```

Workers AI uses the Cloudflare account during local development, so AI requests are not purely local.

### Frontend

From `frontend`:

```powershell
npm install
npm run dev
```

Open the Vite URL, normally:

```text
http://localhost:5173
```

The frontend currently calls:

```text
http://localhost:8787
```

## Demo flow

1. Open the frontend.
2. Click **Use example**.
3. Click **Analyze Logs**.
4. Wait for the Workflow to finish.
5. Read the generated incident report.
6. Ask:
   - `Why was this incident classified as high severity?`
   - `What evidence supports the root cause?`
   - `What should I investigate next?`
7. Click **New Analysis** and submit another set of logs.

## Example input

See `demo/sample-incident.log`.

## API

### Create incident

`POST /api/incidents`

```json
{
  "logs": "10:31:01 INFO GET /api/users 200 42ms..."
}
```

Response:

```json
{
  "incidentId": "INC-...",
  "workflowId": "...",
  "status": "analyzing"
}
```

### Get incident

`GET /api/incidents/:id`

Returns the incident state and stored messages.

### Ask a follow-up question

`POST /api/incidents/:id/messages`

```json
{
  "message": "Why was this classified as high severity?"
}
```

## Deployment

### 1. Login

```powershell
npx wrangler login
```

### 2. Deploy the Worker

From the `worker` directory:

```powershell
npx wrangler deploy
```

The deployed API will be available on the Worker URL printed by Wrangler.

### 3. Update the frontend API URL

In `frontend/src/main.tsx`, change:

```ts
const API_URL = "http://localhost:8787";
```

to the deployed Worker URL, for example:

```ts
const API_URL = "https://incidentlens-api.<your-subdomain>.workers.dev";
```

### 4. Build the frontend

```powershell
npm run build
```

This creates the `dist` directory.

### 5. Deploy to Pages

Create a Pages project once:

```powershell
npx wrangler pages project create incidentlens
```

Then deploy:

```powershell
npx wrangler pages deploy dist --project-name incidentlens
```

The resulting site will be available on a `pages.dev` URL.

## Design decisions

### Why logs instead of a chatbot?

The main input is operational evidence rather than a manually written problem description. The user supplies logs, and the system derives the incident from those logs.

### Why a Workflow?

The investigation is intentionally split into durable steps:

1. Extract signals.
2. Analyze with the LLM.
3. Produce the final incident report.
4. Persist the result.

This demonstrates Cloudflare Workflows as an orchestration layer rather than using the LLM as a simple chat endpoint.

### Why a Durable Object?

Each incident has its own persistent state. The Durable Object stores the submitted logs, investigation messages, final result, and follow-up conversation.

### Limitations

This is a focused prototype. It does not claim to replace a production SIEM or observability platform. It analyzes only the evidence supplied by the user and explicitly instructs the model not to invent telemetry.

## Future improvements

- Direct `.log`/`.txt` file upload.
- Streaming workflow progress.
- Multiple log sources per incident.
- Structured severity/evidence cards.
- Authentication and access control.
- Integration with real observability systems.
