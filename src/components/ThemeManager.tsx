import { useEffect } from 'react';

const BUILTIN = ['light', 'dark'];

interface Props {
  theme: string;
  onThemeChange(theme: string): void;
}

export default function ThemeManager({ theme, onThemeChange }: Props) {
  useEffect(() => {
    const rootEl = document.documentElement;
    rootEl.dataset.theme = theme;
    if (BUILTIN.includes(theme)) {
      document.getElementById('user-theme')?.remove();
    }
  }, [theme]);

  useEffect(() => {
    if (BUILTIN.includes(theme)) return;
    let cancelled = false;
    window.api
      .readTheme(theme)
      .then(css => {
        if (cancelled) return;
        let el = document.getElementById('user-theme') as HTMLStyleElement | null;
        if (!el) {
          el = document.createElement('style');
          el.id = 'user-theme';
          document.head.appendChild(el);
        }
        el.textContent = css;
      })
      .catch(() => {
        if (!cancelled) onThemeChange('light');
      });
    return () => {
      cancelled = true;
    };
  }, [theme, onThemeChange]);

  return null;
}
