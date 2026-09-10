import { House, ChatCircle, ChartBar, User } from '@phosphor-icons/react';

export type Tab = 'home' | 'chat' | 'charts' | 'profile';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  return (
    <div className="fixed bottom-0 left-0 w-full z-50 md:hidden bg-white/90 dark:bg-[#0d1117]/90 backdrop-blur-md border-t border-slate-200 dark:border-gray-800">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
        <button
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'home' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <House size={24} weight={activeTab === 'home' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Inicio</span>
        </button>
        <button
          onClick={() => onTabChange('chat')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'chat' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ChatCircle size={24} weight={activeTab === 'chat' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Asistente</span>
        </button>
        <button
          onClick={() => onTabChange('charts')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'charts' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ChartBar size={24} weight={activeTab === 'charts' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Gráficos</span>
        </button>
        <button
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'profile' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white'
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
