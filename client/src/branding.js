/*
 * Per-deployment branding.
 *
 * The office name lives in the database (app_settings.office_name), written by the
 * first-run onboarding screen and editable afterwards in الإعدادات. It is fetched at
 * boot from the public /api/onboarding/status endpoint, so one build of this app
 * serves any office — nothing office-specific is baked into the bundle.
 *
 * The previous build-time VITE_OFFICE_NAME approach is gone: it would have meant
 * setting a Vercel variable for every office and rebuilding to rename one, and it
 * could not be driven by an in-app onboarding form.
 *
 *   VITE_OFFICE_LOGO_URL  optional per-deployment logo; falls back to the bundled one.
 *
 * The name falls back to a GENERIC label, never another office's name, and is cached
 * in localStorage so a reload doesn't flash the fallback before the fetch lands.
 */
import defaultLogo from './assets/logo.png';
import API_BASE from './config';

export const GENERIC_OFFICE_NAME = 'مكتب العدل المنفذ';

const CACHE_KEY = 'office_branding';

const logoFromEnv = () => {
    const v = import.meta.env.VITE_OFFICE_LOGO_URL;
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export const OFFICE_LOGO = logoFromEnv() || defaultLogo;

/*
 * The bailiff's name is stored bare ("مراد القعودي"); the sidebar has always shown
 * it as "مكتب الأستاذ …". Compose it here so the stored value stays the same string
 * the act template merges.
 */
export const composeOfficeLabel = (officeName) => {
    const name = (officeName || '').trim();
    return name ? `مكتب الأستاذ ${name}` : GENERIC_OFFICE_NAME;
};

// Last known name, so the first paint after a reload is already correct.
export const cachedOfficeLabel = () => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return GENERIC_OFFICE_NAME;
        return composeOfficeLabel(JSON.parse(raw).officeName);
    } catch {
        return GENERIC_OFFICE_NAME;
    }
};

/*
 * Ask the server who this deployment belongs to and whether it still needs setup.
 * Returns { needsOnboarding, officeName, label }. Never throws — a failed fetch
 * degrades to the cached/generic name and "already set up", so a backend blip can
 * never bounce a working office into the onboarding screen.
 */
export async function loadBranding() {
    try {
        const res = await fetch(`${API_BASE}/onboarding/status`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const officeName = data.officeName || '';
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ officeName })); } catch { /* private mode */ }
        return {
            needsOnboarding: Boolean(data.needsOnboarding),
            officeName,
            label: composeOfficeLabel(officeName),
        };
    } catch {
        return { needsOnboarding: false, officeName: '', label: cachedOfficeLabel() };
    }
}
