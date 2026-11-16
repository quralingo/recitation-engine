import { NativeEventEmitter, NativeModules } from 'react-native';
import { RecitationEngine } from './engine';
import type { NativeBridge, NativeChunk, RecitationEngineOptions, SessionEvent } from './types';
export * from './types';
export { pcm16leToFloat32 } from './engine';
export { DEFAULT_THRESHOLDS } from './alignment';
export { createHafsReferenceProvider } from './reference';
export type { HafsReferenceBundle } from './reference';
export { createBundledHafsReferenceProvider } from './bundled-reference';

let instance: RecitationEngine | undefined;
/** One SDK client per process. Call once and keep it for the app's lifetime. */
export function getRecitation(options?: RecitationEngineOptions): RecitationEngine {
  if (instance) {
    if (options) throw new Error('getRecitation options must be set on the first call; use setReferenceProvider between sessions');
    return instance;
  }
  const native = NativeModules.QuralingoRecitation;
  if (!native) throw new Error('@quranlingoapp/recitation is not linked. Rebuild the native app; Expo Go is unsupported.');
  const engine = new RecitationEngine(native as NativeBridge, options);
  const events = new NativeEventEmitter(native);
  events.addListener('QuralingoRecitationChunk', (c: NativeChunk) => engine.acceptChunk(c));
  events.addListener('QuralingoRecitationEvent', (e: SessionEvent) => engine.acceptEvent(e));
  instance = engine;
  return engine;
}
