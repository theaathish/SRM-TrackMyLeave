import { useEffect } from 'react';

export function useFrameworkReady() {
  useEffect(() => {
    // Only run on web platform
    if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
      const win = globalThis.window as any;
      if (win.frameworkReady) {
        win.frameworkReady();
      }
    }
  }, []);
}