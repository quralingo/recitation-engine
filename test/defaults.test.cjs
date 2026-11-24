const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { RecitationEngine } = require('../lib/engine');
const { createBundledHafsReferenceProvider } = require('../lib/bundled-reference');
const bundle = require('../mobile-reference/surahs/001.json');
const model = {version:'4.0.0',build:'test',tokens:bundle.vocabulary,blank:0,wordBar:1,referenceAvailable:false,calibration:null};
function fixture(overrides = {}) {
  const calls = {configure:[], load:0, start:[]};
  const bridge = {configure:async c=>{calls.configure.push(c);}, loadModel:async()=>{calls.load++;return model;},
    start:async(id,o)=>{calls.start.push([id,o]);}, reference:async()=>{throw Error('Unexpected SDK reference lookup');},
    cancel:async()=>{}, pushAudio:async()=>{}, showSharingSettings:async()=>{}, ...overrides};
  return {engine:new RecitationEngine(bridge),bridge,calls};
}
test('start needs only surah/ayah; prepares once, selects bundled data and reuses the model', async()=>{
  const {engine,calls} = fixture();
  const id = await engine.start({expected:{surah:1,ayah:1}});
  assert.deepEqual(calls.configure,[{}]);
  assert.equal(calls.load,1);
  let result;engine.onResult(r=>{result=r;});
  engine.acceptChunk({sessionId:id,index:0,startMs:0,endMs:0,backend:'cpu',heads:[],decoded:{text:'',tokens:[],settled:0,isFinal:true}});
  assert.equal(result.words.length,bundle.ayahs['1'].length);
  assert.deepEqual(result.words[0].expectedPhonemes,bundle.ayahs['1'][0].map(i=>model.tokens[i]));
  await engine.start({expected:{surah:114,ayah:6}});
  assert.equal(calls.configure.length,1);assert.equal(calls.load,1);
});
test('bundled loader resolves every ayah from static package JSON paths',()=>{
  const provider=createBundledHafsReferenceProvider();let count=0;
  for(let s=1;s<=114;s++){
    const b=JSON.parse(fs.readFileSync(`mobile-reference/surahs/${String(s).padStart(3,'0')}.json`));
    for(const ayah of Object.keys(b.ayahs)){
      assert.equal(provider.resolveAyah({surah:s,ayah:Number(ayah)},model).length,b.ayahs[ayah].length);count++;
    }
  }
  assert.equal(count,6236);
});
test('explicit word phonemes bypass the default Quran reference entirely',async()=>{
  const {engine}=fixture();let lookups=0;
  engine.setReferenceProvider({resolveAyah:()=>{lookups++;throw Error('Should not run');}});
  await engine.start({expected:[{id:'practice-1',phonemes:['a']}]});await engine.cancel();
  await engine.start({expected:{kind:'exercise',id:'custom',words:[{id:'practice-2',phonemes:['i']}],focus:['ghunna']}});
  assert.equal(lookups,0);
});
test('caller provider overrides built-in and SDK references',async()=>{
  const {bridge}=fixture({loadModel:async()=>({...model,referenceAvailable:true})});let used=0;
  const engine=new RecitationEngine(bridge,{referenceProvider:{resolveAyah:()=>{used++;return [{id:'alternate',phonemes:['a']}];}}});
  await engine.start({expected:{surah:1,ayah:1}});assert.equal(used,1);
});
test('missing native key rejects before model download; explicit configuration can recover',async()=>{
  const f=fixture({configure:async c=>{if(!c.apiKey)throw Error('missing_configuration');}});
  await assert.rejects(f.engine.start({expected:{surah:1,ayah:1}}),/missing_configuration/);
  assert.equal(f.calls.load,0);
  await f.engine.configure({apiKey:'test'});await f.engine.start({expected:{surah:1,ayah:1}});
  assert.equal(f.calls.load,1);
});
test('failed model load retries on next start without creating another client',async()=>{
  let attempt=0;const f=fixture({loadModel:async()=>{if(++attempt===1)throw Error('needs_connection');return model;}});
  await assert.rejects(f.engine.start({expected:{surah:1,ayah:1}}),/needs_connection/);
  await f.engine.start({expected:{surah:1,ayah:1}});
  assert.equal(attempt,2);assert.equal(f.calls.configure.length,1);
});
test('cancel during automatic loading prevents a late microphone start',async()=>{
  let release;const f=fixture({loadModel:()=>new Promise(resolve=>{release=()=>resolve(model);})});
  const start=f.engine.start({expected:{surah:1,ayah:1}});
  const rejected=assert.rejects(start,/cancelled/);
  await new Promise(resolve=>setImmediate(resolve));
  const cancel=f.engine.cancel();release();await cancel;await rejected;
  assert.equal(f.calls.start.length,0);
});
test('cancel during native start releases the session before cancellation completes',async()=>{
  let release, nativeCancelled=false;
  const f=fixture({start:()=>new Promise(resolve=>{release=resolve;}),cancel:async()=>{nativeCancelled=true;}});
  const start=f.engine.start({expected:{surah:1,ayah:1}});
  const rejected=assert.rejects(start,/cancelled/);
  await new Promise(resolve=>setImmediate(resolve));
  const cancel=f.engine.cancel();release();await cancel;await rejected;
  assert.equal(nativeCancelled,true);
});
test('package entry point keeps one singleton and supports first-call reference options',async()=>{
  const Module=require('node:module');const original=Module._load;let nativeConfigure=0;
  const native={configure:async()=>{nativeConfigure++;},loadModel:async()=>model,start:async()=>{}};
  Module._load=function(request,parent,isMain){
    if(request==='react-native')return {NativeModules:{QuralingoRecitation:native},NativeEventEmitter:class{addListener(){}}};
    return original.call(this,request,parent,isMain);
  };
  let api;
  try{api=require('../lib/index');}finally{Module._load=original;}
  const engine=api.getRecitation({referenceProvider:'bundled-hafs'});
  assert.equal(api.getRecitation(),engine);
  assert.throws(()=>api.getRecitation({referenceProvider:'sdk'}),/first call/);
  await engine.start({expected:{surah:1,ayah:1}});assert.equal(nativeConfigure,1);
});
