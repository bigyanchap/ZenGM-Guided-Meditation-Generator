import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Loader2, Download, FolderOpen, Save, X } from 'lucide-react';
import type { Segment, VoiceTimeline } from './audio-utils';
import {
  mergeSegmentsWithTimeline, buildBedFromParts, mixVoiceAndMusic,
  decodeBlob, bufferToWav,
} from './audio-utils';
import {
  parseBlueprint, blueprintTotalMs, scaleBlueprintToTotal, splitForElevenLabs,
  toElevenLabsPlan, chunkTitle, formatMs,
  MEDITATION_TEMPLATE, WAKEUP_TEMPLATE, EMPTY_TEMPLATE,
} from './music-blueprint';
import { renderSynthBed } from './synth-engine';

interface Props {
  segments: Segment[];
  title: string;
  hasElevenLabsKey: boolean;
  composeElevenLabsMusic: (compositionPlan: Record<string, unknown>, signal?: AbortSignal) => Promise<Blob>;
  onOpenSettings: () => void;
}

type MusicSource = 'synth' | 'elevenlabs';

const BLUEPRINT_KEY = 'zengm_music_blueprint';
const SOURCE_KEY = 'zengm_music_source';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MusicBed({ segments, title, hasElevenLabsKey, composeElevenLabsMusic, onOpenSettings }: Props) {
  const [source, setSource] = useState<MusicSource>(() => (localStorage.getItem(SOURCE_KEY) as MusicSource) || 'synth');
  const [jsonText, setJsonText] = useState(() => localStorage.getItem(BLUEPRINT_KEY) || MEDITATION_TEMPLATE);
  const [fitToVoice, setFitToVoice] = useState(true);
  const [musicUnderVoice, setMusicUnderVoice] = useState(0.25);
  const [musicInPauses, setMusicInPauses] = useState(0.55);
  const [isComposing, setIsComposing] = useState(false);
  const [isMixing, setIsMixing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [bedUrl, setBedUrl] = useState<string | null>(null);
  const [bedNote, setBedNote] = useState<string | null>(null);
  const [voiceTimeline, setVoiceTimeline] = useState<VoiceTimeline | null>(null);
  const bedBufferRef = useRef<AudioBuffer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => parseBlueprint(jsonText), [jsonText]);
  const hasVoiceAudio = segments.some(s => s.type === 'text' && s.audioUrl);

  useEffect(() => { localStorage.setItem(BLUEPRINT_KEY, jsonText); }, [jsonText]);
  useEffect(() => { localStorage.setItem(SOURCE_KEY, source); }, [source]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Recompute the voice timeline whenever generated voice audio changes.
  const segmentsKey = segments.map(s => s.audioUrl || (s.type === 'pause' ? `p${s.duration}` : 't')).join('|');
  useEffect(() => {
    let cancelled = false;
    if (!hasVoiceAudio) { setVoiceTimeline(null); return; }
    mergeSegmentsWithTimeline(segments)
      .then(t => { if (!cancelled) setVoiceTimeline(t); })
      .catch(() => { if (!cancelled) setVoiceTimeline(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentsKey]);

  const effectivePlan = useMemo(() => {
    if (!parsed.plan) return null;
    if (fitToVoice && voiceTimeline && voiceTimeline.totalSec > 0) {
      return scaleBlueprintToTotal(parsed.plan, Math.round(voiceTimeline.totalSec * 1000));
    }
    return parsed.plan;
  }, [parsed.plan, fitToVoice, voiceTimeline]);

  const generateBed = async () => {
    if (!effectivePlan || isComposing) return;
    if (source === 'elevenlabs' && !hasElevenLabsKey) {
      setErrorText('ElevenLabs music needs an API key. Add your ElevenLabs key in Settings, or switch the music source to the free Synth.');
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsComposing(true);
    setErrorText(null);
    try {
      let buffer: AudioBuffer;
      if (source === 'synth') {
        buffer = await renderSynthBed(effectivePlan);
      } else {
        const parts = splitForElevenLabs(effectivePlan);
        const bedParts: Array<AudioBuffer | number> = [];
        for (const part of parts) {
          if (ac.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          if (part.kind === 'silence') {
            bedParts.push(part.duration_ms / 1000);
          } else {
            const blob = await composeElevenLabsMusic(toElevenLabsPlan(part.chunks), ac.signal);
            bedParts.push(await decodeBlob(blob));
          }
        }
        buffer = await buildBedFromParts(bedParts);
      }
      bedBufferRef.current = buffer;
      if (bedUrl) URL.revokeObjectURL(bedUrl);
      const url = URL.createObjectURL(bufferToWav(buffer));
      setBedUrl(url);
      setBedNote(
        `${source === 'synth' ? 'ZenGM Synth (free)' : 'ElevenLabs Music'} · ${formatMs(Math.round(buffer.duration * 1000))}` +
        (fitToVoice && voiceTimeline ? ' · fitted to voice length' : ''),
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setErrorText(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsComposing(false);
      abortRef.current = null;
    }
  };

  const downloadMixed = async () => {
    const bed = bedBufferRef.current;
    if (!bed || isMixing) return;
    setIsMixing(true);
    setErrorText(null);
    try {
      const timeline = voiceTimeline ?? (await mergeSegmentsWithTimeline(segments));
      const mixed = await mixVoiceAndMusic(timeline.buffer, bed, {
        musicUnderVoice, musicInPauses, pauseRanges: timeline.pauseRanges,
      });
      downloadBlob(bufferToWav(mixed), `${title.replace(/\s+/g, '_') || 'meditation'}_mixed.wav`);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e));
    } finally {
      setIsMixing(false);
    }
  };

  const onLoadFile = (f: File) => {
    f.text().then(t => setJsonText(t)).catch(() => setErrorText('Could not read that file.'));
  };

  const blueprintTotal = parsed.plan ? blueprintTotalMs(parsed.plan) : 0;

  return (
    <div className="mt-6 pt-4 border-t border-[var(--border)]">
      <div className="flex items-center gap-1.5 mb-3">
        <Music size={13} className="text-[var(--accent)]" />
        <h3 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">Music Bed</h3>
      </div>

      {/* Source switch */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="zengm-music-source" checked={source === 'synth'} onChange={() => setSource('synth')} className="accent-[var(--accent)]" />
          Free — ZenGM Synth
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="zengm-music-source" checked={source === 'elevenlabs'} onChange={() => setSource('elevenlabs')} className="accent-[var(--accent)]" />
          ElevenLabs Music
        </label>
        <span className="text-[10px] text-[var(--text-muted)]">
          {source === 'synth'
            ? 'Composed in-app from the blueprint. Exact timing, offline, $0.'
            : hasElevenLabsKey
              ? 'Uses your ElevenLabs credit. Chunks are composed by the API; silence chunks are stitched in locally.'
              : 'Needs an ElevenLabs API key in Settings.'}
        </span>
        {source === 'elevenlabs' && !hasElevenLabsKey && (
          <button type="button" onClick={onOpenSettings} className="text-[11px] underline text-[var(--accent)]">Open Settings</button>
        )}
      </div>

      {/* JSON editor */}
      <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Blueprint (JSON)</label>
      <textarea
        value={jsonText}
        onChange={e => setJsonText(e.target.value)}
        spellCheck={false}
        className="w-full h-56 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-xs leading-relaxed resize-y outline-none focus:border-[var(--border-strong)] transition font-mono"
      />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <select
          value=""
          onChange={e => {
            const v = e.target.value;
            if (v === 'meditation') setJsonText(MEDITATION_TEMPLATE);
            if (v === 'wakeup') setJsonText(WAKEUP_TEMPLATE);
            if (v === 'empty') setJsonText(EMPTY_TEMPLATE);
          }}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none"
        >
          <option value="">Template…</option>
          <option value="meditation">Meditation bed</option>
          <option value="wakeup">Gentle wake-up</option>
          <option value="empty">Empty</option>
        </select>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded hover:bg-[var(--bg-hover)] transition">
          <FolderOpen size={12} /> Load .json
        </button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onLoadFile(f); e.target.value = ''; }} />
        <button type="button" onClick={() => downloadBlob(new Blob([jsonText], { type: 'application/json' }), 'music-blueprint.json')} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded hover:bg-[var(--bg-hover)] transition">
          <Save size={12} /> Save .json
        </button>
        {parsed.plan
          ? <span className="text-[11px] text-green-600">✓ Valid — {parsed.plan.chunks.length} chunks · {formatMs(blueprintTotal)} total</span>
          : <span className="text-[11px] text-red-500">{parsed.errors[0]}</span>}
      </div>
      {parsed.plan && parsed.errors.length === 0 && parsed.warnings.length > 0 && (
        <div className="mt-1.5 text-[11px] text-amber-600 leading-relaxed">
          {parsed.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}
      {parsed.plan === null && parsed.errors.length > 1 && (
        <div className="mt-1.5 text-[11px] text-red-500 leading-relaxed">
          {parsed.errors.slice(1).map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Chunk cards */}
      {parsed.plan && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-4 mb-2">Preview — what the engine will be told</div>
          <div className="flex gap-2.5 overflow-x-auto pb-2">
            {parsed.plan.chunks.map((chunk, i) => (
              <div key={i} className="min-w-[180px] max-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5" style={{ borderTop: '3px solid var(--accent)' }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium truncate">{chunkTitle(chunk)}</span>
                  <span className="text-[11px] font-semibold text-[var(--accent)]">{formatMs(chunk.duration_ms)}</span>
                </div>
                {chunk.type === 'silence' ? (
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mt-1">True silence, stitched in by the app — never sent to any API.</p>
                ) : (
                  <>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mt-1 line-clamp-3">{chunk.text.replace(/^\s*\[[^\]]+\]\s*/, '')}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {chunk.positive_styles.slice(0, 4).map((s, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--border)] bg-[var(--bg-input)]">{s}</span>
                      ))}
                      {chunk.positive_styles.length > 4 && <span className="text-[10px] text-[var(--text-muted)]">+{chunk.positive_styles.length - 4}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {chunk.negative_styles.slice(0, 4).map((s, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-500">✕ {s}</span>
                      ))}
                      {chunk.negative_styles.length > 4 && <span className="text-[10px] text-[var(--text-muted)]">+{chunk.negative_styles.length - 4}</span>}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                      Adherence: {chunk.context_adherence}
                      {source === 'synth' && chunk.root ? ` · root ${chunk.root}` : ''}
                      {source === 'synth' && chunk.scale ? ` · ${chunk.scale}` : ''}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Timelines + fit */}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--text-secondary)] flex-wrap">
        {voiceTimeline ? (
          <span>
            Voice timeline <b>{formatMs(Math.round(voiceTimeline.totalSec * 1000))}</b>
            {' '}(voice {formatMs(Math.round(voiceTimeline.voiceSec * 1000))} · pauses {formatMs(Math.round(voiceTimeline.pauseSec * 1000))})
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Generate the voice first to see its timeline here.</span>
        )}
        {parsed.plan && <span>Blueprint <b>{formatMs(blueprintTotal)}</b></span>}
        {voiceTimeline && parsed.plan && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={fitToVoice} onChange={e => setFitToVoice(e.target.checked)} className="accent-[var(--accent)]" />
            Fit music to voice length (scales chunks proportionally; your JSON is not changed)
          </label>
        )}
      </div>

      {/* Mix levels */}
      <div className="flex items-end gap-5 mt-3 flex-wrap">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Music under voice {Math.round(musicUnderVoice * 100)}%</label>
          <input type="range" min="0" max="0.8" step="0.05" value={musicUnderVoice} onChange={e => setMusicUnderVoice(parseFloat(e.target.value))} className="w-36 accent-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Music in pauses {Math.round(musicInPauses * 100)}%</label>
          <input type="range" min="0" max="1" step="0.05" value={musicInPauses} onChange={e => setMusicInPauses(parseFloat(e.target.value))} className="w-36 accent-[var(--accent)]" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          onClick={generateBed}
          disabled={!parsed.plan || isComposing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isComposing ? <Loader2 size={12} className="animate-spin" /> : <Music size={12} />}
          {isComposing ? 'Composing…' : 'Generate music bed'}
        </button>
        {isComposing && (
          <button type="button" onClick={() => abortRef.current?.abort()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded hover:bg-[var(--bg-hover)] transition">
            <X size={12} /> Cancel
          </button>
        )}
        {bedUrl && (
          <>
            <button type="button" onClick={() => { if (bedBufferRef.current) downloadBlob(bufferToWav(bedBufferRef.current), `${title.replace(/\s+/g, '_') || 'meditation'}_music_bed.wav`); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border)] rounded hover:bg-[var(--bg-hover)] transition">
              <Download size={12} /> Music bed WAV
            </button>
            <button type="button" onClick={downloadMixed} disabled={!hasVoiceAudio || isMixing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition disabled:opacity-30 disabled:cursor-not-allowed">
              {isMixing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Mixed WAV (voice + music)
            </button>
          </>
        )}
      </div>
      {bedUrl && (
        <div className="mt-3">
          <div className="text-[10px] text-[var(--text-muted)] mb-1">{bedNote}</div>
          <audio controls src={bedUrl} className="w-full h-9" />
        </div>
      )}
      {errorText && (
        <div className="mt-3 text-[11px] text-red-500 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 leading-relaxed">{errorText}</div>
      )}
    </div>
  );
}
