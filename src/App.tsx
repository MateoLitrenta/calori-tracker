import { useState, useRef, useEffect, useLayoutEffect, useCallback, lazy, Suspense, type ReactNode } from 'react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import type { Tab } from './components/BottomNav';
import AuthModal from './components/AuthModal';
import ViewSkeleton from './components/ViewSkeleton';
import { useAppStore } from './hooks/useAppStore';
import toast, { Toaster } from 'react-hot-toast';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import { followCoachViewport } from './lib/coachViewport';
import { resolveEntryRoute } from './utils/entryRoute';
import type { EntryRoute } from './utils/entryRoute';
import type { HomeViewState } from './components/HomeView';
import './DesktopExperience.css';
import './FitnessSystem.css';
import './components/NavigationGlass.css';

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

declare const __CALORI_PREVIEW_COMMIT__: string;

function App() {
  const { user, loading, activeProfile, updateRecord, habitDrafts, completeOnboarding, signOut } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  // Presentation context only: no records, drafts or credentials are persisted.
  const [homeContext, setHomeContext] = useState<{ ownerId: string; value: HomeViewState } | null>(null);
  const [homeEntry, setHomeEntry] = useState<{ ownerId: string | null; active: boolean }>({ ownerId: null, active: false });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/$/, '') || '/');
  const mainRef = useRef<HTMLElement>(null);
  const appShellRef = useRef<HTMLDivElement>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const scrollPositionsRef = useRef({ home: 0, charts: 0, profile: 0 });
  const profileBeforeLeave = useRef<((leave: () => void) => void) | null>(null);
  const coachReadingPositions = useRef(new Map<string, number>());
  const userId = user?.id ?? null;
  const profileReady = !!user && activeProfile?.user_id === user.id;
  const route = resolveEntryRoute(path, !!user, activeProfile?.onboarding_completed);
  const isCoachLayout = activeTab === 'chat' && route === '/app' && (profileReady || (loading && !!user));
  const reportEntryActivity = useCallback((active: boolean) => {
    setHomeEntry(current => current.ownerId === userId && current.active === active ? current : { ownerId: userId, active });
  }, [userId]);

  const navigate = (next: EntryRoute) => {
    if (window.location.pathname !== next) window.history.pushState(null, '', next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useEffect(() => {
    if (userId !== previousUserIdRef.current) {
      coachReadingPositions.current.clear();
      if (typeof __CALORI_PREVIEW_COMMIT__ !== 'undefined' && __CALORI_PREVIEW_COMMIT__) {
        window.dispatchEvent(new Event('calori-reset-geometry'));
      }
    }
    if (userId && userId !== previousUserIdRef.current) {
      scrollPositionsRef.current = { home: 0, charts: 0, profile: 0 };
      setActiveTab('home');
    }
    previousUserIdRef.current = userId;
  }, [userId]);

  const changeTab = (next: Tab) => {
    if (next === activeTab) return;
    if (activeTab === 'home' && homeEntry.ownerId === userId && homeEntry.active) {
      toast.error('Guardá o cerrá el registro en edición antes de cambiar de sección. Tu borrador se conserva.', { id: 'entry-navigation-blocked' });
      return;
    }
    const leave = () => {
      if (activeTab !== 'chat') scrollPositionsRef.current[activeTab] = mainRef.current?.scrollTop ?? 0;
      setActiveTab(next);
    };
    if (activeTab === 'profile' && profileBeforeLeave.current) profileBeforeLeave.current(leave);
    else leave();
  };

  const restoreTabScroll = useCallback(() => {
    if (activeTab === 'chat' || !mainRef.current) return;
    const main = mainRef.current;
    const top = previousUserIdRef.current === userId ? scrollPositionsRef.current[activeTab] : 0;
    const selector = { home: '.home-variants', charts: '.charts-insights', profile: '.profile-view' }[activeTab];
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

  useLayoutEffect(() => {
    const shell = appShellRef.current;
    if (isCoachLayout && shell) return followCoachViewport(shell);
  }, [isCoachLayout]);

  if (loading && !user) {
    return <main className="auth-entry min-h-dvh flex items-center justify-center p-4"><p role="status" className="auth-secondary text-sm">Cargando sesión…</p></main>;
  }

  if (!user) {
    return <><Toaster position="bottom-right" containerStyle={{ bottom: 'var(--feedback-offset)' }} toastOptions={{ style: { maxWidth: 'min(24rem, calc(100vw - 2rem))' } }} />
      {route === '/login' || route === '/register'
        ? <AuthModal key={route} presentation="page" initialMode={route === '/login' ? 'login' : 'register'}
          onClose={() => navigate('/')} onModeChange={mode => navigate(mode === 'login' ? '/login' : '/register')} />
        : <LandingPage onNavigate={navigate} />}
    </>;
  }

  if (!loading && (!profileReady || !activeProfile)) {
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

  if (!loading && profileReady && activeProfile && route === '/onboarding') {
    return <><Toaster position="bottom-right" containerStyle={{ bottom: 'var(--feedback-offset)' }} toastOptions={{ style: { maxWidth: 'min(24rem, calc(100vw - 2rem))' } }} /><Onboarding key={user.id} profile={activeProfile} onComplete={completeOnboarding} onSignOut={signOut} /></>;
  }

  return (
    <div ref={appShellRef} className={`app-shell ${isCoachLayout ? 'app-shell-coach' : activeTab === 'home' ? 'app-shell-fitness' : ''} h-screen flex flex-col md:flex-row overflow-hidden`}>
      <Toaster position="bottom-right" containerStyle={{ bottom: 'var(--feedback-offset)' }} toastOptions={{ style: { background: 'var(--fit-surface)', color: 'var(--fit-ink)', border: '1px solid var(--fit-rule)', maxWidth: 'min(24rem, calc(100vw - 2rem))' } }} />
      
      {/* Desktop Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={changeTab}
        onAuthOpen={() => setIsAuthOpen(true)}
      />

      <div className="app-stage flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Main Content Area */}
        <main ref={mainRef} aria-busy={loading ? 'true' : undefined} className="app-main flex-1 flex flex-col overflow-y-auto p-0 md:p-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 w-full">
          {activeTab === 'home' && route === '/app' && (
            <header className="home-header">
              <div className="home-heading-brand">
                <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol" />
                <h1 className="screen-title">
                  <span className="md:hidden">Calori</span>
                  <span className="hidden md:inline">Inicio</span>
                </h1>
              </div>
            </header>
          )}
          <div className="app-content p-4 md:p-0">
            {loading || !profileReady || !activeProfile ? (
              <ViewSkeleton view={activeTab} />
            ) : (
              <Suspense fallback={<ViewSkeleton view={activeTab} />}>
                <RestoreTabScroll key={`${userId}:${activeTab}`} onReady={restoreTabScroll}>
                  {activeTab === 'home' && <HomeView key={user.id} activeProfile={activeProfile} updateRecord={updateRecord} habitDrafts={habitDrafts}
                    viewState={homeContext?.ownerId === user.id ? homeContext.value : undefined}
                    onViewStateChange={value => setHomeContext({ ownerId: user.id, value })}
                    onEntryActiveChange={reportEntryActivity} />}
                  {activeTab === 'chat' && <ChatView scrollContainer={mainRef} readingPositions={coachReadingPositions} />}
                  {activeTab === 'charts' && <ChartsView />}
                  {activeTab === 'profile' && <ProfileView key={user.id} beforeLeave={profileBeforeLeave} />}
                </RestoreTabScroll>
              </Suspense>
            )}
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
