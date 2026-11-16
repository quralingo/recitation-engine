const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createHafsReferenceProvider } = require('../lib/reference');
const { RecitationEngine } = require('../lib/engine');
const root = path.resolve(__dirname, '../mobile-reference');
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'surahs/001.json')));
const model = {version: '4.0.0', build: 'test', tokens: bundle.vocabulary, blank: 0, wordBar: 1, referenceAvailable: false, calibration: null};
const request = {surah: 1, ayah: 1};
test('every generated artifact matches its manifest hash and coverage', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  for (const [file, expected] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(bytes.length, expected.bytes, file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.sha256, file);
  }
  let ayat = 0, words = 0, tokens = 0;
  for (let s = 1; s <= 114; s++) {
    const b = JSON.parse(fs.readFileSync(path.join(root, 'surahs', `${String(s).padStart(3, '0')}.json`)));
    const provider = createHafsReferenceProvider(b);
    for (const [ayah, expected] of Object.entries(b.ayahs)) {
      const resolved = provider.resolveAyah({surah: s, ayah: Number(ayah)}, model);
      assert.equal(resolved.length, expected.length);
      assert.ok(resolved.every(w => w.phonemes.length > 0 && w.phonemes.every(p => model.tokens.includes(p))));
      ayat++; words += expected.length; tokens += expected.flat().length;
    }
  }
  assert.deepEqual({ayat, words, tokens}, {ayat: 6236, words: 77481, tokens: 471080});
  assert.equal(manifest.counts.phones, 522475);
});
test('provider resolves source IDs, optional display IDs and defensive copies', () => {
  const provider = createHafsReferenceProvider(bundle);
  const words = provider.resolveAyah(request, model);
  assert.equal(words.length, bundle.ayahs['1'].length);
  assert.equal(words[0].id, '1:1:1');
  assert.equal(words[0].text, undefined);
  words[0].phonemes.length = 0;
  assert.ok(provider.resolveAyah(request, model)[0].phonemes.length);
  const labels = bundle.ayahs['1'].map((_, i) => ({id: `display-${i}`}));
  assert.equal(provider.resolveAyah({...request, words: labels}, model)[0].id, 'display-0');
});
test('reference rejects changed vocabulary, model generation, context and display counts', () => {
  const provider = createHafsReferenceProvider(bundle);
  assert.throws(() => provider.resolveAyah(request, {...model, tokens: [...model.tokens].reverse()}), /incompatible/);
  assert.throws(() => provider.resolveAyah(request, {...model, version: '5.0.0'}), /incompatible/);
  assert.throws(() => provider.resolveAyah({...request, reading: 'wasl'}, model), /context/);
  assert.throws(() => provider.resolveAyah({...request, words: [{id:'x'}]}, model), /word count/);
  assert.throws(() => provider.resolveAyah({surah:2, ayah:1}, model), /not loaded/);
  assert.throws(() => provider.resolveAyah({surah:1, ayah:999}, model), /reference_missing/);
});
test('reference rejects corrupt token ids, mixed revisions, duplicate surahs and invalid provenance', () => {
  const clone = () => structuredClone(bundle);
  let bad = clone(); bad.ayahs['1'][0][0] = 1;
  assert.throws(() => createHafsReferenceProvider(bad));
  bad = clone(); bad.source.revision = 'unversioned';
  assert.throws(() => createHafsReferenceProvider(bad));
  bad = clone(); bad.surah = 2; bad.source.revision = 'a'.repeat(40);
  assert.throws(() => createHafsReferenceProvider([bundle,bad]), /Mixed/);
  assert.throws(() => createHafsReferenceProvider([bundle,bundle]), /duplicate/);
});
function engineFixture() {
  const calls = [];
  const bridge = {configure: async()=>{}, loadModel: async()=>model, reference:async()=>{ throw Error('SDK reference should not run'); },
    start:async(id, options)=>{calls.push([id, options]);}, cancel:async()=>{}, pushAudio:async()=>{}, stop:async()=>{}, showSharingSettings:async()=>{}};
  return {engine:new RecitationEngine(bridge), calls};
}
test('engine falls back to an offline provider when native reference is absent', async () => {
  const {engine, calls} = engineFixture();
  engine.setReferenceProvider(createHafsReferenceProvider(bundle));
  await engine.configure({apiKey:'test'}); await engine.loadModel();
  await engine.start({expected:request});
  assert.equal(calls.length, 1);
  assert.throws(()=>engine.setReferenceProvider(undefined), /between sessions/);
  await engine.cancel(); engine.setReferenceProvider(undefined);
  await assert.rejects(engine.start({expected:request}), /reference_missing/);
});
test('educator exercise accepts explicit phonemes without Quran lookup and retains instructional focus', async () => {
  const {engine} = engineFixture();
  await engine.configure({apiKey:'test'}); await engine.loadModel();
  const expected = {kind:'exercise', id:'teacher-example', text:'Educator label', focus:['ghunna'],
    words:[{id:'teacher-word', phonemes:bundle.ayahs['1'][0].map(id=>bundle.vocabulary[id])}]};
  const id = await engine.start({expected}); let result;
  engine.onResult(r=>{result=r;});
  engine.acceptChunk({sessionId:id,index:0,startMs:0,endMs:0,backend:'cpu',heads:[], decoded:{text:'',tokens:[],settled:0,isFinal:true}});
  assert.deepEqual(result.exercise.focus,['ghunna']);
  assert.equal(result.words[0].id,'teacher-word');
  assert.equal(result.words[0].state,'uncertain');
  assert.equal(result.words[0].text,undefined);
  assert.equal(result.ghunnaScore,undefined); // No invented rule score.
});
