import { appFetch } from './app-fetch';
type LlmBackend = 'gemini' | 'kimi' | 'deepseek';

/** Redact secrets from error strings shown in the UI. */
export function sanitizeLlmErrorMessage(raw: string): string {
  return raw
    .replace(/\bAIzaSy[A-Za-z0-9_-]+\b/g, 'AIza[…]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, 'sk-[…]')
    .replace(/\bhf_[A-Za-z0-9_-]{6,}/g, 'hf_[…]')
    .replace(/on behalf of user\s+[^\s"'}\]]+/gi, 'on behalf of user […]');
}

/** Which remote IASTify path is used for this key (for error headers). */
export function describeIastifyBackend(apiKey: string, backendHint?: LlmBackend): string {
  const k = apiKey.trim();
  if (!k) return 'No API key';
  if (backendHint === 'gemini') return 'Google Gemini';
  if (backendHint === 'kimi') return 'Kimi K2.6';
  if (backendHint === 'deepseek') return 'DeepSeek';
  if (k.startsWith('AIza')) return 'Google Gemini';
  if (isHfKey(k)) return 'Hugging Face';
  if (/^[a-f0-9]{32}$/i.test(k)) return 'ElevenLabs (not used for IASTify)';
  return 'OpenAI chat';
}

/**
 * Turn thrown values into a readable, multi-line message (fetch failures, causes, AggregateError).
 */
export function formatIastifyUserFacingError(err: unknown): string {
  if (err instanceof DOMException) {
    return `${err.name}: ${err.message}${err.code ? ` (code ${err.code})` : ''}`;
  }
  if (err instanceof TypeError) {
    const msg = err.message || 'TypeError';
    if (/failed to fetch/i.test(msg)) {
      return (
        `${err.name}: ${msg}\n\n` +
        'The browser did not receive any HTTP response. Common causes:\n' +
        '• No network, VPN, firewall, or corporate proxy blocking outbound HTTPS\n' +
        '• Hosts used by IASTify: api.openai.com, generativelanguage.googleapis.com, router.huggingface.co, api-inference.huggingface.co\n' +
        '• In this app: View → Toggle Developer Tools → Network, click IASTify again, and inspect the failed request (red) for status or “(blocked)”\n' +
        '• Ad blockers / privacy tools blocking API calls\n' +
        '• Electron: antivirus “HTTPS scanning” breaking TLS (try an exception for this app)'
      );
    }
    return `${err.name}: ${msg}`;
  }
  if (typeof AggregateError !== 'undefined' && err instanceof AggregateError && err.errors?.length) {
    return `AggregateError (${err.errors.length} sub-errors):\n${err.errors.map((e, i) => `  ${i + 1}. ${formatIastifyUserFacingError(e)}`).join('\n')}`;
  }
  if (err instanceof Error) {
    let s = err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message;
    const c = (err as Error & { cause?: unknown }).cause;
    if (c !== undefined && c !== null) {
      s += `\n\nCaused by:\n${formatIastifyUserFacingError(c)}`;
    }
    return s;
  }
  return String(err);
}

function isHfKey(apiKey: string): boolean {
  return apiKey.trim().startsWith('hf_');
}

/** OpenAI-style chat on the HF router (needs token permission: Inference Providers). */
const HF_OPENAI_CHAT = 'https://router.huggingface.co/v1/chat/completions';
const HF_LLM_MODELS = [
  'Qwen/Qwen2.5-0.5B-Instruct:hf-inference',
  'HuggingFaceTB/SmolLM2-1.7B-Instruct:hf-inference',
  'meta-llama/Llama-3.2-1B-Instruct:hf-inference',
] as const;

/** Classic serverless text-generation (works with a normal read token + Inference API access). */
const HF_SERVERLESS_TEXT_MODELS = [
  'Qwen/Qwen2.5-0.5B-Instruct',
  'HuggingFaceTB/SmolLM2-1.7B-Instruct',
] as const;

function parseHfJsonError(raw: string): string {
  const t = raw.trim();
  if (!t) return 'Unknown error';
  try {
    const j = JSON.parse(t) as { error?: string | { message?: string } };
    if (typeof j.error === 'string') return j.error;
    if (j.error && typeof j.error === 'object' && 'message' in j.error) {
      return String((j.error as { message: string }).message);
    }
  } catch {
    return t.length > 280 ? `${t.slice(0, 220)}…` : t;
  }
  return t;
}

function isRouterPermissionError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('inference providers') ||
    m.includes('sufficient permissions') ||
    m.includes('authentication method does not have') ||
    m.includes('on behalf of user') ||
    m.includes('inference end')
  );
}

function extractHfGeneratedText(data: unknown): string | null {
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object' && 'generated_text' in (data[0] as object)) {
    const g = (data[0] as { generated_text?: string }).generated_text;
    if (typeof g === 'string' && g.trim()) return g.trim();
  }
  if (data && typeof data === 'object' && data !== null && 'generated_text' in data) {
    const g = (data as { generated_text: string }).generated_text;
    if (typeof g === 'string' && g.trim()) return g.trim();
  }
  return null;
}

