# Allica GTM Pipeline — Candidate Submission

## Quick Start

**Requirements:** Docker, Docker Compose, an [OpenRouter](https://openrouter.ai) API key.

**Hosted deployment:**

- App: `https://gtm.pavandongare.com`
- Supabase Studio: `https://gtm-studio.pavandongare.com` (protected behind server-side basic auth)

```bash
cd solution
cp .env.example .env
# Set OPENROUTER_API_KEY in .env
docker compose up --build
```

Open **http://localhost:3000** and click **Run Pipeline**.

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Supabase Studio | http://localhost:54323 |

**Eval suite** (backend running, at least one run completed):

```bash
cd solution/backend && node evals/runner.js
```

---

## Candidate — Problem and Design Framing

### 1. Problem Interpretation

Allica's inbound GTM flow is currently handled manually: a person reads a form submission, cross-checks basic eligibility, decides which team should own it, and writes a first-touch email. Most of that work is repetitive and rule-bound enough to automate reliably. The part that is not is interpreting the free-text notes — detecting risk signals expressed in natural language, understanding what the business actually needs, and writing an email that sounds like it came from a person who read their submission.

The right first version is a system that handles the deterministic decisions automatically (deduplication, validation, enrichment, threshold-based routing, compliance checks) and uses a language model only where genuine text understanding is needed. A good outcome for this version is that a GTM manager can load a batch of leads, see immediately why each one was routed where it was, and send the generated email with minimal editing — all without touching code.

### 2. Metrics and Constraints

**Primary metric: first-pass routing accuracy.** A lead routed to the wrong queue wastes human time in one of two directions: a good lead sits unworked in Triage, or a flagged lead goes to Growth-Inbound and receives outreach it should not. Routing accuracy is the single measure that captures whether the pipeline is actually useful.

**Guardrail 1: rate of emails generated for flagged leads.** This should be zero. The pipeline is designed so that any lead with red flags detected routes to Manual Review before the email stage is even reached. If this rate is non-zero, the red-flag detection has a gap.

**Guardrail 2: rate of ineligible leads auto-progressed.** Leads below £500k revenue or flagged for serious risk signals should not produce outreach. If they do, the hard gates or LLM interpretation is failing. This is the compliance equivalent of a false negative.

These two guardrails matter more than coverage. It is better to send fewer emails with high confidence than to send more emails with uncertain quality.

### 3. Tradeoffs Made Deliberately

**No deep credit risk modelling.** Revenue, sector, and company age are proxies for creditworthiness. Real underwriting uses management accounts, credit history, and asset valuations. The pipeline correctly routes to human review anything it cannot confidently assess rather than approximating signals it does not have.

**Stub enrichment only.** A live Companies House API call would give real-time status, director changes, and filing history. The stub covers the sample data well enough to demonstrate the enrichment-to-scoring path. The enrichment layer is an isolated module — swapping the stub for a real API is a one-file change.

**Known eligibility gaps and what closes them.** Several rules in `docs/eligibility.md` cannot be enforced automatically with the current data:

- *Director changes and mismatches* — the Companies House `/company/{number}/officers` and filing history endpoints provide this. Not in the stub. With a live integration, a deterministic check on director tenure and change frequency is straightforward.
- *Healthcare professional registration* — requires querying professional body registers (GMC, GDC, NMC) with a known registrant name and number. That data is not on the lead record. The appropriate handling is routing healthcare-sector leads to Manual Review and having a human verify registration as part of due diligence.
- *Manufacturing asset base, construction contract pipeline* — these require reviewing filed balance sheets and private contract records. No public API covers this reliably. These are credit analyst responsibilities, not pipeline automation. The sector scoring and Manual Review routing ensure the right leads reach the right people.
- *UK-based verification* — a Companies House match implicitly confirms UK registration. Unmatched leads that would otherwise reach Growth-Inbound are already overridden to Manual Review via the `enrichment_unverified` flag.

**Single pipeline configuration.** There is one editable config, not a pipeline-per-team or pipeline-per-product design. The schema supports multiple pipelines; the UI does not yet expose a selector.

**No multi-language support.** All leads and output are in English.

### 4. High-Level Architecture

The pipeline has two phases. Deduplication is a batch operation — you cannot detect a duplicate by looking at one lead in isolation — so it runs across all leads before any individual processing starts. After that, leads are processed concurrently with a concurrency cap.

```
POST /runs
    │
    ▼  202 Accepted — returns run_id immediately, does not wait
create run record in DB
    │
    ▼  background, non-blocking
┌──────────────────────────────────────────────────────────┐
│  PHASE 1 — BATCH PRE-PROCESSING  (sequential, all leads) │
│                                                          │
│  normalise all leads   (trim, coerce types, build keys)  │
│  deduplicate batch     (fuzzy match across all leads)    │
└──────────────────────────┬───────────────────────────────┘
                           │  labelled: first occurrence vs duplicate
                           ▼
┌──────────────────────────────────────────────────────────┐
│  PHASE 2 — PER-LEAD PROCESSING  (concurrent, cap = 3)    │
│                                                          │
│  slot 1 ──▶ [lead A: full pipeline] ──▶ write to DB      │
│  slot 2 ──▶ [lead B: full pipeline] ──▶ write to DB      │
│  slot 3 ──▶ [lead C: full pipeline] ──▶ write to DB      │
│  slot _ ──▶ (lead D waits for a free slot)               │
│  ...                                                     │
└──────────────────────────┬───────────────────────────────┘
                           │  all leads done
                           ▼
                    mark run = completed


GET /runs/:id  ◀──  frontend polls every 2s
                    returns run status + all lead results written so far
                    (UI updates lead-by-lead as each slot completes)
```

**Per-lead flow** (what runs inside each slot in Phase 2):

```
  duplicate? ─── yes ──▶  status=skipped, stop
      │ no
      ▼
  enrich  (Companies House stub — synchronous JSON lookup, no cost)
      │
      ▼
  injection check  (LLM, cheap model — guard before any notes reach an LLM)
      │ detected ──▶  Manual Review, stop
      │ LLM error ──▶  fail-open, continue  (blocking legitimate leads on a downed check is worse than missing an injection)
      │ clean
      ▼
  notes interpretation  (LLM — runs for all leads, including revenue failures)
      │ LLM error ──▶  Manual Review, stop  (cannot assess red flags without this; heuristics alone are not trusted)
      │                   triage handler needs real signals, not placeholders
      ▼
  revenue gate
      │ fail ──▶  Triage + notes in decision log, stop
      │ pass
      ▼
  compute ICP score  (revenue × 0.5 + sector × 0.3 + age × 0.2)
      │
      ▼
  routing decision  (thresholds + red flag override)
      │ Triage or Manual Review ──▶  stop, no email
      │ Growth-Inbound
      ▼
  email draft  (LLM)
      │
      ▼
  safety check  (structural → regex → LLM if both pass)
      │
      ▼
  write result to DB
```

The cap of 3 concurrent leads is configurable (`llm_concurrency_limit` in the pipeline config). Each Growth-Inbound lead makes up to 4 LLM calls (injection check, notes interpretation, email draft, safety review). Running all 10 sample leads without a cap would fire up to 40 simultaneous LLM calls and reliably hit provider rate limits.

---

## Candidate — Design Notes

### Scoring and Routing

The ICP score is a weighted sum of three signals, each normalised to a fraction within its dimension:

```
icp_score = (revenue_fraction × 0.5) + (sector_fraction × 0.3) + (age_fraction × 0.2)
```

The maximum possible score is 1.0 (all three signals at full credit). Changing the weights in config directly changes the maximum contribution per signal — the formula is linear and transparent.

**Why these three signals, and why these weights:**

Revenue (0.5) is dominant because it determines whether a meaningful loan is viable at all. A company with £600k revenue and a perfect sector profile is a weaker lead than a £5m company in a borderline sector — loan size and debt capacity are primarily revenue-driven. Sector (0.3) ranks second because it determines both product-market fit and default risk profile; a poor sector can disqualify an otherwise good lead. Company age (0.2) is a secondary filter: a three-year-old manufacturing company with £5m revenue is still a strong lead, but age is a real creditworthiness signal for the marginal cases.

**Revenue bands** (fractions, not absolute scores):

| Band | Range | Fraction | Rationale |
|---|---|---|---|
| below_target | < £500k | 0.0 | Hard gate — never reaches scoring |
| borderline | £500k–£1m | 0.2 | Eligible but at the low end; limited loan size |
| target | £1m–£10m | 0.8 | Allica's core SME market |
| strong | £10m–£50m | 1.0 | Larger opportunity, still within stated range |
| edge_case | > £50m | 0.4 | These companies typically have institutional banking access |

**Unverified revenue discount:** When Companies House enrichment finds no match, revenue is self-reported and may be overstated. A 15% discount (`unverified_revenue_multiplier: 0.85`) is applied to the revenue contribution only — not the total score. Sector and age already degrade naturally when enrichment fails (sector falls to 0.33 conservative prior, age scores 0.0), so a blanket multiplier on the total would double-penalise.

**Sector fractions:** Good sectors (Manufacturing, Healthcare, Construction, Logistics, Food & Beverage) → 1.0. Poor sectors (Technology, Startup) → 0.0. Unknown → 0.33. The 0.33 prior reflects that Allica's named good sectors are a subset of the full UK SIC taxonomy — the uninformed prior is below 0.5.

**Company age bands:** < 2 years → 0.0 (mirrors the UK lending standard of minimum 2 years trading). 2–5 years → 0.5 (adequate but not fully established). 5+ years → 1.0 (survived at least one business cycle).

**Routing thresholds** (from `gtm_playbook.md`):

| Score | Routing |
|---|---|
| > 0.5 | Growth-Inbound priority |
| 0.3 – 0.5 | Growth-Inbound standard |
| < 0.3 | Triage |
| Any red flag | Manual Review — overrides score entirely |

Red flags detected in the notes route to Manual Review regardless of ICP score. The score is still computed and stored — a reviewer can see that a flagged lead would have scored 0.9 but was pulled for review, which is useful context when the flag turns out to be a false positive.

**Expected scores for the sample leads** (sanity check):

| Lead | Revenue | Sector | Age | Score | Routing |
|---|---|---|---|---|---|
| Oxfordshire Bakery (£1.8m) | 0.40 | F&B 0.30 | est. 0.20 | 0.90 | Growth-Inbound priority |
| Northbridge Fabrication (£5.2m) | 0.40 | Mfg 0.30 | est. 0.20 | 0.90 | Growth-Inbound priority |
| Greenfield Dental (£1.4m) | 0.40 | Health 0.30 | est. 0.20 | 0.90 | Growth-Inbound priority |
| Oxfordshire Bakery duplicate | — | — | — | — | Skipped |
| Thames Valley Logistics | scored but irrelevant | — | — | — | Manual Review (red flag) |
| Artisan Coffee (£650k) | 0.10 | F&B 0.30 | est. 0.20 | 0.60 | Growth-Inbound priority |
| Precision Engineering (£3.2m) | 0.40 | Mfg 0.30 | est. 0.20 | 0.90 | Growth-Inbound priority |
| Startup Ventures (£200k) | — | — | — | null | Triage (hard gate) |
| Countryside Vet (£1.9m) | 0.40 | Health 0.30 | est. 0.20 | 0.90 | Growth-Inbound priority |
| Heritage Construction (£12m) | 0.50 | Const 0.30 | est. 0.20 | 1.00 | Growth-Inbound priority |

### Why the Pipeline is Asynchronous

Each lead makes between 1 and 4 LLM calls depending on how far it progresses. Holding one HTTP request open while processing a full batch is impractical — at 2–15 seconds per call, a synchronous endpoint would routinely timeout.

The API keeps one primary write path for starting the workflow: `POST /runs`. That call creates a run, returns HTTP 202 immediately, and lets the backend continue processing in the background. `GET /runs/:id` gives the UI a stable way to read progress and results as they are persisted. This keeps the main interaction simple while making the system practical to operate: the job continues if the page refreshes, and persisted runs remain available through the history view even if the active Run tab is no longer attached to the in-flight run.

The efficiency improvement is twofold:

- **Concurrency is used** so independent leads do not wait on each other unnecessarily.
- **Concurrency is capped** (`llm_concurrency_limit`, default `3`) so the system does not fan out dozens of simultaneous LLM calls and immediately run into provider rate limits or unstable latency.

If this had been implemented as one synchronous request that waited for the final response, even a moderate batch would produce poor UX and unreliable request times. The current shape keeps the API small while fitting the behavior of a long-running workflow.

### Safety and Compliance

The safety layer runs in three steps:

1. **Structural check** — deterministic: word count (110–170 words), and whether pricing language appears without the required disclaimer. Fast, no LLM. Fails immediately if violated.
2. **Regex check** — scans for exact prohibited phrases (`guaranteed approval`, `24 hours`, `lowest rates`, etc.). Also fast and free. If any match, the email is flagged — no LLM call.
3. **LLM compliance review** — runs only if both steps above pass (saves tokens on clearly bad emails). Checks for subtle violations: implied certainty of approval, implicit timelines, phrasing that contradicts a red flag detected for this lead, and whether exactly one call to action is present.

Emails that fail safety are not removed from the output. The violation is surfaced alongside the email so a reviewer can verify the flag. Silently dropping the email would obscure whether the generation model is drifting toward unsafe phrasing over time.

### How an Operator Inspects or Overrides Decisions

Every lead result includes a `decision_log` with gate results, notes interpretation, and a plain-English routing reason. The UI surfaces this per lead — a reviewer can see exactly why a lead was routed where it was without reading code or querying the database.

For overrides: `PATCH /runs/:runId/results/:resultId` accepts a routing decision and a required reason string. The original pipeline output is preserved; the override sits alongside it. Both are visible in the UI. This gives a full audit trail — what the pipeline decided, what the human changed it to, and why.

The UI currently has two distinct operational views:

- `Run History` is the audit trail, grouped by run.
- `Latest Leads` is the current-state view, showing the latest stored result per lead ID.

The latest-leads view is implemented now because the stored `decision_log`, flags, and score breakdown are usually enough to understand why a lead passed or failed. Full config versioning is still future scope: each run already stores a `config_hash`, but not a full config snapshot or numbered config version.
For aggregated monitoring of the primary metric over time, the next UI addition should be an analytics view over the existing Postgres data rather than separate observability infrastructure. The underlying data is already persisted per lead and per run; what is missing is a simple aggregated view for operators.

### Failure Modes

| Failure | Handling |
|---|---|
| LLM error (notes interpretation) | Retry once; on second failure route to **Manual Review** — red flags cannot be assessed without the LLM |
| LLM error (injection check) | Fail-open — retry once, then continue. Blocking a legitimate lead is worse than missing an edge case |
| LLM returns malformed JSON | Retry once; on second failure treated same as HTTP error for that stage |
| Enrichment file missing | Falls back to `confidence: 0.0`, uses `sector_hint` from lead if present |
| Lead missing `id` or `company_name` | Flagged `invalid_input`, skipped |
| Accidental repeat click in one open UI session | `Run Pipeline` is disabled while the current run is starting or processing |
| Per-lead processing error | Written to DB as `status: 'failed'`; does not affect other leads in the run |
| DB unavailable at startup | Retries with backoff (10 attempts, 2s interval) |

### What Would Come Next

- **Lightweight analytics view in the existing UI** — per-lead decisions and run history are already persisted in Postgres, so the next step is an aggregated operator view rather than new infrastructure. This should show routing distribution over time, Manual Review rate, safety pass/fail rate, average ICP score per run, and red-flag detection rate.
- **Live Companies House integration** — the enrichment module is isolated; swapping the stub for a real API is a one-file change. This unlocks director change checks and real-time company status.
- **Full config versioning / snapshots** — runs already store a `config_hash`. The next step is storing explicit config versions or full config snapshots so historical results and the `Latest Leads` view can show the exact config that produced a decision.
- **Push-based progress updates instead of polling** — the current UI polls because it is the simplest reliable review-time implementation. At larger scale, the backend should publish run progress via Server-Sent Events or WebSockets so the frontend is notified as leads complete rather than repeatedly polling `GET /runs/:id`.
- **Backend idempotency for run submission** — the current UI prevents the obvious double-click case in one browser session, but repeated submits across tabs, refreshes, or direct API calls still create new runs. The next step is an idempotency key or short-window duplicate-run suppression on `POST /runs`.
- **Pagination for read APIs and operator views** — `GET /runs`, `GET /runs/:id`, and `GET /lead-results/latest` are fine at assignment scale, but a production operator console should page large histories and large per-run result sets instead of returning everything in one response.
- **Queue-based processing** — for larger batches, `POST /runs` becomes a job producer and worker processes consume per-lead jobs from Redis/BullMQ or SQS. The DB schema needs no changes.
- **Feedback loop** — capture sales outcomes (contacted / converted / declined) and link them back to pipeline runs. This closes the loop for calibrating score weights and eventually replacing the heuristic ICP score with a trained model.
- **GDPR-compliant PII handling** — field-level encryption for contact name, defined retention policy, right-to-erasure. Pre-production requirement for a financial services context.

---

## Response Structure

Every lead result in `GET /runs/:id → results[]`:

**Completed lead:**
```json
{
  "result_id": "2a53c7e9-...",
  "id": "L-2001",
  "company_name": "Oxfordshire Bakery Ltd",
  "status": "completed",
  "valid": true,
  "duplicate_of": null,
  "enrichment": {
    "matched": true,
    "confidence": 1.0,
    "company_number": "08976543",
    "status": "active",
    "incorporated_on": "2014-05-12",
    "company_age_years": 11.9,
    "sic_codes": ["10710"],
    "sector": "Food & Beverage",
    "address": "12 High St, Oxford OX1 1AA"
  },
  "icp_score": 0.9,
  "routing": "Growth-Inbound",
  "routing_priority": "priority",
  "flags": [],
  "score_breakdown": {
    "revenue": 0.4,
    "sector": 0.3,
    "company_age": 0.2,
    "final_icp_score": 0.9,
    "revenue_verified": true,
    "age_available": true
  },
  "decision_log": {
    "gate_results": {
      "email_valid": true,
      "is_duplicate": false,
      "revenue_gate": "£1,800,000 — target band, passed",
      "company_status": "active — passed"
    },
    "notes_interpretation": {
      "business_need": "equipment upgrade financing",
      "red_flags": [],
      "llm_reasoning": "Standard equipment finance enquiry. No risk signals."
    },
    "routing_reason": "ICP score 0.9 > 0.5 threshold → Growth-Inbound priority"
  },
  "email": {
    "subject": "Supporting Oxfordshire Bakery's equipment upgrade",
    "body": "Dear Amelia,\n\n...",
    "safety_passed": true,
    "safety_violations": [],
    "safety_reasoning": "Passed all checks."
  },
  "from_cache": false
}
```

**Skipped (duplicate):**
```json
{
  "id": "L-2004",
  "company_name": "Oxfordshire Bakery Ltd",
  "status": "skipped",
  "duplicate_of": "L-2001",
  "flags": ["duplicate"],
  "decision_log": {
    "gate_results": {
      "is_duplicate": true,
      "duplicate_of": "L-2001",
      "reason": "Same company_name and website as L-2001"
    }
  },
  "email": null
}
```

**`status` values:** `completed` — pipeline ran to completion (may still have flags). `skipped` — duplicate. `failed` — unhandled error. `invalid_input` — missing required `id` or `company_name`.

**`icp_score`:** `null` when a hard gate fails or the lead is skipped. Numeric 0–1 otherwise.

**`email`:** `null` for Triage, Manual Review, or when drafting failed. When present, `safety_passed: false` means the email was generated but contains violations — included for reviewer inspection, not silently dropped.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | Express + Node.js | Straightforward, same language as frontend |
| Frontend | React + Vite + Tailwind | Fast to build a readable reviewer UI |
| Database | Postgres 15 | Structured schema, clear foreign keys, queryable across runs |
| DB admin | Supabase Studio | Visual database browser, no extra setup |
| LLM | OpenRouter via `openai` npm package | Single API key, model switching without code changes |

---

## Candidate — Honest Assessment

### ✅ Everything required by the brief

**Part A — Problem and design framing**
- ✅ Problem interpretation (3–5 sentences)
- ✅ Primary success metric + guardrail metrics with rationale
- ✅ Explicit tradeoffs and what was deliberately left out
- ✅ High-level architecture with per-component responsibilities

**Part B — Functional requirements**
- ✅ HTTP endpoint accepting a leads array (defaults to `leads_small.json` if omitted)
- ✅ Per-lead output: id, company name, validation result, enrichment, ICP score, routing, email, flags
- ✅ Deduplication — exact and fuzzy match on company name + website
- ✅ Email validation
- ✅ Invalid leads marked and explained
- ✅ Enrichment from `companies_house_stub.json` — company number, status, SIC codes, sector, company age
- ✅ Eligibility and routing rules from `docs/eligibility.md` and `docs/gtm_playbook.md`
- ✅ ICP score (0–1), weighted and explainable
- ✅ Routing: Growth-Inbound / Triage / Manual Review / Declined
- ✅ First-touch email draft using LLM — company name, inferred business need, sector-appropriate angle
- ✅ Email respects tone and safety rules from the playbook
- ✅ Exactly one call to action enforced and checked
- ✅ Safety: no guaranteed approval, fixed timelines, invented pricing, or contradiction of red flags
- ✅ Response structure documented in this README

**Part C — Non-functional**
- ✅ Modules are focused and readable — one responsibility per file
- ✅ All scoring weights and thresholds are config-driven with written rationale, not magic numbers
- ✅ Non-engineers can run and inspect the system (UI at `http://localhost:3000`)
- ✅ Eval suite with 10 named cases covering routing, flags, email content, and deduplication

**Deliverables**
- ✅ Public GitHub repository
- ✅ Quick Start in README
- ✅ Design Notes covering all five required topics

---

### Additional Implementation Choices

The brief asked for a small runnable service and a simple way for an operator to inspect outputs. The components below are all in support of that same workflow:

| Addition | Why |
|---|---|
| React UI (Run, History, Config tabs) | A static page hitting one endpoint cannot show per-lead results, run history, or live config editing. The UI makes the pipeline inspectable without touching the API directly. |
| PostgreSQL + run persistence | Async processing requires somewhere to write results as they arrive. Postgres gives a real audit trail and makes the operator override endpoint meaningful. |
| Live config editing via UI | The brief emphasises grounded, explainable decisions. Letting a non-engineer adjust weights and thresholds without a code deploy is the natural completion of that requirement. |
| Operator override endpoint | The brief asks how an operator would inspect or override decisions. The endpoint is the answer implemented, not just described. |
| Prompt injection detection | Free-text notes are an LLM input surface. A pre-check before notes reach any model is a minimal responsible default for a financial services context. |
| Three-layer safety check | Structural → regex → LLM in sequence. The brief asked for "basic safety." This adds cost-efficiency without adding complexity to the pipeline flow. |
| Fuzzy deduplication | The brief specifies "same company and website." Fuzzy matching catches near-duplicates that exact matching misses in noisy intake data. |
| Eval suite (10 cases) | The brief calls a couple of checks "a plus." Named cases with structured assertions are more useful for regression testing than ad-hoc examples. |
| Docker Compose full stack | One `docker compose up --build` gets a reviewer to a running system without manual Postgres setup. |

---

### ❌ What was not implemented — and the reason

**Five eligibility rules from `docs/eligibility.md` are not automatically enforced:**

| Rule | Why it was not automated |
|---|---|
| Director mismatches and significant director changes (last 6 months) | Requires the Companies House `/company/{number}/officers` and filing history endpoints. Not in the stub. With a live integration this is a straightforward deterministic check. |
| Healthcare professional registration verification | Requires querying GMC, GDC, or NMC registers with a registrant name and number. That data is not on the lead record. There is no blanket healthcare → Manual Review rule in the pipeline. The compensating control is notes interpretation: if the LLM detects a risk signal related to registration or practice ownership, the red flag routes the lead to Manual Review. Without a signal, a healthcare lead with good revenue and age scores normally. |
| Construction contract pipeline and stability | Requires private contract records. No reliable public API exists. This is credit analyst scope, not pipeline automation. No dedicated construction routing rule exists in the pipeline — a healthy construction lead scores on revenue, sector, and age like any other. |
| Manufacturing asset-base assessment | Same — requires filed balance sheets and asset valuations. No dedicated manufacturing routing rule. A manufacturing lead with good signals scores well and routes to Growth-Inbound; the credit analyst assesses assets as part of standard due diligence. |
