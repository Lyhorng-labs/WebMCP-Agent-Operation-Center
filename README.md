# Agent Operations Center

A web-based incident-response control room where a human engineer supervises an AI
agent investigating and resolving production incidents.

The agent does not chat about the incident. It uses WebMCP tools exposed by the page
to read live system state, gather evidence, form a diagnosis, propose a fix — and then
**blocks mid-tool-call until a human approves it**.

**Live demo:** https://web-mcp-agent-operation-center.vercel.app
**Requires:** ChatGPT desktop in-app browser, or Chrome 149+ with
`chrome://flags/#enable-webmcp-testing` enabled.

---

## The demo

Open the app. A production incident is already active:

```
INC-1847  Checkout success rate degraded          ACTIVE
started 8m ago · affected: checkout-api, payment-service

Checkout API      success 61.0%   errors 39.0%   p95 820ms  / 240 base
Payment Service   success 18.0%   errors 82.0%   p95 5200ms / 640 base
```

Ask the agent:

> Investigate the checkout outage and find the safest way to restore service.

The agent works through the page's tools — reading system status, comparing metrics to
baselines, correlating deployment timing, tracing service dependencies, and querying
logs. The dashboard reacts as it goes: service cards highlight as it inspects them, the
log panel narrows to its queries, and the activity feed records every call.

It then records a finding with cited evidence, and proposes a remediation plan. The plan
appears as an approval card, and **the agent's `propose_remediation` call is now suspended
mid-execution, waiting.** A human clicks APPROVE — that click applies the rollback — the
parked call resumes with the resulting state, and the agent verifies recovery.

The scenario includes a **decoy**: `auth-service` deployed 6 minutes ago — more recently
than the guilty `payment-service` deploy at 10 minutes. An agent that pattern-matches on
"newest deploy" gets it wrong. Getting it right requires combining deployment timing
against incident start, service health, and dependency direction.

## Why this is a strong fit for WebMCP

**The tools need to live in the page.** They aren't a wrapper over a REST API — they read
the same in-memory state the UI renders and they drive the UI as a side effect. Calling
`get_service_health` highlights that service's card. Calling `query_logs` applies the
agent's filter to the visible log panel. The human watches the agent think, in their own
interface, without a word of narration.

**Approval is a DOM interaction inside a tool call.** `propose_remediation` calls
`await awaitDecision(planId)` and suspends. The promise's `resolve` is held in a
module-level map that the APPROVE button reaches from a React `onClick`. A server-side
MCP server cannot do this — it has no button to wait on.

**The agent has no path to production.** It can propose; it cannot execute. The rollback
runs inside `approvePlan` — the click handler — so the human is literally the one who
changes system state. This also removes a failure mode we hit in testing: assistants
refuse to invoke destructive tools without re-confirming in chat, which stalled the
incident *after* permission had already been granted. Nothing to re-confirm now.

## What people and agents can do together that was difficult before

Agents that touch production are usually all-or-nothing: either they run read-only and a
human does the work, or they act autonomously and you audit afterwards. Neither is what
operations actually needs.

This app makes the middle case real:

- The agent investigates at machine speed across metrics, deploys, dependencies, and logs.
- Every conclusion is submitted through `record_finding` with **cited evidence**, so the
  human reviews reasoning rather than trusting a summary.
- Destructive actions are **structurally gated**: the agent proposes, and the action tool
  physically cannot proceed until a human clicks.
- Approval is **bound to specific arguments**. Approving a rollback to `v4.1.3` does not
  authorize a rollback to `v4.1.2` — `planMismatch` refuses any divergence, field by field.
- One approval buys exactly one execution. Replay is refused.

The human stays the decision-maker on anything irreversible, without becoming the
bottleneck on investigation.

## How WebMCP is implemented

Nine tools are registered on page load:

```js
document.modelContext.registerTool({
  name: "get_service_health",
  description:
    "Return current metrics for one service compared against its 7-day baseline. " +
    "Use to quantify how abnormal a service is. Does not diagnose a cause.",
  inputSchema: {
    type: "object",
    properties: {
      serviceId: {
        type: "string",
        description: "e.g. 'payment-service'. Get valid ids from get_system_status.",
      },
    },
    required: ["serviceId"],
    additionalProperties: false,
  },
  execute: async ({ serviceId }) => { /* ... */ },
});
```

See [`app/webmcp/tools.ts`](app/webmcp/tools.ts) for all nine.

