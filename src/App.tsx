import { useState, useRef, useEffect } from 'react';
import HomeView from './components/HomeView';
import ChatView from './components/ChatView';
import ChartsView from './components/ChartsView';
import ProfileView from './components/ProfileView';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import type { Tab } from './components/BottomNav';
import AuthModal from './components/AuthModal';
import ThemeToggle from './components/ThemeToggle';
import { Fire } from '@phosphor-icons/react';
import { useAppStore } from './hooks/useAppStore';
import { Toaster } from 'react-hot-toast';

function App() {
  const { user, loading } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-slate-100 dark:bg-[#0f141c] text-slate-900 dark:text-white">
        <Toaster position="bottom-right" />
        {loading ? (
          <p role="status" className="text-sm text-slate-500 dark:text-gray-400">Cargando sesión…</p>
        ) : (
          <main className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-[#161b22] p-6 text-center shadow-sm">
            <Fire size={40} weight="fill" className="mx-auto mb-4 text-orange-500" />
            <h1 className="text-2xl font-bold">Calori Tracker</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">Ingresá a tu cuenta para ver y registrar tu día.</p>
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Ingresar / Registrarse
            </button>
          </main>
        )}
        {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-slate-100 dark:bg-[#0f141c] text-slate-900 dark:text-white">
      <Toaster position="bottom-right" />
      
      {/* Desktop Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onAuthOpen={() => setIsAuthOpen(true)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-slate-200 dark:border-gray-800 bg-white dark:bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-gray-800 rounded-lg">
              <Fire size={24} weight="fill" className="text-orange-500" />
            </div>
            <h1 className="text-lg font-bold">Calori Tracker</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content Area */}
        <main ref={mainRef} className="flex-1 flex flex-col overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 w-full transition-all duration-300">
          {activeTab === 'home' && <HomeView />}
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'charts' && <ChartsView />}
          {activeTab === 'profile' && <ProfileView />}
        </main>
      </div>
      
      {/* Mobile Bottom Nav */}
      {user && (
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      {isAuthOpen && (
        <AuthModal onClose={() => setIsAuthOpen(false)} />
      )}
    </div>
  );
}

export default App;
