/**
 * LLM service — originally Gemini, now powered by Groq (llama-3.3-70b-versatile).
 * All exported function signatures are unchanged so the rest of the app requires no edits.
 * Provider portability: swap VITE_GROQ_API_KEY + GROQ_MODEL env vars to change backend.
 */
import Groq from "groq-sdk";
import {
  UserIntent,
  AuditResult,
  StressTestResult,
  InstructionSet,
  ModelType,
  Retrospective,
  PIIFinding,
  MemoryState,
  AuditResultSchema,
  StressTestResultSchema,
  InstructionSetSchema,
} from "../types";
import { z } from "zod";

const apiKey = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile";

const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

// ── helpers ────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries <= 0 || err.message?.includes("AbortError")) throw err;
    if (
      err.message?.includes("429") ||
      err.message?.includes("500") ||
      err.message?.includes("503")
    ) {
      console.warn(`Retrying after ${delay}ms… (${retries} left)`);
      await new Promise((r) => setTimeout(r, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

function cleanJson(text: string): string {
  return text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
}

async function chatJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  signal?: AbortSignal
): Promise<T> {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content:
          systemPrompt +
          "\n\nRespond ONLY with valid JSON matching the schema. No markdown fences.",
      },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });
  if (signal?.aborted) throw new Error("AbortError");
  const text = completion.choices[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty response from Groq");
  return schema.parse(JSON.parse(cleanJson(text)));
}

// ── PII scanner (no LLM needed) ────────────────────────────────────────────

export function scanForPII(text: string): PIIFinding[] {
  const findings: PIIFinding[] = [];
  const patterns = [
    { type: "EMAIL", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    {
      type: "PHONE",
      regex: /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    },
    { type: "API_KEY", regex: /(sk|ak|key)-[a-zA-Z0-9]{20,}/g },
  ];
  patterns.forEach((p) => {
    let match;
    while ((match = p.regex.exec(text)) !== null) {
      findings.push({ type: p.type, value: match[0], index: match.index });
    }
  });
  return findings;
}

// ── model strengths ────────────────────────────────────────────────────────

export const getModelStrengths = (model: ModelType): string => {
  switch (model) {
    case ModelType.GEMINI_2_0_FLASH:
      return "Next-gen multimodal speed with enhanced reasoning parity.";
    case ModelType.GEMINI_1_5_PRO:
      return "1M-2M context, strong reasoning, and multimodal agentic capabilities.";
    case ModelType.GEMINI_1_5_FLASH:
      return "High-throughput, fast inference, multimodal speed.";
    case ModelType.GPT_4O:
      return "Strong reasoning and ecosystem integration.";
    case ModelType.GPT_O1_PREVIEW:
      return "Advanced chain-of-thought and complex task decomposition.";
    case ModelType.CLAUDE_3_7_SONNET:
      return "Bleeding-edge coding capabilities and extremely low latency.";
    case ModelType.CLAUDE_3_5_SONNET:
      return "Best-in-class coding and agentic tool use.";
    case ModelType.CLAUDE_3_OPUS:
      return "Best-in-class complex reasoning and analysis.";
    case ModelType.DEEPSEEK_R1:
      return "High-level mathematical reasoning and cost-efficient open-weights.";
    default:
      return "Optimize for speed and efficiency.";
  }
};

// ── exported service functions ─────────────────────────────────────────────

export async function auditIntent(
  intent: UserIntent,
  signal?: AbortSignal
): Promise<AuditResult> {
  return withRetry(() =>
    chatJSON(
      "You are an AI intent auditor.",
      `Analyze this user intent for a prompt: "${intent.raw}".
Identify implicit assumptions, 3 critical edge cases, and the "Truth Surface" (required external data).
Return JSON: { "assumptions": [string], "edgeCases": [string], "truthSurface": [string] }`,
      AuditResultSchema,
      signal
    )
  ).catch((err: any) => {
    if (err.message?.includes("429"))
      throw new Error("Capacity reached (Rate Limit). Please wait a moment.");
    throw new Error(`Environmental scan failed: ${err.message || "Unknown error"}`);
  });
}

export async function stressTest(
  intent: UserIntent,
  audit: AuditResult,
  signal?: AbortSignal
): Promise<StressTestResult> {
  return withRetry(() =>
    chatJSON(
      "You are an adversarial prompt stress-tester.",
      `Stress-test this intent: "${intent.raw}" based on audit findings: ${JSON.stringify(audit)}.
Provide a Critic argument, Logic optimization, and Resolution into a hardened instruction set.
Return JSON: { "criticArgument": string, "logicOptimization": string, "resolution": string }`,
      StressTestResultSchema,
      signal
    )
  ).catch((err: any) => {
    if (err.message?.includes("429"))
      throw new Error("Capacity reached (Rate Limit). Please wait a moment.");
    throw new Error(`Stress test failed: ${err.message || "Unknown error"}`);
  });
}

export async function generateInstructionSet(
  intent: UserIntent,
  stress: StressTestResult,
  memory: MemoryState[] = [],
  signal?: AbortSignal
): Promise<InstructionSet> {
  const modelStrengths = getModelStrengths(intent.targetModel);

  let relevantMemory = memory;
  if (intent.useLCI) {
    const budgetFactor = 1 / intent.lciConfig.compressionRatio;
    const charBudget = Math.floor(
      intent.lciConfig.contextWindow * 4 * 0.15 * budgetFactor
    );
    const budgetMemory: MemoryState[] = [];
    let currentSize = 0;
    for (let i = memory.length - 1; i >= 0; i--) {
      const item = memory[i];
      const itemSize = item.key.length + item.value.length;
      if (currentSize + itemSize < charBudget) {
        budgetMemory.unshift(item);
        currentSize += itemSize;
      } else if (currentSize < charBudget) {
        const remaining = charBudget - currentSize;
        budgetMemory.unshift({
          ...item,
          value:
            item.value.substring(0, Math.max(0, remaining - item.key.length)) +
            " [LCI_TRUNCATED]",
        });
        break;
      }
    }
    relevantMemory = budgetMemory;
  } else {
    relevantMemory = memory.slice(-5).map((m) => ({
      ...m,
      value: m.value.length > 500 ? m.value.substring(0, 500) + "..." : m.value,
    }));
  }

  const memoryContext =
    relevantMemory.length > 0
      ? `\nRecent Context (LCI-Optimized): ${JSON.stringify(relevantMemory)}`
      : "";

  return withRetry(() =>
    chatJSON(
      "You are a high-dimensional prompt architect.",
      `Generate an Instruction Set for intent: "${intent.raw}" using resolution: "${stress.resolution}".
Target Model: ${intent.targetModel}.
Model-Specific Optimization: ${modelStrengths}
Use LCI Protocol: ${intent.useLCI}. Context Window=${intent.lciConfig.contextWindow}, Compression=${intent.lciConfig.compressionRatio}:1.
High Risk: ${intent.highRisk}. Compliance: ${intent.compliance || "none"}.${memoryContext}

Return JSON with keys: systemRole, cognitiveStack (array), verificationGates (array), handoffArtifacts (array), verbalizedSampling, finalPrompt,
buildContract: { invariants: [{id, description, status ("verified"|"unverified"|"failed"), evidence}], intentDrift (0-100), redTeamReport: {threatLevel ("low"|"medium"|"high"), findings (array)} }`,
      InstructionSetSchema,
      signal
    )
  ).catch((err: any) => {
    if (err.message?.includes("429"))
      throw new Error(
        "Capacity reached (Rate Limit). Please wait a moment before re-generating."
      );
    throw err;
  });
}

export async function getRetrospective(
  failedStep: string,
  signal?: AbortSignal
): Promise<Retrospective> {
  const RetrospectiveSchema = z.object({
    failureReason: z.string(),
    suggestedUpdate: z.string(),
  });
  return chatJSON(
    "You are a retrospective analyst.",
    `Analyze this failed step log: "${failedStep}".
Provide a failure reason and a suggested update to the BUILD_CONTRACT.
Return JSON: { "failureReason": string, "suggestedUpdate": string }`,
    RetrospectiveSchema,
    signal
  );
}

export async function chatWithExpert(
  message: string,
  context: any,
  signal?: AbortSignal
): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content: `You are the Meta-Prompt Knowledge Expert. Help users master high-dimensional prompt engineering.
Context: ${JSON.stringify(context)}`,
      },
      { role: "user", content: message },
    ],
    temperature: 0.7,
  });
  if (signal?.aborted) throw new Error("AbortError");
  return completion.choices[0]?.message?.content ?? "";
}

