import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, RotateCcw, Download, Volume2, VolumeX,
  Loader2, Leaf, Flower2, Film, X,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { Segment } from './audio-utils';
import { mergeSegmentsToBuffer, bufferToWav } from './audio-utils';

interface Props {
  segments: Segment[];
  setSegments: React.Dispatch<React.SetStateAction<Segment[]>>;
  title: string;
  setTitle: (t: string) => void;
  isGenerating: boolean;
  setIsGenerating: (b: boolean) => void;
  modelStatus: 'loading' | 'ready' | 'error';
  generateSegment: (text: string, voice: string, opts?: { signal?: AbortSignal }) => Promise<Blob>;
  onCreateVideo: () => void;
}

const VOICES = [
  { id: 'af_heart', label: 'Heart (US F)' },
  { id: 'af_bella', label: 'Bella (US F)' },
  { id: 'af_sky', label: 'Sky (US F)' },
  { id: 'am_adam', label: 'Adam (US M)' },
  { id: 'am_michael', label: 'Michael (US M)' },
  { id: 'bf_emma', label: 'Emma (UK F)' },
  { id: 'bm_george', label: 'George (UK M)' },
];

const DEFAULT_SCRIPT = `Guided meditation for Software Engineers...

Namaste and Welcome.
Close all screens if you haven't already.

Silence your phone.

Sit comfortably on a chair or on the floor. (5)
Keep your spine erect but not too rigid. (5)
Keep your chin slightly up. (5)
Keep your hands resting naturally over the knees.
Close your eyes.

Take a slow breath in through your nose. (5)

and exhale gently through your mouth. (5)

Again. (5)

Take a slow breath in through your nose. (5)

and exhale gently through your mouth. (5)

Again. (5)

Take a slow breath in through your nose. (5)

and exhale gently through your mouth. (5)

Let your breathing return to normal. (5)

Now notice the mental tabs open in your mind. (5)

Notice the Deadlines.

The Unfinished tasks.

Bugs to fix.

Features to ship.

Messages waiting.

You don't need to close them on the computer.

Just don't engage with it for now.

Just observe what's going on in your mind.

Let it drop if it drops easily. (5)

Don't force it though.

Just let it go if it goes.

Bring attention to your body.

Notice your jaw.

Just look at it with awareness.

Don't give any words.

Just give your attention. (5)

Similarly, notice your shoulders.

Let them drop slightly.

If there is tension, rotate your shoulders slowly 3 times.

1. (5)

2. (5)

3. (5)

and rotate it in the opposite direction 3 times.

1. (5)

2. (5)

3. (5)

Then, notice your forehead.

Imagine a cool breeze is flowing touching your forehead. (5)

Just enjoy it. (5)

Now observe the inner drive. (5)

The part of you that wants to improve everything. (5)

Observe that drive which wants to optimize everything.

Ship faster.

Do better.

Stay ahead.

Do not judge that feeling. (5)

Just observe its energy.

Where do you feel it in the body? (5)

Chest? (5)

Head? (5)

Stomach? (5)

Throat? (5)

Just observe that sensation. (5)

Now ask silently:

Is this clarity? Or is this just a pressure? (10)

Clarity feels steady.

Pressure feels tight.

If you feel tightness, breathe into it. (5)

Slowly and deeply inhale into where you feel the tightness. (5)

Give it some Prana, the life energy. (5)

Then, exhale slowly. (5)

Next, notice your thoughts. (5)

Is there any thoughts like:

"I must prove myself."

"I must not fall behind."

"I can't fail." (5)

Notice how the body reacts.

Now gently say inside:

My worth is not measured in output. (5)

Next.

Visualize yourself working.

You are coding.

You are solving problems.

You are building.

But there is no rush inside.

No anxiety.

No comparison with co-workers.

Just clean thinking.

Just elegant code.

Simple.

Clear.

Stable.

Feel that state. (5)

Now ask quietly:

If this project fails,

Am I still whole?

If this sprint goes badly,

Am I still enough?

Do not answer with logic.

Just feel.

Now drop all roles from mind and be nothing.

Drop the engineer in you.

Drop the performer.

Drop the achiever.

Just stillness and silence.

Nothing to debug.

Nothing to optimize.

Nothing to deploy.

Awareness is already complete.

Rest in this state and space of observing those thoughts. (5)

Let the thoughts drop if they drop.

Let it stay if it stays. (5)

You just observe. (30)

Now, slowly, very slowly open your eyes.

Decide to carry this calm into your work.

Do not carry work into your nerves.

Thank You for doing this Meditation with us.

Namaste.`;

function meditationAbortError(): DOMException {
  return new DOMException('Generation cancelled', 'AbortError');
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  return e instanceof Error && e.name === 'AbortError';
}

