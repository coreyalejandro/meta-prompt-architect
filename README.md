# Meta-Prompt Architect

A structured prompt engineering and evaluation platform. Transforms vague user intent into hardened, machine-executable instruction sets using a recursive three-phase pipeline — audit, stress-test, synthesis.

Live app: https://ai.studio/apps/34d58bd0-0f42-4058-b4ab-265711ccde10

---

## Relevance to AI Safety

Prompt pipelines are an evaluation and governance surface. A system that cannot audit its own instruction quality cannot be reliably aligned. Meta-Prompt Architect operationalizes intent-to-instruction fidelity as a measurable, reproducible engineering artifact rather than a trial-and-error craft.

---

## Implemented Pipeline

```
User Intent
    |
    v
[1] Environmental Scan (Audit)
    - Identifies implicit assumptions and edge cases
    - Surfaces the Truth Surface: required external data not present in the prompt
    |
    v
[2] Stress-Test (Dialectical)
    - Simulates Critic + Logic Specialist adversarial roles
    - Finds vulnerabilities in intent before synthesis
    |
    v
[3] Synthesis (The Executable)
    - Produces hardened instruction set with system role, cognitive stack, binary verification gates
    - Recursive Retrospective: analyzes failed AI steps, updates build contract
```

---

## Developer Tooling

- **Linear Context Injection (LCI)** - token squeezing for context window efficiency
- **Cognitive Load Monitor** - real-time reasoning density tracking, automated mitigation
- **Model-Specific Adapters** - tailored reasoning logic for Claude 3.7, Gemini 2.0, GPT-4o, Cursor, Claude Code
- **PII Shield** - integrated scanner prevents sensitive data leaks during prompt engineering
- **Audit Trail** (AuditTrail.tsx, AuditView.tsx) - full provenance log of pipeline decisions
- **Export tooling** - JSON and Markdown artifact export (utils/export.ts)
- **Secure storage** - encrypted local storage for prompts and pipeline state (utils/secureStorage.ts)
- **Token estimator** - pre-flight token budget calculation (services/tokenEstimator.ts)

---

## How to Run

Prerequisites: Node.js, Gemini API key

```
npm install
```

Set key in .env.local:

```
GEMINI_API_KEY=your_key_here
```

```
npm run dev
```

Open http://localhost:5173. Enter a vague intent. Watch the three-phase pipeline run. Export the hardened instruction set as JSON or Markdown.

---

## Stack

- React 18, TypeScript, Tailwind CSS, Framer Motion
- Google Gemini 2.0 Flash (internal reasoning engine)
- Vite, Vercel deployment

---

## Known Limits

| Claim | Status |
|-------|--------|
| Three-phase audit-stress-synthesis pipeline | Implemented |
| LCI compression and cognitive load monitor | Implemented |
| Model-specific adapters (Claude, Gemini, GPT-4o) | Implemented |
| Recursive error-correction retrospective | Implemented |
| Cross-model evaluation layer (drift/failure/reliability) | Roadmap |
| Independent validation of instruction quality improvement | Not yet validated |
| Production monitoring or enterprise deployment | Not claimed |

This is a Gemini-backed prototype. The core pipeline runs end-to-end. Cross-model evaluation and independent instruction-quality benchmarking are planned but not yet built.

---

## Related Work

- [The Living Constitution](https://github.com/coreyalejandro/the-living-constitution) - runtime constitutional governance layer
- [Agent Sentinel](https://github.com/coreyalejandro/Agent-Sentinel-Alignment-Anomaly-Detector) - behavioral anomaly detection for agentic logs
