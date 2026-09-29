import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  ChartBar,
  Check,
  CheckCircle,
  ChatsCircle,
  Drop,
  ForkKnife,
  PersonSimpleWalk,
  Plus,
  Scales,
  SoccerBall,
  Sparkle,
} from '@phosphor-icons/react';
import ThemeToggle from './ThemeToggle';
import './LandingPage.css';

type PublicPath = '/login' | '/register';

type LandingPageProps = {
  onNavigate: (path: PublicPath) => void;
};

// Illustrative values only. The public page never reads a user's records.
const heatmapPattern = [1, 2, 1, 5, 3, 1, 2, 2, 0, 1, 4, 1, 2, 3, 1, 2, 5, 1, 2, 1, 4, 2, 1, 3, 1, 0];
const heatmapColors = [
  'bg-heatmap-neutral',
  'bg-heatmap-deficit-medium',
  'bg-heatmap-deficit-high',
  'bg-heatmap-deficit-low',
  'bg-heatmap-surplus-medium',
  'bg-slate-200 dark:bg-[#2d333b]',
];

function PublicLink({ path, onNavigate, className, children }: {
  path: PublicPath;
  onNavigate: LandingPageProps['onNavigate'];
  className?: string;
  children: ReactNode;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  }

  return <a href={path} className={className} onClick={handleClick}>{children}</a>;
}

function DashboardPreview() {
  return (
    <figure className="lp-showcase" aria-label="Ejemplo ilustrativo del resumen diario de Calori">
      <div className="lp-preview-window">
        <div className="lp-preview-topbar">
          <span className="lp-preview-brand"><img src="/brand/calori-logo-symbol.png" alt="" width="28" height="28" /> Calori</span>
          <span className="lp-demo-label">Vista de ejemplo</span>
        </div>
        <div className="lp-preview-content">
          <div className="lp-preview-title"><div><span className="lp-small-label">TODO EN UN LUGAR</span><h2>Tu día, en perspectiva.</h2></div><span className="lp-today">Hoy</span></div>
          <div className="lp-energy-card">
            <div className="lp-energy-top"><span>Balance energético</span><span className="lp-status">Déficit Moderado</span></div>
            <div className="lp-energy-value">−420 <span>kcal</span></div>
            <p className="lp-energy-description">Consumidas − gasto estimado</p>
            <div className="lp-energy-columns">
              <div><span><i className="lp-dot lp-dot-orange" />Consumidas</span><strong>1.840 <small>kcal</small></strong><div className="lp-meter"><i /></div></div>
              <div><span><i className="lp-dot lp-dot-muted" />Gasto estimado</span><strong>2.260 <small>kcal</small></strong><div className="lp-meter lp-meter-expenditure"><i /></div></div>
            </div>
          </div>
          <div className="lp-habits">
            <div><span><Drop size={15} />Agua</span><strong>1,8 <small>L</small></strong><div className="lp-water-marks" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} className={index < 6 ? 'lp-filled' : ''} />)}</div></div>
            <div><span><PersonSimpleWalk size={15} />Pasos</span><strong>6.240</strong><span className="lp-habit-note">Un paso a la vez</span></div>
            <div><span><Scales size={15} />Peso</span><strong>72,4 <small>kg</small></strong><span className="lp-habit-note">Último registro</span></div>
          </div>
          <div className="lp-recent-meal"><span className="lp-meal-icon"><ForkKnife size={21} /></span><div><span>Almuerzo registrado</span><strong>Pollo, arroz y vegetales</strong></div><CheckCircle size={21} weight="fill" /></div>
        </div>
      </div>
      <div className="lp-preview-coach"><span className="lp-coach-icon"><Sparkle size={21} weight="fill" /></span><div><strong>Tu Coach tiene el contexto.</strong><p>Comidas, actividad y últimos días, conectados.</p></div></div>
      <figcaption>Un ejemplo de cómo se ve un día en Calori.</figcaption>
    </figure>
  );
}