export async function redTeamAudit(
  instructionSet: InstructionSet,
  signal?: AbortSignal
): Promise<{ score: number; reasoning: string; vulnerabilities: string[] }> {
  const RedTeamSchema = z.object({
    score: z.number(),
    reasoning: z.string(),
    vulnerabilities: z.array(z.string()),
  });
  return withRetry(() =>
    chatJSON(
      "You are a Senior Security Auditor.",
      `Perform an adversarial red-team audit on this instruction set:\n${instructionSet.finalPrompt}
Identify safety bypasses, jailbreak vulnerabilities, logical loopholes.
Return JSON: { "score": number (1-10), "reasoning": string, "vulnerabilities": [string] }`,
      RedTeamSchema,
      signal
    )
  );
}

export async function generateWorkflow(prompt: string, signal?: AbortSignal) {
  const WorkflowSchema = z.object({
    steps: z.array(
      z.object({
        name: z.string(),
        intent: z.string(),
        targetModel: z.nativeEnum(ModelType),
        dependsOnNames: z.array(z.string()),
      })
    ),
  });
  return withRetry(() =>
    chatJSON(
      "You are an expert AI workflow architect.",
      `Design a multi-step AI workflow for: "${prompt}".
Available models: ${Object.values(ModelType).join(", ")}
Return JSON: { "steps": [{name, intent, targetModel, dependsOnNames}] }`,
      WorkflowSchema,
      signal
    )
  );
}

export async function testCrossModelParity(
  instructionSet: InstructionSet,
  signal?: AbortSignal
) {
  const ParitySchema = z.object({
    claudeScore: z.number(),
    geminiScore: z.number(),
    gptScore: z.number(),
    consistency: z.number(),
    issues: z.array(z.string()),
  });
  return withRetry(() =>
    chatJSON(
      "You are a cross-model compatibility expert.",
      `Evaluate this instruction set for parity across Claude, Gemini, and GPT:
${instructionSet.finalPrompt}
Return JSON: { "claudeScore": number, "geminiScore": number, "gptScore": number, "consistency": number, "issues": [string] }`,
      ParitySchema,
      signal
    )
  );
}

export async function mapConstitutionalStandards(
  instructionSet: InstructionSet,
  signal?: AbortSignal
) {
  const StandardsSchema = z.object({
    standards: z.array(
      z.object({
        standard: z.string(),
        coverage: z.number(),
        mappedClauses: z.array(z.string()),
      })
    ),
  });
  return withRetry(() =>
    chatJSON(
      "You are a compliance and regulatory expert.",
      `Map this instruction set to regulatory standards (GDPR, HIPAA, NIST, EU AI Act):
${instructionSet.finalPrompt}
Return JSON: { "standards": [{standard, coverage (1-100), mappedClauses: [string]}] }`,
      StandardsSchema,
      signal
    )
  );
}
