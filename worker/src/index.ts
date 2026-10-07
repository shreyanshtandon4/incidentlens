import { DurableObject } from "cloudflare:workers";
import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";

interface Env {
  AI: Ai;
  INCIDENTS: DurableObjectNamespace<IncidentSession>;
  INCIDENT_WORKFLOW: Workflow<IncidentParams>;
}

type IncidentParams = {
  incidentId: string;
  logs: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type Incident = {
  id: string;
  report: string;
  status: string;
  result: string | null;
  created_at: number;
};

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

async function askAI(
  ai: Ai,
  system: string,
  user: string
): Promise<string> {
  const result = await ai.run(MODEL, {
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: user,
      },
    ],
  });

  if (typeof result === "string") {
    return result;
  }

  return (
    (result as { response?: string }).response ??
    JSON.stringify(result)
  );
}

/* ============================================================
   DURABLE OBJECT
   Stores one incident and its investigation memory.
   ============================================================ */

export class IncidentSession extends DurableObject<Env> {
  private incidentId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          ts INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS incident (
          id TEXT PRIMARY KEY,
          report TEXT NOT NULL,
          status TEXT NOT NULL,
          result TEXT,
          created_at INTEGER NOT NULL
        );
      `);

      const rows = Array.from(
        this.ctx.storage.sql.exec<{ id: string }>(
          `SELECT id FROM incident LIMIT 1`
        )
      );

      if (rows.length > 0) {
        this.incidentId = String(rows[0].id);
      }
    });
  }

  async initialize(id: string, logs: string): Promise<void> {
    this.incidentId = id;

    this.ctx.storage.sql.exec(
      `
      INSERT OR IGNORE INTO incident
        (id, report, status, result, created_at)
      VALUES (?, ?, 'analyzing', NULL, ?)
      `,
      id,
      logs,
      Date.now()
    );

    await this.addMessage(
      "user",
      `Submitted logs:\n${logs}`
    );
  }

  async addMessage(
    role: Message["role"],
    content: string
  ): Promise<void> {
    this.ctx.storage.sql.exec(
      `
      INSERT INTO messages(role, content, ts)
      VALUES (?, ?, ?)
      `,
      role,
      content,
      Date.now()
    );
  }

  async getMessages(): Promise<Message[]> {
    const rows = this.ctx.storage.sql.exec<{
      role: string;
      content: string;
      ts: number;
    }>(
      `
      SELECT role, content, ts
      FROM messages
      ORDER BY id ASC
      `
    );

    return Array.from(rows).map((row) => ({
      role: row.role as Message["role"],
      content: String(row.content),
      ts: Number(row.ts),
    }));
  }

  async setResult(
    status: string,
    result: string
  ): Promise<void> {
    if (!this.incidentId) {
      throw new Error("Incident has not been initialized");
    }

    this.ctx.storage.sql.exec(
      `
      UPDATE incident
      SET status = ?, result = ?
      WHERE id = ?
      `,
      status,
      result,
      this.incidentId
    );

    await this.addMessage(
      "assistant",
      `Final AI Analysis:\n${result}`
    );
  }

  async getIncident(): Promise<Incident | null> {
    const rows = Array.from(
      this.ctx.storage.sql.exec<{
        id: string;
        report: string;
        status: string;
        result: string | null;
        created_at: number;
      }>(
        `
        SELECT id, report, status, result, created_at
        FROM incident
        LIMIT 1
        `
      )
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    return {
      id: String(row.id),
      report: String(row.report),
      status: String(row.status),
      result:
        row.result === null
          ? null
          : String(row.result),
      created_at: Number(row.created_at),
    };
  }
}

/* ============================================================
   WORKFLOW
   Logs → signal extraction → AI investigation → final report
   ============================================================ */

export class IncidentInvestigationWorkflow extends WorkflowEntrypoint<
  Env,
  IncidentParams
> {
  async run(
    event: WorkflowEvent<IncidentParams>,
    step: WorkflowStep
  ) {
    const { incidentId, logs } = event.payload;

    const stub =
      this.env.INCIDENTS.getByName(incidentId);

    /* --------------------------------------------------------
       STEP 1 — EXTRACT BASIC LOG SIGNALS
       -------------------------------------------------------- */

    const signals = await step.do(
      "extract log signals",
      async () => {
        const lines = logs.split("\n");

        const errorLines = lines.filter((line) =>
          /\b(ERROR|FATAL|CRITICAL|EXCEPTION)\b/i.test(line)
        );

        const warningLines = lines.filter((line) =>
          /\b(WARN|WARNING)\b/i.test(line)
        );

        const timeoutLines = lines.filter((line) =>
          /\b(timeout|timed out|connection refused)\b/i.test(line)
        );

        return JSON.stringify({
          total_lines: lines.length,
          error_count: errorLines.length,
          warning_count: warningLines.length,
          timeout_count: timeoutLines.length,
          sample_errors: errorLines.slice(0, 10),
          sample_warnings: warningLines.slice(0, 10),
          sample_timeouts: timeoutLines.slice(0, 10),
        });
      }
    );

    await step.do(
      "save log signals",
      async () => {
        await stub.addMessage(
          "assistant",
          `Extracted log signals:\n${signals}`
        );
      }
    );

    /* --------------------------------------------------------
       STEP 2 — AI INVESTIGATION
       -------------------------------------------------------- */

    const investigation = await step.do(
      "analyze logs with AI",
      async () => {
        return askAI(
          this.env.AI,
          `
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
          `.trim(),
          `
LOG SIGNALS:
${signals}

RAW LOGS:
${logs}
          `.trim()
        );
      }
    );

    await step.do(
      "save investigation",
      async () => {
        await stub.addMessage(
          "assistant",
          `AI Investigation:\n${investigation}`
        );
      }
    );

    /* --------------------------------------------------------
       STEP 3 — FINAL INCIDENT REPORT
       -------------------------------------------------------- */

    const final = await step.do(
      "produce final incident report",
      async () => {
        return askAI(
          this.env.AI,
          `
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
          `.trim(),
          `
LOG SIGNALS:
${signals}

AI INVESTIGATION:
${investigation}

RAW LOGS:
${logs}
          `.trim()
        );
      }
    );

    /* --------------------------------------------------------
       STEP 4 — SAVE RESULT
       -------------------------------------------------------- */

    await step.do(
      "save final incident report",
      async () => {
        await stub.setResult(
          "complete",
          final
        );
      }
    );

    return {
      incidentId,
      signals,
      investigation,
      final,
    };
  }
}

/* ============================================================
   MAIN WORKER API
   ============================================================ */

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: cors,
      });
    }

    try {
      /* ======================================================
         SUBMIT LOGS
         
         POST /api/incidents
         
         Body:
         {
           "logs": "..."
         }
         ====================================================== */

      if (
        url.pathname === "/api/incidents" &&
        request.method === "POST"
      ) {
        const body =
          await request.json<{ logs?: string }>();

        if (!body.logs?.trim()) {
          return Response.json(
            {
              error: "logs are required",
            },
            {
              status: 400,
              headers: cors,
            }
          );
        }

        const logs = body.logs.trim();

        // Keep the demo simple and prevent huge requests.
        if (logs.length > 100000) {
          return Response.json(
            {
              error:
                "Logs are too large. Please submit less than 100KB.",
            },
            {
              status: 400,
              headers: cors,
            }
          );
        }

        const incidentId =
          `INC-${Date.now()
            .toString(36)
            .toUpperCase()}`;

        const stub =
          env.INCIDENTS.getByName(incidentId);

        await stub.initialize(
          incidentId,
          logs
        );

        const workflow =
          await env.INCIDENT_WORKFLOW.create({
            id: incidentId,
            params: {
              incidentId,
              logs,
            },
          });

        return Response.json(
          {
            incidentId,
            workflowId: workflow.id,
            status: "analyzing",
          },
          {
            headers: cors,
          }
        );
      }

      /* ======================================================
         INCIDENT ROUTES

         GET  /api/incidents/:id
         POST /api/incidents/:id/messages
         ====================================================== */

      const match = url.pathname.match(
        /^\/api\/incidents\/([^/]+)(\/messages)?$/
      );

      if (match) {
        const id = match[1];

        const stub =
          env.INCIDENTS.getByName(id);

        /* ----------------------------------------------------
           GET INCIDENT
           ---------------------------------------------------- */

        if (request.method === "GET") {
          const incident =
            await stub.getIncident();

          const messages =
            await stub.getMessages();

          if (!incident) {
            return Response.json(
              {
                error: "Incident not found",
              },
              {
                status: 404,
                headers: cors,
              }
            );
          }

          return Response.json(
            {
              incident,
              messages,
            },
            {
              headers: cors,
            }
          );
        }

        /* ----------------------------------------------------
           FOLLOW-UP AI CHAT

           This is secondary to the log analyzer.
           ---------------------------------------------------- */

        if (
          request.method === "POST" &&
          match[2] === "/messages"
        ) {
          const body =
            await request.json<{
              message?: string;
            }>();

          if (!body.message?.trim()) {
            return Response.json(
              {
                error: "message is required",
              },
              {
                status: 400,
                headers: cors,
              }
            );
          }

          const messages =
            await stub.getMessages();

          const history =
            messages
              .slice(-12)
              .map(
                (message) =>
                  `${message.role}: ${message.content}`
              )
              .join("\n");

          const answer =
            await askAI(
              env.AI,
              `
You are an incident response assistant.

Answer questions using only the incident
investigation stored in the conversation.

Be explicit when information is unknown.
Do not invent telemetry or evidence.
              `.trim(),
              `
INCIDENT HISTORY:

${history}

USER QUESTION:
${body.message.trim()}
              `.trim()
            );

          await stub.addMessage(
            "user",
            body.message.trim()
          );

          await stub.addMessage(
            "assistant",
            answer
          );

          return Response.json(
            {
              answer,
            },
            {
              headers: cors,
            }
          );
        }
      }

      /* ======================================================
         HEALTH CHECK
         ====================================================== */

      return Response.json(
        {
          service: "IncidentLens API",
          status: "ok",
        },
        {
          headers: cors,
        }
      );
    } catch (error) {
      console.error(error);

      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Internal error",
        },
        {
          status: 500,
          headers: cors,
        }
      );
    }
  },
} satisfies ExportedHandler<Env>;