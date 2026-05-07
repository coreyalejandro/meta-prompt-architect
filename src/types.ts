import { z } from 'zod';

export enum ModelType {
  GEMINI_2_0_FLASH = "gemini-2.0-flash",
  GEMINI_1_5_PRO = "gemini-1.5-pro",
  GEMINI_1_5_FLASH = "gemini-1.5-flash",
  GPT_4O = "gpt-4o",
  GPT_O1_PREVIEW = "o1-preview",
  CLAUDE_3_7_SONNET = "claude-3-7-sonnet",
  CLAUDE_3_5_SONNET = "claude-3-5-sonnet",
  CLAUDE_3_OPUS = "claude-3-opus",
  DEEPSEEK_R1 = "deepseek-r1"
}

export enum ThemeType {
  DARK = "dark",
  LIGHT = "light",
  HIGH_CONTRAST = "high-contrast"
}

export const UserIntentSchema = z.object({
  raw: z.string(),
  targetModel: z.nativeEnum(ModelType),
  useLCI: z.boolean(),
  lciConfig: z.object({
    contextWindow: z.number(),
    compressionRatio: z.number(),
  }),
  highRisk: z.boolean(),
  theme: z.nativeEnum(ThemeType),
  compliance: z.string().optional(),
});

export const AuditResultSchema = z.object({
  assumptions: z.array(z.string()),
  edgeCases: z.array(z.string()),
  truthSurface: z.array(z.string()),
});

export const StressTestResultSchema = z.object({
  criticArgument: z.string(),
  logicOptimization: z.string(),
  resolution: z.string(),
});

export const InvariantSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(['verified', 'unverified', 'failed']),
  evidence: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) return val.join('; ');
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    },
    z.string().optional()
  ),
});

export const BuildContractSchema = z.object({
  invariants: z.array(InvariantSchema),
  intentDrift: z.number(),
  redTeamReport: z.object({
    threatLevel: z.enum(['low', 'medium', 'high']),
    findings: z.array(z.string()),
  }),
});

export const InstructionSetSchema = z.object({
  systemRole: z.string(),
  cognitiveStack: z.array(z.string()),
  verificationGates: z.array(z.string()),
  handoffArtifacts: z.array(z.string()),
  verbalizedSampling: z.string().optional(),
  finalPrompt: z.string(),
  buildContract: BuildContractSchema.optional(),
});

export const HistoryItemSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  intent: UserIntentSchema,
  results: z.object({
    audit: AuditResultSchema,
    stress: StressTestResultSchema,
    instructionSet: InstructionSetSchema,
  }),
});

export const MemoryStateSchema = z.object({
  key: z.string(),
  value: z.string(),
  lastUpdated: z.string(),
});

export type UserIntent = z.infer<typeof UserIntentSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;
export type StressTestResult = z.infer<typeof StressTestResultSchema>;
export type Invariant = z.infer<typeof InvariantSchema>;
export type BuildContract = z.infer<typeof BuildContractSchema>;
export type InstructionSet = z.infer<typeof InstructionSetSchema>;
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
export type MemoryState = z.infer<typeof MemoryStateSchema>;

export type TruthStatus = "verified" | "unverified" | "failed";

export const WORMAuditLogSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  action: z.enum(['GENERATE', 'EXPORT_JSON', 'EXPORT_MD', 'EXPORT_CURSOR', 'REDACT_PII']),
  userId: z.string(), // Simulated user ID
  details: z.any(),
  hash: z.string() // Simulated cryptographic hash of the record to ensure immutability
});

export type WORMAuditLog = z.infer<typeof WORMAuditLogSchema>;

export interface WorkflowStep {
  id: string;
  name: string;
  intent: string;
  targetModel: ModelType;
  dependsOn: string[];
  status: 'idle' | 'running' | 'completed' | 'failed';
  result?: InstructionSet;
  error?: string;
}

export interface PIIFinding {
  type: string;
  value: string;
  index: number;
}

export interface Retrospective {
  failureReason: string;
  suggestedUpdate: string;
}

export const CrossModelParitySchema = z.object({
  claudeScore: z.number(),
  geminiScore: z.number(),
  gptScore: z.number(),
  consistency: z.number(),
  issues: z.array(z.string()),
});
export type CrossModelParityResult = z.infer<typeof CrossModelParitySchema>;

export const ConstitutionalMappingSchema = z.object({
  standards: z.array(z.object({
    standard: z.string(),
    coverage: z.number(),
    mappedClauses: z.array(z.string())
  }))
});
export type ConstitutionalMappingResult = z.infer<typeof ConstitutionalMappingSchema>;
