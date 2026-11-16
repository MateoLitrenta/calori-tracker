import { createContext, useContext, useLayoutEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: 'dark',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'calori-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    } catch { /* The preference can still apply for this session. */ }
    return defaultTheme;
  });

  useLayoutEffect(() => {
    const root = window.document.documentElement;
    const media = theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const apply = () => root.classList.toggle('dark', theme === 'dark' || Boolean(media?.matches));
    apply();
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      try { localStorage.setItem(storageKey, theme); } catch { /* Storage may be unavailable. */ }
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