export default function MeditationGenerator({
  segments, setSegments, title, setTitle,
  isGenerating, setIsGenerating, modelStatus,
  generateSegment, onCreateVideo,
}: Props) {
  const [text, setText] = useState(DEFAULT_SCRIPT);
  const [pace, setPace] = useState(0.8);
  const [selectedVoice, setSelectedVoice] = useState('am_michael');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = document.createElement('audio');
    audioRef.current = el;
    return () => { el.pause(); el.remove(); };
  }, []);

  useEffect(() => () => { generateAbortRef.current?.abort(); }, []);

  const parseText = (input: string): Segment[] => {
    const lines = input.split(/\n/);
    const result: Segment[] = [];
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;
      const tokens = trimmedLine.split(/(\(\d+\))/);
      tokens.forEach(token => {
        if (!token || !token.trim()) return;
        const pauseMatch = token.match(/^\((\d+)\)$/);
        if (pauseMatch) { result.push({ type: 'pause', duration: parseInt(pauseMatch[1]) }); return; }
        const t = token.trim();
        const dotMatch = t.match(/^(.+?)(\.+)$/);
        if (dotMatch) {
          const body = dotMatch[1].trim();
          const dotCount = dotMatch[2].length;
          if (body) result.push({ type: 'text', content: body + '.' });
          result.push({ type: 'pause', duration: dotCount });
        } else {
          result.push({ type: 'text', content: t });
        }
      });
    });
    return result;
  };

  const cancelGenerating = () => {
    generateAbortRef.current?.abort();
  };

  const generateAudio = async () => {
    generateAbortRef.current?.abort();
    const ac = new AbortController();
    generateAbortRef.current = ac;
    const { signal } = ac;

    setIsGenerating(true);
    setIsPlaying(false);
    setCurrentSegmentIndex(-1);
    setProgress(0);
    const parsedSegments = parseText(text);
    setSegments(parsedSegments.map(s => ({ ...s, isGenerating: s.type === 'text' })));
    try {
      if (modelStatus !== 'ready') throw new Error('TTS model not loaded yet.');
      const updated = [...parsedSegments];
      for (let i = 0; i < updated.length; i++) {
        if (signal.aborted) throw meditationAbortError();
        const seg = updated[i];
        if (seg.type === 'text' && seg.content) {
          setSegments(prev => prev.map((s, idx) => idx === i ? { ...s, isGenerating: true } : s));
          const blob = await generateSegment(seg.content, selectedVoice, { signal });
          updated[i].audioUrl = URL.createObjectURL(blob);
          setSegments(prev => prev.map((s, idx) => idx === i ? { ...s, isGenerating: false, audioUrl: updated[i].audioUrl } : s));
        }
      }
      setSegments(updated);
    } catch (error: unknown) {
      if (isAbortError(error)) {
        setSegments(prev =>
          prev.map(s => (s.type === 'text' ? { ...s, isGenerating: false } : s)),
        );
      } else {
        console.error('Generation failed:', error);
        const message = error instanceof Error ? error.message : String(error);
        alert(`Generation failed: ${message}`);
      }
    } finally {
      generateAbortRef.current = null;
      setIsGenerating(false);
    }
  };

  const playNext = (index: number) => {
    if (index >= segments.length) { setIsPlaying(false); setCurrentSegmentIndex(-1); setProgress(100); return; }
    setCurrentSegmentIndex(index);
    const segment = segments[index];
    setProgress((index / segments.length) * 100);
    if (segment.type === 'text' && segment.audioUrl) {
      if (audioRef.current) {
        audioRef.current.src = segment.audioUrl;
        audioRef.current.playbackRate = pace;
        audioRef.current.muted = isMuted;
        audioRef.current.play().catch(e => console.error('Playback failed:', e));
      }
    } else if (segment.type === 'pause' && segment.duration) {
      setTimeout(() => { if (isPlaying) playNext(index + 1); }, segment.duration * 1000);
    } else {
      playNext(index + 1);
    }
  };

  const togglePlay = () => {
    if (isPlaying) { setIsPlaying(false); audioRef.current?.pause(); return; }
    if (segments.length === 0) return;
    setIsPlaying(true);
    if (currentSegmentIndex === -1) { playNext(0); }
    else if (segments[currentSegmentIndex].type === 'text' && audioRef.current) { audioRef.current.play(); }
    else { playNext(currentSegmentIndex); }
  };

  const reset = () => {
    setIsPlaying(false);
    setCurrentSegmentIndex(-1);
    setProgress(0);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  const downloadAudio = async () => {
    if (segments.length === 0 || isGenerating) return;
    try {
      const buffer = await mergeSegmentsToBuffer(segments);
      const blob = bufferToWav(buffer);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/\s+/g, '_') || 'meditation'}.wav`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to merge audio for download.');
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onended = () => { if (isPlaying) playNext(currentSegmentIndex + 1); };
    }
  }, [isPlaying, currentSegmentIndex, segments]);

  const hasAudio = segments.some(s => s.audioUrl);
  const hasSegments = segments.length > 0;

  return (
    <div className="h-full flex">
      {/* Left: Editor (2/3) */}
      <div className="flex-[2] min-w-0 overflow-y-auto px-6 py-5">
        <h2 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Meditation Generator</h2>

        {/* Title */}
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-1.5 text-sm outline-none focus:border-[var(--border-strong)] transition"
          />
        </div>

        {/* Voice + Pace */}
        <div className="flex items-end gap-4 mb-3">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Voice</label>
            <select
              value={selectedVoice}
              onChange={e => setSelectedVoice(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-1.5 text-sm outline-none focus:border-[var(--border-strong)] transition"
            >
              {VOICES.map(v => <option key={v.id} value={v.id} className="bg-[var(--option-bg)]">{v.label}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Pace {pace}x</label>
            <input
              type="range" min="0.5" max="1.5" step="0.1"
              value={pace}
              onChange={e => setPace(parseFloat(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        </div>

        {/* Script */}
        <div className="mb-2">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Script</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full h-64 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm leading-relaxed resize-none outline-none focus:border-[var(--border-strong)] transition font-light"
          />
        </div>

        {/* Pause legend */}
        <div className="flex gap-3 text-[10px] text-[var(--text-muted)] mb-4">
          <span>Pause rules:</span>
          <span><span className="text-[var(--accent)]">. is 1 sec </span></span>
          <span><span className="text-[var(--accent)]">.. is 2 secs </span></span>
          <span><span className="text-[var(--accent)]">... is 3 secs </span></span>
          <span><span className="text-[var(--accent)]">(n) is n secs </span></span>
        </div>

        {/* Generate */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generateAudio}
            disabled={isGenerating || !text.trim() || modelStatus !== 'ready'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : null}
            {isGenerating ? 'Processing...' : 'Generate'}
          </button>
          {isGenerating && (
            <button
              type="button"
              onClick={cancelGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] transition"
            >
              <X size={12} />
              Cancel Generation
            </button>
          )}
        </div>
      </div>

      {/* Right: Player + Sequence (1/3, always visible) */}
      <div className="flex-1 border-l border-[var(--border)] bg-[var(--bg-surface)] flex flex-col overflow-hidden">
        {/* Player */}
        <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Player</div>

          <p className="text-[11px] text-[var(--text-secondary)] mb-2 truncate h-4">
            {currentSegmentIndex >= 0
              ? (segments[currentSegmentIndex].type === 'text'
                ? `"${segments[currentSegmentIndex].content}"`
                : `${segments[currentSegmentIndex].duration}s pause`)
              : (hasAudio ? 'Ready to play' : 'Generate audio to begin')}
          </p>

          <div className="w-full h-0.5 bg-[var(--bg-input)] rounded-full mb-3 overflow-hidden">
            <motion.div
              className="h-full bg-[var(--accent)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center gap-1">
            <button onClick={reset} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition disabled:opacity-30" title="Reset" disabled={!hasSegments}>
              <RotateCcw size={13} />
            </button>
            <button
              onClick={togglePlay}
              disabled={!hasAudio || isGenerating}
              className="w-7 h-7 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded flex items-center justify-center hover:bg-[var(--bg-active)] transition disabled:opacity-30"
            >
              {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition" title={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
          </div>
        </div>

        {/* Sequence list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2 px-1">Sequence</div>
          {hasSegments ? (
            <div className="space-y-px">
              {segments.map((seg, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] transition ${
                    currentSegmentIndex === i
                      ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {seg.type === 'text' ? <Leaf size={10} /> : <Flower2 size={10} />}
                  <span className="truncate flex-1">
                    {seg.type === 'text' ? seg.content : `${seg.duration}s`}
                  </span>
                  {seg.isGenerating && <Loader2 size={10} className="animate-spin" />}
                  {seg.audioUrl && !seg.isGenerating && <div className="w-1 h-1 bg-[var(--accent)] rounded-full shrink-0" />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--text-muted)] px-2 italic">Press Generate to see the sequence</p>
          )}
        </div>

        {/* Bottom actions */}
        {hasAudio && !isGenerating && (
          <div className="px-4 py-3 border-t border-[var(--border)] flex flex-col gap-1.5">
            <button
              onClick={downloadAudio}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition"
            >
              <Download size={12} /> Download Audio
            </button>
            <button
              onClick={onCreateVideo}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition"
            >
              <Film size={12} /> Create Video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
