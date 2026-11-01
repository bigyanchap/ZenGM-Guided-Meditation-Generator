import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { Film, Wind, AlertTriangle, RefreshCw, Sun, Moon, Settings, Eye, EyeOff, Github, Coffee } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MeditationGenerator from './MeditationGenerator';
import VideoGenerator from './VideoGenerator';
import type { Segment } from './audio-utils';
import { composeElevenLabsMusic, ELEVENLABS_TTS_MODELS, ELEVENLABS_MUSIC_MODELS } from './elevenlabs-music';
import { appFetch } from './app-fetch';

type Page = 'meditation' | 'video' | 'settings';
type Theme = 'light' | 'dark';
type TtsMode = 'free' | 'paid';

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
  elevenLabsApiKey: string;
  elevenLabsTtsModel: string;
  elevenLabsMusicModel: string;
}

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

export default function App() {
  const [activePage, setActivePage] = useState<Page>('meditation');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');
  const [ttsMode, setTtsMode] = useState<TtsMode>(() => (localStorage.getItem('tts_mode') as TtsMode) || 'free');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(() => localStorage.getItem('tts_elevenlabs_api_key') || '');
  const [elevenLabsTtsModel, setElevenLabsTtsModel] = useState(() => localStorage.getItem('elevenlabs_tts_model') || ELEVENLABS_TTS_MODELS[0].value);
  const [elevenLabsMusicModel, setElevenLabsMusicModel] = useState(() => localStorage.getItem('elevenlabs_music_model') || ELEVENLABS_MUSIC_MODELS[0].value);
  const [showKey, setShowKey] = useState(false);

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

  const hasElevenLabsTtsKey = elevenLabsApiKey.trim().length > 0;
  const usePaidMode = ttsMode === 'paid' && hasElevenLabsTtsKey;
  const availableVoices = usePaidMode ? PAID_TTS_VOICES : FREE_TTS_VOICES;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const settingsSnapshot = useCallback((): SettingsForm => ({
    ttsMode,
    elevenLabsApiKey,
    elevenLabsTtsModel,
    elevenLabsMusicModel,
  }), [ttsMode, elevenLabsApiKey, elevenLabsTtsModel, elevenLabsMusicModel]);

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
    setElevenLabsApiKey(d.elevenLabsApiKey);
    setElevenLabsTtsModel(d.elevenLabsTtsModel);
    setElevenLabsMusicModel(d.elevenLabsMusicModel);
    localStorage.setItem('tts_mode', d.ttsMode);
    localStorage.setItem('tts_elevenlabs_api_key', d.elevenLabsApiKey);
    localStorage.setItem('elevenlabs_tts_model', d.elevenLabsTtsModel);
    localStorage.setItem('elevenlabs_music_model', d.elevenLabsMusicModel);
    // Clean up keys from removed providers (Gemini / Kimi / DeepSeek / OpenAI era).
    for (const k of ['tts_gemini_api_key', 'tts_model', 'llm_gemini_api_key', 'llm_kimi_api_key',
      'llm_deepseek_api_key', 'llm_model_choice', 'gemini_tts_model', 'gemini_llm_model',
      'tts_api_key', 'llm_api_key']) {
      localStorage.removeItem(k);
    }
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
    const voiceId = await resolveElevenLabsVoiceId(voice, signal);
    const res = await appFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      signal,
      method: 'POST',
      headers: { 'xi-api-key': elevenLabsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: elevenLabsTtsModel,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: { message: res.statusText } }));
      throw new Error(err.detail?.message || err.detail || `API error: ${res.status}`);
    }
    return res.blob();
  }, [elevenLabsApiKey, elevenLabsTtsModel, resolveElevenLabsVoiceId]);

  const generateWithAPI = useCallback(async (text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    if (!hasElevenLabsTtsKey) throw new Error('No ElevenLabs API key. Add it in Settings, or switch TTS Engine to Free (Local).');
    return generateWithElevenLabs(text, voice, signal);
  }, [hasElevenLabsTtsKey, generateWithElevenLabs]);

  const composeElevenLabsMusicCb = useCallback((compositionPlan: Record<string, unknown>, signal?: AbortSignal): Promise<Blob> => {
    return composeElevenLabsMusic({
      apiKey: elevenLabsApiKey,
      modelId: elevenLabsMusicModel,
      compositionPlan,
      signal,
    });
  }, [elevenLabsApiKey, elevenLabsMusicModel]);

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
            hasElevenLabsKey={hasElevenLabsTtsKey}
            composeElevenLabsMusic={composeElevenLabsMusicCb}
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
                    : 'Uses the ElevenLabs API — the only API in ZenGM — for voice and music. Higher quality, no model download, requires an API key.'}
                </p>
              </div>

              {settingsDraft.ttsMode === 'paid' && (
                  <div>
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">ElevenLabs API Key (the only API key in ZenGM)</div>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={settingsDraft.elevenLabsApiKey}
                          onChange={e => setSettingsDraft(p => p ? { ...p, elevenLabsApiKey: e.target.value } : p)}
                          placeholder="Paste ElevenLabs API key..."
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
                        Powers both ElevenLabs voice (TTS) and ElevenLabs Music. Stored only in this browser, never sent anywhere except ElevenLabs.
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">ElevenLabs TTS Model</div>
                      <select
                        value={settingsDraft.elevenLabsTtsModel}
                        onChange={e => setSettingsDraft(p => p ? { ...p, elevenLabsTtsModel: e.target.value } : p)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)] transition text-[var(--text-primary)]"
                      >
                        {ELEVENLABS_TTS_MODELS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">ElevenLabs Music Model</div>
                      <select
                        value={settingsDraft.elevenLabsMusicModel}
                        onChange={e => setSettingsDraft(p => p ? { ...p, elevenLabsMusicModel: e.target.value } : p)}
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)] transition text-[var(--text-primary)]"
                      >
                        {ELEVENLABS_MUSIC_MODELS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1.5 px-1 leading-relaxed">
                        Used by the Music Bed blueprint when its source is ElevenLabs. The free ZenGM Synth needs no key at all.
                      </p>
                    </div>
                  </div>
                )}

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
