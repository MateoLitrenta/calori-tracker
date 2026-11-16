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
    <div className="relative" ref={dropdownRef} onKeyDown={event => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        dropdownRef.current?.querySelector('button')?.focus();
      }
    }}>
      <button
        aria-label="Cambiar Tema" aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="appearance-trigger w-11 h-11 flex items-center justify-center"
        title="Cambiar Tema"
      >
        <CurrentIcon size={20} />
      </button>

      {isOpen && (
        <div className="appearance-picker absolute right-0 mt-2 w-36 shadow-lg overflow-hidden z-50">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setIsOpen(false);
                dropdownRef.current?.querySelector('button')?.focus();
              }}
              aria-pressed={theme === value}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-2"
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
