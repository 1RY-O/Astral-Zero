/**
 * Debris Derby — theme preference.
 *
 * Three choices: `system` (default, follows prefers-color-scheme), `dark` and
 * `light` (manual overrides persisted to localStorage). The canvas reads the
 * same CSS custom properties at runtime, so the game surface and the React
 * chrome can never disagree about the active theme.
 */

export const THEME_STORAGE_KEY = 'debris-derby:theme';
export const THEME_CHOICES = Object.freeze(['system', 'dark', 'light']);
export const THEME_EVENT = 'debrisderby:themechange';

let systemMedia = null;
let systemListener = null;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getThemePreference() {
  const saved = storage()?.getItem(THEME_STORAGE_KEY);
  return THEME_CHOICES.includes(saved) ? saved : 'system';
}

export function prefersLight() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function resolveTheme(preference = getThemePreference()) {
  if (preference === 'dark' || preference === 'light') return preference;
  return prefersLight() ? 'light' : 'dark';
}

/**
 * Apply a preference to the document.
 * @param {'system'|'dark'|'light'} preference
 * @param {{ persist?: boolean, announce?: boolean }} [options]
 * @returns {'dark'|'light'} resolved theme
 */
export function applyTheme(preference, { persist = false, announce = true } = {}) {
  if (typeof document === 'undefined') return 'dark';
  const choice = THEME_CHOICES.includes(preference) ? preference : 'system';
  const resolved = resolveTheme(choice);

  if (choice === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', choice);
  }
  document.documentElement.style.colorScheme = resolved;

  if (persist) {
    try {
      storage()?.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      /* storage may be blocked; the in-memory theme still applies */
    }
  }

  if (announce && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(THEME_EVENT, { detail: { preference: choice, resolved } }),
    );
  }
  return resolved;
}

export function setTheme(preference) {
  return applyTheme(preference, { persist: true });
}

/**
 * Apply the saved preference and follow OS changes while in `system` mode.
 * @returns {() => void} cleanup
 */
export function initTheme() {
  applyTheme(getThemePreference(), { announce: false });
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  if (!systemMedia) {
    systemMedia = window.matchMedia('(prefers-color-scheme: light)');
    systemListener = () => {
      if (getThemePreference() === 'system') applyTheme('system');
    };
    systemMedia.addEventListener?.('change', systemListener);
  }
  return () => {
    systemMedia?.removeEventListener?.('change', systemListener);
    systemMedia = null;
    systemListener = null;
  };
}
