const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RecitationEngine } = require('../lib/engine');
function fixture(overrides = {}) {
  const info = { version: '4.0.0', build: 'test', tokens: ['blank', '|', 'a', 'b'], blank: 0, wordBar: 1, referenceAvailable: false, calibration: null };
  const calls = [];
  const bridge = { configure: async () => {}, loadModel: async () => info, reference: async () => [['a']],
    start: async (...args) => { calls.push(args); }, pushAudio: async () => {}, cancel: async () => {},
    stop: async id => chunk(id, true), showSharingSettings: async () => {}, ...overrides };
  return { engine: new RecitationEngine(bridge, {referenceProvider: 'sdk'}), calls, bridge, info };
}
const expected = [{ id: 'one', text: 'label', phonemes: ['a'] }];
const chunk = (sessionId, isFinal = false, name = 'a') => ({ sessionId, index: 0, startMs: 0, endMs: 40, backend: 'cpu', heads: [],
  decoded: { text: name, settled: 1, isFinal, tokens: [{id: 2, name, firstMs: 0, peakMs: 0, lastMs: 40, confidence: .99}] } });
async function ready(overrides) { const f = fixture(overrides); await f.engine.configure({ apiKey: 'test' }); await f.engine.loadModel(); return f; }
test('lifecycle prepares the model automatically and rejects overlapping sessions', async () => {
  const { engine } = fixture(); await engine.start({ expected });
  await assert.rejects(engine.start({ expected })); await assert.rejects(engine.configure({ apiKey: 'test' }));
});
test('reference absence fails explicitly and caller phonemes are vocabulary checked', async () => {
  const { engine } = await ready();
  await assert.rejects(engine.start({ expected: { surah: 1, ayah: 1 } }), /reference_missing/);
  await assert.rejects(engine.start({ expected: [{ id: 'x', phonemes: ['made-up'] }] }));
  await assert.rejects(engine.start({ expected: [{ id: 'x', phonemes: ['|'] }] }));
});
test('SDK reference can populate expected word phonemes', async () => {
  const f = await ready(); f.info.referenceAvailable = true;
  const id = await f.engine.start({ expected: { surah: 1, ayah: 1, words: [{id: 'word'}] } });
  let result; f.engine.onResult(r => { result = r; }); f.engine.acceptChunk(chunk(id, true));
  assert.equal(result.words[0].id, 'word'); assert.equal(result.words[0].state, 'correct');
});
test('results are revision snapshots, stale sessions and duplicate finals are ignored', async () => {
  const { engine } = await ready(); const results = [];
  const sub = engine.onResult(r => results.push(r));
  const id = await engine.start({ expected });
  engine.acceptChunk(chunk('old', true)); engine.acceptChunk(chunk(id)); engine.acceptChunk(chunk(id, true));
  engine.acceptChunk(chunk(id, true));
  assert.equal(results.length, 2); assert.equal(results[0].words[0].state, 'pending');
  assert.equal(results[1].words[0].state, 'correct'); assert.equal(results[1].matchedText, 'label');
  sub.remove(); await engine.start({ expected }); engine.acceptChunk(chunk(id, true)); assert.equal(results.length, 2);
});
test('stop returns final output even without a separately delivered native event', async () => {
  const { engine } = await ready(); await engine.start({ expected });
  assert.equal((await engine.stop()).decoded.isFinal, true);
});
test('backend replay can revise prior word feedback', async () => {
  const { engine } = await ready(); const r = []; engine.onResult(x => r.push(x));
  const id = await engine.start({ expected });
  const first = chunk(id); first.decoded.tokens.push({id: 1, name: '|', firstMs: 40, peakMs: 40, lastMs: 40, confidence: .99}); first.decoded.settled = 2;
  engine.acceptChunk(first); engine.acceptEvent({sessionId: id, type: 'backendChanged', fromChunk: 0});
  engine.acceptChunk({...chunk(id, false, 'b'), index: 0});
  assert.equal(r[0].words[0].state, 'correct'); assert.equal(r[1].words[0].committed, false);
});
test('external input is validated, ordered and bounded', async () => {
  let unblock; const received = [];
  const { engine } = await ready({ pushAudio: async (_id, values) => { received.push(values); await new Promise(r => { unblock = r; }); } });
  await engine.start({ expected, source: 'external', sampleRate: 16000 });
  await assert.rejects(engine.pushAudio([NaN])); await assert.rejects(engine.pushAudio([2]));
  await assert.rejects(engine.pushAudio(new Float32Array(16001)));
  const jobs = [engine.pushAudio([.1]), engine.pushAudio([.2]), engine.pushAudio([.3]), engine.pushAudio([.4])];
  await assert.rejects(engine.pushAudio([.5]), /backpressure/);
  for (let i = 0; i < 4; i++) { await new Promise(r => setImmediate(r)); unblock(); }
  await Promise.all(jobs); assert.deepEqual(received, [[.1], [.2], [.3], [.4]]);
});
test('unsupported cross-platform sample rates and invalid silence windows fail early', async () => {
  const { engine } = await ready();
  await assert.rejects(engine.start({ expected, sampleRate: 12345 }));
  await assert.rejects(engine.start({ expected, endOnSilenceMs: 100 }));
});
test('failed native start releases lifecycle state', async () => {
  let fail = true;
  const { engine } = await ready({ start: async () => { if (fail) throw new Error('microphone_denied'); } });
  await assert.rejects(engine.start({ expected }), /microphone_denied/); fail = false;
  await engine.start({ expected }); await engine.cancel();
});

