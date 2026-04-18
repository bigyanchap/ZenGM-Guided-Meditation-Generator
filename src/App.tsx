import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Film, Wind, AlertTriangle, RefreshCw, Sun, Moon, Settings, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MeditationGenerator from './MeditationGenerator';
import VideoGenerator from './VideoGenerator';
import type { Segment } from './audio-utils';

type Page = 'meditation' | 'video';
type Theme = 'light' | 'dark';
type TtsMode = 'free' | 'paid';
type TtsProvider = 'openai' | 'elevenlabs' | 'unknown';

const OPENAI_VOICES: Record<string, string> = {
  af_heart: 'nova', af_bella: 'alloy', af_sky: 'shimmer',
  am_adam: 'echo', am_michael: 'onyx',
  bf_emma: 'shimmer', bm_george: 'fable',
};

const ELEVENLABS_VOICES: Record<string, string> = {
  af_heart: '21m00Tcm4TlvDq8ikWAM',  // Rachel
  af_bella: 'EXAVITQu4vr4xnSDxMaL',  // Bella
  af_sky: 'MF3mGyEYCl7XYWbV9V6O',    // Elli
  am_adam: 'pNInz6obpgDQGcFmaJgB',    // Adam
  am_michael: 'TxGEqnHWrfWFTfGW9XjX', // Josh
  bf_emma: 'AZnzlk1XvdvUeBnXmlld',    // Domi
  bm_george: 'VR6AewLTigWG4xSOukaG',  // Arnold
};

function detectProvider(key: string): TtsProvider {
  const k = key.trim();
  if (k.startsWith('sk-')) return 'openai';
  if (/^[a-f0-9]{32}$/i.test(k)) return 'elevenlabs';
  return 'unknown';
}

const PROVIDER_LABELS: Record<TtsProvider, string> = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  unknown: 'Unknown',
};

function abortError(): DOMException {
  return new DOMException('Generation cancelled', 'AbortError');
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>('meditation');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'light');
  const [showSettings, setShowSettings] = useState(false);

  const [ttsMode, setTtsMode] = useState<TtsMode>(() => (localStorage.getItem('tts_mode') as TtsMode) || 'free');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('tts_api_key') || '');
  const [showKey, setShowKey] = useState(false);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [title, setTitle] = useState('Zen for Engineers');
  const [isGenerating, setIsGenerating] = useState(false);

  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [modelError, setModelError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingGenerations = useRef<Map<number, { resolve: (blob: Blob) => void; reject: (e: Error) => void }>>(new Map());
  const nextId = useRef(0);

  const usePaidMode = ttsMode === 'paid' && apiKey.trim().length > 0;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('tts_mode', ttsMode); }, [ttsMode]);
  useEffect(() => { localStorage.setItem('tts_api_key', apiKey); }, [apiKey]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

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

  const detectedProvider = detectProvider(apiKey);

  const generateWithOpenAI = useCallback(async (text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      signal,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: OPENAI_VOICES[voice] || 'onyx',
        response_format: 'wav',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || `API error: ${res.status}`);
    }
    return res.blob();
  }, [apiKey]);

  const generateWithElevenLabs = useCallback(async (text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    const voiceId = ELEVENLABS_VOICES[voice] || 'TxGEqnHWrfWFTfGW9XjX';
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      signal,
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: { message: res.statusText } }));
      throw new Error(err.detail?.message || err.detail || `API error: ${res.status}`);
    }
    return res.blob();
  }, [apiKey]);

  const generateWithAPI = useCallback(async (text: string, voice: string, signal?: AbortSignal): Promise<Blob> => {
    if (detectedProvider === 'openai') return generateWithOpenAI(text, voice, signal);
    if (detectedProvider === 'elevenlabs') return generateWithElevenLabs(text, voice, signal);
    return generateWithOpenAI(text, voice, signal);
  }, [detectedProvider, generateWithOpenAI, generateWithElevenLabs]);

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
              <div className="w-16 h-16 rounded-full border border-[var(--border)] flex items-center justify-center mb-6">
                {modelStatus === 'error'
                  ? <AlertTriangle size={24} className="text-red-400" />
                  : <Wind size={24} strokeWidth={1} className="text-[var(--text-muted)]" />}
              </div>

              <h1 className="text-2xl font-light tracking-tight mb-1">Dhyāna</h1>
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

      {/* Settings modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            key="settings-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 flex items-center justify-center"
            onClick={() => setShowSettings(false)}
            style={{ background: 'var(--overlay-bg)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden"
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(40px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
              }}
            >
              <div className="px-6 pt-5 pb-4">
                <h3 className="text-sm font-medium mb-5">Settings</h3>

                {/* TTS Engine toggle */}
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
                      animate={{ left: ttsMode === 'free' ? '3px' : 'calc(50%)' }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                    <button
                      onClick={() => setTtsMode('free')}
                      className={`relative z-10 flex-1 px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                        ttsMode === 'free' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      Free (Local)
                    </button>
                    <button
                      onClick={() => setTtsMode('paid')}
                      className={`relative z-10 flex-1 px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                        ttsMode === 'paid' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      Paid (Cloud)
                    </button>
                  </div>

                  <p className="text-[10px] text-[var(--text-muted)] mt-2 px-1">
                    {ttsMode === 'free'
                      ? 'Uses Kokoro-82M running locally in your browser. Free, private, ~80 MB download.'
                      : 'Uses TTS API. Depends on the provider like OpenAI or ElevenLabs. Higher quality, no model download, requires API key.'}
                  </p>
                </div>

                {/* API Key (only when paid) */}
                <AnimatePresence>
                  {ttsMode === 'paid' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">API Key</span>
                          {apiKey.trim() && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{
                                background: detectedProvider !== 'unknown' ? 'var(--accent-bg)' : 'rgba(239,68,68,0.1)',
                                color: detectedProvider !== 'unknown' ? 'var(--accent)' : '#ef4444',
                              }}
                            >
                              {PROVIDER_LABELS[detectedProvider]}
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder="Paste any TTS API key..."
                            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm pr-9 outline-none focus:border-[var(--border-strong)] transition font-mono"
                          />
                          <button
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                          >
                            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 px-1">
                          Provider auto-detected from key format. Supports <span className="text-[var(--text-secondary)]">OpenAI</span> (sk-...) and <span className="text-[var(--text-secondary)]">ElevenLabs</span> (hex).
                          Stored locally, never shared.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-[var(--border)] flex justify-end">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition font-medium"
                >
                  Done
                </button>
              </div>
            </motion.div>
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

        <div className="mt-auto mb-2 flex flex-col items-center gap-0.5">
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Settings size={13} strokeWidth={1.5} />
          </button>
          <button
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
            onCreateVideo={() => setActivePage('video')}
          />
        )}
        {activePage === 'video' && (
          <VideoGenerator segments={segments} title={title} />
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
