import { useState, useRef, useEffect, useLayoutEffect, useCallback, lazy, Suspense, type ReactNode } from 'react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import type { Tab } from './components/BottomNav';
import AuthModal from './components/AuthModal';
import ViewSkeleton from './components/ViewSkeleton';
import { useAppStore } from './hooks/useAppStore';
import { Toaster } from 'react-hot-toast';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import { resolveEntryRoute } from './utils/entryRoute';
import type { EntryRoute } from './utils/entryRoute';

const HomeView = lazy(() => import('./components/HomeView'));
const loadChatView = () => import('./components/ChatView');
const loadChartsView = () => import('./components/ChartsView');
const loadProfileView = () => import('./components/ProfileView');
const ChatView = lazy(loadChatView);
const ChartsView = lazy(loadChartsView);
const ProfileView = lazy(loadProfileView);

// Inside Suspense: restore only when the actual view commits, before it paints.
function RestoreTabScroll({ children, onReady }: {
  children: ReactNode;
  onReady: () => void | (() => void);
}) {
  useLayoutEffect(onReady, [onReady]);
  return children;
}

function App() {
  const { user, loading, activeProfile, updateRecord, completeOnboarding, signOut } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/$/, '') || '/');
  const mainRef = useRef<HTMLElement>(null);
  const appShellRef = useRef<HTMLDivElement>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const scrollPositionsRef = useRef({ home: 0, charts: 0, profile: 0 });
  const userId = user?.id ?? null;
  const profileReady = !!user && activeProfile?.user_id === user.id;
  const route = resolveEntryRoute(path, !!user, activeProfile?.onboarding_completed);
  const isCoachLayout = activeTab === 'chat' && route === '/app' && profileReady;

  const navigate = (next: EntryRoute) => {
    if (window.location.pathname !== next) window.history.pushState(null, '', next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useEffect(() => {
    if (userId && userId !== previousUserIdRef.current) {
      scrollPositionsRef.current = { home: 0, charts: 0, profile: 0 };
      setActiveTab('home');
    }
    previousUserIdRef.current = userId;
  }, [userId]);

  const changeTab = (next: Tab) => {
    if (next === activeTab) return;
    if (activeTab !== 'chat') {
      scrollPositionsRef.current[activeTab] = mainRef.current?.scrollTop ?? 0;
    }
    setActiveTab(next);
  };

  const restoreTabScroll = useCallback(() => {
    if (activeTab === 'chat' || !mainRef.current) return;
    const main = mainRef.current;
    const top = previousUserIdRef.current === userId ? scrollPositionsRef.current[activeTab] : 0;
    const selector = { home: '.home-variants', charts: '.charts-insights', profile: '.profile-v2' }[activeTab];
    const restore = () => {
      if (!main.querySelector(selector)) return false;
      main.scrollTop = top;
      return true;
    };
    if (restore()) return;
    // Data inside a loaded chunk may still be pending. Stop watching as soon as its view is ready.
    const observer = new MutationObserver(() => { if (restore()) observer.disconnect(); });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeTab, userId]);

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
    if (loading || !profileReady || route !== '/app') return;
    const preload = () => { void Promise.allSettled([loadChatView(), loadChartsView(), loadProfileView()]); };
    if (window.requestIdleCallback) {
      const idleId = window.requestIdleCallback(preload);
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(timer);
  }, [loading, profileReady, route]);

  useEffect(() => {
    if (!isCoachLayout) return;
    const shell = appShellRef.current;
    const mobile = window.matchMedia('(max-width: 767px)');
    const viewport = window.visualViewport;
    const resize = () => {
      if (mobile.matches) {
        shell?.style.setProperty('--coach-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
        shell?.style.setProperty('--coach-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      } else {
        shell?.style.removeProperty('--coach-viewport-height');
        shell?.style.removeProperty('--coach-viewport-top');
      }
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    mobile.addEventListener('change', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      mobile.removeEventListener('change', resize);
      shell?.style.removeProperty('--coach-viewport-height');
      shell?.style.removeProperty('--coach-viewport-top');
    };
  }, [isCoachLayout]);

  if (loading) {
    if (user) {
      return <div className="app-shell h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-[#151719] text-slate-900 dark:text-white">
        <main className="app-main flex-1 overflow-hidden p-4 md:p-8 md:ml-64" aria-busy="true">
          <ViewSkeleton view="home" />
        </main>
      </div>;
    }
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
    <div ref={appShellRef} className={`app-shell ${isCoachLayout ? 'app-shell-coach' : ''} h-screen flex flex-col md:flex-row overflow-hidden bg-slate-50 dark:bg-[#151719] text-slate-900 dark:text-white`}>
      <Toaster position="bottom-right" />
      
      {/* Desktop Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={changeTab}
        onAuthOpen={() => setIsAuthOpen(true)}
      />

      <div className="app-stage flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Main Content Area */}
        <main ref={mainRef} className="app-main flex-1 flex flex-col overflow-y-auto p-0 md:p-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 w-full bg-slate-50 dark:bg-[#151719]">
          {/* Mobile Header */}
          {activeTab === 'home' && route === '/app' && (
            <header className="home-header md:hidden flex-shrink-0 flex items-center justify-start">
              <div className="flex items-center gap-3">
                <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol" />
                <h1 className="text-lg font-bold">Calori</h1>
              </div>
            </header>
          )}
          <div className="app-content p-4 md:p-0">
            <Suspense fallback={<ViewSkeleton view={activeTab} />}>
            <RestoreTabScroll key={`${userId}:${activeTab}`} onReady={restoreTabScroll}>
            {activeTab === 'home' && <HomeView activeProfile={activeProfile} updateRecord={updateRecord} />}
            {activeTab === 'chat' && <ChatView scrollContainer={mainRef} />}
            {activeTab === 'charts' && <ChartsView />}
            {activeTab === 'profile' && <ProfileView />}
            </RestoreTabScroll>
            </Suspense>
          </div>
        </main>
      </div>
      
      {/* Mobile Bottom Nav */}
      {user && (
        <BottomNav activeTab={activeTab} onTabChange={changeTab} />
      )}

      {isAuthOpen && (
        <AuthModal onClose={() => setIsAuthOpen(false)} />
      )}
    </div>
  );
}

export default App;
