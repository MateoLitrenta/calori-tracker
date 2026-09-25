import { House, ChatCircle, ChartBar, User, SignOut } from '@phosphor-icons/react';
import ThemeToggle from './ThemeToggle';
import { useAppStore } from '../hooks/useAppStore';
import UserAvatar from './UserAvatar';
import type { Tab } from './BottomNav';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onAuthOpen: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onAuthOpen }: SidebarProps) {
  const { user, activeProfile, avatarRevision, signOut } = useAppStore();

  const navItems = [
    { id: 'home', label: 'Inicio', icon: House },
    { id: 'chat', label: 'Asistente', icon: ChatCircle },
    { id: 'charts', label: 'Gráficos', icon: ChartBar },
    { id: 'profile', label: 'Perfil', icon: User },
  ] as const;

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#1e2124] p-6 justify-between flex-shrink-0 h-full overflow-y-auto">
      <div>
        <div className="flex items-center gap-3 mb-10">
          <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-sidebar" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Calori</h1>
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-control)] font-medium transition-colors ${
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
              <UserAvatar userId={user.id}
                path={activeProfile?.user_id === user.id ? activeProfile.avatar_path : null}
                revision={avatarRevision} size={40} />
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {activeProfile?.user_id === user.id ? activeProfile.name : 'Usuario'}
                </span>
                <span className="text-xs text-slate-500 dark:text-gray-400 truncate">
                  {user.email}
                </span>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-[var(--radius-control)] transition-colors"
            >
              <SignOut size={18} />
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <button
            onClick={onAuthOpen}
            className="flex items-center justify-center w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-[var(--radius-control)] font-medium text-sm transition-colors"
          >
            Ingresar / Registrarse
          </button>
        )}
      </div>
    </aside>
  );
}
