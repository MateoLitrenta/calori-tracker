import { Fire, House, ChatCircle, ChartBar, User, SignOut } from '@phosphor-icons/react';
import ThemeToggle from './ThemeToggle';
import { useAppStore } from '../hooks/useAppStore';
import type { Tab } from './BottomNav';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onAuthOpen: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onAuthOpen }: SidebarProps) {
  const { user, activeProfile, signOut } = useAppStore();

  const navItems = [
    { id: 'home', label: 'Inicio', icon: House },
    { id: 'chat', label: 'Asistente', icon: ChatCircle },
    { id: 'charts', label: 'Gráficos', icon: ChartBar },
    { id: 'profile', label: 'Perfil', icon: User },
  ] as const;

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-gray-800 bg-white dark:bg-[#161b22] p-6 justify-between flex-shrink-0 h-full overflow-y-auto">
      <div>
        <div className="flex items-center gap-3 mb-10">
          <div className="p-2 bg-slate-100 dark:bg-gray-800 rounded-lg">
            <Fire size={32} weight="fill" className="text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Calori Tracker</h1>
          </div>
        </div>

        {user && (
          <nav className="flex flex-col gap-2">
            {navItems.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-500'
                      : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-[#0f141c] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon size={24} weight={isActive ? 'fill' : 'regular'} />
                  {label}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-slate-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500 dark:text-gray-400">
            Tema Visual
          </span>
          <ThemeToggle />
        </div>
        
        {user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <User size={20} className="text-slate-500 dark:text-gray-400" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {activeProfile?.name || 'Usuario'}
                </span>
                <span className="text-xs text-slate-500 dark:text-gray-400 truncate">
                  {user.email}
                </span>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
            >
              <SignOut size={18} />
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <button
            onClick={onAuthOpen}
            className="flex items-center justify-center w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Ingresar / Registrarse
          </button>
        )}
      </div>
    </aside>
  );
}
