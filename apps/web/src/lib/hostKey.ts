/**
 * The host key lives in sessionStorage: it survives a reload but not closing the tab, and it's never
 * written anywhere longer-lived. Storage can be unavailable (private mode, blocked site data), so
 * every access is guarded and the page simply asks for the key again.
 */
const STORAGE_KEY = 'slotbook.hostKey';

export function loadHostKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveHostKey(key: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Not persisted; the key still works for this page view.
  }
}

export function clearHostKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
