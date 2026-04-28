import React, { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
import { Upload, Download, Film, Music, Image, Loader2, AlertCircle, CheckCircle2, Captions, Mic, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { Segment } from './audio-utils';
import { mergeSegmentsToBuffer, formatTime, decodeBlobToAudioBuffer } from './audio-utils';

interface Props {
  segments: Segment[];
  title: string;
  onGoToMeditation?: () => void;
}

type VideoStatus = 'idle' | 'merging' | 'encoding' | 'done' | 'error';
type SubtitleCue = { start: number; end: number; text: string };
type TrackConfig = { start: number; end: number };

const FADE_OUT_DURATION = 5;
const MAX_SIZE = { width: 1920, height: 1080 };
const FRAME_RATE = 12;

export default function VideoGenerator({ segments, title, onGoToMeditation }: Props) {
  const [bgMusicFile, setBgMusicFile] = useState<File | null>(null);
  const [bgMusicDuration, setBgMusicDuration] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [bgMusicVolume, setBgMusicVolume] = useState(0.2);
  const [bgFadeDuration, setBgFadeDuration] = useState(FADE_OUT_DURATION);
  const [subtitleSize, setSubtitleSize] = useState(36);
  const [subtitleBottom, setSubtitleBottom] = useState(64);
  const [subtitlePaddingX, setSubtitlePaddingX] = useState(22);
  const [subtitlePaddingY, setSubtitlePaddingY] = useState(14);
  const [subtitleOpacity, setSubtitleOpacity] = useState(0.85);
  const [voiceAudioFile, setVoiceAudioFile] = useState<File | null>(null);
  const [meditationDuration, setMeditationDuration] = useState(0);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [voiceTrack, setVoiceTrack] = useState<TrackConfig>({ start: 0, end: 0 });
  const [musicTrack, setMusicTrack] = useState<TrackConfig>({ start: 0, end: 0 });
  const [imageTrack, setImageTrack] = useState<TrackConfig>({ start: 0, end: 0 });
  const [subtitleTrack, setSubtitleTrack] = useState<TrackConfig>({ start: 0, end: 0 });
  const [videoStatus, setVideoStatus] = useState<VideoStatus>('idle');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [preciseFieldErrors, setPreciseFieldErrors] = useState<Record<string, string>>({});
  const preciseFieldErrorsRef = useRef(preciseFieldErrors);
  preciseFieldErrorsRef.current = preciseFieldErrors;

  const bgMusicInputRef = useRef<HTMLInputElement>(null);
  const voiceAudioInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const hasSegmentAudio = segments.some(s => s.audioUrl);
  const hasVoiceSource = hasSegmentAudio || !!voiceAudioFile;
  const baseDuration = Math.max(
    voiceTrack.end,
    musicTrack.end,
    imageTrack.end,
    subtitleTrack.end,
    meditationDuration + FADE_OUT_DURATION,
  );
  const totalDuration = Math.max(1, baseDuration);
  const musicMinDuration = Math.max(0, musicTrack.start + bgFadeDuration);
  const bgMusicValid = !bgMusicFile || bgMusicDuration >= musicMinDuration;
  const preciseControlValid = Object.keys(preciseFieldErrors).length === 0;
  const canCreate = hasVoiceSource && bgMusicFile && imageFile && meditationDuration > 0 && bgMusicValid;

  const setFieldError = useCallback((id: string, message: string | null) => {
    setPreciseFieldErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const calcMeditationDuration = useCallback(async () => {
    if (hasSegmentAudio) {
      try {
        const buffer = await mergeSegmentsToBuffer(segments);
        setMeditationDuration(buffer.duration);
      } catch { setMeditationDuration(0); }
      return;
    }
    if (voiceAudioFile) {
      try {
        const url = URL.createObjectURL(voiceAudioFile);
        const audio = new Audio();
        await new Promise<void>((resolve, reject) => {
          audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); reject(); };
          audio.src = url;
        });
        setMeditationDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      } catch { setMeditationDuration(0); }
      return;
    }
    setMeditationDuration(0);
  }, [segments, hasSegmentAudio, voiceAudioFile]);

  useEffect(() => {
    if (hasSegmentAudio) setVoiceAudioFile(null);
  }, [hasSegmentAudio]);

  useEffect(() => { calcMeditationDuration(); }, [calcMeditationDuration]);
  useEffect(() => {
    if (meditationDuration <= 0) return;
    const voiceStart = voiceTrack.start;
    const voiceEnd = voiceStart + meditationDuration;
    const musicEnd = Math.max(musicTrack.end, voiceEnd + bgFadeDuration);
    const mediaEnd = Math.max(voiceEnd, musicEnd);
    setVoiceTrack({ start: voiceStart, end: voiceEnd });
    setMusicTrack((p) => ({ start: p.start, end: musicEnd }));
    setImageTrack((p) => ({ start: 0, end: Math.max(p.end, mediaEnd) }));
    setSubtitleTrack((p) => ({ start: 0, end: Math.max(p.end, voiceEnd) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meditationDuration]);

  const handleVoiceAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVoiceAudioFile(file);
  };

  const handleBgMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgMusicFile(file);
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      setBgMusicDuration(audio.duration);
      setMusicTrack((p) => ({ ...p, end: Math.max(p.end, audio.duration) }));
      URL.revokeObjectURL(url);
    };
    audio.src = url;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!hasSegmentAudio) {
        if (mounted) setSubtitleCues([]);
        return;
      }
      try {
        const cues = await buildSubtitleCues(segments);
        if (mounted) setSubtitleCues(cues);
      } catch {
        if (mounted) setSubtitleCues([]);
      }
    };
    run();
    return () => { mounted = false; };
  }, [segments, hasSegmentAudio]);

  const subtitleTrackLabel = useMemo(
    () => subtitleCues.length > 0
      ? `${subtitleCues.length} cues from script`
      : 'Script-based cues (generate voice in Meditation with text segments); otherwise no on-screen subtitle lines',
    [subtitleCues.length],
  );

  const runExport = async () => {
    if (!hasVoiceSource || !bgMusicFile || !imageFile || meditationDuration <= 0 || !bgMusicValid) return;
    if (Object.keys(preciseFieldErrorsRef.current).length > 0) return;

    setVideoStatus('merging');
    setVideoProgress(0);
    setErrorMsg('');
    setVideoBlob(null);

    try {
      setVideoProgress(5);
      let meditationBuffer: AudioBuffer;
      if (hasSegmentAudio) {
        meditationBuffer = await mergeSegmentsToBuffer(segments);
      } else if (voiceAudioFile) {
        const audioCtx = new AudioContext();
        const ab = await voiceAudioFile.arrayBuffer();
        const mime = voiceAudioFile.type || 'audio/*';
        meditationBuffer = await decodeBlobToAudioBuffer(audioCtx, ab, mime);
        await audioCtx.close();
      } else {
        throw new Error('No voice audio: add segments in Meditation or upload a file.');
      }
      const vidDuration = totalDuration;

      setVideoProgress(10);
      const audioCtx = new AudioContext();
      const bgArrayBuf = await bgMusicFile.arrayBuffer();
      const bgMusicBuffer = await audioCtx.decodeAudioData(bgArrayBuf);

      setVideoStatus('encoding');
      setVideoProgress(15);
      const sampleRate = 48000;
      const totalSamples = Math.ceil(vidDuration * sampleRate);
      const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

      const medSource = offlineCtx.createBufferSource();
      medSource.buffer = meditationBuffer;
      const medGain = offlineCtx.createGain();
      medGain.gain.setValueAtTime(voiceVolume, 0);
      medSource.connect(medGain);
      medGain.connect(offlineCtx.destination);
      medSource.start(Math.max(0, voiceTrack.start));

      const bgSource = offlineCtx.createBufferSource();
      bgSource.buffer = bgMusicBuffer;
      const bgGain = offlineCtx.createGain();
      const musicStart = Math.max(0, musicTrack.start);
      const fadeStart = Math.max(musicStart, musicTrack.end - Math.max(0.1, bgFadeDuration));
      bgGain.gain.setValueAtTime(bgMusicVolume, 0);
      bgGain.gain.setValueAtTime(bgMusicVolume, musicStart);
      bgGain.gain.setValueAtTime(bgMusicVolume, fadeStart);
      bgGain.gain.linearRampToValueAtTime(0, Math.max(fadeStart, musicTrack.end));
      bgSource.connect(bgGain);
      bgGain.connect(offlineCtx.destination);
      bgSource.start(musicStart);

      const mixedBuffer = await offlineCtx.startRendering();
      await audioCtx.close();
      setVideoProgress(30);

      const img = await loadImage(imageFile);
      const maxW = MAX_SIZE.width, maxH = MAX_SIZE.height;
      let cw = img.naturalWidth, ch = img.naturalHeight;
      if (cw > maxW || ch > maxH) {
        const scale = Math.min(maxW / cw, maxH / ch);
        cw = Math.round(cw * scale);
        ch = Math.round(ch * scale);
      }
      cw = cw % 2 === 0 ? cw : cw - 1;
      ch = ch % 2 === 0 ? ch : ch - 1;

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx2d = canvas.getContext('2d')!;

      const subtitleFont = `${Math.max(18, Math.min(68, subtitleSize))}px ui-rounded, "Segoe UI", sans-serif`;

      const { Muxer, ArrayBufferTarget } = await import('webm-muxer');

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: 'V_VP8', width: cw, height: ch },
        audio: { codec: 'A_OPUS', sampleRate, numberOfChannels: 2 },
      });

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error('VideoEncoder error:', e),
      });
      videoEncoder.configure({ codec: 'vp8', width: cw, height: ch, bitrate: 1_250_000, framerate: FRAME_RATE });

      const totalFrames = Math.ceil(vidDuration * FRAME_RATE);
      for (let i = 0; i < totalFrames; i++) {
        const t = i / FRAME_RATE;
        ctx2d.clearRect(0, 0, cw, ch);

        if (t >= imageTrack.start && t <= imageTrack.end) {
          ctx2d.drawImage(img, 0, 0, cw, ch);
        } else {
          ctx2d.fillStyle = '#05080d';
          ctx2d.fillRect(0, 0, cw, ch);
        }

        if (t >= subtitleTrack.start && t <= subtitleTrack.end) {
          const cueText = resolveSubtitleText(t, subtitleCues);
          drawSubtitle(ctx2d, cueText, cw, ch, {
            font: subtitleFont,
            bottom: subtitleBottom,
            padX: subtitlePaddingX,
            padY: subtitlePaddingY,
            opacity: subtitleOpacity,
          });
        }

        const frame = new VideoFrame(canvas, {
          timestamp: Math.round(t * 1_000_000),
          duration: Math.round((1 / FRAME_RATE) * 1_000_000),
        });
        videoEncoder.encode(frame, { keyFrame: true });
        frame.close();
        if (i % 24 === 0) setVideoProgress(30 + (i / totalFrames) * 25);
      }
      await videoEncoder.flush();
      videoEncoder.close();
      setVideoProgress(55);

      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder error:', e),
      });
      audioEncoder.configure({ codec: 'opus', sampleRate, numberOfChannels: 2, bitrate: 128_000 });

      const frameSize = Math.floor(sampleRate * 0.02);
      const totalAudioFrames = Math.ceil(mixedBuffer.length / frameSize);
      const ch0 = mixedBuffer.getChannelData(0);
      const ch1 = mixedBuffer.numberOfChannels > 1 ? mixedBuffer.getChannelData(1) : ch0;

      for (let i = 0; i < totalAudioFrames; i++) {
        const offset = i * frameSize;
        const length = Math.min(frameSize, mixedBuffer.length - offset);
        const data = new Float32Array(length * 2);
        for (let j = 0; j < length; j++) { data[j] = ch0[offset + j]; data[length + j] = ch1[offset + j]; }
        const audioData = new AudioData({
          format: 'f32-planar' as AudioSampleFormat,
          sampleRate, numberOfFrames: length, numberOfChannels: 2,
          timestamp: Math.round((offset / sampleRate) * 1_000_000), data,
        });
        audioEncoder.encode(audioData);
        audioData.close();
        if (i % 200 === 0) setVideoProgress(55 + (i / totalAudioFrames) * 35);
      }
      await audioEncoder.flush();
      audioEncoder.close();
      setVideoProgress(95);

      muxer.finalize();
      const webmBlob = new Blob([target.buffer], { type: 'video/webm' });
      setVideoBlob(webmBlob);
      setVideoStatus('done');
      setVideoProgress(100);
    } catch (err: any) {
      console.error('Video creation failed:', err);
      setErrorMsg(err.message || String(err));
      setVideoStatus('error');
    }
  };

  const createVideo = () => {
    if (!bgMusicFile || !imageFile) return;
    document.querySelectorAll<HTMLInputElement>('input[data-precise-field]').forEach((el) => { el.blur(); });
    window.setTimeout(() => {
      if (Object.keys(preciseFieldErrorsRef.current).length > 0) return;
      if (!hasVoiceSource || !bgMusicFile || !imageFile || meditationDuration <= 0 || !bgMusicValid) return;
      void runExport();
    }, 48);
  };

  const downloadVideo = () => {
    if (!videoBlob) return;
    const url = URL.createObjectURL(videoBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '_') || 'meditation'}.webm`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const preciseErrorMessages = useMemo(
    () => Array.from(new Set(Object.values(preciseFieldErrors).filter(Boolean))),
    [preciseFieldErrors],
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <h2 className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Video Generator</h2>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4 w-full">
        <div className="min-w-0">
        {/* Sources */}
        <div className="space-y-2 mb-5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Sources</div>

          <div className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded">
            <Music size={13} className="text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs">Meditation Audio (voice)</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {hasSegmentAudio
                  ? `${segments.filter(s => s.type === 'text').length} segments from generator \u00b7 ${
                    meditationDuration > 0 ? formatTime(meditationDuration) : 'calculating...'
                  }`
                  : voiceAudioFile
                    ? `Uploaded: ${voiceAudioFile.name} \u00b7 ${meditationDuration > 0 ? formatTime(meditationDuration) : 'calculating...'}`
                    : 'Add voice: upload a file (right) or go to the Meditation page'}
              </div>
            </div>
            {hasVoiceSource
              ? <CheckCircle2 size={13} className="text-green-600/70 shrink-0" />
              : <AlertCircle size={13} className="text-[var(--text-muted)] shrink-0" />}
            <input
              ref={voiceAudioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleVoiceAudioUpload}
            />
          </div>

          <div
            className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded cursor-pointer hover:bg-[var(--bg-hover)] transition"
            onClick={() => bgMusicInputRef.current?.click()}
          >
            <Upload size={13} className="text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs">Background Music</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {bgMusicFile ? `${bgMusicFile.name} \u00b7 ${formatTime(bgMusicDuration)}` : '.mp3, .wav, .ogg'}
              </div>
            </div>
            {bgMusicFile && (bgMusicValid
              ? <CheckCircle2 size={13} className="text-green-600/70 shrink-0" />
              : <AlertCircle size={13} className="text-red-500/70 shrink-0" />)}
            <input ref={bgMusicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleBgMusicUpload} />
          </div>

          {bgMusicFile && !bgMusicValid && meditationDuration > 0 && (
            <p className="text-[10px] text-red-500/70 pl-3">
              Music must be at least {formatTime(musicMinDuration)} (track start + {bgFadeDuration.toFixed(1)}s fade)
            </p>
          )}

          <div
            className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded cursor-pointer hover:bg-[var(--bg-hover)] transition"
            onClick={() => imageInputRef.current?.click()}
          >
            {imagePreview
              ? <img src={imagePreview} className="w-8 h-5 object-cover rounded shrink-0" />
              : <Image size={13} className="text-[var(--text-muted)] shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-xs">Background Image</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {imageFile ? imageFile.name : '.jpg, .png, .webp'}
              </div>
            </div>
            {imageFile && <CheckCircle2 size={13} className="text-green-600/70 shrink-0" />}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          <div className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded">
            <Captions size={13} className="text-[var(--text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs">Subtitles</div>
              <div className="text-[10px] text-[var(--text-muted)]">{subtitleTrackLabel}</div>
            </div>
            <CheckCircle2 size={13} className="text-green-600/70 shrink-0" />
          </div>
        </div>

        {/* Precision controls */}
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Precise Controls</div>
          {preciseErrorMessages.length > 0 && (
            <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500 space-y-1">
              {preciseErrorMessages.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded p-3">
            <FreeNumberField
              id="voiceStart"
              label="Voice start (s)"
              value={voiceTrack.start}
              onError={setFieldError}
              onCommit={(v) => {
                const s = Math.max(0, v);
                setVoiceTrack({ start: s, end: s + meditationDuration });
              }}
              validate={(n) => {
                if (n < 0) return 'Voice start: enter a number ≥ 0';
                if (n > 1e7) return 'Voice start: number is too large';
                return null;
              }}
            />
            <RangeField label="Voice volume" min={0} max={1.5} step={0.05} value={voiceVolume} onChange={setVoiceVolume} />
            <FreeNumberField
              id="musicStart"
              label="Music start (s)"
              value={musicTrack.start}
              onError={setFieldError}
              onCommit={(v) => setMusicTrack((p) => ({ ...p, start: Math.max(0, v) }))}
              validate={(n) => {
                if (n < 0) return 'Music start: enter a number ≥ 0';
                if (n > 1e7) return 'Music start: number is too large';
                return null;
              }}
            />
            <RangeField label="Music volume" min={0} max={1} step={0.05} value={bgMusicVolume} onChange={setBgMusicVolume} />
            <FreeNumberField
              id="musicEnd"
              label="Music end (s)"
              value={musicTrack.end}
              onError={setFieldError}
              onCommit={(v) => setMusicTrack((p) => {
                const end = Math.max(p.start + 0.2, v);
                return { ...p, end };
              })}
              validate={(n) => {
                if (n <= musicTrack.start) return 'Music end: must be greater than music start';
                if (n > 1e7) return 'Music end: number is too large';
                return null;
              }}
            />
            <FreeNumberField
              id="bgFade"
              label="Music fade-out (s)"
              value={bgFadeDuration}
              onError={setFieldError}
              onCommit={(v) => setBgFadeDuration(Math.max(0.2, v))}
              validate={(n) => {
                if (Number.isNaN(n) || n < 0.2) return 'Fade-out: enter a number ≥ 0.2';
                if (n > 1e4) return 'Fade-out: number is too large';
                return null;
              }}
            />
            <FreeNumberField
              id="imageEnd"
              label="Image end (s)"
              value={imageTrack.end}
              onError={setFieldError}
              onCommit={(v) => setImageTrack((p) => ({ ...p, end: Math.max(p.start + 0.2, v) }))}
              validate={(n) => {
                if (n <= imageTrack.start) return 'Image end: must be after image start';
                if (n > 1e7) return 'Image end: number is too large';
                return null;
              }}
            />
            <FreeNumberField
              id="subtitleEnd"
              label="Subtitle end (s)"
              value={subtitleTrack.end}
              onError={setFieldError}
              onCommit={(v) => setSubtitleTrack((p) => ({ ...p, end: Math.max(p.start + 0.2, v) }))}
              validate={(n) => {
                if (n <= subtitleTrack.start) return 'Subtitle end: must be after subtitle start';
                if (n > 1e7) return 'Subtitle end: number is too large';
                return null;
              }}
            />
            <RangeField label="Subtitle size" min={20} max={68} step={1} value={subtitleSize} onChange={setSubtitleSize} />
            <RangeField label="Subtitle bottom offset" min={30} max={180} step={1} value={subtitleBottom} onChange={setSubtitleBottom} />
            <RangeField label="Subtitle panel opacity" min={0.25} max={0.95} step={0.01} value={subtitleOpacity} onChange={setSubtitleOpacity} />
            <RangeField label="Subtitle horizontal padding" min={12} max={42} step={1} value={subtitlePaddingX} onChange={setSubtitlePaddingX} />
            <RangeField label="Subtitle vertical padding" min={8} max={26} step={1} value={subtitlePaddingY} onChange={setSubtitlePaddingY} />
          </div>
        </div>

        {/* Timeline */}
        {meditationDuration > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Timeline</div>
              <div className="text-[10px] text-[var(--text-muted)]">Total: {formatTime(totalDuration)}</div>
            </div>
            <div className="space-y-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded p-3">
              <TimelineRow name="Voice" track={voiceTrack} totalDuration={totalDuration} color="var(--accent)" />
              <TimelineRow name="Music" track={musicTrack} totalDuration={totalDuration} color="#4f8cff" />
              <TimelineRow name="Image" track={imageTrack} totalDuration={totalDuration} color="#8a7df0" />
              <TimelineRow name="Subtitle" track={subtitleTrack} totalDuration={totalDuration} color="#f2a746" />
              <div className="flex items-center gap-2 mt-1">
                <span className="w-10 shrink-0" />
                <div className="flex-1 flex justify-between text-[9px] text-[var(--text-muted)]">
                  <span>0:00</span>
                  <span>{formatTime(totalDuration)}</span>
                </div>
                <span className="w-10 shrink-0" />
              </div>
            </div>
          </div>
        )}
        </div>

        <div className="min-w-0 space-y-3">
          {!hasVoiceSource && (
            <div
              className="rounded-lg border p-4 sticky top-4"
              style={{ borderColor: 'var(--accent)', background: 'var(--glass-bg)' }}
            >
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Voice audio required</div>
              <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                The video needs a guided-voice track. Upload your own, or go to the Meditation page to create one.
              </p>
              <div className="flex flex-col sm:flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => voiceAudioInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition"
                >
                  <Upload size={14} /> Upload voice audio
                </button>
                {onGoToMeditation && (
                  <button
                    type="button"
                    onClick={onGoToMeditation}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border rounded transition"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    <Sparkles size={14} /> Generate audio in Meditation
                  </button>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-3">Accepted: common formats such as .mp3, .wav, .m4a, .ogg</p>
            </div>
          )}

          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded p-3 sticky top-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Render notes</div>
            <ul className="text-xs text-[var(--text-secondary)] space-y-1.5">
              <li>Track bars show timing for voice, music, image, and subtitles.</li>
              <li>Subtitles: script-based lines when you use the generator; glossy bar at the bottom.</li>
            </ul>
            {hasVoiceSource && onGoToMeditation && !hasSegmentAudio && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={onGoToMeditation}
                  className="text-[11px] text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                >
                  <Mic size={12} /> Switch to script-based audio in Meditation
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        {(videoStatus === 'merging' || videoStatus === 'encoding') && (
          <div className="mb-4 xl:col-span-2">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                {videoStatus === 'merging' ? 'Merging audio...' : 'Encoding video...'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] ml-auto">{Math.round(videoProgress)}%</span>
            </div>
            <div className="w-full h-1 bg-[var(--bg-input)] rounded-full overflow-hidden">
              <motion.div className="h-full bg-[var(--accent)]" animate={{ width: `${videoProgress}%` }} transition={{ ease: 'easeOut' }} />
            </div>
          </div>
        )}

        {videoStatus === 'error' && (
          <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded p-3 xl:col-span-2">
            <p className="text-xs text-red-500">{errorMsg}</p>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-[var(--border)] pt-4 flex items-center gap-2 xl:col-span-2">
          <button
            type="button"
            onClick={createVideo}
            disabled={!canCreate || !preciseControlValid || videoStatus === 'merging' || videoStatus === 'encoding'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Film size={12} /> Create Video
          </button>
          {videoBlob && (
            <button
              onClick={downloadVideo}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-strong)] rounded hover:bg-[var(--bg-active)] transition"
            >
              <Download size={12} /> Download .webm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ name, track, totalDuration, color }: { name: string; track: TrackConfig; totalDuration: number; color: string }) {
  const safeTotal = Math.max(0.1, totalDuration);
  const startPct = (Math.max(0, track.start) / safeTotal) * 100;
  const widthPct = (Math.max(0.1, track.end - track.start) / safeTotal) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">{name}</span>
      <div className="flex-1 h-4 bg-[var(--bg-input)] rounded overflow-hidden relative">
        <div
          className="absolute top-0 bottom-0 rounded"
          style={{ left: `${startPct}%`, width: `${Math.min(100 - startPct, widthPct)}%`, background: color }}
        />
      </div>
      <span className="text-[10px] text-[var(--text-muted)] w-18 text-right">
        {formatTime(track.start)} - {formatTime(track.end)}
      </span>
    </div>
  );
}

function RangeField({ label, min, max, step, value, onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
        <span>{label}</span>
        <span>{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function FreeNumberField({
  id,
  label,
  value,
  onCommit,
  validate,
  onError,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (n: number) => void;
  validate?: (n: number) => string | null;
  onError: (id: string, message: string | null) => void;
}) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : '0'));
  const [localErr, setLocalErr] = useState<string | null>(null);
  const focused = useRef(false);

  const syncFromValue = useCallback((n: number) => {
    if (!Number.isFinite(n)) { setText('0'); return; }
    if (Math.abs(n - Math.round(n)) < 1e-6) setText(String(Math.round(n)));
    else setText(String(n));
  }, []);

  useLayoutEffect(() => {
    if (!focused.current) syncFromValue(value);
  }, [value, syncFromValue]);

  const applyBlur = useCallback(() => {
    const raw = text.trim().replace(/,/g, '.');
    if (raw === '' || raw === '.' || raw === '-' || raw === '+') {
      const m = 'Enter a valid number';
      setLocalErr(m);
      onError(id, `${label}: ${m}`);
      return;
    }
    const n = parseFloat(raw);
    if (Number.isNaN(n) || !Number.isFinite(n)) {
      const m = 'Not a valid number';
      setLocalErr(m);
      onError(id, `${label}: ${m}`);
      return;
    }
    const extra = validate?.(n) ?? null;
    if (extra) {
      setLocalErr(extra);
      onError(id, extra);
      return;
    }
    setLocalErr(null);
    onError(id, null);
    onCommit(n);
    syncFromValue(n);
  }, [text, id, label, onCommit, onError, validate, syncFromValue]);

  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</div>
      <input
        data-precise-field
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (localErr) { setLocalErr(null); onError(id, null); }
        }}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; applyBlur(); }}
        className={`w-full bg-[var(--bg-input)] border rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--border-strong)] transition ${
          localErr ? 'border-red-500/60' : 'border-[var(--border)]'
        }`}
      />
      {localErr && <p className="text-[10px] text-red-500 mt-0.5">{localErr}</p>}
    </label>
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

async function buildSubtitleCues(segments: Segment[]): Promise<SubtitleCue[]> {
  const cues: SubtitleCue[] = [];
  const audioCtx = new AudioContext();
  let offset = 0;
  for (const seg of segments) {
    if (seg.type === 'pause') {
      offset += seg.duration || 0;
      continue;
    }
    if (!seg.audioUrl || !seg.content?.trim()) continue;
    const res = await fetch(seg.audioUrl);
    const arr = await res.arrayBuffer();
    const b = await audioCtx.decodeAudioData(arr.slice(0));
    cues.push({ start: offset, end: offset + b.duration, text: seg.content.trim() });
    offset += b.duration;
  }
  await audioCtx.close();
  return cues;
}

function resolveSubtitleText(t: number, cues: SubtitleCue[]): string {
  const cue = cues.find((c) => t >= c.start && t <= c.end);
  return cue?.text?.trim() || '';
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  style: { font: string; bottom: number; padX: number; padY: number; opacity: number },
) {
  const trimmed = text.trim();
  if (!trimmed) return;
  ctx.save();
  ctx.font = style.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(trimmed);
  const boxW = Math.min(width * 0.9, metrics.width + style.padX * 2);
  const boxH = Math.max(54, parseInt(style.font, 10) + style.padY * 2);
  const x = (width - boxW) / 2;
  const y = height - style.bottom - boxH;

  ctx.shadowColor = 'rgba(255,255,255,0.3)';
  ctx.shadowBlur = 18;
  const gradient = ctx.createLinearGradient(0, y, 0, y + boxH);
  gradient.addColorStop(0, `rgba(255,255,255,${Math.min(0.28, style.opacity)})`);
  gradient.addColorStop(1, `rgba(30,30,30,${Math.max(0.18, style.opacity * 0.7)})`);
  ctx.fillStyle = gradient;
  drawRoundedRect(ctx, x, y, boxW, boxH, 22);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.7, style.opacity)})`;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, boxW, boxH, 22);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(trimmed, width / 2, y + boxH / 2);
  ctx.restore();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
