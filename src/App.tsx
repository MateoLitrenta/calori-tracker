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
import { useAppStore } from './hooks/useAppStore';
import { Toaster } from 'react-hot-toast';

function App() {
  const { user, loading } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (activeTab === 'chat') return;
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  if (loading || !user) {
    return (
      <div className="auth-entry min-h-dvh flex items-center justify-center p-4">
        <Toaster position="bottom-right" />
        {loading ? (
          <p role="status" className="auth-secondary text-sm">Cargando sesión…</p>
        ) : (
          <main className="auth-entry-card w-full max-w-sm text-center">
            <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-auth mx-auto mb-6" />
            <h1 className="text-2xl font-semibold tracking-tight">Calori</h1>
            <p className="auth-secondary mt-3 text-sm leading-relaxed">Ingresá a tu cuenta para ver y registrar tu día.</p>
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="auth-primary mt-8 w-full px-4 py-3 font-medium transition-colors"
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
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-slate-50 dark:bg-[#151719] text-slate-900 dark:text-white">
      <Toaster position="bottom-right" />
      
      {/* Desktop Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        onAuthOpen={() => setIsAuthOpen(true)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Main Content Area */}
        <main ref={mainRef} className="flex-1 flex flex-col overflow-y-auto p-0 md:p-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 w-full transition-all duration-300 bg-slate-50 dark:bg-[#151719]">
          {/* Mobile Header */}
          <header className="home-header md:hidden flex-shrink-0 flex items-center justify-between p-4 border border-slate-200 dark:border-[#ffffff0d] bg-white dark:bg-[#1e2124]">
            <div className="flex items-center gap-3">
              <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol" />
              <h1 className="text-lg font-bold">Calori</h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>
          <div className="p-4 md:p-0">
            {activeTab === 'home' && <HomeView />}
            {activeTab === 'chat' && <ChatView scrollContainer={mainRef} />}
            {activeTab === 'charts' && <ChartsView />}
            {activeTab === 'profile' && <ProfileView />}
          </div>
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
