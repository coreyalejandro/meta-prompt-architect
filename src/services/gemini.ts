import { GoogleGenAI, Type } from "@google/genai";
import { UserIntent, AuditResult, StressTestResult, InstructionSet, ModelType, Retrospective, PIIFinding, MemoryState, AuditResultSchema, StressTestResultSchema, InstructionSetSchema, Attachment } from "../types";
import { z } from 'zod';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Essential: Robustness Helper
async function withRetry<T>(fn: () => Promise<T>, retries: number = 3, delay: number = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries <= 0 || err.message?.includes('AbortError')) throw err;
    // Only retry on rate limits or transient server errors
    if (err.message?.includes('429') || err.message?.includes('500') || err.message?.includes('503')) {
      console.warn(`Retrying after ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

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

// Essential: Attachment Preprocessor and Payload Compiler
export function buildContentPayload(basePrompt: string, attachments?: Attachment[]) {
  if (!attachments || attachments.length === 0) {
    return basePrompt;
  }

  const parts: any[] = [{ text: basePrompt }];

  attachments.forEach(file => {
    if (file.type === 'application/pdf') {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: file.content
        }
      });
    } else {
      parts[0].text += `\n\n=== ATTACHED WORKSPACE CONTEXT [Name: ${file.name}] ===\n${file.content}\n==============================================`;
    }
  });

  return parts;
}

const GENERATION_MODEL = "gemini-3-flash-preview";

// Essential: Model-Specific Reasoning Adapters
function cleanJsonResponse(text: string) {
  return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

export const getModelStrengths = (model: ModelType) => {
  switch (model) {
    case ModelType.GEMINI_2_0_FLASH: return "Next-gen multimodal speed with enhanced reasoning parity.";
    case ModelType.GEMINI_1_5_PRO: return "1M-2M context, strong reasoning, and multimodal agentic capabilities.";
    case ModelType.GEMINI_1_5_FLASH: return "High-throughput, fast inference, multimodal speed.";
    case ModelType.GPT_4O: return "Strong reasoning and ecosystem integration.";
    case ModelType.GPT_O1_PREVIEW: return "Advanced chain-of-thought and complex task decomposition.";
    case ModelType.CLAUDE_3_7_SONNET: return "Bleeding-edge coding capabilities and extremely low latency.";
    case ModelType.CLAUDE_3_5_SONNET: return "Best-in-class coding and agentic tool use.";
    case ModelType.CLAUDE_3_OPUS: return "Best-in-class complex reasoning and analysis.";
    case ModelType.DEEPSEEK_R1: return "High-level mathematical reasoning and cost-efficient open-weights.";
    default: return "Optimize for speed and efficiency.";
  }
};

export async function auditIntent(intent: UserIntent, signal?: AbortSignal): Promise<AuditResult> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: buildContentPayload(`Analyze this user intent for a prompt: "${intent.raw}". 
      Identify implicit assumptions, 3 critical edge cases, and the "Truth Surface" (required external data).
      CRITICAL: You MUST explicitly list any required dynamic inputs (text, documents, code, etc.) that the prompt mentions, so we can later create variable placeholders (e.g. {{input}}) for them in the Truth Surface or assumptions.`, intent.attachments),
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
  }).catch((err: any) => {
    console.error('Audit error after retries:', err);
    if (err.message?.includes('429')) throw new Error('Capacity reached (Rate Limit). Please wait a moment.');
    throw new Error(`Environmental scan failed: ${err.message || 'Unknown error'}`);
  });
}

export async function stressTest(intent: UserIntent, audit: AuditResult, signal?: AbortSignal): Promise<StressTestResult> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: buildContentPayload(`Stress-test this intent: "${intent.raw}" based on these audit findings: ${JSON.stringify(audit)}.
      Provide a Critic's argument, Logic optimization, and a Resolution into a hardened instruction set.
      CRITICAL DESIGN ENFORCEMENT: The Logic Optimization MUST explicitly apply "Backward's Design" principles. You must define the exact end-state and output structure first, and then build the logic backwards.
      CRITICAL VARIABLE ENFORCEMENT: The logic must enforce that ALL dynamic inputs identified in the audit will be parameterized using explicit variable placeholders (like {{variable_name}}).`, intent.attachments),
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
  }).catch((err: any) => {
    console.error('Stress test error after retries:', err);
    if (err.message?.includes('429')) throw new Error('Capacity reached (Rate Limit). Please wait a moment.');
    throw new Error(`Stress test failed: ${err.message || 'Unknown error'}`);
  });
}

// Relevance Filtering: Only include memory items that have keyword overlap or are relevant to the current intent
export function filterMemoryByRelevance(intentText: string, memory: MemoryState[]): MemoryState[] {
  if (!intentText || intentText.trim() === '') return [];
  
  // Normalize and tokenize current intent to extract meaningful terms
  const currentWords = intentText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !['generate', 'prompt', 'create', 'build', 'write', 'implement', 'design', 'with', 'that', 'this', 'some', 'from', 'using', 'optimized', 'architecture', 'integration', 'should', 'have', 'workflow', 'builder', 'expert', 'system', 'concept'].includes(word));

  if (currentWords.length === 0) {
    // If the intent has only short/common words, return a small subset of the most recent memory to prevent complete loss of context
    return memory.slice(-2);
  }

  return memory.filter(item => {
    const valText = item.value.toLowerCase();
    const keyText = item.key.toLowerCase();
    
    // Check if any significant keyword is present in the memory key or value
    const hasKeywordOverlap = currentWords.some(word => valText.includes(word) || keyText.includes(word));
    return hasKeywordOverlap;
  });
}

export async function generateInstructionSet(
  intent: UserIntent, 
  stress: StressTestResult, 
  memory: MemoryState[] = [],
  signal?: AbortSignal
): Promise<InstructionSet> {
  const modelStrengths = getModelStrengths(intent.targetModel);
  
  // Relevance check to isolate context and prevent unrelated project contamination (e.g. madmall)
  const filteredMemory = filterMemoryByRelevance(intent.raw, memory);
  
  // Optimization: Dynamic LCI Memory Compression
  let relevantMemory = filteredMemory;
  if (intent.useLCI) {
    const budgetFactor = 1 / intent.lciConfig.compressionRatio;
    const charBudget = Math.floor(intent.lciConfig.contextWindow * 4 * 0.15 * budgetFactor); // Approx 15% of window available for memory, scaled by compression
    
    // Reverse memory and keep adding until budget reached
    const budgetMemory = [];
    let currentSize = 0;
    for (let i = memory.length - 1; i >= 0; i--) {
      const item = memory[i];
      const itemSize = item.key.length + item.value.length;
      if (currentSize + itemSize < charBudget) {
        budgetMemory.unshift(item);
        currentSize += itemSize;
      } else if (currentSize < charBudget) {
        // Partial add for the last possible item
        const remaining = charBudget - currentSize;
        budgetMemory.unshift({
          ...item,
          value: item.value.substring(0, Math.max(0, remaining - item.key.length)) + " [LCI_TRUNCATED]"
        });
        break;
      }
    }
    relevantMemory = budgetMemory;
  } else {
    // Standard default compression
    relevantMemory = memory.slice(-5).map(m => ({
      ...m,
      value: m.value.length > 500 ? m.value.substring(0, 500) + "..." : m.value
    }));
  }
  
  const memoryContext = relevantMemory.length > 0 ? `\nRecent Context (LCI-Optimized): ${JSON.stringify(relevantMemory)}` : "";

  const promptText = `Generate a high-dimensional Instruction Set for intent: "${intent.raw}" using resolution: "${stress.resolution}".
        Target Model: ${intent.targetModel}. 
        Model-Specific Optimization: ${modelStrengths}
        Use LCI (Linear Context Injection) Protocol: ${intent.useLCI}. 
        LCI Configuration: Context Window=${intent.lciConfig.contextWindow} tokens, Compression Ratio=${intent.lciConfig.compressionRatio}:1.
        High Risk: ${intent.highRisk}.
        Compliance Mode: ${intent.compliance || 'none'}.${memoryContext}
        
        LCI PROTOCOL DETAILS:
        1. Structural Partitioning: Divide complex instructions into "Cognitive Layers".
        2. Recursive Summarization: If intent is extremely complex, compress low-priority details based on the ${intent.lciConfig.compressionRatio}:1 ratio.
        3. Identity Preservation: Core architectural goals MUST NOT be compressed.
        
        CRITICAL: Implement "Instruction Anchoring". Safety-critical directives and compliance instructions MUST be excluded from LCI compression and MUST be explicitly "anchored" at the very end of the 'finalPrompt' (the highest attention area for LLMs), regardless of the LCI compression ratio.
        
        CRITICAL: The 'finalPrompt' MUST NOT use terms like 'BOOTSTRAP_COMMAND' or 'USAGE_INSTRUCTIONS' or ask the AI to relay instructions to another session, as these trigger prompt injection filters in modern LLMs. Instead, provide a clear, natural-language 'Context & Goal' section and standard 'Instructions' formatted safely for direct execution.
        
        CRITICAL DESIGN REQUIREMENT (BACKWARD'S DESIGN):
        The generated system prompt ('finalPrompt') MUST be explicitly derived using "Backward's Design" principles. You must first define the desired end-state, desired output formats, and success criteria of the user's intent. Then, construct the instructions backwards step-by-step to ensure the model naturally arrives at that desired outcome without deviating. 
        
        CRITICAL VARIABLE PLACEHOLDERS REQUIREMENT:
        The generated system prompt ('finalPrompt') MUST explicitly integrate dynamic variable placeholders for ANY input (text, image, document, plan, review, etc.) being discussed or mentioned in the user's intent. The user must be able to inject runtime context inputs. You MUST include exact syntax patterns embedded naturally in the instruction structures, such as {{input_name}} or \${input_name}. 
        For example: 
        - If the user intent mentions a plan, include {{plan}} or \${plan}.
        - If it mentions an image, include {{image}} or \${image}.
        - If it mentions a reference document, include {{attached_document}} or \${attached_document}.
        Ensure these placeholders are styled clearly (e.g. "Review the implementation plan provided in {{plan}} before proceeding...", "Analyze the attached image in {{image}}..."). Do NOT omit them; they must be physically written as empty placeholder tags to preserve downstream utility!
        
        BUILD CONTRACT & FORMAL VERIFICATION:
        Generate a 'buildContract' that includes:
        1. Invariants: A set of strict logical constraints extracted from the intent (e.g., "Output must be valid JSON", "No mentions of PII"). Each invariant must have a 'verified' status. You MUST include two specific invariants to guarantee the new hardening rules:
           - An invariant asserting: "Prompt is explicitly derived via Backward's Design principles."
           - An invariant asserting: "Variable placeholders (e.g. {{input}}) are present for ALL dynamic inputs mentioned."
        2. Intent Drift: A calculation (0-100) of how much the final prompt has evolved from the original intent. 0 means identical, 100 means complete departure.
        3. Red-Team Report: An internal adversarial assessment (threat level and specific findings).`;

  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: GENERATION_MODEL,
        contents: buildContentPayload(promptText, intent.attachments),
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
              buildContract: {
                type: Type.OBJECT,
                properties: {
                  invariants: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        description: { type: Type.STRING },
                        status: { type: Type.STRING, enum: ["verified", "unverified", "failed"] },
                        evidence: { type: Type.STRING },
                      },
                      required: ["id", "description", "status"],
                    },
                  },
                  intentDrift: { type: Type.NUMBER },
                  redTeamReport: {
                    type: Type.OBJECT,
                    properties: {
                      threatLevel: { type: Type.STRING, enum: ["low", "medium", "high"] },
                      findings: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ["threatLevel", "findings"],
                  },
                },
                required: ["invariants", "intentDrift", "redTeamReport"],
              },
            },
            required: ["systemRole", "cognitiveStack", "verificationGates", "handoffArtifacts", "verbalizedSampling", "finalPrompt", "buildContract"],
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
    });
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
    model: GENERATION_MODEL,
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
    model: GENERATION_MODEL,
    contents: `You are the Meta-Prompt Knowledge Expert. Your goal is to help users master high-dimensional prompt engineering and the Meta-Prompt Architect app.
    
    Context: ${JSON.stringify(context)}
    
    User Message: "${message}"
    
    Provide a concise, high-authority response. If the user is asking about a feature, explain it in the context of cognitive governance. If they are asking about their current prompt, offer specific architectural advice.`,
  });

  if (signal?.aborted) throw new Error('AbortError');
  return response.text;
}

export async function redTeamAudit(instructionSet: InstructionSet, signal?: AbortSignal): Promise<{ score: number; reasoning: string; vulnerabilities: string[] }> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
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
  });
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
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: `You are an expert AI workflow architect. Given the following user request, design a multi-step AI workflow.
      Each step should have a name, a detailed intent (prompt), a target model, and an array of names of the steps it depends on.
      
      CRITICAL DESIGN RULES FOR EVERY STEP INTENT:
      1. Apply Backward's Design: Define the step's end-state and output structure first, then describe the logic backwards.
      2. Variable Parameterization: If a step takes inputs from previous steps or external data, you MUST include explicit variable placeholders (e.g. {{input_name}}) in the intent.
      
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
  });
}

export async function testCrossModelParity(instructionSet: InstructionSet, signal?: AbortSignal) {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
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
  });
}

export async function mapConstitutionalStandards(instructionSet: InstructionSet, signal?: AbortSignal) {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: `You are a compliance and regulatory expert. Map the following instruction set to specific C-RSP (Constitutionally-Regulated Single Pass) execution standards (e.g., GDPR, HIPAA, NIST, EU AI Act, C-RSP Core).
      
      Instruction Set:
      ${instructionSet.finalPrompt}
      
      Identify which C-RSP standards are addressed, the percentage of coverage (1-100), and list the specific clauses or directives in the prompt that map to that standard.`,
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
  });
}

export async function testPlaygroundPrompt(systemPrompt: string, userMessage: string, signal?: AbortSignal): Promise<string> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt
      }
    });
    if (signal?.aborted) throw new Error('AbortError');
    return response.text || '';
  });
}
