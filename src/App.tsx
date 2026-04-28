import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { Film, Wind, AlertTriangle, RefreshCw, Sun, Moon, Settings, Eye, EyeOff, Github, Coffee } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MeditationGenerator from './MeditationGenerator';
import VideoGenerator from './VideoGenerator';
import type { Segment } from './audio-utils';
import { runIastifyLlm, describeIastifyBackend, formatIastifyUserFacingError } from './llm-iastify';
import { appFetch } from './app-fetch';

type Page = 'meditation' | 'video' | 'settings';
type Theme = 'light' | 'dark';
type TtsMode = 'free' | 'paid';
type TtsModel = 'gemini' | 'elevenlabs';
type LlmModel = 'gemini' | 'kimi' | 'deepseek';

const ELEVENLABS_VOICES: Record<string, string> = {
  in_m_whisper: 'TxGEqnHWrfWFTfGW9XjX', // Josh
  in_m_commanding: 'VR6AewLTigWG4xSOukaG', // Arnold
  in_f_whisper: 'EXAVITQu4vr4xnSDxMaL', // Bella
  in_f_commanding: 'AZnzlk1XvdvUeBnXmlld', // Domi
  us_m_whisper: 'pNInz6obpgDQGcFmaJgB', // Adam
  us_m_commanding: 'VR6AewLTigWG4xSOukaG', // Arnold
  us_f_whisper: '21m00Tcm4TlvDq8ikWAM', // Rachel
  us_f_commanding: 'MF3mGyEYCl7XYWbV9V6O', // Elli
};

const ELEVENLABS_VOICE_NAMES: Record<string, string> = {
  in_f_whisper: 'Aisiri',
  in_f_commanding: 'Aaliyah',
  in_m_whisper: 'Aahir',
  in_m_commanding: 'Aakash',
  us_f_whisper: 'AImee',
  us_f_commanding: 'Sultry',
  us_m_whisper: 'ASMR Mike',
  us_m_commanding: 'Alton',
};

function abortError(): DOMException {
  return new DOMException('Generation cancelled', 'AbortError');
}

type SettingsForm = {
  ttsMode: TtsMode;
  geminiTtsApiKey: string;
  elevenLabsApiKey: string;
  ttsModel: TtsModel;
  geminiLlmApiKey: string;
  kimiLlmApiKey: string;
  deepseekLlmApiKey: string;
  llmModel: LlmModel;
  geminiTtsModel: string;
  geminiLlmModel: string;
};

const GEMINI_TTS_MODELS = [
  { value: 'gemini-3.1-flash-tts-preview', label: 'Gemini 3.1 Flash TTS Preview (preferred)' },
  { value: 'gemini-2.5-flash-tts', label: 'Gemini 2.5 Flash TTS (fallback)' },
  { value: 'gemini-2.5-flash-lite-preview-tts', label: 'Gemini 2.5 Flash Lite TTS Preview (fallback)' },
] as const;

const GEMINI_LLM_MODELS = [
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (preferred)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (fallback)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fallback)' },
] as const;

const GEMINI_TTS_VOICES: Record<string, string> = {
  in_m_whisper: 'Charon',
  in_m_commanding: 'Orus',
  in_f_whisper: 'Kore',
  in_f_commanding: 'Leda',
  us_m_whisper: 'Puck',
  us_m_commanding: 'Fenrir',
  us_f_whisper: 'Aoede',
  us_f_commanding: 'Zephyr',
};

const PAID_TTS_VOICES = [
  { id: 'in_f_whisper', label: 'Indian accent, female, deep, whispery' },
  { id: 'in_f_commanding', label: 'Indian accent, female, deep, persuasive' },
  { id: 'in_m_whisper', label: 'Indian accent, male, deep, whispery' },
  { id: 'in_m_commanding', label: 'Indian accent, male, deep, persuasive' },
  { id: 'us_f_whisper', label: 'American English, female, deep, whispery' },
  { id: 'us_f_commanding', label: 'American English, female, deep, persuasive' },
  { id: 'us_m_whisper', label: 'American English, male, deep, whispery' },
  { id: 'us_m_commanding', label: 'American English, male, deep, persuasive' },
] as const;

