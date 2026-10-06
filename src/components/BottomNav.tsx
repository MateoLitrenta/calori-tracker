import { House, ChatCircle, ChartBar, User } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';

export type Tab = 'home' | 'chat' | 'charts' | 'profile';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const activeIndex = (['home', 'chat', 'charts', 'profile'] as Tab[]).indexOf(activeTab);
  return (
    <div className="app-bottom-nav fixed bottom-0 left-0 w-full z-50 md:hidden bg-white/95 dark:bg-[#1e2124]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/5 pb-[env(safe-area-inset-bottom)]">
      <div className="bottom-nav-track flex justify-around items-center h-16 max-w-md mx-auto px-2"
        style={{ '--active-index': activeIndex } as CSSProperties}>
        <span className="bottom-nav-indicator" aria-hidden="true" />
        <button
          onClick={() => onTabChange('home')}
          aria-current={activeTab === 'home' ? 'page' : undefined}
          className={`bottom-nav-item flex flex-col items-center justify-center w-full h-full space-y-1 ${
            activeTab === 'home' ? 'text-[#f5a064]' : 'text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <House size={24} weight={activeTab === 'home' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Inicio</span>
        </button>
        <button
          onClick={() => onTabChange('chat')}
          aria-current={activeTab === 'chat' ? 'page' : undefined}
          className={`bottom-nav-item flex flex-col items-center justify-center w-full h-full space-y-1 ${
            activeTab === 'chat' ? 'text-[#f5a064]' : 'text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ChatCircle size={24} weight={activeTab === 'chat' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Coach</span>
        </button>
        <button
          onClick={() => onTabChange('charts')}
          aria-current={activeTab === 'charts' ? 'page' : undefined}
          className={`bottom-nav-item flex flex-col items-center justify-center w-full h-full space-y-1 ${
            activeTab === 'charts' ? 'text-[#f5a064]' : 'text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ChartBar size={24} weight={activeTab === 'charts' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Datos</span>
        </button>
        <button
          onClick={() => onTabChange('profile')}
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          className={`bottom-nav-item flex flex-col items-center justify-center w-full h-full space-y-1 ${
            activeTab === 'profile' ? 'text-[#f5a064]' : 'text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <User size={24} weight={activeTab === 'profile' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Perfil</span>
        </button>
      </div>
    </div>
  );
};

export default BottomNav;
