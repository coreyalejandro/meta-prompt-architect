import { GoogleGenAI, Type } from "@google/genai";
import { UserIntent, AuditResult, StressTestResult, InstructionSet, ModelType, Retrospective, PIIFinding, MemoryState, AuditResultSchema, StressTestResultSchema, InstructionSetSchema } from "../types";
import { z } from 'zod';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Essential: PII/Sensitive Data Scanner
export function scanForPII(text: string): PIIFinding[] {
  const findings: PIIFinding[] = [];
  const patterns = [
    { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { type: 'PHONE', regex: /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g },
    { type: 'API_KEY', regex: /(sk|ak|key)-[a-zA-Z0-9]{20,}/g }
  ];

  patterns.forEach(p => {
    let match;
    while ((match = p.regex.exec(text)) !== null) {
      findings.push({ type: p.type, value: match[0], index: match.index });
    }
  });
  return findings;
}

// Essential: Model-Specific Reasoning Adapters
function cleanJsonResponse(text: string) {
  return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

export const getModelStrengths = (model: ModelType) => {
  switch (model) {
    case ModelType.GEMINI_1_5_PRO: return "1M-2M context, strong reasoning, and multimodal agentic capabilities.";
    case ModelType.GEMINI_1_5_FLASH: return "High-throughput, fast inference, multimodal speed.";
    case ModelType.GPT_4O: return "Strong reasoning and ecosystem integration.";
    case ModelType.GPT_O1_PREVIEW: return "Advanced chain-of-thought and complex task decomposition.";
    case ModelType.CLAUDE_3_5_SONNET: return "Best-in-class coding and agentic tool use.";
    case ModelType.CLAUDE_3_OPUS: return "Best-in-class complex reasoning and analysis.";
    case ModelType.DEEPSEEK_R1: return "High-level mathematical reasoning and cost-efficient open-weights.";
    default: return "Optimize for speed and efficiency.";
  }
};

export async function auditIntent(intent: UserIntent, signal?: AbortSignal): Promise<AuditResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this user intent for a prompt: "${intent.raw}". 
      Identify implicit assumptions, 3 critical edge cases, and the "Truth Surface" (required external data).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
            edgeCases: { type: Type.ARRAY, items: { type: Type.STRING } },
            truthSurface: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["assumptions", "edgeCases", "truthSurface"],
        },
      },
    });

    if (signal?.aborted) throw new Error('AbortError');
    const text = response.text;
    if (!text) throw new Error('Empty response from audit engine');
    
    return AuditResultSchema.parse(JSON.parse(cleanJsonResponse(text)));
  } catch (err: any) {
    console.error('Audit error:', err);
    if (err.message?.includes('429')) throw new Error('Capacity reached (Rate Limit). Please wait a moment.');
    throw new Error(`Environmental scan failed: ${err.message || 'Unknown error'}`);
  }
}

export async function stressTest(intent: UserIntent, audit: AuditResult, signal?: AbortSignal): Promise<StressTestResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Stress-test this intent: "${intent.raw}" based on these audit findings: ${JSON.stringify(audit)}.
      Provide a Critic's argument, Logic optimization, and a Resolution into a "Steel-man" instruction set.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            criticArgument: { type: Type.STRING },
            logicOptimization: { type: Type.STRING },
            resolution: { type: Type.STRING },
          },
          required: ["criticArgument", "logicOptimization", "resolution"],
        },
      },
    });

    if (signal?.aborted) throw new Error('AbortError');
    const text = response.text;
    if (!text) throw new Error('Empty response from stress engine');

    return StressTestResultSchema.parse(JSON.parse(cleanJsonResponse(text)));
  } catch (err: any) {
    console.error('Stress test error:', err);
    if (err.message?.includes('429')) throw new Error('Capacity reached (Rate Limit). Please wait a moment.');
    throw new Error(`Stress test failed: ${err.message || 'Unknown error'}`);
  }
}

