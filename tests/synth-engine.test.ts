import { noteToFreq, resolveScale, instrumentsForChunk, planSynthEvents, synthBedDurationSec } from '../src/synth-engine';
import { parseBlueprint } from '../src/music-blueprint';
import type { BlueprintChunk } from '../src/music-blueprint';

const gen = (partial: Partial<BlueprintChunk>): BlueprintChunk => ({
  type: 'generation', text: 'x', duration_ms: 60000,
  positive_styles: [], negative_styles: [], context_adherence: 'high', ...partial,
});

describe('noteToFreq', () => {
  it('A4 is 440 Hz', () => { expect(Math.round(noteToFreq('A4'))).toBe(440); });
  it('D3 is about 146.83 Hz', () => { expect(Math.abs(noteToFreq('D3') - 146.83)).toBeLessThan(0.1); });
  it('an octave doubles the frequency', () => {
    expect(Math.abs(noteToFreq('D4') - noteToFreq('D3') * 2)).toBeLessThan(0.01);
  });
  it('garbage falls back to D3', () => { expect(noteToFreq('banana')).toBe(noteToFreq('D3')); });
});

describe('resolveScale', () => {
  it('resolves raga yaman', () => { expect(resolveScale('raga yaman')).toEqual([0, 2, 4, 6, 7, 9, 11]); });
  it('unknown scales fall back to raga yaman', () => { expect(resolveScale('whatever')).toEqual([0, 2, 4, 6, 7, 9, 11]); });
});

describe('instrumentsForChunk', () => {
  it('maps style words to instruments', () => {
    const inst = instrumentsForChunk(gen({ positive_styles: ['tanpura drone', 'singing bowl'] }));
    expect(inst).toContain('drone');
    expect(inst).toContain('bowl');
  });
  it('negative styles veto instruments', () => {
    const inst = instrumentsForChunk(gen({
      positive_styles: ['tanpura drone', 'bansuri flute'],
      negative_styles: ['flute'],
    }));
    expect(inst).toContain('drone');
    expect(inst.includes('flute')).toBe(false);
  });
  it('defaults to drone when nothing is recognised', () => {
    expect(instrumentsForChunk(gen({ positive_styles: ['ethereal vibes'] }))).toEqual(['drone']);
  });
  it('silence chunks have no instruments', () => {
    expect(instrumentsForChunk(gen({ type: 'silence' }))).toEqual([]);
  });
});

describe('planSynthEvents', () => {
  it('bed duration comes from the blueprint total', () => {
    const { plan } = parseBlueprint('{"chunks":[{"text":"x","duration_ms":60000},{"type":"silence","duration_ms":20000}]}');
    expect(synthBedDurationSec(plan!)).toBe(80);
  });

  it('produces a drone event spanning the chunk and no events inside silence', () => {
    const { plan } = parseBlueprint(JSON.stringify({
      chunks: [
        { text: 'x', duration_ms: 60000, positive_styles: ['tanpura drone'] },
        { type: 'silence', duration_ms: 20000 },
      ],
    }));
    const events = planSynthEvents(plan!);
    const drone = events.find(e => e.kind === 'drone');
    expect(drone?.startSec).toBe(0);
    expect(drone?.durSec).toBe(60);
    expect(events.every(e => e.startSec < 60)).toBe(true);
  });

  it('bowls strike sparsely, pads change slowly', () => {
    const { plan } = parseBlueprint(JSON.stringify({
      chunks: [{ text: 'x', duration_ms: 120000, positive_styles: ['singing bowl', 'soft pad'] }],
    }));
    const events = planSynthEvents(plan!);
    const bowls = events.filter(e => e.kind === 'bowl');
    const pads = events.filter(e => e.kind === 'padChord');
    expect(bowls.length).toBeGreaterThan(1);
    expect(bowls.length).toBeLessThan(10);
    expect(pads.length).toBe(6);
  });
});
