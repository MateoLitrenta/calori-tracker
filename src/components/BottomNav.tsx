import { House, ChatCircle, ChartBar, User } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';

export type Tab = 'home' | 'chat' | 'charts' | 'profile';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const destinations = [
  { tab: 'home', label: 'Inicio', Icon: House },
  { tab: 'chat', label: 'Coach', Icon: ChatCircle },
  { tab: 'charts', label: 'Datos', Icon: ChartBar },
  { tab: 'profile', label: 'Perfil', Icon: User },
] as const;

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const activeIndex = destinations.findIndex(({ tab }) => tab === activeTab);
  return (
    <nav aria-label="Navegación principal" className="app-bottom-nav fixed bottom-0 left-0 w-full z-50 md:hidden bg-white/95 dark:bg-[#1e2124]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/5 pb-[env(safe-area-inset-bottom)]">
      <div className="bottom-nav-track flex justify-around items-center h-16 max-w-md mx-auto px-2"
        style={{ '--active-index': activeIndex } as CSSProperties}>
        <span className="bottom-nav-indicator" aria-hidden="true" />
        {destinations.map(({ tab, label, Icon }) => {
          const current = activeTab === tab;
          return (
            <button key={tab} type="button" onClick={() => onTabChange(tab)}
              aria-current={current ? 'page' : undefined}
              className="bottom-nav-item flex flex-col items-center justify-center w-full h-full space-y-1 text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white">
              <Icon size={24} weight={current ? 'fill' : 'regular'} aria-hidden="true" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