### The tools

| Tool | Tier | Purpose |
|---|---|---|
| `get_system_status` | read | Orientation: incident + all services |
| `get_service_health` | read | Current metrics vs 7-day baseline |
| `get_recent_deployments` | read | Deploys with timing and rollback targets |
| `get_service_dependencies` | read | `dependsOn` / `dependedOnBy`, for blast radius |
| `query_logs` | read | Filtered log search; mirrors the filter into the UI |
| `record_finding` | write | Agent's conclusion + cited evidence |
| `propose_remediation` | **gate** | Renders the approval card and blocks until a human decides |
| `rollback_deployment` | act | Direct execution path; verifies the plan is approved, unused, and argument-identical |
| `verify_recovery` | read | Re-reads metrics; resolves the incident if healthy |

### Design decisions

**Read tools return evidence, never conclusions.** There is no `analyze_incident()`. No
tool tells the agent the root cause — it returns ratios (`p95Ms: 8.13x baseline`) and lets
the agent reason. Diagnosis happens in the model, not in a hardcoded branch, which is what
makes the demo real rather than scripted.

**Errors are returned, not thrown.** An unknown `serviceId` returns
`{ error, knownIds: [...] }`. The agent self-corrects on the next call instead of
dead-ending.

**Every tool call is logged automatically.** A `defineTool()` wrapper handles activity
logging, error trapping, and result shaping in one place, so all nine behave identically.

**Timeouts degrade into retries.** If nobody approves within 45 seconds,
`propose_remediation` returns `status: "awaiting_approval"` with instructions to try
again — the plan stays live and a later call resolves instantly once approved. No tool
call waits unbounded, which matters because the host has its own timeout.

**Approval is bound to exact arguments.** `planMismatch` compares every approved
parameter field by field, and a used plan is terminal. Approving a rollback to `v4.1.3`
authorizes that and nothing else; replay is refused.

### Notes on Chrome 149's WebMCP implementation

Verified by inspection, since the API is not yet documented:

```js
Object.getOwnPropertyNames(Object.getPrototypeOf(document.modelContext))
// ['ontoolchange', 'executeTool', 'getTools', 'registerTool', 'constructor']
```

- **There is no `unregisterTool`.** Registration is one-way for the document's lifetime.
  Because React StrictMode remounts effects and Fast Refresh replaces modules while the
  browser's registry persists, a `window`-level flag is the only reliable guard against
  `InvalidStateError: Duplicate tool name`.
- **`executeTool(tool, args)` takes a `RegisteredTool` handle from `getTools()`, not a
  name**, and `args` must be a **JSON string** — an object throws
  `UnknownError: Failed to parse input arguments`. The return value is also a JSON string.
  Tool bodies are unaffected: the browser parses the string before calling `execute`.

These are recorded in [`app/webmcp/webmcp.d.ts`](app/webmcp/webmcp.d.ts).

## Architecture

```
HUMAN ──> Operations Center (Next.js)
               │
          WebMCP Tool Layer  (document.modelContext)
               │
   ┌───────┬───┴───┬───────────┬──────────────┐
 Status  Health  Deploys     Logs        Dependencies
   └───────┴───────┴───────────┴──────────────┘
               │
          (agent reasoning)
               │
        record_finding ──> propose_remediation ──┐
                                                 │ blocks
        HUMAN APPROVAL ←─────────────────────────┘
          the click applies the rollback and resolves the parked promise
               │
               └──> verify_recovery
```

State lives in a single in-memory store (`app/lib/ops/`) exposed to React through
`useSyncExternalStore`. Tools mutate the store; panels subscribe. The UI never calls a
tool — data flows one way, so the dashboard cannot drift out of sync with what the agent
did.

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in a WebMCP-enabled browser. The header shows
`9/9 WebMCP tools registered` when the API is available.

For development there is a console helper:

```js
__ops.list()                                                  // registered tool names
await __ops.call("get_service_health", { serviceId: "payment-service" })
await __ops.callViaBrowser("get_service_health", { serviceId: "payment-service" })
```

`call` runs the local implementation; `callViaBrowser` goes through
`document.modelContext.executeTool` — the same path an agent takes.

> After editing `tools.ts`, hard-reload (`Cmd+Shift+R`). Fast Refresh cannot update the
> browser's tool registry.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · WebMCP

## License

MIT — see [LICENSE](LICENSE).
