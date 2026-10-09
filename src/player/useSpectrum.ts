import { useSyncExternalStore } from 'react';
import { spectrum } from './spectrum';

export function useSpectrumState() {
  return useSyncExternalStore(spectrum.subscribeState, spectrum.getState, spectrum.getState);
}