test('only a VAD speech end can close the final streaming word, not an old CTC timestamp', async () => {
  const { engine } = await ready();
  const results = [];
  engine.onResult(result => results.push(result));
  const id = await engine.start({ expected, source: 'external', endOnSilenceMs: 0 });
  engine.acceptChunk({ ...chunk(id), endMs: 5000 });
  assert.equal(results.at(-1).words[0].state, 'pending');
  engine.acceptEvent({ sessionId: id, type: 'speechEnded', atMs: 5000, silenceMs: 1520 });
  assert.equal(results.at(-1).words[0].state, 'correct');
  assert.equal(results.at(-1).decoded.isFinal, false);
  await engine.pushAudio([0]);
});

test('storage inspection configures the client but never downloads a model', async () => {
  let loads = 0;
  const { engine } = fixture({ loadModel: async () => { loads++; }, getModelStorage: async () => ({ models: [] }) });
  assert.deepEqual(await engine.getModelStorage(), { models: [] });
  assert.equal(loads, 0);
});

test('download progress is independent of capture sessions and subscriptions can be removed', async () => {
  const { engine } = fixture();const seen = [];
  const subscription = engine.onModelDownloadProgress(progress => seen.push(progress));
  engine.acceptModelDownloadProgress({ downloadedBytes: 5, totalBytes: 10 });
  engine.acceptModelDownloadProgress({ downloadedBytes: -1, totalBytes: 10 });
  engine.acceptModelDownloadProgress({ downloadedBytes: NaN, totalBytes: 10 });
  subscription.remove();engine.acceptModelDownloadProgress({ downloadedBytes: 10, totalBytes: 10 });
  assert.deepEqual(seen, [{ downloadedBytes: 5, totalBytes: 10 }]);
});

test('microphone readiness follows native startup without needing speech', async () => {
  let release;
  const events = [];
  const { engine } = await ready({ start: () => new Promise(resolve => { release = resolve; }) });
  engine.onEvent(event => events.push(event));
  const pending = engine.start({ expected });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.length, 0);
  release();
  const id = await pending;
  assert.deepEqual(events, [{ sessionId: id, type: 'captureReady' }]);
});
test('failed startup and external audio do not claim microphone readiness', async () => {
  const failed = await ready({ start: async () => { throw new Error('microphone_denied'); } });
  const events = [];
  failed.engine.onEvent(event => events.push(event));
  await assert.rejects(failed.engine.start({ expected }));
  const external = await ready();
  external.engine.onEvent(event => events.push(event));
  await external.engine.start({ expected, source: 'external' });
  assert.equal(events.length, 0);
});
test('cancelling native startup never emits captureReady', async () => {
  let release;
  const { engine } = await ready({ start: () => new Promise(resolve => { release = resolve; }) });
  const events = [];
  engine.onEvent(event => events.push(event));
  const start = engine.start({ expected });
  const rejected = assert.rejects(start, /cancelled/);
  await new Promise(resolve => setImmediate(resolve));
  const cancel = engine.cancel();
  release();
  await cancel;
  await rejected;
  assert.equal(events.length, 0);
});
test('focused sessions validate their target and return only its feedback', async () => {
  const { engine } = await ready();
  await assert.rejects(engine.start({ expected, focusWordId: 'missing' }), /focusWordId/);
  const results = [];
  engine.onResult(result => results.push(result));
  const id = await engine.start({ expected: [...expected, { id: 'other', phonemes: ['b'] }], focusWordId: 'one' });
  engine.acceptChunk(chunk(id, true));
  assert.deepEqual(results.at(-1).words.map(w => w.id), ['one']);
});