export async function generateInstructionSet(
  intent: UserIntent, 
  stress: StressTestResult, 
  memory: MemoryState[] = [],
  signal?: AbortSignal
): Promise<InstructionSet> {
  const modelStrengths = getModelStrengths(intent.targetModel);
  // Optimization: Limit memory to last 5 items and truncate long values to prevent "Capacity" issues
  const relevantMemory = memory.slice(-5).map(m => ({
    key: m.key,
    value: m.value.length > 500 ? m.value.substring(0, 500) + "..." : m.value
  }));
  const memoryContext = relevantMemory.length > 0 ? `\nRecent Context: ${JSON.stringify(relevantMemory)}` : "";

  try {
    const response = await ai.models.generateContent({
      model: intent.targetModel,
      contents: `Generate a high-dimensional Instruction Set for intent: "${intent.raw}" using resolution: "${stress.resolution}".
      Target Model: ${intent.targetModel}. 
      Model-Specific Optimization: ${modelStrengths}
      Use LCI: ${intent.useLCI}. 
      LCI Configuration: Context Window=${intent.lciConfig.contextWindow} tokens, Compression Ratio=${intent.lciConfig.compressionRatio}:1.
      High Risk: ${intent.highRisk}.
      Compliance Mode: ${intent.compliance || 'none'}.${memoryContext}
      
      CRITICAL: Use "Advanced Verbalized Sampling". Before finalizing the prompt, perform an internal evaluation of 3 different prompt architectures (e.g., Chain-of-Thought, Few-Shot, Role-Based). 
      Select the most robust one and explain WHY in the 'verbalizedSampling' field.
      
      POLICY ALIGNMENT: Ensure the prompt adheres to safety, neutrality, and ethical guidelines. Flag any potential violations in the cognitive stack.
      If Compliance Mode is not 'none', ensure the prompt explicitly includes instructions to adhere to the specified regulatory framework (${intent.compliance}).
      
      DYNAMIC CONTEXTUALIZATION (CRITICAL): The 'systemRole', 'cognitiveStack', 'verificationGates', and 'handoffArtifacts' MUST NOT be generic. They MUST be highly customized and directly derived from the unique nuances of the intent ("${intent.raw}"). Do NOT spit out the same generic instruction set scaffolding for every request.
      
      COGNITIVE STACK INSTRUCTIONS: Define the specific, custom cognitive modes the AI should use tailored strictly to this intent. If the target model or intent implies an agentic IDE like Claude Code, explicitly utilize its known cognitive modes (e.g., "Architect Mode" for planning, "Code Mode" for execution, "Ask Mode" for clarification). Otherwise, invent highly specific, intent-driven analysis modes.
      
      Include System Role, Cognitive Stack, Verification Gates, Handoff Artifacts, Verbalized Sampling explanation, and the Final Prompt.
      
      CRITICAL: Implement "Instruction Anchoring". Safety-critical directives and compliance instructions MUST be excluded from LCI compression and MUST be explicitly "anchored" at the very end of the 'finalPrompt' (the highest attention area for LLMs), regardless of the LCI compression ratio.
      
      CRITICAL: The 'finalPrompt' MUST NOT use terms like 'BOOTSTRAP_COMMAND' or 'USAGE_INSTRUCTIONS' or ask the AI to relay instructions to another session, as these trigger prompt injection filters in modern LLMs. Instead, provide a clear, natural-language 'Context & Goal' section and standard 'Instructions' formatted safely for direct execution.`,
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            systemRole: { type: Type.STRING },
            cognitiveStack: { type: Type.ARRAY, items: { type: Type.STRING } },
            verificationGates: { type: Type.ARRAY, items: { type: Type.STRING } },
            handoffArtifacts: { type: Type.ARRAY, items: { type: Type.STRING } },
            verbalizedSampling: { type: Type.STRING },
            finalPrompt: { type: Type.STRING },
          },
          required: ["systemRole", "cognitiveStack", "verificationGates", "handoffArtifacts", "verbalizedSampling", "finalPrompt"],
        },
      },
    });

    if (signal?.aborted) throw new Error('AbortError');
    
    const text = response.text;
    if (!text) throw new Error('Empty response from analysis engine');
    
    try {
      const parsed = JSON.parse(cleanJsonResponse(text));
      return InstructionSetSchema.parse(parsed);
    } catch (parseErr) {
      console.error('Failed to parse instruction set JSON:', text);
      throw new Error('Analysis engine returned malformed data. The instruction set may be too complex.');
    }
  } catch (apiErr: any) {
    if (apiErr.message?.includes('429')) throw new Error('Capacity reached (Rate Limit). Please wait a moment before re-generating.');
    if (apiErr.message?.includes('content is too long')) throw new Error('Intent complexity exceeds engine capacity. Please simplify your input.');
    throw apiErr;
  }
}

const RetrospectiveSchema = z.object({
  failureReason: z.string(),
  suggestedUpdate: z.string(),
});

