import { getRecitation, pcm16leToFloat32 } from '@quranlingoapp/recitation';
import type { ExpectedWord } from '@quranlingoapp/recitation';

// Supply phonemes from a reviewed reference matching model.tokens.
// Never derive the Quran's recitation phonemes by splitting Arabic letters.
export async function recite(apiKey: string, expected: ExpectedWord[]) {
  const engine = getRecitation();
  await engine.configure({ apiKey, audience: 'children' });
  const model = await engine.loadModel();
  console.log(model.version, model.referenceAvailable);
  const resultSubscription = engine.onResult(result => {
    // Render result.words (pending/provisional/committed), decoded.text and raw heads.
    // Replace the preceding snapshot. The SDK can replay chunks after backend failover.
    console.log(result.decoded.isFinal, result.words);
  });
  const eventSubscription = engine.onEvent(event => console.log(event.type));
  await engine.start({ expected }); // Native microphone, ~320 ms model context.
  return {
    stop: async () => {
      try { return await engine.stop(); }
      finally { resultSubscription.remove(); eventSubscription.remove(); }
    },
    cancel: async () => {
      try { await engine.cancel(); }
      finally { resultSubscription.remove(); eventSubscription.remove(); }
    },
  };
}

export async function feedExistingStream(expected: ExpectedWord[], chunks: AsyncIterable<Uint8Array>) {
  const engine = getRecitation(); // Already configured and loaded by the host.
  await engine.start({ source: 'external', sampleRate: 16000, expected, endOnSilenceMs: 0 });
  for await (const pcm16le of chunks) await engine.pushAudio(pcm16leToFloat32(pcm16le));
  return engine.stop();
}