/**
 * Public Inference API (no Inference Providers / router) — text generation on a small instruct model.
 */
async function huggingFaceServerlessText(
  apiKey: string,
  userContent: string,
  signal?: AbortSignal,
): Promise<string> {
  let lastErr = '';
  for (let i = 0; i < HF_SERVERLESS_TEXT_MODELS.length; i++) {
    const modelId = HF_SERVERLESS_TEXT_MODELS[i];
    const res = await appFetch(
      `https://api-inference.huggingface.co/models/${encodeURIComponent(modelId)}`,
      {
        method: 'POST',
        signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: userContent,
          parameters: {
            max_new_tokens: 8192,
            return_full_text: false,
            temperature: 0.01,
            do_sample: false,
          },
        }),
      },
    );
    const raw = await res.text();
    if (!res.ok) {
      const errMsg = parseHfJsonError(raw);
      lastErr = errMsg;
      const low = errMsg.toLowerCase();
      if (
        i < HF_SERVERLESS_TEXT_MODELS.length - 1 &&
        (res.status === 404 || low.includes('not found') || low.includes('is currently loading') || res.status === 503)
      ) {
        continue;
      }
      throw new Error(
        `${sanitizeLlmErrorMessage(errMsg)}\n\n` +
          'For Hugging Face: hamburger menu → Access tokens. Use a token with the right to call the public Inference API (or fine-grained: at least "Make calls to the Inference API"). ' +
          'The router path also needs "Access Inference Providers" if you use only that. This app will fall back from the router to serverless when permissions allow.',
      );
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('Hugging Face returned an invalid response.');
    }
    const out = extractHfGeneratedText(data);
    if (out) return out;
    if (i < HF_SERVERLESS_TEXT_MODELS.length - 1) continue;
    lastErr = 'Model returned an empty result.';
  }
  throw new Error(sanitizeLlmErrorMessage(lastErr) || 'Hugging Face text generation failed.');
}

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
/** Defaults can be overridden from Settings for Gemini keys. */
const DEFAULT_GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'] as const;

function shouldTryNextGeminiModel(errMsg: string): boolean {
  const m = errMsg.toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('exhausted') ||
    m.includes('resource_exhausted') ||
    m.includes('not found') ||
    m.includes('is not found') ||
    m.includes('not supported')
  );
}

function appendGeminiSetupHint(sanitizedMessage: string, rawForHints: string): string {
  const low = rawForHints.toLowerCase();
  if (
    !low.includes('quota') &&
    !low.includes('exhausted') &&
    !low.includes('resource_exhausted') &&
    !low.includes('billing') &&
    !low.includes('permission') &&
    !low.includes('api key not valid') &&
    !low.includes('consumer_suspended')
  ) {
    return sanitizedMessage;
  }
  return (
    `${sanitizedMessage}\n\n` +
    'This is usually a Google Cloud project setup issue, not a “new key” bug. ' +
    'Enable the “Generative Language API” for the project that owns this key, check API key restrictions, and billing if Google requires it. ' +
    'Quotas are per project and per day. A key from https://aistudio.google.com/apikey is made for the Gemini API.'
  );
}

function isGeminiKey(apiKey: string): boolean {
  return apiKey.trim().startsWith('AIza');
}

async function huggingFaceChatCompletions(
  apiKey: string,
  userContent: string,
  signal?: AbortSignal,
): Promise<string> {
  let lastError = 'Hugging Face chat failed';
  for (let m = 0; m < HF_LLM_MODELS.length; m++) {
    const model = HF_LLM_MODELS[m];
    const res = await appFetch(HF_OPENAI_CHAT, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0,
        max_tokens: 8192,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      const errMsg = parseHfJsonError(raw);
      lastError = errMsg;
      if (res.status === 403 || isRouterPermissionError(errMsg)) {
        return huggingFaceServerlessText(apiKey, userContent, signal);
      }
      const low = errMsg.toLowerCase();
      if (
        m < HF_LLM_MODELS.length - 1 &&
        (res.status === 404 ||
          res.status === 400 ||
          low.includes('not found') ||
          low.includes('unavailable') ||
          low.includes('not supported') ||
          low.includes('model'))
      ) {
        continue;
      }
      throw new Error(sanitizeLlmErrorMessage(errMsg));
    }
    const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
    const c = data.choices?.[0]?.message?.content;
    if (c && typeof c === 'string') return c;
    if (m < HF_LLM_MODELS.length - 1) continue;
    throw new Error('LLM returned an empty response.');
  }
  if (isRouterPermissionError(lastError)) {
    return huggingFaceServerlessText(apiKey, userContent, signal);
  }
  throw new Error(sanitizeLlmErrorMessage(lastError));
}

