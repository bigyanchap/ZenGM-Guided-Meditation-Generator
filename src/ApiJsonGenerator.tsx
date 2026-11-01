import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Wand2, Settings, Download, Film, Loader2, FileJson, Upload } from 'lucide-react';
import type { Segment } from './audio-utils';
import { mergeSegmentsToBuffer, bufferToWav } from './audio-utils';
import {
  parseVoiceBlueprint, blueprintTotals, chunkTextForApi, chunkVoiceSpec, formatSeconds,
  DEFAULT_VOICE_BLUEPRINT, type VoiceSpec,
} from './voice-blueprint';

interface ApiJsonGeneratorProps {
  segments: Segment[];
  setSegments: React.Dispatch<React.SetStateAction<Segment[]>>;
  title: string;
  setTitle: (t: string) => void;
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
  hasElevenLabsKey: boolean;
  /** One ElevenLabs TTS call for one chunk, spoken with the blueprint's voice spec. */
  generateChunk: (text: string, voice: VoiceSpec, signal?: AbortSignal) => Promise<Blob>;
  onOpenSettings: () => void;
  onCreateVideo: () => void;
}

const STORAGE_KEY = 'zengm_voice_blueprint';

export default function ApiJsonGenerator({
  segments, setSegments, setTitle, isGenerating, setIsGenerating,
  hasElevenLabsKey, generateChunk, onOpenSettings, onCreateVideo,
}: ApiJsonGeneratorProps) {
  const [jsonText, setJsonText] = useState(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_VOICE_BLUEPRINT);
  const [genError, setGenError] = useState('');
  const [generatingIdx, setGeneratingIdx] = useState(-1);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseVoiceBlueprint(jsonText), [jsonText]);
  const totals = useMemo(() => (parsed.blueprint ? blueprintTotals(parsed.blueprint) : null), [parsed]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, jsonText);
  }, [jsonText]);

  useEffect(() => () => {
    if (mergedUrl) URL.revokeObjectURL(mergedUrl);
  }, [mergedUrl]);

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setJsonText(String(reader.result || ''));
    reader.readAsText(f);
    e.target.value = '';
  };

  const handleSaveFile = () => {
    const name = (parsed.blueprint?.title || 'meditation').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'meditation';
    const url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleGenerate = async () => {
    const bp = parsed.blueprint;
    if (!bp) return;
    if (!hasElevenLabsKey) {
      setGenError('No ElevenLabs API key yet — add it in Settings, then generate.');
      return;
    }
    setGenError('');
    setMergedUrl(null);
    setTitle(bp.title);
    const controller = new AbortController();
    abortRef.current = controller;
    const segs: Segment[] = bp.timeline.map(item =>
      item.type === 'chunk' ? { type: 'text', content: item.text } : { type: 'pause', duration: item.seconds });
    setSegments(segs);
    setIsGenerating(true);
    try {
      for (let i = 0; i < bp.timeline.length; i++) {
        const item = bp.timeline[i];
        if (item.type !== 'chunk') continue;
        setGeneratingIdx(i);
        setSegments(prev => prev.map((s, j) => (j === i ? { ...s, isGenerating: true } : s)));
        const blob = await generateChunk(chunkTextForApi(item, bp.voice.model_id), chunkVoiceSpec(bp, item), controller.signal);
        const url = URL.createObjectURL(blob);
        segs[i] = { ...segs[i], audioUrl: url, isGenerating: false };
        setSegments([...segs]);
      }
      setGeneratingIdx(-1);
      const buffer = await mergeSegmentsToBuffer(segs);
      setMergedUrl(URL.createObjectURL(bufferToWav(buffer)));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setGenError('Generation cancelled.');
      } else {
        setGenError(err instanceof Error ? err.message : 'Generation failed.');
      }
      setSegments(prev => prev.map(s => ({ ...s, isGenerating: false })));
    } finally {
      setIsGenerating(false);
      setGeneratingIdx(-1);
      abortRef.current = null;
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const hasAudio = segments.some(s => s.audioUrl);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left: JSON editor */}
      <div className="flex-[2] min-h-0 flex flex-col p-6 overflow-y-auto custom-scrollbar">
        <h2 className="text-xl font-bold text-[var(--text-main)] tracking-tight">Meditation Generator</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1 mb-5">
          ElevenLabs mode — everything comes from your JSON: voice, script, stress and gaps. No music here; add music later in Create Video.
        </p>

        {!hasElevenLabsKey && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs text-amber-200 flex-1">ElevenLabs is selected, but no API key is saved yet — generation will not run until you add one.</p>
            <button onClick={onOpenSettings} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors">
              <Settings size={13} /> Open Settings
            </button>
          </div>
        )}

        <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Voice blueprint (JSON)</label>
        <textarea
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          spellCheck={false}
          className="w-full h-[380px] resize-y rounded-xl bg-[var(--bg-card)] border border-[var(--border-ui)] p-4 font-mono text-[12px] leading-relaxed text-[var(--text-main)] focus:outline-none focus:border-purple-500/50 custom-scrollbar"
        />

        <div className="mt-3 min-h-[20px]">
          {parsed.blueprint && totals ? (
            <p className="text-xs text-emerald-400">
              ✓ Valid — {totals.chunks} chunks · {totals.gaps} gaps · ≈ {formatSeconds(totals.estTotalSec)} total
              ({formatSeconds(totals.estSpokenSec)} voice + {formatSeconds(totals.totalGapSec)} silence) · ≈ {totals.spokenChars.toLocaleString()} credits
            </p>
          ) : (
            <p className="text-xs text-red-400">{parsed.errors[0]}</p>
          )}
          {parsed.blueprint && parsed.errors.length === 0 && parsed.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-400 mt-1">⚠ {w}</p>
          ))}
          {!parsed.blueprint && parsed.errors.slice(1).map((e, i) => (
            <p key={i} className="text-xs text-red-400/80 mt-1">{e}</p>
          ))}
          {genError && <p className="text-xs text-red-400 mt-1">{genError}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {!isGenerating ? (
            <button
              onClick={handleGenerate}
              disabled={!parsed.blueprint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              <Wand2 size={16} /> Generate with ElevenLabs
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-sm font-medium transition-colors"
            >
              <Loader2 size={16} className="animate-spin" /> Cancel
            </button>
          )}
          <button
            onClick={() => setJsonText(DEFAULT_VOICE_BLUEPRINT)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ui)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <FileJson size={14} /> Template
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ui)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <Upload size={14} /> Load .json
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleLoadFile} />
          <button
            onClick={handleSaveFile}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ui)] text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          >
            <Download size={14} /> Save .json
          </button>
        </div>

        <p className="text-[11px] text-[var(--text-muted)] mt-5 leading-relaxed">
          Hand AI your plain script in chat (with the Skill) and it returns this JSON ready to paste — gaps are calculated from what each line asks
          of the listener, and stress is written into the words themselves (a CAPITALISED word is the pivot; Sanskrit is never capitalised).
          Gaps are inserted by the app as true silence: any length, zero credits. Only the spoken characters cost credits.
        </p>
      </div>

      {/* Right: timeline preview + player */}
      <div className="flex-1 min-h-0 flex flex-col border-l border-[var(--border-ui)] bg-[var(--bg-panel)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-ui)]">
          <h3 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Timeline</h3>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
          {parsed.blueprint ? parsed.blueprint.timeline.map((item, i) => (
            item.type === 'chunk' ? (
              <div key={i} className={`rounded-lg px-3 py-2 text-xs leading-relaxed border ${segments[i]?.audioUrl ? 'border-emerald-500/30 bg-emerald-500/5 text-[var(--text-main)]' : 'border-[var(--border-ui)] bg-[var(--bg-card)] text-[var(--text-main)]'}`}>
                <span className="text-[var(--text-muted)] mr-2">{i + 1}.</span>
                {generatingIdx === i && <Loader2 size={12} className="inline animate-spin mr-1.5 text-purple-400" />}
                {item.text.length > 140 ? item.text.slice(0, 140) + '…' : item.text}
                {item.delivery && <span className="block mt-1 text-[10px] uppercase tracking-wider text-purple-300/70">delivery: {item.delivery}{parsed.blueprint!.voice.model_id !== 'eleven_v3' ? ' (v3 only)' : ''}</span>}
                {(item.stability !== undefined || item.speed !== undefined) && <span className="block mt-1 text-[10px] uppercase tracking-wider text-sky-300/70">{[item.stability !== undefined ? `stability ${item.stability}` : null, item.speed !== undefined ? `speed ${item.speed}` : null].filter(Boolean).join(' · ')}</span>}
              </div>
            ) : (
              <div key={i} className="rounded-lg px-3 py-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--bg-hover)]/50 flex items-center gap-2">
                <span>{i + 1}.</span><span className="tracking-widest">· · ·</span><span>{item.seconds}s silence</span>
              </div>
            )
          )) : (
            <p className="text-xs text-[var(--text-muted)] p-2">Fix the JSON to see the timeline.</p>
          )}
        </div>

        <div className="p-4 border-t border-[var(--border-ui)] space-y-3">
          {mergedUrl && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={mergedUrl} className="w-full" />
            </>
          )}
          <div className="flex gap-2">
            {mergedUrl ? (
              <a
                href={mergedUrl}
                download={`${(parsed.blueprint?.title || 'meditation').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'meditation'}.wav`}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                <Download size={14} /> Download final stitched WAV
              </a>
            ) : (
              <button
                disabled
                title={hasAudio ? 'Partial audio exists — generate again to build the full stitched file.' : 'Generate first — the stitched file is built when generation completes.'}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600/40 text-white/60 text-xs font-medium cursor-not-allowed"
              >
                <Download size={14} /> Download final stitched WAV
              </button>
            )}
            <button
              onClick={onCreateVideo}
              disabled={!mergedUrl}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ui)] text-xs text-[var(--text-main)] hover:border-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Film size={14} /> Create Video
            </button>
          </div>
          {!mergedUrl && (
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {hasAudio
                ? 'Partial audio exists — generate again to build the full stitched file.'
                : 'The stitched file — every chunk with its gaps as true silence, in one WAV — is built when generation completes.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
