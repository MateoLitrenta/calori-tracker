import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, X, Spinner, EnvelopeSimple } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import ThemeToggle from './ThemeToggle';
import './AuthEntry.css';

interface AuthModalProps {
  onClose: () => void;
  initialMode?: 'login' | 'register';
  onModeChange?: (mode: 'login' | 'register') => void;
  presentation?: 'modal' | 'page';
}

export default function AuthModal({ onClose, initialMode = 'login', onModeChange, presentation = 'modal' }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const busy = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const page = presentation === 'page';

  useEffect(() => {
    if (page) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose, page]);

  const changeMode = (mode: 'login' | 'register') => {
    if (busy.current) return;
    setErrorMessage(''); setConfirmationSent(false);
    if (onModeChange) onModeChange(mode);
    else setIsLogin(mode === 'login');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setLoading(true); setErrorMessage('');
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Sesión iniciada');
        onClose();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // The authenticated loader creates the profile, including after email confirmation.
        // Personal data is collected in onboarding.
        if (data.session) { toast.success('¡Bienvenido a Calori!'); onClose(); }
        else { setConfirmationSent(true); setPassword(''); }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No pudimos completar el acceso. Intentá de nuevo.');
    } finally { busy.current = false; setLoading(false); }
  };

  return <div className={page ? 'auth-entry auth-page' : 'auth-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'}>
    {page && <header className="auth-page-header">
      <a href="/" onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onClose(); } }} className="auth-back"><ArrowLeft size={18} /> Volver a Calori</a>
      <ThemeToggle />
    </header>}
    <main className={page ? 'auth-page-content' : 'contents'}>
      <div ref={panel} className="auth-modal w-full max-w-md flex flex-col overflow-hidden" role={page ? undefined : 'dialog'} aria-modal={page ? undefined : true} aria-labelledby="auth-heading">
        <div className="auth-page-brand">
          <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-modal" />
          <span>Calori</span>
          {!page && <button type="button" onClick={onClose} aria-label="Cerrar" className="auth-close ml-auto p-3"><X size={22} /></button>}
        </div>
        <div className="auth-page-intro">
          <h1 id="auth-heading">{isLogin ? 'Volvé a Calori.' : 'Menos esfuerzo. Más contexto.'}</h1>
          <p className="auth-secondary">{isLogin ? 'Tu día, tus hábitos y tu Coach te esperan.' : 'Creá tu cuenta. Después, te conocemos un poco mejor.'}</p>
        </div>
        <div className="auth-modal-header flex shrink-0 gap-5 px-6">
          <button type="button" disabled={loading} onClick={() => changeMode('login')} className={`auth-tab text-sm font-medium ${isLogin ? 'auth-tab-active' : ''}`} aria-pressed={isLogin}>Iniciar sesión</button>
          <button type="button" disabled={loading} onClick={() => changeMode('register')} className={`auth-tab text-sm font-medium ${!isLogin ? 'auth-tab-active' : ''}`} aria-pressed={!isLogin}>Crear cuenta</button>
        </div>
        <div className="auth-form-scroll min-h-0 overflow-y-auto p-5 sm:p-6">
          {confirmationSent ? <div className="auth-confirmation" role="status">
            <EnvelopeSimple size={32} aria-hidden="true" />
            <h2>Revisá tu email</h2>
            <p className="auth-secondary">Si el registro está disponible para esta dirección, recibirás un enlace de confirmación. Después podés iniciar sesión para completar tu perfil.</p>
            <button type="button" className="auth-primary w-full py-3 px-4" onClick={() => changeMode('login')}>Ir a iniciar sesión</button>
          </div> : <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="tu@email.com" disabled={loading} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-password">Contraseña</label>
              <input id="auth-password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={event => setPassword(event.target.value)} placeholder={isLogin ? 'Tu contraseña' : 'Al menos 6 caracteres'} disabled={loading} />
            </div>
            {errorMessage && <p role="alert" className="auth-error">{errorMessage}</p>}
            <button type="submit" disabled={loading} className="auth-primary mt-2 w-full flex items-center justify-center py-3 px-4 font-medium disabled:cursor-not-allowed">
              {loading ? <><Spinner size={20} className="animate-spin mr-2" /> Un momento…</> : isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </form>}
        </div>
      </div>
    </main>
  </div>;
}
