import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Desktop } from '@phosphor-icons/react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themes = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'system', label: 'Sistema', icon: Desktop },
  ] as const;

  const currentIcon = themes.find((t) => t.value === theme)?.icon || Desktop;
  const CurrentIcon = currentIcon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-11 h-11 flex items-center justify-center bg-white dark:bg-[#1e2124] hover:bg-slate-100 dark:hover:bg-[#292d30] border border-slate-200 dark:border-white/5 rounded-[var(--radius-control)] transition-colors text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white"
        title="Cambiar Tema"
      >
        <CurrentIcon size={20} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-white/5 rounded-[var(--radius-widget)] shadow-lg overflow-hidden z-50">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                theme === value
                  ? 'bg-slate-200 dark:bg-gray-800 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-800/50 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