const FREE_TTS_VOICES = [
  { id: 'af_bella', label: 'Bella (US F)' },
  { id: 'af_heart', label: 'Heart (US F)' },
  { id: 'af_sky', label: 'Sky (US F)' },
  { id: 'am_adam', label: 'Adam (US M)' },
  { id: 'am_michael', label: 'Michael (US M)' },
  { id: 'bf_emma', label: 'Emma (UK F)' },
  { id: 'bm_george', label: 'George (UK M)' },
] as const;

const TTS_STYLE_PROMPTS: Record<string, string> = {
  in_m_whisper: 
    'Speak in Indian accent using voice Zubenelgenubi, deep male voice, soft-spoken, low intensity, breathy but fully audible. Do not whisper. Maintain clear articulation.',

  in_m_commanding: 
    'Speak in Indian accent using voice Zubenelgenubi, deep authoritative tone, calm but commanding, slow pacing.',

  in_f_whisper: 
    'Speak in Indian accent using voice Sulafat, deep female voice, soft-spoken, low intensity, breathy but fully audible. Do not whisper. Maintain clear articulation.',

  in_f_commanding: 
    'Speak in Indian accent using voice Sulafat, deep mature female voice, confident and grounding, slow and clear.',

  us_m_whisper: 
    'Speak in American accent using voice Puck, deep male voice, soft-spoken, low intensity, breathy but fully audible. Do not whisper. Maintain clear articulation.',

  us_m_commanding: 
    'Speak in American accent using voice Puck, deep male voice, calm authority, slow pacing, grounded and confident.',

  us_f_whisper: 
    'Speak in American accent using voice Kore, deep female voice, soft-spoken, low intensity, breathy but fully audible. Do not whisper. Maintain clear articulation.',

  us_f_commanding: 
    'Speak in American accent using voice Kore, deep female voice, calm authority, meditative but firm.',
};

function buildSmartTtsPrompt(script: string, voiceStylePrompt: string): string {
  const cleanScript = script.trim();
  return [
    'You are narrating a guided meditation audio. This is a portion of a guided meditation script. Your task is to read the script aloud in a natural, flowing manner, following the voice style instructions.',
    `Voice style: ${voiceStylePrompt}`,
    'Tone: Calm, slow, meditative.',
    'Read only the SCRIPT content exactly as written; do not add introductions, labels, or commentary.',
    '',
    'SCRIPT:',
    cleanScript,
  ].join('\n');
}

function normalizeGeminiTtsModel(raw: string): string {
  const t = raw.trim();
  if (!t) return GEMINI_TTS_MODELS[0].value;
  if (t === 'gemini-3.1-flash-tts') return 'gemini-3.1-flash-tts-preview';
  if (GEMINI_TTS_MODELS.some(m => m.value === t)) return t;
  return GEMINI_TTS_MODELS[0].value;
}

