import {
  chunkVoiceSpec,
  parseVoiceBlueprint, parseGapValue, blueprintTotals, chunkTextForApi, DEFAULT_VOICE_BLUEPRINT,
} from '../src/voice-blueprint';

describe('parseGapValue', () => {
  it('accepts seconds strings, minutes and bare numbers', () => {
    expect(parseGapValue('20s')).toBe(20);
    expect(parseGapValue('2m')).toBe(120);
    expect(parseGapValue('1m30s')).toBe(90);
    expect(parseGapValue(15)).toBe(15);
    expect(parseGapValue('15')).toBe(15);
  });
  it('rejects garbage', () => {
    expect(parseGapValue('soon')).toBe(null);
    expect(parseGapValue('')).toBe(null);
    expect(parseGapValue(null)).toBe(null);
  });
});

describe('parseVoiceBlueprint', () => {
  it('parses the default template with voice defaults intact', () => {
    const r = parseVoiceBlueprint(DEFAULT_VOICE_BLUEPRINT);
    expect(r.errors).toEqual([]);
    expect(r.blueprint?.title).toBe('Morning Stillness');
    expect(r.blueprint?.voice.persona).toBe('in_m_whisper');
    expect(r.blueprint?.voice.speed).toBe(0.9);
  });

  it('fills defaults when the voice block is missing', () => {
    const r = parseVoiceBlueprint('{"timeline":[{"chunk":"Om."}]}');
    expect(r.errors).toEqual([]);
    expect(r.blueprint?.voice.model_id).toBe('eleven_multilingual_v2');
    expect(r.blueprint?.title).toBe('Guided Meditation');
  });

  it('rejects invalid JSON and an empty timeline', () => {
    expect(parseVoiceBlueprint('{nope').blueprint).toBe(null);
    expect(parseVoiceBlueprint('{"timeline":[]}').blueprint).toBe(null);
  });

  it('rejects a leading gap and consecutive gaps', () => {
    const lead = parseVoiceBlueprint('{"timeline":[{"gap":"5s"},{"chunk":"x"}]}');
    expect(lead.blueprint).toBe(null);
    const dbl = parseVoiceBlueprint('{"timeline":[{"chunk":"x"},{"gap":"5s"},{"gap":"5s"},{"chunk":"y"}]}');
    expect(dbl.blueprint).toBe(null);
  });

  it('rejects out-of-range speed and stability', () => {
    const r = parseVoiceBlueprint('{"voice":{"speed":2},"timeline":[{"chunk":"x"}]}');
    expect(r.blueprint).toBe(null);
    const r2 = parseVoiceBlueprint('{"voice":{"stability":1.5},"timeline":[{"chunk":"x"}]}');
    expect(r2.blueprint).toBe(null);
  });

  it('warns (not errors) on a trailing gap and unknown short persona', () => {
    const r = parseVoiceBlueprint('{"voice":{"persona":"bob"},"timeline":[{"chunk":"x"},{"gap":"5s"}]}');
    expect(r.blueprint === null).toBe(false);
    expect(r.warnings.length).toBe(2);
  });

  it('keeps the delivery note on a chunk', () => {
    const r = parseVoiceBlueprint('{"timeline":[{"chunk":"Rest.","delivery":"softly"}]}');
    const item = r.blueprint?.timeline[0];
    expect(item?.type).toBe('chunk');
    if (item?.type === 'chunk') expect(item.delivery).toBe('softly');
  });
});

describe('blueprintTotals', () => {
  it('counts chunks, gaps, characters and estimates runtime', () => {
    const r = parseVoiceBlueprint(DEFAULT_VOICE_BLUEPRINT);
    const t = blueprintTotals(r.blueprint!);
    expect(t.chunks).toBe(5);
    expect(t.gaps).toBe(5);
    expect(t.totalGapSec).toBe(55);
    expect(t.estTotalSec).toBeGreaterThan(55);
    expect(t.spokenChars).toBeGreaterThan(100);
  });
});

describe('chunkTextForApi', () => {
  it('prepends the delivery tag only for eleven_v3', () => {
    const item = { type: 'chunk' as const, text: 'Rest.', delivery: 'softly' };
    expect(chunkTextForApi(item, 'eleven_v3')).toBe('[softly] Rest.');
    expect(chunkTextForApi(item, 'eleven_multilingual_v2')).toBe('Rest.');
  });
});

describe('per-chunk stability/speed overrides', () => {
  it('keeps valid overrides on the chunk', () => {
    const r = parseVoiceBlueprint('{"timeline":[{"chunk":"Go.","stability":0.4,"speed":0.95}]}');
    expect(r.errors).toEqual([]);
    const item = r.blueprint?.timeline[0];
    if (item?.type === 'chunk') {
      expect(item.stability).toBe(0.4);
      expect(item.speed).toBe(0.95);
    }
  });
  it('rejects out-of-range chunk overrides', () => {
    expect(parseVoiceBlueprint('{"timeline":[{"chunk":"Go.","stability":2}]}').blueprint).toBe(null);
    expect(parseVoiceBlueprint('{"timeline":[{"chunk":"Go.","speed":0.5}]}').blueprint).toBe(null);
  });
  it('chunkVoiceSpec merges overrides over the voice block', () => {
    const r = parseVoiceBlueprint('{"voice":{"stability":0.5,"speed":0.9},"timeline":[{"chunk":"Go.","stability":0.4},{"chunk":"Rest."}]}');
    const bp = r.blueprint!;
    const first = bp.timeline[0];
    const second = bp.timeline[1];
    if (first.type === 'chunk' && second.type === 'chunk') {
      expect(chunkVoiceSpec(bp, first).stability).toBe(0.4);
      expect(chunkVoiceSpec(bp, first).speed).toBe(0.9);
      expect(chunkVoiceSpec(bp, second).stability).toBe(0.5);
      expect(chunkVoiceSpec(bp, second).persona).toBe('in_m_whisper');
    }
  });
});
