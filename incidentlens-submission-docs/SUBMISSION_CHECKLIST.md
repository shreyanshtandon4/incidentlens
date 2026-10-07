# Submission Checklist

## Code

- [ ] Worker builds without TypeScript errors.
- [ ] Frontend builds successfully.
- [ ] Local log submission works.
- [ ] Workflow reaches `complete`.
- [ ] Final incident report appears.
- [ ] Follow-up question works.
- [ ] Durable Object memory is demonstrated.

## Cloudflare

- [ ] `npx wrangler login`
- [ ] Worker deployed with `npx wrangler deploy`
- [ ] Frontend API URL changed from localhost to deployed Worker URL.
- [ ] Frontend built with `npm run build`.
- [ ] Pages project created.
- [ ] Frontend deployed with `npx wrangler pages deploy dist --project-name incidentlens`.
- [ ] Public frontend tested against public Worker.

## Submission files

- [ ] `README.md`
- [ ] `AI_PROMPT_HISTORY.md`
- [ ] `ARCHITECTURE.md`
- [ ] `DEMO_SCRIPT.md`
- [ ] `SUBMISSION_CHECKLIST.md`
- [ ] sample logs

## Final demo

Show this sequence:

1. Paste/use example logs.
2. Analyze Logs.
3. Show Workflow/progress.
4. Show AI incident report.
5. Ask a follow-up question.
6. Explain Workers + Workers AI + Workflows + Durable Objects + Pages.

## Do not spend time adding

- Authentication
- Real-time telemetry
- Voice
- R2
- Vectorize
- AI Search
- Complex file upload
- Multi-user permissions

Those are future improvements, not required for the core demonstration.
