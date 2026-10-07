import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API_URL = "https://incidentlens-api.shreyanshtandon3.workers.dev";

type Incident = {
  id: string;
  report: string;
  status: string;
  result: string | null;
  created_at: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

const SAMPLE_LOGS = `10:31:01 INFO GET /api/users 200 42ms
10:31:02 INFO GET /api/users 200 39ms
10:31:03 WARN GET /api/login 500 1200ms
10:31:04 ERROR POST /api/login 500
10:31:05 ERROR DB connection timeout
10:31:06 ERROR POST /api/login 500
10:31:07 ERROR DB connection timeout
10:31:08 ERROR POST /api/login 500
10:31:09 WARN Database connection pool exhausted
10:31:10 ERROR POST /api/login 500
10:31:11 ERROR DB connection timeout`;

function App() {
  const [logs, setLogs] = useState("");
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answerLoading, setAnswerLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyzeLogs() {
    if (!logs.trim()) {
      setError("Please paste some logs first.");
      return;
    }

    setError("");
    setLoading(true);
    setIncident(null);
    setMessages([]);

    try {
      const response = await fetch(`${API_URL}/api/incidents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ logs }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze logs");
      }

      setIncidentId(data.incidentId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!incidentId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/incidents/${incidentId}`
        );

        const data = await response.json();

        if (cancelled) return;

        setIncident(data.incident);
        setMessages(data.messages || []);

        if (data.incident?.status === "complete") {
          setLoading(false);
          return;
        }

        setTimeout(poll, 2000);
      } catch {
        if (!cancelled) {
          setError("Unable to retrieve incident status.");
          setLoading(false);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  async function askQuestion() {
    if (!incidentId || !question.trim()) return;

    setAnswerLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/incidents/${incidentId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: question,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get answer");
      }

      setMessages((current) => [
        ...current,
        {
          role: "user",
          content: question,
          ts: Date.now(),
        },
        {
          role: "assistant",
          content: data.answer,
          ts: Date.now(),
        },
      ]);

      setQuestion("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setAnswerLoading(false);
    }
  }

  function reset() {
    setLogs("");
    setIncidentId(null);
    setIncident(null);
    setMessages([]);
    setLoading(false);
    setError("");
    setQuestion("");
  }

  const isComplete = incident?.status === "complete";

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="brand">IncidentLens</div>
          <div className="subtitle">
            AI-powered log investigation
          </div>
        </div>

        {incidentId && (
          <div className="incident-id">
            {incidentId}
          </div>
        )}
      </header>

      <main className="container">
        {!incidentId ? (
          <section className="submit-screen">
            <div className="hero">
              <span className="eyebrow">AI INCIDENT RESPONSE</span>

              <h1>
                Submit your logs.
                <br />
                <span>Find out what happened.</span>
              </h1>

              <p>
                IncidentLens analyzes application and server logs,
                identifies abnormal patterns, investigates possible
                causes, and produces an incident report.
              </p>
            </div>

            <div className="card log-card">
              <div className="card-header">
                <div>
                  <h2>Log Submitter</h2>
                  <p>
                    Paste application, server, or infrastructure logs
                    below.
                  </p>
                </div>

                <button
                  className="secondary-button"
                  onClick={() => setLogs(SAMPLE_LOGS)}
                >
                  Use example
                </button>
              </div>

              <textarea
                value={logs}
                onChange={(e) => setLogs(e.target.value)}
                placeholder={`Paste logs here...

Example:
10:31:01 INFO GET /api/users 200 42ms
10:31:04 ERROR POST /api/login 500
10:31:05 ERROR DB connection timeout`}
              />

              <div className="submit-row">
                <span className="log-count">
                  {logs.length.toLocaleString()} characters
                </span>

                <button
                  className="primary-button"
                  onClick={analyzeLogs}
                  disabled={!logs.trim()}
                >
                  Analyze Logs →
                </button>
              </div>
            </div>

            {error && <div className="error">{error}</div>}
          </section>
        ) : (
          <section className="dashboard">
            <div className="dashboard-top">
              <div>
                <span className="eyebrow">INCIDENT INVESTIGATION</span>
                <h1>Incident {incidentId}</h1>
              </div>

              <button
                className="secondary-button"
                onClick={reset}
              >
                New Analysis
              </button>
            </div>

            <div className="status-card">
              <div className="status-icon">
                {isComplete ? "✓" : "⋯"}
              </div>

              <div>
                <strong>
                  {isComplete
                    ? "Investigation complete"
                    : "Investigating logs..."}
                </strong>

                <p>
                  {isComplete
                    ? "IncidentLens has completed the AI investigation."
                    : "The workflow is extracting signals and investigating the incident."}
                </p>
              </div>
            </div>

            {loading && !isComplete && (
              <div className="pipeline">
                <div className="pipeline-step active">
                  <span>01</span>
                  Extracting log signals
                </div>

                <div className="pipeline-line" />

                <div className="pipeline-step active">
                  <span>02</span>
                  Investigating with AI
                </div>

                <div className="pipeline-line" />

                <div className="pipeline-step">
                  <span>03</span>
                  Generating report
                </div>
              </div>
            )}

            {isComplete && incident.result && (
              <>
                <div className="result-card">
                  <div className="result-header">
                    <div>
                      <span className="eyebrow">AI ASSESSMENT</span>
                      <h2>Incident Report</h2>
                    </div>

                    <span className="complete-badge">
                      COMPLETE
                    </span>
                  </div>

                  <div className="result-content">
                    <pre>{incident.result}</pre>
                  </div>
                </div>

                <div className="chat-card">
                  <div className="card-header">
                    <div>
                      <h2>Ask IncidentLens</h2>
                      <p>
                        Ask questions about this investigation.
                      </p>
                    </div>
                  </div>

                  {messages.filter(
                    (m) =>
                      m.role === "user" &&
                      !m.content.startsWith("Submitted logs:")
                  ).length > 0 && (
                    <div className="messages">
                      {messages
                        .filter(
                          (m) =>
                            m.role === "user" &&
                            !m.content.startsWith(
                              "Submitted logs:"
                            )
                        )
                        .map((message, index) => (
                          <div
                            className="message"
                            key={index}
                          >
                            <div className="message-user">
                              You
                            </div>
                            <div>{message.content}</div>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="question-row">
                    <input
                      value={question}
                      onChange={(e) =>
                        setQuestion(e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          askQuestion();
                        }
                      }}
                      placeholder="Why was this classified as high severity?"
                    />

                    <button
                      className="primary-button"
                      onClick={askQuestion}
                      disabled={
                        answerLoading || !question.trim()
                      }
                    >
                      {answerLoading ? "..." : "Ask"}
                    </button>
                  </div>

                  {messages
                    .filter(
                      (m) =>
                        m.role === "assistant" &&
                        !m.content.startsWith(
                          "Final AI Analysis:"
                        ) &&
                        !m.content.startsWith(
                          "AI Investigation:"
                        ) &&
                        !m.content.startsWith(
                          "Extracted log signals:"
                        )
                    )
                    .slice(-3)
                    .map((message, index) => (
                      <div
                        className="answer"
                        key={index}
                      >
                        <strong>IncidentLens</strong>
                        <p>{message.content}</p>
                      </div>
                    ))}
                </div>
              </>
            )}

            {error && <div className="error">{error}</div>}
          </section>
        )}
      </main>

      <footer>
        IncidentLens · Cloudflare Workers AI · Workflows · Durable Objects
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);