export async function runIastifyLlm(
  script: string,
  options: { apiKey: string; backend: LlmBackend; signal?: AbortSignal; geminiModel?: string; geminiFallbackModels?: string[] },
): Promise<string> {
  const { apiKey, backend, signal, geminiModel, geminiFallbackModels } = options;
  const k = apiKey.trim();
  if (!k) throw new Error('LLM API key is missing.');

  const prompt = `You are a Sanskrit transliteration assistant. Convert every Sanskrit word in the following Guided Meditation script into its correct IAST (International Alphabet of Sanskrit Transliteration) form, preserving all non-Sanskrit text, punctuation, formatting, and line breaks exactly as they appear.

Output requirements:
- Return ONLY the transliterated script.
- Do not include any introductions, explanations, confirmations, or closing remarks (e.g., do not write "Here is the result" or similar).
- Do not wrap the output in code blocks or quotation marks.

Script:
${script}`;

  if (backend === 'gemini') {
    let lastRaw = 'Gemini request failed';
    const orderedGeminiModels = [
      ...(geminiModel?.trim() ? [geminiModel.trim()] : []),
      ...(geminiFallbackModels ?? []).map(m => m.trim()).filter(Boolean),
      ...DEFAULT_GEMINI_MODELS,
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);
    for (let i = 0; i < orderedGeminiModels.length; i++) {
      const model = orderedGeminiModels[i];
      try {
        return await geminiGenerate(model, k, prompt, signal);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastRaw = msg;
        const tryNext = i < orderedGeminiModels.length - 1 && shouldTryNextGeminiModel(msg);
        if (tryNext) continue;
        throw new Error(appendGeminiSetupHint(sanitizeLlmErrorMessage(msg), msg));
      }
    }
    throw new Error(appendGeminiSetupHint(sanitizeLlmErrorMessage(lastRaw), lastRaw));
  }

  if (backend === 'kimi') {
    return openAiCompatibleChat('https://api.moonshot.ai/v1', 'kimi-k2-0711-preview', k, prompt, signal);
  }

  if (backend === 'deepseek') {
    return openAiCompatibleChat('https://api.deepseek.com/v1', 'deepseek-chat', k, prompt, signal);
  }

  const base = DEFAULT_OPENAI_BASE.replace(/\/$/, '');
  return openAiCompatibleChat(base, DEFAULT_OPENAI_MODEL, k, prompt, signal);
}

async function openAiCompatibleChat(
  baseUrl: string,
  model: string,
  apiKey: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const base = baseUrl.replace(/\/$/, '');
  const res = await appFetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  });

  const rawText = await res.text();
  let data: { choices?: { message?: { content?: string } }[]; error?: { message?: string } } = {};
  try {
    data = JSON.parse(rawText) as typeof data;
  } catch {
    if (!res.ok) throw new Error(sanitizeLlmErrorMessage(`LLM request failed: ${res.status} ${res.statusText}`));
  }

  if (!res.ok) {
    const msg = data.error?.message || `API error: ${res.status}`;
    throw new Error(sanitizeLlmErrorMessage(msg));
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('LLM returned an empty response.');
  }
  return content;
}

async function geminiGenerate(
  model: string,
  apiKey: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const u = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
  );
  u.searchParams.set('key', apiKey);

  const res = await appFetch(u.toString(), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    }),
  });

  const rawText = await res.text();
  let data: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string; status?: string };
  } = {};
  try {
    data = JSON.parse(rawText) as typeof data;
  } catch {
    if (!res.ok) throw new Error(sanitizeLlmErrorMessage(`LLM request failed: ${res.status} ${res.statusText}`));
  }

  if (!res.ok) {
    const msg = data.error?.message || `API error: ${res.status}`;
    throw new Error(sanitizeLlmErrorMessage(msg));
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('LLM returned an empty response.');
  }
  return text;
}