function PhotoPreview() {
  return (
    <figure className="lp-photo-preview lp-example-panel">
      <div className="lp-example-heading"><span><Camera size={19} /> Registrar una comida</span><span className="lp-demo-label">Ejemplo</span></div>
      <div className="lp-photo-upload">
        <img className="lp-image-thumbnail" src="/landing/meal-demo.webp" alt="Plato con pollo a la plancha, arroz y vegetales" width="640" height="640" loading="lazy" decoding="async" />
        <div><strong>almuerzo.jpg</strong><span>Foto adjunta · analizada con IA</span></div>
        <span className="lp-upload-check"><Check size={16} weight="bold" /></span>
      </div>
      <div className="lp-detection-heading"><span><Sparkle size={16} weight="fill" /> Esto podría haber en tu plato</span><span className="lp-estimate-tag">Estimado por IA</span></div>
      <div className="lp-food-rows">
        <div><span className="lp-food-number">01</span><div><strong>Pollo a la plancha</strong><span>Porción mediana</span></div><span>~250 kcal</span></div>
        <div><span className="lp-food-number">02</span><div><strong>Arroz cocido</strong><span>Una taza, aproximadamente</span></div><span>~200 kcal</span></div>
        <div><span className="lp-food-number">03</span><div><strong>Vegetales</strong><span>Porción pequeña</span></div><span>~50 kcal</span></div>
      </div>
      <div className="lp-estimate-total"><div><span>Total estimado</span><strong>~500 <small>kcal</small></strong></div><span><CheckCircle size={17} /> Revisar porciones</span></div>
      <figcaption>Las cantidades y la preparación pueden cambiar la estimación. Revisá antes de guardar.</figcaption>
    </figure>
  );
}

