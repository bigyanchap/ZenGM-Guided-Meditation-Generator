import {
  parseBlueprint, blueprintTotalMs, scaleBlueprintToTotal,
  splitForElevenLabs, toElevenLabsPlan, chunkTitle, MEDITATION_TEMPLATE,
} from '../src/music-blueprint';

describe('parseBlueprint', () => {
  it('parses the meditation template', () => {
    const r = parseBlueprint(MEDITATION_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.plan?.chunks.length).toBe(3);
    expect(blueprintTotalMs(r.plan!)).toBe(300000);
  });

  it('rejects invalid JSON with a readable error', () => {
    const r = parseBlueprint('{not json');
    expect(r.plan).toBe(null);
    expect(r.errors.length).toBe(1);
  });

  it('rejects a missing chunks array', () => {
    const r = parseBlueprint('{"foo": 1}');
    expect(r.plan).toBe(null);
  });

  it('accepts a silence chunk without text/styles', () => {
    const r = parseBlueprint('{"chunks":[{"type":"silence","duration_ms":20000}]}');
    expect(r.errors).toEqual([]);
    expect(r.plan?.chunks[0].type).toBe('silence');
  });

  it('rejects a generation chunk with no text', () => {
    const r = parseBlueprint('{"chunks":[{"duration_ms":5000,"positive_styles":[],"negative_styles":[]}]}');
    expect(r.plan).toBe(null);
    expect(r.errors[0]).toContain('Chunk 1');
  });

  it('rejects a bad context_adherence', () => {
    const r = parseBlueprint('{"chunks":[{"text":"x","duration_ms":5000,"context_adherence":"extreme"}]}');
    expect(r.plan).toBe(null);
  });

  it('warns (not errors) when a chunk exceeds the ElevenLabs per-chunk limit', () => {
    const r = parseBlueprint('{"chunks":[{"text":"x","duration_ms":180000}]}');
    expect(r.plan === null).toBe(false);
    expect(r.warnings.length).toBe(1);
  });

  it('keeps synth extras root/scale', () => {
    const r = parseBlueprint('{"chunks":[{"text":"x","duration_ms":5000,"root":"D3","scale":"raga yaman"}]}');
    expect(r.plan?.chunks[0].root).toBe('D3');
    expect(r.plan?.chunks[0].scale).toBe('raga yaman');
  });
});

describe('scaleBlueprintToTotal', () => {
  it('scales proportionally and hits the target exactly', () => {
    const { plan } = parseBlueprint(MEDITATION_TEMPLATE);
    const scaled = scaleBlueprintToTotal(plan!, 600000);
    expect(blueprintTotalMs(scaled)).toBe(600000);
    expect(scaled.chunks[0].duration_ms).toBe(120000);
    expect(scaled.chunks[1].duration_ms).toBe(360000);
  });

  it('does not mutate the input plan', () => {
    const { plan } = parseBlueprint(MEDITATION_TEMPLATE);
    scaleBlueprintToTotal(plan!, 100000);
    expect(blueprintTotalMs(plan!)).toBe(300000);
  });
});

describe('splitForElevenLabs + toElevenLabsPlan', () => {
  it('splits generation runs around silence and strips silence from the API plan', () => {
    const { plan } = parseBlueprint(JSON.stringify({
      chunks: [
        { text: 'a', duration_ms: 10000 },
        { type: 'silence', duration_ms: 5000 },
        { text: 'b', duration_ms: 10000 },
        { text: 'c', duration_ms: 10000 },
      ],
    }));
    const parts = splitForElevenLabs(plan!);
    expect(parts.length).toBe(3);
    expect(parts[0].kind).toBe('compose');
    expect(parts[1].kind).toBe('silence');
    expect(parts[2].kind).toBe('compose');
    const apiPlan = toElevenLabsPlan(plan!.chunks) as { chunks: unknown[] };
    expect(apiPlan.chunks.length).toBe(3);
  });
});

describe('chunkTitle', () => {
  it('uses the bracketed label', () => {
    const { plan } = parseBlueprint('{"chunks":[{"text":"[Opening] Drone fades in.","duration_ms":5000}]}');
    expect(chunkTitle(plan!.chunks[0])).toBe('Opening');
  });
  it('names silence chunks', () => {
    const { plan } = parseBlueprint('{"chunks":[{"type":"silence","duration_ms":5000}]}');
    expect(chunkTitle(plan!.chunks[0])).toBe('Silence');
  });
});