export async function getRetrospective(failedStep: string, signal?: AbortSignal): Promise<Retrospective> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this failed step log: "${failedStep}". 
    Provide a failure reason and a suggested update to the BUILD_CONTRACT.template.md.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          failureReason: { type: Type.STRING },
          suggestedUpdate: { type: Type.STRING },
        },
        required: ["failureReason", "suggestedUpdate"],
      },
    },
  });

  if (signal?.aborted) throw new Error('AbortError');
  return RetrospectiveSchema.parse(JSON.parse(cleanJsonResponse(response.text)));
}

const RedTeamSchema = z.object({
  score: z.number(),
  reasoning: z.string(),
  vulnerabilities: z.array(z.string()),
});

export async function chatWithExpert(message: string, context: any, signal?: AbortSignal): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are the Meta-Prompt Knowledge Expert. Your goal is to help users master high-dimensional prompt engineering and the Meta-Prompt Architect app.
    
    Context: ${JSON.stringify(context)}
    
    User Message: "${message}"
    
    Provide a concise, high-authority response. If the user is asking about a feature, explain it in the context of cognitive governance. If they are asking about their current prompt, offer specific architectural advice.`,
  });

  if (signal?.aborted) throw new Error('AbortError');
  return response.text;
}

export async function redTeamAudit(instructionSet: InstructionSet, signal?: AbortSignal): Promise<{ score: number; reasoning: string; vulnerabilities: string[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a Senior Security Auditor. Perform an adversarial red-team audit on this generated instruction set:
    
    ${instructionSet.finalPrompt}
    
    Identify potential safety bypasses, jailbreak vulnerabilities, or logical loopholes. 
    Provide a security score (1-10, where 10 is most secure), reasoning, and a list of vulnerabilities.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
          vulnerabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["score", "reasoning", "vulnerabilities"],
      },
    },
  });

  if (signal?.aborted) throw new Error('AbortError');
  return RedTeamSchema.parse(JSON.parse(cleanJsonResponse(response.text)));
}

const WorkflowGenerationSchema = z.object({
  steps: z.array(z.object({
    name: z.string(),
    intent: z.string(),
    targetModel: z.nativeEnum(ModelType),
    dependsOnNames: z.array(z.string())
  }))
});

export async function generateWorkflow(prompt: string, signal?: AbortSignal) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an expert AI workflow architect. Given the following user request, design a multi-step AI workflow.
    Each step should have a name, a detailed intent (prompt), a target model, and an array of names of the steps it depends on.
    
    User Request: "${prompt}"
    
    Available Models: ${Object.values(ModelType).join(", ")}
    
    Design the workflow to be efficient, breaking down complex tasks into logical, sequential, or parallel steps.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                intent: { type: Type.STRING },
                targetModel: { type: Type.STRING },
                dependsOnNames: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["name", "intent", "targetModel", "dependsOnNames"]
            }
          }
        },
        required: ["steps"],
      },
    },
  });

  if (signal?.aborted) throw new Error('AbortError');
  return WorkflowGenerationSchema.parse(JSON.parse(cleanJsonResponse(response.text)));
}

export async function testCrossModelParity(instructionSet: InstructionSet, signal?: AbortSignal) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a cross-model compatibility expert. Evaluate this instruction set for parity across Claude, Gemini, and GPT architectures.
    
    Instruction Set:
    ${instructionSet.finalPrompt}
    
    Score how well this prompt will perform on each architecture (1-100), provide an overall consistency score (1-100), and list any model-specific issues or biases.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          claudeScore: { type: Type.NUMBER },
          geminiScore: { type: Type.NUMBER },
          gptScore: { type: Type.NUMBER },
          consistency: { type: Type.NUMBER },
          issues: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["claudeScore", "geminiScore", "gptScore", "consistency", "issues"]
      }
    }
  });
  if (signal?.aborted) throw new Error('AbortError');
  return JSON.parse(cleanJsonResponse(response.text));
}

export async function mapConstitutionalStandards(instructionSet: InstructionSet, signal?: AbortSignal) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a compliance and regulatory expert. Map the following instruction set to specific regulatory standards (e.g., GDPR, HIPAA, NIST, EU AI Act).
    
    Instruction Set:
    ${instructionSet.finalPrompt}
    
    Identify which standards are addressed, the percentage of coverage (1-100), and list the specific clauses or directives in the prompt that map to that standard.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          standards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                standard: { type: Type.STRING },
                coverage: { type: Type.NUMBER },
                mappedClauses: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["standard", "coverage", "mappedClauses"]
            }
          }
        },
        required: ["standards"]
      }
    }
  });
  if (signal?.aborted) throw new Error('AbortError');
  return JSON.parse(cleanJsonResponse(response.text));
}
