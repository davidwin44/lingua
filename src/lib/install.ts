/**
 * Desktop install support. Edge and Chrome fire `beforeinstallprompt` when the app can be
 * installed; we keep the event so Settings can offer an "Install" button.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function initInstall(): void {
  try {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e as InstallPromptEvent;
      notify();
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      installed = true;
      notify();
    });
  } catch {
    /* not a browser */
  }
}

export function registerServiceWorker(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
  } catch {
    /* ignore */
  }
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches;
  } catch {
    return false;
  }
}

export type InstallState = 'installed' | 'available' | 'unavailable';

export function installState(): InstallState {
  if (installed || isStandalone()) return 'installed';
  return deferred ? 'available' : 'unavailable';
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === 'accepted';
}
