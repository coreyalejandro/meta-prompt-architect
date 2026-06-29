import { LiveModelConfig } from '../types';
import { GoogleGenAI } from "@google/genai";

export async function testLiveModel(
  config: LiveModelConfig,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal
): Promise<string> {
  if (config.provider === 'ollama') {
    const endpoint = config.endpoint || 'http://localhost:11434';
    const res = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        stream: false
      }),
      signal
    });
    if (!res.ok) throw new Error(`Ollama Error: ${res.statusText}`);
    const data = await res.json();
    return data.message.content;
  }

  if (config.provider === 'lmstudio') {
    const endpoint = config.endpoint || 'http://localhost:1234';
    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        stream: false
      }),
      signal
    });
    if (!res.ok) throw new Error(`LM Studio Error: ${res.statusText}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }
  
  if (config.provider === 'gemini') {
    const defaultKey = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_GEMINI_API_KEY : '';
    const ai = new GoogleGenAI({ apiKey: config.apiKey || defaultKey || 'no-key' });
    const res = await ai.models.generateContent({
      model: config.modelId,
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt
      }
    });
    return res.text || '';
  }

  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        stream: false
      }),
      signal
    });
    if (!res.ok) throw new Error(`OpenAI Error: ${res.statusText}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: config.modelId,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ],
        max_tokens: 4096
      }),
      signal
    });
    if (!res.ok) throw new Error(`Anthropic Error: ${res.statusText}`);
    const data = await res.json();
    return data.content[0].text;
  }

  throw new Error(`Unsupported provider: ${config.provider}`);
}
