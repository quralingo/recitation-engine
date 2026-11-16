import { NativeEventEmitter, NativeModules } from 'react-native';
import { RecitationEngine } from './engine';
import type { NativeBridge, NativeChunk, SessionEvent } from './types';
export * from './types';
export { pcm16leToFloat32 } from './engine';
export { DEFAULT_THRESHOLDS } from './alignment';
export { createHafsReferenceProvider } from './reference';
export type { HafsReferenceBundle } from './reference';

let instance: RecitationEngine | undefined;
/** One SDK client per process. Call once and keep it for the app's lifetime. */
export function getRecitation(): RecitationEngine {
  if (instance) return instance;
  const native = NativeModules.QuralingoRecitation;
  if (!native) throw new Error('@quranlingoapp/recitation is not linked. Rebuild the native app; Expo Go is unsupported.');
  const engine = new RecitationEngine(native as NativeBridge);
  const events = new NativeEventEmitter(native);
  events.addListener('QuralingoRecitationChunk', (c: NativeChunk) => engine.acceptChunk(c));
  events.addListener('QuralingoRecitationEvent', (e: SessionEvent) => engine.acceptEvent(e));
  instance = engine;
  return engine;
}
