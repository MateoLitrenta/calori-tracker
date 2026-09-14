import { House, ChatCircle, ChartBar, User } from '@phosphor-icons/react';

export type Tab = 'home' | 'chat' | 'charts' | 'profile';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  return (
    <div className="fixed bottom-0 left-0 w-full z-50 md:hidden bg-[#1e2124]/95 backdrop-blur-md border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
        <button
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'home' ? 'text-[#f5a064]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <House size={24} weight={activeTab === 'home' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Inicio</span>
        </button>
        <button
          onClick={() => onTabChange('chat')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'chat' ? 'text-[#f5a064]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <ChatCircle size={24} weight={activeTab === 'chat' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Asistente</span>
        </button>
        <button
          onClick={() => onTabChange('charts')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'charts' ? 'text-[#f5a064]' : 'text-gray-400 hover:text-white'
          }`}
        >
          <ChartBar size={24} weight={activeTab === 'charts' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-medium">Gráficos</span>
        </button>
        <button
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
            activeTab === 'profile' ? 'text-[#f5a064]' : 'text-gray-400 hover:text-white'
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