function shouldTryNextGeminiTtsModel(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('not found') ||
    m.includes('not supported') ||
    m.includes('unsupported') ||
    m.includes('resource_exhausted') ||
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('429')
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>('meditation');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');
  const [ttsMode, setTtsMode] = useState<TtsMode>(() => (localStorage.getItem('tts_mode') as TtsMode) || 'free');
  const [geminiTtsApiKey, setGeminiTtsApiKey] = useState(() => localStorage.getItem('tts_gemini_api_key') || '');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(() => localStorage.getItem('tts_elevenlabs_api_key') || '');
  const [ttsModel, setTtsModel] = useState<TtsModel>(() => (localStorage.getItem('tts_model') as TtsModel) || 'gemini');
  const [geminiLlmApiKey, setGeminiLlmApiKey] = useState(() => localStorage.getItem('llm_gemini_api_key') || '');
  const [kimiLlmApiKey, setKimiLlmApiKey] = useState(() => localStorage.getItem('llm_kimi_api_key') || '');
  const [deepseekLlmApiKey, setDeepseekLlmApiKey] = useState(() => localStorage.getItem('llm_deepseek_api_key') || '');
  const [llmModel, setLlmModel] = useState<LlmModel>(() => (localStorage.getItem('llm_model_choice') as LlmModel) || 'gemini');
  const [geminiTtsModel, setGeminiTtsModel] = useState(() => normalizeGeminiTtsModel(localStorage.getItem('gemini_tts_model') || ''));
  const [geminiLlmModel, setGeminiLlmModel] = useState(() => localStorage.getItem('gemini_llm_model') || GEMINI_LLM_MODELS[0].value);
  const [showKey, setShowKey] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);

  const [settingsDraft, setSettingsDraft] = useState<SettingsForm | null>(null);
  const pageBeforeSettingsRef = useRef<Page | null>(null);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [title, setTitle] = useState('Guided Meditation 1');
  const [isGenerating, setIsGenerating] = useState(false);

  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [modelError, setModelError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingGenerations = useRef<Map<number, { resolve: (blob: Blob) => void; reject: (e: Error) => void }>>(new Map());
  const nextId = useRef(0);

  const hasGeminiTtsKey = geminiTtsApiKey.trim().length > 0;
  const hasElevenLabsTtsKey = elevenLabsApiKey.trim().length > 0;
  const availableTtsModels = useMemo(() => {
    const list: TtsModel[] = [];
    if (hasGeminiTtsKey) list.push('gemini');
    if (hasElevenLabsTtsKey) list.push('elevenlabs');
    return list;
  }, [hasGeminiTtsKey, hasElevenLabsTtsKey]);
  const activeTtsModel: TtsModel | null = availableTtsModels.includes(ttsModel) ? ttsModel : (availableTtsModels[0] ?? null);
  const usePaidMode = ttsMode === 'paid' && activeTtsModel !== null;
  const availableVoices = usePaidMode
    ? (activeTtsModel === 'elevenlabs' ? PAID_TTS_VOICES : PAID_TTS_VOICES)
    : FREE_TTS_VOICES;

  const hasGeminiLlmKey = geminiLlmApiKey.trim().length > 0;
  const hasKimiLlmKey = kimiLlmApiKey.trim().length > 0;
  const hasDeepseekLlmKey = deepseekLlmApiKey.trim().length > 0;
  const availableLlmModels = useMemo(() => {
    const list: LlmModel[] = [];
    if (hasGeminiLlmKey) list.push('gemini');
    if (hasKimiLlmKey) list.push('kimi');
    if (hasDeepseekLlmKey) list.push('deepseek');
    return list;
  }, [hasGeminiLlmKey, hasKimiLlmKey, hasDeepseekLlmKey]);
  const activeLlmModel: LlmModel | null = availableLlmModels.includes(llmModel) ? llmModel : (availableLlmModels[0] ?? null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const settingsSnapshot = useCallback((): SettingsForm => ({
    ttsMode,
    geminiTtsApiKey,
    elevenLabsApiKey,
    ttsModel,
    geminiLlmApiKey,
    kimiLlmApiKey,
    deepseekLlmApiKey,
    llmModel,
    geminiTtsModel,
    geminiLlmModel,
  }), [ttsMode, geminiTtsApiKey, elevenLabsApiKey, ttsModel, geminiLlmApiKey, kimiLlmApiKey, deepseekLlmApiKey, llmModel, geminiTtsModel, geminiLlmModel]);

  const goToSettings = useCallback(() => {
    if (activePage !== 'settings') {
      pageBeforeSettingsRef.current = activePage;
    }
    setSettingsDraft(settingsSnapshot());
    setActivePage('settings');
  }, [activePage, settingsSnapshot]);

  const saveSettings = useCallback(() => {
    if (!settingsDraft) return;
    const d = settingsDraft;
    setTtsMode(d.ttsMode);
    setGeminiTtsApiKey(d.geminiTtsApiKey);
    setElevenLabsApiKey(d.elevenLabsApiKey);
    setTtsModel(d.ttsModel);
    setGeminiLlmApiKey(d.geminiLlmApiKey);
    setKimiLlmApiKey(d.kimiLlmApiKey);
    setDeepseekLlmApiKey(d.deepseekLlmApiKey);
    setLlmModel(d.llmModel);
    setGeminiTtsModel(d.geminiTtsModel);
    setGeminiLlmModel(d.geminiLlmModel);
    localStorage.setItem('tts_mode', d.ttsMode);
    localStorage.setItem('tts_gemini_api_key', d.geminiTtsApiKey);
    localStorage.setItem('tts_elevenlabs_api_key', d.elevenLabsApiKey);
    localStorage.setItem('tts_model', d.ttsModel);
    localStorage.setItem('llm_gemini_api_key', d.geminiLlmApiKey);
    localStorage.setItem('llm_kimi_api_key', d.kimiLlmApiKey);
    localStorage.setItem('llm_deepseek_api_key', d.deepseekLlmApiKey);
    localStorage.setItem('llm_model_choice', d.llmModel);
    localStorage.setItem('gemini_tts_model', d.geminiTtsModel);
    localStorage.setItem('gemini_llm_model', d.geminiLlmModel);
    localStorage.removeItem('tts_api_key');
    localStorage.removeItem('llm_api_key');
    const back = pageBeforeSettingsRef.current;
    pageBeforeSettingsRef.current = null;
    setActivePage(back && back !== 'settings' ? back : 'meditation');
  }, [settingsDraft]);

  useLayoutEffect(() => {
    if (activePage === 'settings' && !settingsDraft) {
      setSettingsDraft(settingsSnapshot());
    }
  }, [activePage, settingsDraft, settingsSnapshot]);

  useEffect(() => {
    if (activePage !== 'settings') setSettingsDraft(null);
  }, [activePage]);

  useEffect(() => {
    if (!settingsDraft || activePage !== 'settings') return;
    const ttsChoices: TtsModel[] = [];
    if (settingsDraft.geminiTtsApiKey.trim()) ttsChoices.push('gemini');
    if (settingsDraft.elevenLabsApiKey.trim()) ttsChoices.push('elevenlabs');
    const llmChoices: LlmModel[] = [];
    if (settingsDraft.geminiLlmApiKey.trim()) llmChoices.push('gemini');
    if (settingsDraft.kimiLlmApiKey.trim()) llmChoices.push('kimi');
    if (settingsDraft.deepseekLlmApiKey.trim()) llmChoices.push('deepseek');
    if (ttsChoices.length && !ttsChoices.includes(settingsDraft.ttsModel)) {
      setSettingsDraft(p => (p ? { ...p, ttsModel: ttsChoices[0] } : p));
      return;
    }
    if (llmChoices.length && !llmChoices.includes(settingsDraft.llmModel)) {
      setSettingsDraft(p => (p ? { ...p, llmModel: llmChoices[0] } : p));
    }
  }, [activePage, settingsDraft]);

  const initTTS = useCallback(() => {
    setModelStatus('loading');
    setModelLoadProgress(0);
    setLoadedBytes(0);
    setTotalBytes(0);
    setModelError(null);

    if (workerRef.current) workerRef.current.terminate();

    const worker = new Worker(
      new URL('./tts.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      switch (msg.type) {
        case 'init-progress':
          setModelLoadProgress(msg.progress);
          setLoadedBytes(msg.loaded);
          setTotalBytes(msg.total);
          break;
        case 'init-ready':
          setModelStatus('ready');
          break;
        case 'init-error':
          setModelError(msg.error);
          setModelStatus('error');
          break;
        case 'generated': {
          const p = pendingGenerations.current.get(msg.id);
          if (p) { p.resolve(msg.blob as Blob); pendingGenerations.current.delete(msg.id); }
          break;
        }
        case 'generate-error': {
          const p = pendingGenerations.current.get(msg.id);
          if (p) { p.reject(new Error(msg.error)); pendingGenerations.current.delete(msg.id); }
          break;
        }
      }
    };

    worker.onerror = (e) => {
      console.error('TTS Worker error:', e);
      setModelError(e.message || 'Worker crashed');
      setModelStatus('error');
    };

    worker.postMessage({ type: 'init' });
  }, []);

  useEffect(() => { initTTS(); return () => { workerRef.current?.terminate(); }; }, [initTTS]);

  const resolveElevenLabsVoiceId = useCallback(async (voice: string, signal?: AbortSignal): Promise<string> => {
    const key = elevenLabsApiKey.trim();
    const desiredName = ELEVENLABS_VOICE_NAMES[voice];
    if (!desiredName) return ELEVENLABS_VOICES[voice] || 'TxGEqnHWrfWFTfGW9XjX';
    const res = await appFetch('https://api.elevenlabs.io/v1/voices', {
      signal,
      method: 'GET',
      headers: { 'xi-api-key': key },
    });
    if (!res.ok) return ELEVENLABS_VOICES[voice] || 'TxGEqnHWrfWFTfGW9XjX';
    const data = await res.json().catch(() => ({ voices: [] as { voice_id?: string; name?: string }[] }));
    const matched = (data.voices || []).find((v: { voice_id?: string; name?: string }) => (v.name || '').trim().toLowerCase() === desiredName.toLowerCase());
    return matched?.voice_id || ELEVENLABS_VOICES[voice] || 'TxGEqnHWrfWFTfGW9XjX';
  }, [elevenLabsApiKey]);

  const generateWithElevenLabs = useCallback(async (text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    const narratedText = buildSmartTtsPrompt(text, TTS_STYLE_PROMPTS[voice] || 'Deep, calm, slow meditative narration.');
    const voiceId = await resolveElevenLabsVoiceId(voice, signal);
    const res = await appFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      signal,
      method: 'POST',
      headers: { 'xi-api-key': elevenLabsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: narratedText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: { message: res.statusText } }));
      throw new Error(err.detail?.message || err.detail || `API error: ${res.status}`);
    }
    return res.blob();
  }, [elevenLabsApiKey, resolveElevenLabsVoiceId]);

  const generateWithGeminiTts = useCallback(async (text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    const k = geminiTtsApiKey.trim();
    const selectedModel = normalizeGeminiTtsModel(geminiTtsModel);
    const fallbackModels = GEMINI_TTS_MODELS.map(m => m.value).filter(m => m !== selectedModel);
    const modelsToTry = [selectedModel, ...fallbackModels];
    const selectedVoice = GEMINI_TTS_VOICES[voice] || 'Kore';
    const narratedText = buildSmartTtsPrompt(text, TTS_STYLE_PROMPTS[voice] || 'Deep, calm, slow meditative narration.');
    let lastError = 'Gemini TTS request failed';

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      const u = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
      u.searchParams.set('key', k);
      const res = await appFetch(u.toString(), {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: narratedText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        }),
      });
      const raw = await res.text();
      let data: {
        candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
        error?: { message?: string };
      } = {};
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        if (!res.ok) {
          lastError = `Gemini TTS failed on ${model}: ${res.status} ${res.statusText}`;
          const canRetry = i < modelsToTry.length - 1 && shouldTryNextGeminiTtsModel(lastError);
          if (canRetry) continue;
          throw new Error(lastError);
        }
      }
      if (!res.ok) {
        const msg = data.error?.message || `Gemini TTS failed: ${res.status}`;
        lastError = `Gemini TTS failed on ${model}: ${msg}`;
        const canRetry = i < modelsToTry.length - 1 && shouldTryNextGeminiTtsModel(msg);
        if (canRetry) continue;
        throw new Error(
          `${lastError}\n\n` +
          'If this persists, open Google AI Studio → API key project, ensure Generative Language API is enabled and billing is active, then check model availability for your region.',
        );
      }
      const inlineData = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
      const b64 = inlineData?.data;
      if (!b64) {
        lastError = `Gemini TTS returned no audio on ${model}.`;
        const canRetry = i < modelsToTry.length - 1;
        if (canRetry) continue;
        throw new Error(lastError);
      }
      const binary = atob(b64);
      const u8 = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) u8[j] = binary.charCodeAt(j);
      const mime = inlineData?.mimeType || 'audio/wav';
      return new Blob([u8], { type: mime });
    }
    throw new Error(lastError);
  }, [geminiTtsApiKey, geminiTtsModel]);

  const generateWithAPI = useCallback(async (text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    if (activeTtsModel === 'gemini') return generateWithGeminiTts(text, voice, signal);
    if (activeTtsModel === 'elevenlabs') return generateWithElevenLabs(text, voice, signal);
    throw new Error('No TTS model is available. Add a Gemini or ElevenLabs TTS API key in Settings.');
  }, [activeTtsModel, generateWithElevenLabs, generateWithGeminiTts]);

  const generateWithWorker = useCallback((text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    return new Promise<Blob>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }

      const id = nextId.current++;
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        fn();
      };

      const onAbort = () => {
        pendingGenerations.current.delete(id);
        workerRef.current?.postMessage({ type: 'cancel-generate', id });
        finish(() => reject(abortError()));
      };

      signal?.addEventListener('abort', onAbort);

      pendingGenerations.current.set(id, {
        resolve: (blob) => finish(() => resolve(blob)),
        reject: (e) => finish(() => reject(e)),
      });
      workerRef.current?.postMessage({ type: 'generate', id, text, voice });
    });
  }, []);

  const generateSegment = useCallback((text: string, voice: string, opts?: { signal?: AbortSignal }): Promise<Blob> => {
    const signal = opts?.signal;
    if (usePaidMode) return generateWithAPI(text, voice, signal);
    return generateWithWorker(text, voice, signal);
  }, [usePaidMode, generateWithAPI, generateWithWorker]);

  const effectiveModelReady = usePaidMode || modelStatus === 'ready';
  const showSplash = !usePaidMode && modelStatus !== 'ready';
  const effectiveIastifyApiKey = useMemo(() => {
    if (activeLlmModel === 'gemini') return geminiLlmApiKey.trim();
    if (activeLlmModel === 'kimi') return kimiLlmApiKey.trim();
    if (activeLlmModel === 'deepseek') return deepseekLlmApiKey.trim();
    return '';
  }, [activeLlmModel, geminiLlmApiKey, kimiLlmApiKey, deepseekLlmApiKey]);
  const hasLlmKey = effectiveIastifyApiKey.length > 0;

  const iastifyScript = useCallback(async (script: string) => {
    try {
      return await runIastifyLlm(script, {
        apiKey: effectiveIastifyApiKey,
        backend: activeLlmModel || 'gemini',
        geminiModel: geminiLlmModel,
        geminiFallbackModels: GEMINI_LLM_MODELS.map(m => m.value).filter(m => m !== geminiLlmModel),
      });
    } catch (e) {
      const backend = describeIastifyBackend(effectiveIastifyApiKey, activeLlmModel || undefined);
      const detail = formatIastifyUserFacingError(e);
      throw new Error(`Backend: ${backend}\n\n${detail}`);
    }
  }, [effectiveIastifyApiKey, activeLlmModel, geminiLlmModel]);

  const MeditateIcon = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="2.5"/>
      <path d="M12 7v4"/>
      <path d="M8 10c-2 1-4 3-5 5"/>
      <path d="M16 10c2 1 4 3 5 5"/>
      <path d="M4 17c3-4 5.5-5.5 8-5.5s5 1.5 8 5.5"/>
    </svg>
  );

  const sidebarItems: { id: Page; icon: React.FC<{ size?: number; strokeWidth?: number }>; label: string }[] = [
    { id: 'meditation', icon: MeditateIcon, label: 'Meditation' },
    { id: 'video', icon: Film, label: 'Video' },
  ];

  return (
    <div className="h-screen flex bg-[var(--bg)] text-[var(--text-primary)] font-sans select-none">
      {/* Model loading splash (only in free mode) */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-50 bg-[var(--splash-bg)] flex items-center justify-center"
          >
            <div className="flex flex-col items-center text-center px-6 max-w-sm w-full">
              <img
                src="/logo.png"
                alt="ZenGM logo"
                className="w-20 h-20 object-contain mb-5 drop-shadow-sm rounded-full border border-[var(--border)]"
              />
              <br/>
              <h1 className="text-2xl font-light tracking-tight mb-1">ZenGM - Guided Meditation Generator</h1>
              <p className="text-[var(--text-muted)] text-xs mb-8">Loading voice model</p>

              {modelStatus === 'loading' && (
                <div className="w-full space-y-2">
                  <div className="w-full h-1 bg-[var(--bg-input)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[var(--accent)] rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${modelLoadProgress}%` }}
                      transition={{ ease: 'easeOut' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                    <span>
                      {totalBytes > 0
                        ? `${(loadedBytes / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`
                        : 'Connecting...'}
                    </span>
                    <span>{Math.round(modelLoadProgress)}%</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-3">~80 MB &middot; cached after first load</p>
                </div>
              )}

              {modelStatus === 'error' && (
                <div className="w-full space-y-3">
                  <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                    <p className="text-red-400 text-xs">{modelError}</p>
                  </div>
                  <button
                    onClick={initTTS}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[var(--bg-hover)] border border-[var(--border)] rounded text-xs hover:bg-[var(--bg-active)] transition"
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <nav className="w-11 shrink-0 bg-[var(--bg-sidebar)] border-r border-[var(--border)] flex flex-col items-center pt-2.5 gap-0.5">
        
        {sidebarItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            title={item.label}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              activePage === item.id
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <item.icon size={14} strokeWidth={1.5} />
          </button>
        ))}

        <div className="mt-auto mb-2 flex flex-col items-center gap-1">
          <button
            onClick={goToSettings}
            title="Settings"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              activePage === 'settings'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Settings size={13} strokeWidth={1.5} />
          </button>
          <a
            href="https://github.com/bigyanchap/Guided-Meditation-Generator"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub repository"
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            onClick={(e) => {
              if (window.electronAPI) {
                e.preventDefault();
                void window.electronAPI.openExternal('https://github.com/bigyanchap/Guided-Meditation-Generator');
              }
            }}
          >
            <Github size={13} strokeWidth={1.5} />
          </a>
          <a
            href="https://buymeacoffee.com/bigyanchap"
            target="_blank"
            rel="noopener noreferrer"
            title="Support on Buy Me a Coffee"
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            onClick={(e) => {
              if (window.electronAPI) {
                e.preventDefault();
                void window.electronAPI.openExternal('https://buymeacoffee.com/bigyanchap');
              }
            }}
          >
            <Coffee size={13} strokeWidth={1.5} />
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            {theme === 'light' ? <Moon size={13} strokeWidth={1.5} /> : <Sun size={13} strokeWidth={1.5} />}
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activePage === 'meditation' && (
          <MeditationGenerator
            segments={segments}
            setSegments={setSegments}
            title={title}
            setTitle={setTitle}
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
            modelStatus={effectiveModelReady ? 'ready' : modelStatus}
            generateSegment={generateSegment}
            hasLlmApiKey={hasLlmKey}
            iastifyScript={iastifyScript}
            onOpenSettings={goToSettings}
            onCreateVideo={() => setActivePage('video')}
            voices={availableVoices}
          />
        )}
        {activePage === 'video' && (
          <VideoGenerator segments={segments} title={title} onGoToMeditation={() => setActivePage('meditation')} />
        )}
        {activePage === 'settings' && settingsDraft && (
          <div className="h-full overflow-y-auto px-6 py-5">
            <div className="max-w-2xl pb-6">
              <h2 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Settings</h2>
              <p className="text-[10px] text-[var(--text-muted)] mb-4 px-0.5">
                Changes apply when you press Save. Leaving without saving discards edits.
              </p>

              <div className="mb-5">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2.5">TTS Engine</div>

                <div className="relative flex rounded-full p-[3px] border border-[var(--glass-border)]" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(12px)' }}>
                  <motion.div
                    className="absolute top-[3px] bottom-[3px] rounded-full"
                    style={{
                      background: 'var(--glass-indicator)',
                      border: '1px solid var(--glass-indicator-border)',
                      boxShadow: '0 2px 8px rgba(212,149,106,0.15)',
                      width: 'calc(50% - 3px)',
                    }}
                    animate={{ left: settingsDraft.ttsMode === 'free' ? '3px' : 'calc(50%)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                  <button
                    type="button"
                    onClick={() => setSettingsDraft(p => p ? { ...p, ttsMode: 'free' } : p)}
                    className={`relative z-10 flex-1 px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                      settingsDraft.ttsMode === 'free' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    Free (Local)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsDraft(p => p ? { ...p, ttsMode: 'paid' } : p)}
                    className={`relative z-10 flex-1 px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                      settingsDraft.ttsMode === 'paid' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    API Key
                  </button>
                </div>

                <p className="text-[10px] text-[var(--text-muted)] mt-2 px-1">
                  {settingsDraft.ttsMode === 'free'
                    ? 'Uses Kokoro-82M running locally in your browser. Free, private, ~80 MB download.'
                    : 'Uses TTS API. Depends on the provider like OpenAI or ElevenLabs. Higher quality, no model download, requires API key.'}
                </p>
              </div>

              <AnimatePresence>
                {settingsDraft.ttsMode === 'paid' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Gemini TTS API Key</div>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={settingsDraft.geminiTtsApiKey}
                          onChange={e => setSettingsDraft(p => p ? { ...p, geminiTtsApiKey: e.target.value } : p)}
                          placeholder="Paste Gemini API key..."
                          className="w-full select-text bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm pr-9 outline-none focus:border-[var(--border-strong)] transition font-mono text-[var(--text-primary)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                        >
                          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1.5 px-1 leading-relaxed">
                        If set, Gemini TTS model appears below and can be selected.
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">ElevenLabs TTS API Key</div>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={settingsDraft.elevenLabsApiKey}
                          onChange={e => setSettingsDraft(p => p ? { ...p, elevenLabsApiKey: e.target.value } : p)}
                          placeholder="Paste ElevenLabs API key..."
                          className="w-full select-text bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm pr-9 outline-none focus:border-[var(--border-strong)] transition font-mono text-[var(--text-primary)]"
                        />
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1.5 px-1 leading-relaxed">
                        If set, ElevenLabs TTS model appears and meditation voice dropdown switches to ElevenLabs voices.
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">TTS Model</div>
                      <select
                        value={settingsDraft.ttsModel}
                        onChange={e => setSettingsDraft(p => p ? { ...p, ttsModel: e.target.value as TtsModel } : p)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)] transition text-[var(--text-primary)]"
                      >
                        {settingsDraft.geminiTtsApiKey.trim() && <option value="gemini">Gemini TTS Model</option>}
                        {settingsDraft.elevenLabsApiKey.trim() && <option value="elevenlabs">ElevenLabs TTS Model</option>}
                      </select>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1.5 px-1 leading-relaxed">
                        A model appears only when its API key is filled.
                      </p>
                    </div>

                    {settingsDraft.geminiTtsApiKey.trim() && (
                      <div className="mb-4">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Gemini TTS Model</div>
                        <select
                          value={settingsDraft.geminiTtsModel}
                          onChange={e => setSettingsDraft(p => p ? { ...p, geminiTtsModel: e.target.value } : p)}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)] transition text-[var(--text-primary)]"
                        >
                          {GEMINI_TTS_MODELS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Gemini LLM API Key</div>
                      <div className="relative">
                        <input
                          type={showLlmKey ? 'text' : 'password'}
                          value={settingsDraft.geminiLlmApiKey}
                          onChange={e => setSettingsDraft(p => p ? { ...p, geminiLlmApiKey: e.target.value } : p)}
                          placeholder="Paste Gemini LLM API key..."
                          className="w-full select-text bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm pr-9 outline-none focus:border-[var(--border-strong)] transition font-mono text-[var(--text-primary)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLlmKey(!showLlmKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                        >
                          {showLlmKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Kimi K2.6 LLM API Key</div>
                      <div className="relative">
                        <input
                          type={showLlmKey ? 'text' : 'password'}
                          value={settingsDraft.kimiLlmApiKey}
                          onChange={e => setSettingsDraft(p => p ? { ...p, kimiLlmApiKey: e.target.value } : p)}
                          placeholder="Paste Kimi API key..."
                          className="w-full select-text bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm pr-9 outline-none focus:border-[var(--border-strong)] transition font-mono text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">DeepSeek LLM API Key</div>
                      <div className="relative">
                        <input
                          type={showLlmKey ? 'text' : 'password'}
                          value={settingsDraft.deepseekLlmApiKey}
                          onChange={e => setSettingsDraft(p => p ? { ...p, deepseekLlmApiKey: e.target.value } : p)}
                          placeholder="Paste DeepSeek API key..."
                          className="w-full select-text bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm pr-9 outline-none focus:border-[var(--border-strong)] transition font-mono text-[var(--text-primary)]"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">LLM Model</div>
                      <select
                        value={settingsDraft.llmModel}
                        onChange={e => setSettingsDraft(p => p ? { ...p, llmModel: e.target.value as LlmModel } : p)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)] transition text-[var(--text-primary)]"
                      >
                        {settingsDraft.geminiLlmApiKey.trim() && <option value="gemini">Gemini</option>}
                        {settingsDraft.kimiLlmApiKey.trim() && <option value="kimi">Kimi K2.6</option>}
                        {settingsDraft.deepseekLlmApiKey.trim() && <option value="deepseek">DeepSeek</option>}
                      </select>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1.5 px-1 leading-relaxed">
                        A model appears only when its API key is filled.
                      </p>
                    </div>

                    {settingsDraft.geminiLlmApiKey.trim() && settingsDraft.llmModel === 'gemini' && (
                      <div className="mb-4">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Gemini LLM Model (IASTify)</div>
                        <select
                          value={settingsDraft.geminiLlmModel}
                          onChange={e => setSettingsDraft(p => p ? { ...p, geminiLlmModel: e.target.value } : p)}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)] transition text-[var(--text-primary)]"
                        >
                          {GEMINI_LLM_MODELS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-6 pt-4 border-t border-[var(--border)] flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={saveSettings}
                  className="px-4 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); }
      `}</style>
    </div>
  );
}