function HistoryPreview() {
  return (
    <figure className="lp-history-preview lp-example-panel">
      <div className="lp-history-toolbar"><div><span className="lp-small-label">TU HISTORIAL</span><h3>Cada día cuenta una parte.</h3></div><div className="lp-periods" aria-label="Vistas disponibles en el historial, ejemplo de la vista anual"><span>Día</span><span>Semana</span><span>Mes</span><span className="lp-period-current">Año</span></div></div>
      <div className="lp-heatmap-viewport"><div className="lp-heatmap-months" aria-hidden="true">{['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'].map(month => <span key={month}>{month}</span>)}</div>
      <div className="lp-heatmap-body"><div className="lp-heatmap-days" aria-hidden="true"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div className="lp-heatmap" role="img" aria-label="Ejemplo de seis meses de registros. Verde representa déficit, rojo superávit y gris mantenimiento; gris claro u oscuro según el tema representa días sin datos.">{Array.from({ length: 182 }, (_, index) => <span key={index} className={`lp-heat-cell ${heatmapColors[heatmapPattern[(index * 7 + Math.floor(index / 7)) % heatmapPattern.length]]}`} />)}</div></div></div>
      <div className="lp-heatmap-footer"><figcaption>El patrón dice más que un día aislado.</figcaption><div className="lp-heatmap-legend"><span><i className="bg-slate-200 dark:bg-[#2d333b]" />Sin datos</span><span><i className="bg-heatmap-deficit-medium" />Déficit</span><span><i className="bg-heatmap-surplus-medium" />Superávit</span><span><i className="bg-heatmap-neutral" />Mantenimiento</span></div></div>
    </figure>
  );
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-lp-reveal]'));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.remove('lp-reveal-pending');
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08 });
    // Keep the initial viewport visible; only reveal content reached by scrolling.
    for (const element of elements) {
      if (element.getBoundingClientRect().top >= window.innerHeight) {
        element.classList.add('lp-reveal-pending');
        observer.observe(element);
      }
    }
    return () => {
      observer.disconnect();
      elements.forEach(element => element.classList.remove('lp-reveal-pending'));
    };
  }, []);

  return (
    <div className="landing-page" ref={pageRef}>
      <a className="lp-skip-link" href="#lp-main">Ir al contenido</a>
      <header className="lp-header lp-container">
        <a href="/" className="lp-brand" aria-label="Calori, inicio"><img src="/brand/calori-logo-symbol.png" alt="" width="40" height="40" /><span>Calori<span className="lp-brand-period">.</span></span></a>
        <nav aria-label="Navegación principal"><PublicLink path="/login" onNavigate={onNavigate} className="lp-nav-login">Iniciar sesión</PublicLink><PublicLink path="/register" onNavigate={onNavigate} className="lp-button lp-button-small">Crear cuenta <ArrowUpRight size={15} aria-hidden="true" /></PublicLink></nav>
      </header>

      <main id="lp-main" tabIndex={-1}>
        <section className="lp-hero lp-container" aria-labelledby="lp-hero-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow"><span /> MENOS REGISTRO. MÁS PERSPECTIVA.</p>
            <h1 id="lp-hero-title">Tu alimentación y entrenamiento, <em>con menos carga manual.</em></h1>
            <p className="lp-hero-description">Registrá comidas, entrenamientos y progreso con IA. Calori entiende tu contexto y te ayuda a llevar el control.</p>
            <div className="lp-hero-actions"><PublicLink path="/register" onNavigate={onNavigate} className="lp-button">Crear cuenta <ArrowRight size={19} aria-hidden="true" /></PublicLink><PublicLink path="/login" onNavigate={onNavigate} className="lp-text-link">Iniciar sesión <ArrowUpRight size={17} aria-hidden="true" /></PublicLink></div>
            <p className="lp-free-note"><CheckCircle size={16} weight="fill" aria-hidden="true" /> Gratis para empezar.</p>
          </div>
          <DashboardPreview />
        </section>

        <section className="lp-how lp-container" aria-labelledby="lp-how-title" data-lp-reveal>
          <div className="lp-section-intro"><p className="lp-eyebrow">ASÍ DE SIMPLE</p><h2 id="lp-how-title">Empezá en tres pasos.</h2></div>
          <ol className="lp-steps">
            <li><span className="lp-step-number">01</span><div><h3>Contanos sobre vos</h3><p>Creá tu cuenta y completá tu perfil para darle contexto a tu seguimiento.</p></div></li>
            <li><span className="lp-step-number">02</span><div><h3>Registrá a tu manera</h3><p>Una foto, una comida o tu entrenamiento. Sumá lo que pasó en tu día.</p></div></li>
            <li><span className="lp-step-number">03</span><div><h3>Encontrá tu perspectiva</h3><p>Revisá tu balance, mirá tu historial y conversá con tu Coach.</p></div></li>
          </ol>
        </section>

        <section className="lp-feature lp-feature-photo lp-container" aria-labelledby="lp-photo-title" data-lp-reveal>
          <div className="lp-feature-copy"><p className="lp-eyebrow"><Camera size={17} /> COMIDAS, SIN TANTO TRABAJO</p><h2 id="lp-photo-title">De la foto<br />al registro.</h2><p>Sacá una foto de tu comida y recibí una estimación de lo que hay en el plato. Revisá los alimentos y las porciones antes de guardar.</p><p className="lp-feature-aside">Un punto de partida útil, con espacio para tus ajustes.</p><PublicLink path="/register" onNavigate={onNavigate} className="lp-text-link">Empezar mi registro <ArrowRight size={18} aria-hidden="true" /></PublicLink></div>
          <PhotoPreview />
        </section>

        <section className="lp-feature lp-feature-coach lp-container" aria-labelledby="lp-coach-title" data-lp-reveal>
          <div className="lp-feature-copy"><p className="lp-eyebrow"><ChatsCircle size={17} /> UNA CONVERSACIÓN CON CONTEXTO</p><h2 id="lp-coach-title">Un Coach con<br />tu contexto.</h2><p>Conversá sobre tu alimentación y actividad con el contexto de tus registros y de los últimos días. Menos repetir. Más entender cómo venís.</p><div className="lp-context-tags"><span><ForkKnife size={15} /> Comidas</span><span><PersonSimpleWalk size={15} /> Actividad</span><span><ChartBar size={15} /> Últimos días</span></div></div>
          <figure className="lp-chat-preview lp-example-panel">
            <div className="lp-chat-heading"><span className="lp-coach-icon"><Sparkle size={23} weight="fill" /></span><div><strong>Coach Calori</strong><span>Una mirada sobre tus registros</span></div><span className="lp-demo-label">Ejemplo</span></div>
            <div className="lp-chat-messages"><p className="lp-chat-user">Hoy jugué al fútbol. ¿Cómo viene mi semana?</p><div className="lp-chat-answer"><span className="lp-chat-context"><ChartBar size={14} /> Con el contexto de tus últimos días</span><p>En los días que registraste, combinaste comidas y actividad. El fútbol de hoy también suma a tu gasto estimado.</p><p>Podemos mirar la semana completa para entender el patrón.</p></div></div>
            <div className="lp-chat-input" aria-hidden="true"><Plus size={18} /><span>Una pregunta. Todo tu contexto.</span><span className="lp-chat-send"><ArrowUpRight size={17} /></span></div>
            <figcaption>Conversación ilustrativa.</figcaption>
          </figure>
        </section>

        <section className="lp-movement lp-container" aria-labelledby="lp-movement-title" data-lp-reveal>
          <div className="lp-movement-copy"><span className="lp-movement-icon"><SoccerBall size={29} weight="light" /></span><div><p className="lp-eyebrow">TU ACTIVIDAD TAMBIÉN CUENTA</p><h2 id="lp-movement-title">Estimá el gasto de<br />tu entrenamiento.</h2><p>Estimá el gasto según la actividad, su duración y tu perfil.</p></div></div>
          <div className="lp-workout-example"><div><strong>Fútbol</strong><span>60 min</span></div><ArrowRight size={21} aria-hidden="true" /><div><strong>540 <small>kcal</small></strong><span>aprox. · ejemplo de estimación</span></div></div>
        </section>

        <section className="lp-history lp-container" aria-labelledby="lp-history-title" data-lp-reveal>
          <div className="lp-history-intro"><div><p className="lp-eyebrow">MIRÁ EL RECORRIDO COMPLETO</p><h2 id="lp-history-title">Un día es una foto.<br />Tu historial es la película.</h2></div><p>Pasá del día a la semana, al mes o al año. Encontrá patrones en tu balance y volvé a tus registros cuando lo necesites.</p></div>
          <HistoryPreview />
          <ul className="lp-benefits"><li><Camera size={21} /><div><h3>Menos carga manual</h3><p>Fotos y estimaciones para comenzar.</p></div></li><li><ChatsCircle size={21} /><div><h3>Contexto que acompaña</h3><p>Un Coach conectado con tus días.</p></div></li><li><ChartBar size={21} /><div><h3>Una mirada más amplia</h3><p>Balance e historial en un lugar.</p></div></li><li><CheckCircle size={21} /><div><h3>A tu ritmo</h3><p>Registrá, revisá y seguí.</p></div></li></ul>
        </section>

        <section className="lp-final-section lp-container" aria-labelledby="lp-final-title" data-lp-reveal>
          <div className="lp-final-cta"><img src="/brand/calori-logo-symbol.png" alt="" width="56" height="56" /><p className="lp-eyebrow">TU PRÓXIMO PASO, MÁS SIMPLE</p><h2 id="lp-final-title">Empezá con tu día de hoy.</h2><p>No hace falta tener todo resuelto para empezar a registrar.</p><PublicLink path="/register" onNavigate={onNavigate} className="lp-button">Crear cuenta <ArrowRight size={19} aria-hidden="true" /></PublicLink><PublicLink path="/login" onNavigate={onNavigate} className="lp-text-link">Iniciar sesión <ArrowUpRight size={17} aria-hidden="true" /></PublicLink><span className="lp-final-note">Gratis para empezar.</span></div>
        </section>
      </main>

      <footer className="lp-footer lp-container"><div><a href="/" className="lp-brand" aria-label="Calori, inicio"><img src="/brand/calori-logo-symbol.png" alt="" width="32" height="32" /><span>Calori<span className="lp-brand-period">.</span></span></a><p>© {new Date().getFullYear()} Calori.</p></div><div className="lp-footer-actions"><PublicLink path="/login" onNavigate={onNavigate} className="lp-text-link">Iniciar sesión <ArrowUpRight size={16} aria-hidden="true" /></PublicLink><div className="lp-theme-toggle"><ThemeToggle /></div></div></footer>
    </div>
  );
}
