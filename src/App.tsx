import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import type { Tab } from './components/BottomNav';
import AuthModal from './components/AuthModal';
import ThemeToggle from './components/ThemeToggle';
import { useAppStore } from './hooks/useAppStore';
import { Toaster } from 'react-hot-toast';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import { resolveEntryRoute } from './utils/entryRoute';
import type { EntryRoute } from './utils/entryRoute';

const HomeView = lazy(() => import('./components/HomeView'));
const ChatView = lazy(() => import('./components/ChatView'));
const ChartsView = lazy(() => import('./components/ChartsView'));
const ProfileView = lazy(() => import('./components/ProfileView'));

function App() {
  const { user, loading, activeProfile, completeOnboarding, signOut } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/$/, '') || '/');
  const mainRef = useRef<HTMLElement>(null);
  const profileReady = !!user && activeProfile?.user_id === user.id;
  const route = resolveEntryRoute(path, !!user, activeProfile?.onboarding_completed);

  const navigate = (next: EntryRoute) => {
    if (window.location.pathname !== next) window.history.pushState(null, '', next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname.replace(/\/$/, '') || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (loading || (user && !profileReady)) return;
    if (window.location.pathname !== route) {
      window.history.replaceState(null, '', route);
      setPath(route);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [loading, user, profileReady, route, path]);

  useEffect(() => {
    if (activeTab === 'chat') return;
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  if (loading) {
    return <main className="auth-entry min-h-dvh flex items-center justify-center p-4"><p role="status" className="auth-secondary text-sm">Cargando sesión…</p></main>;
  }

  if (!user) {
    return <><Toaster position="bottom-right" />
      {route === '/login' || route === '/register'
        ? <AuthModal key={route} presentation="page" initialMode={route === '/login' ? 'login' : 'register'}
          onClose={() => navigate('/')} onModeChange={mode => navigate(mode === 'login' ? '/login' : '/register')} />
        : <LandingPage onNavigate={navigate} />}
    </>;
  }

  if (!profileReady || !activeProfile) {
    return <main className="auth-entry min-h-dvh flex items-center justify-center p-4">
      <div className="auth-entry-card w-full max-w-sm text-center">
        <p role="alert">No pudimos cargar tu perfil.</p>
        <button type="button" className="auth-primary w-full mt-6 p-3" onClick={() => window.location.reload()}>Reintentar</button>
        <button type="button" className="auth-secondary p-3 min-h-11" onClick={() => {
          setEntryError('');
          void signOut().catch(() => setEntryError('No pudimos cerrar la sesión. Intentá de nuevo.'));
        }}>Cerrar sesión</button>
        {entryError && <p role="alert" className="auth-error">{entryError}</p>}
      </div>
    </main>;
  }

  if (route === '/onboarding') {
    return <><Toaster position="bottom-right" /><Onboarding key={user.id} profile={activeProfile} onComplete={completeOnboarding} onSignOut={signOut} /></>;
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
            <Suspense fallback={<p role="status" className="text-sm text-slate-500 dark:text-gray-400">Cargando…</p>}>
            {activeTab === 'home' && <HomeView />}
            {activeTab === 'chat' && <ChatView scrollContainer={mainRef} />}
            {activeTab === 'charts' && <ChartsView />}
            {activeTab === 'profile' && <ProfileView />}
            </Suspense>
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
