import { ModelType } from '../types';

// Simplified pricing per 1M tokens (Input/Output)
const MODEL_PRICING: Record<ModelType, { input: number; output: number }> = {
  [ModelType.GEMINI_1_5_PRO]: { input: 3.5, output: 10.5 },
  [ModelType.GEMINI_1_5_FLASH]: { input: 0.1, output: 0.3 },
  [ModelType.GPT_4O]: { input: 5, output: 15 },
  [ModelType.GPT_O1_PREVIEW]: { input: 15, output: 45 },
  [ModelType.CLAUDE_3_5_SONNET]: { input: 3, output: 15 },
  [ModelType.CLAUDE_3_OPUS]: { input: 15, output: 75 },
  [ModelType.DEEPSEEK_R1]: { input: 0.5, output: 1 },
};

export function estimateCost(model: ModelType, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 1, output: 3 };
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}
