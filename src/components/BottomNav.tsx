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
    <nav aria-label="Navegación principal" className="app-bottom-nav md:hidden">
      <div className="bottom-nav-track"
        style={{ '--active-index': activeIndex } as CSSProperties}>
        <span className="bottom-nav-indicator" aria-hidden="true" />
        {destinations.map(({ tab, label, Icon }) => {
          const current = activeTab === tab;
          return (
            <button key={tab} type="button" onClick={() => onTabChange(tab)}
              aria-current={current ? 'page' : undefined}
              className="bottom-nav-item">
              <Icon size={20} weight={current ? 'fill' : 'regular'} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
