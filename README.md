# Allica - Senior FullStack Engineer - AI (GTM) Take Home

## Candidate - Reviewer Start Here

My runnable submission lives in [`solution/`](solution/).

I kept the implementation isolated there because I used a separate stack from the starter scaffold in this repo. For review, start with:

- [`solution/README.md`](solution/README.md)
- [`solution/docker-compose.yml`](solution/docker-compose.yml)

Hosted URLs:

- App: `https://gtm.pavandongare.com`
- Studio: `https://gtm-studio.pavandongare.com`

Everything else in this root repo is the provided assignment material unless explicitly referenced from `solution/`.

## Context

Allica serves established UK businesses that need specialist lending, often discovered through inbound interest (forms, referrals, events). Today, much of that inbound traffic is reviewed by humans who:

- Clean up messy input
- Check basic eligibility and risk
- Decide who should own the lead
- Write a tailored first touch email

Your job in this exercise is to design and implement a very small first version of an assistant that helps with that flow.

We are not looking for a perfect production system. We are looking for clear thinking about the problem, a pragmatic design, and a small but coherent implementation.

---

## Timebox

Aim for **3-5 focused hours**.

We do not expect everything to be finished or polished. If you run out of time, prefer a smaller, end to end slice with good reasoning over half finished features.

Please note what you would do next if you had another 1-2 days.

---

## Your Task

You will deliver two things:

1. **Problem and system framing (roughly 1 page in the README)**
2. **A small end to end implementation that processes inbound leads and produces:
   - a prioritisation signal per lead
   - a routing decision
   - an optional first touch email draft**

You are free to choose your languages, libraries, and hosting (if any), as long as we can run your solution.

---

## Data and materials

The repository contains:

- `data/leads_small.json`  
  Sample inbound leads. Includes noise such as duplicates and invalid data.

- `data/companies_house_stub.json`  
  Mocked external company registry with basic details (status, SIC codes, incorporation date, address).

- `docs/eligibility.md`  
  Simplified eligibility and risk notes.

- `docs/gtm_playbook.md`  
  GTM and messaging guidance: tone of voice, sector hints, routing rules.

You may assume these are roughly representative of the real world system, but simplified.

---

## Part A - Problem and design framing

Add a section to this README titled **"Candidate - Problem and design framing"** and answer the following in your own words (bullet points are fine):

1. **Problem interpretation**  
   In 3 to 5 sentences, describe what you think this assistant should do for Allica and for the GTM team. What does a "good" outcome look like for this first version?

2. **Metrics and constraints**  
   Pick:
   - one primary success metric for this system (for example, proportion of leads that are correctly routed on first pass), and
   - one or two guardrail metrics (for example, rate of unsafe messages, proportion of obviously ineligible leads that are still auto progressed).  

   Explain briefly why you chose them.

3. **Main tradeoffs you are making**  
   In this timebox, what are you *deliberately* not solving? Examples could be: deep credit risk modelling, complex UI, multi language support. Explain which constraints led you to that choice (time, complexity, risk, etc).

4. **High level architecture**  
   Sketch your solution at a high level. This can be a diagram or a short list of components, for example:
   - HTTP entrypoint
   - lead cleaning and validation
   - enrichment layer
   - scoring and routing
   - email drafting  
   For each component, note its main responsibility in one sentence.

This section is part of the evaluation. We are looking for clear problem understanding and sensible scoping.

---

## Part B - Functional requirements

Implement a small service that exposes **one HTTP endpoint** and runs a pipeline over the provided data.

### 1. API

Create an endpoint, for example:

- `POST /run`

with a JSON body of the form:

```json
{
  "leads": [
    {
      "id": "L-2001",
      "company_name": "Oxfordshire Bakery Ltd",
      "contact_name": "Amelia Shaw",
      "email": "amelia.shaw@example.com",
      "website": "https://oxonbakery.example",
      "employees": 18,
      "annual_revenue_gbp": 1800000,
      "notes": "Inbound form: equipment upgrade financing."
    }
  ]
}
```

If `leads` is omitted, you may default to `data/leads_small.json`.

The endpoint should return JSON containing, for each processed lead:

- original lead id and company name
- whether the lead passed basic validation
- any enrichment you used (for example the company number and status)
- a prioritisation or ICP signal between 0 and 1, or a simple priority rank
- a routing decision (for example which team or queue should own this)
- if you generate an email:
  - subject line
  - body text
- any safety or compliance flags you consider important

You can choose the exact field names, but **document the response structure** in the README.

### 2. Pipeline behaviour

Your pipeline should, at minimum:

1. **Deduplicate and validate leads**

   - Use a simple heuristic to spot obvious duplicates (for example, same company and website).
   - Validate email shape.
   - Mark or drop leads that clearly cannot be processed, and explain that choice in your design notes.

2. **Enrich with registry data**

   - Join to `companies_house_stub.json` when possible.
   - Use a small subset of fields that you believe matter for routing or messaging (for example, status, SIC, age).

3. **Apply eligibility and routing rules**

   - Use the notes in `docs/eligibility.md` and `docs/gtm_playbook.md` to:
     - flag clearly ineligible or risky leads,
     - compute a simple ICP or priority score,
     - decide who should own the lead (for example, Growth Inbound vs Triage vs Manual review).

   You are free to choose between a simple rule based approach, a numeric score, or a hybrid. The important part is that the decision is **explainable**.

4. **Optional: draft a first touch email**
   If you have time, use an LLM (or a template if you prefer) to generate a short first touch email that:

   - uses the company name,
   - reflects a plausible business need from the notes and enrichment,
   - respects the tone and safety rules in `docs/gtm_playbook.md`,
   - contains exactly one clear call to action.

   If you do not implement email drafting, describe in your Design Notes how you would do it.

5. **Basic safety**
   Ensure that your output does not:

   - promise guaranteed approval or fixed timelines,
   - invent specific pricing or terms,
   - contradict obvious red flags from `docs/eligibility.md`.

   Explain in your Design Notes how you enforce or check this.

---

## Part C - Non functional expectations

Within the timebox, aim for:

- **Clarity over completeness**  
  Modules and functions that are easy to read, rather than overly generic abstractions.

- **Grounded decisions**  
  Scoring and routing logic that can be explained from the data and docs, not magic thresholds with no rationale.

- **Operability**  
  A simple way for a non engineer to run the system and inspect outputs (for example a CLI or the included static HTML page hitting your endpoint).

We do not require heavy tests, but a couple of small checks or examples (unit tests or scripted checks) are a plus.

---

## Deliverables

Please provide:

1. **Code and assets**

   - A **public GitHub repository**.
   - Clear instructions in this README for running the service locally.
   - Optional: a hosted URL where we can try the endpoint and simple UI.

2. **README additions**

   - The **Problem and design framing** section from Part A.
   - A **Quick Start** section with the exact commands to set up and run your solution.
   - A **Design Notes** section.

3. **Design Notes (about 400-800 words total)**
   In a section titled **"Candidate - Design Notes"**, please cover:

   1. **Scoring and routing**
   2. **Use of AI vs deterministic logic**
   3. **Safety and compliance**
   4. **How an operator would inspect or override decisions**
   5. **What you would do next with another 1-2 days**

---

## Submission

- Keep the solution small, runnable, and easy to review.
- Document any assumptions clearly.
- If something is incomplete, say so directly.
