import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChatCircleDots,
  Check,
  CheckCircle,
  Barbell,
  ForkKnife,
  SignOut,
  Sparkle,
  Spinner,
  SquaresFour,
} from '@phosphor-icons/react';
import type { UserProfile, UserSex } from '../types';
import ThemeToggle from './ThemeToggle';
import './Onboarding.css';

type ProfileDetails = Pick<UserProfile, 'name' | 'age' | 'sex' | 'height' | 'weight'>;
type ProfileDraft = { name: string; age: string; sex: UserSex | ''; height: string; weight: string };
type FieldErrors = Partial<Record<keyof ProfileDraft, string>>;
type RegistrationPreference = 'meals' | 'workouts' | 'both';

interface OnboardingProps {
  profile: UserProfile;
  onComplete: (details: ProfileDetails) => Promise<void>;
  onSignOut: () => Promise<void>;
}

const steps = ['Tu perfil', 'Tu registro', 'Tus herramientas', 'Todo listo'];
const fieldOrder: (keyof ProfileDraft)[] = ['name', 'age', 'sex', 'height', 'weight'];
const preferences = [
  { value: 'meals', label: 'Comidas', description: 'Lo que comés, en un solo lugar.', icon: ForkKnife },
  { value: 'workouts', label: 'Entrenamientos', description: 'Un espacio para tu movimiento.', icon: Barbell },
  { value: 'both', label: 'Ambos', description: 'Una mirada completa de tu día.', icon: SquaresFour },
] as const;

const toolCopy: Record<RegistrationPreference, { intro: string; photo: string; ai: string; coach: string }> = {
  meals: {
    intro: 'Tres formas de hacer más simple tu registro de comidas.',
    photo: 'Estimá una comida con una foto.',
    ai: 'Usá IA para ayudarte a completar las calorías de una comida.',
    coach: 'Preguntale a Calori sobre tus últimos días.',
  },
  workouts: {
    intro: 'Herramientas para acompañar tu movimiento y tu día.',
    photo: 'Si también querés sumar una comida, podés empezar con una foto.',
    ai: 'Usá IA para ayudarte a estimar las calorías de un entrenamiento.',
    coach: 'Preguntale a Calori sobre la actividad de tus últimos días.',
  },
  both: {
    intro: 'Comidas y movimiento, con un poco de ayuda cuando la necesites.',
    photo: 'Estimá una comida con una foto.',
    ai: 'Usá IA para ayudarte a completar calorías.',
    coach: 'Preguntale a Calori sobre tus últimos días.',
  },
};

function initialNumber(value: number): string {
  return Number.isFinite(value) && value > 0 ? String(value) : '';
}

function validateDraft(draft: ProfileDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.name.trim()) errors.name = 'Ingresá tu nombre.';
  const age = Number(draft.age);
  if (!draft.age.trim() || !Number.isFinite(age) || age <= 0 || !Number.isInteger(age)) {
    errors.age = 'Ingresá una edad entera mayor que 0.';
  }
  if (draft.sex !== 'Masculino' && draft.sex !== 'Femenino') errors.sex = 'Seleccioná una opción.';
  const height = Number(draft.height);
  if (!draft.height.trim() || !Number.isFinite(height) || height <= 0) {
    errors.height = 'Ingresá una altura mayor que 0, en cm.';
  }
  const weight = Number(draft.weight);
  if (!draft.weight.trim() || !Number.isFinite(weight) || weight <= 0) {
    errors.weight = 'Ingresá un peso mayor que 0, en kg.';
  }
  return errors;
}

export default function Onboarding({ profile, onComplete, onSignOut }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(() => ({
    name: profile.name || '',
    age: initialNumber(profile.age),
    sex: profile.sex === 'Masculino' || profile.sex === 'Femenino' ? profile.sex : '',
    height: initialNumber(profile.height),
    weight: initialNumber(profile.weight),
  }));
  const [preference, setPreference] = useState<RegistrationPreference>('both');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [completed, setCompleted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previousStep = useRef(step);
  const requestInFlight = useRef(false);
  const completionSucceeded = useRef(false);
  const busy = saving || signingOut;
  const copy = toolCopy[preference];

  useEffect(() => {
    if (previousStep.current !== step) {
      headingRef.current?.focus();
      previousStep.current = step;
    }
  }, [step]);

  function updateField(field: keyof ProfileDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validateProfile(): boolean {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    const firstInvalidField = fieldOrder.find((field) => nextErrors[field]);
    if (firstInvalidField) {
      setStep(0);
      const element = formRef.current?.elements.namedItem(firstInvalidField);
      if (element instanceof HTMLElement) element.focus();
      return false;
    }
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current || completionSucceeded.current) return;
    setRequestError('');
    if (step === 0 && !validateProfile()) return;
    if (step < 3) {
      if (step === 0) setDraft((current) => ({ ...current, name: current.name.trim() }));
      setStep((current) => current + 1);
      return;
    }
    if (!validateProfile()) return;
    requestInFlight.current = true;
    setSaving(true);
    try {
      await onComplete({
        name: draft.name.trim(),
        age: Number(draft.age),
        sex: draft.sex as UserSex,
        height: Number(draft.height),
        weight: Number(draft.weight),
      });
      completionSucceeded.current = true;
      setCompleted(true);
    } catch {
      setRequestError('No pudimos guardar tu perfil. Tus datos siguen acá; intentá de nuevo.');
    } finally {
      requestInFlight.current = false;
      setSaving(false);
    }
  }

  async function handleSignOut() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setSigningOut(true);
    setRequestError('');
    try {
      await onSignOut();
    } catch {
      setRequestError('No pudimos cerrar la sesión. Intentá de nuevo.');
    } finally {
      requestInFlight.current = false;
      setSigningOut(false);
    }
  }

  const title = ['Contanos un poco sobre vos', '¿Qué querés registrar?', 'Un poco de ayuda, a tu manera.', 'Todo listo.'][step];
  const description = [
    'Empecemos con lo esencial. Después podés actualizar estos datos en tu perfil.',
    'Elegí por dónde empezar. Todas las herramientas van a estar disponibles.',
    copy.intro,
    'Tu espacio para registrar, entender y seguir a tu ritmo.',
  ][step];

  return (
    <div className="calori-onboarding">
      <header className="onboarding-topbar">
        <div className="onboarding-brand" aria-label="Calori">
          <img src="/brand/calori-logo-symbol.png" alt="" width="40" height="40" />
          <span>Calori</span>
        </div>
        <div className="onboarding-topbar-actions">
          <button
            type="button"
            className="onboarding-signout"
            onClick={handleSignOut}
            disabled={busy}
          >
            <SignOut size={18} aria-hidden="true" />
            <span>{signingOut ? 'Cerrando…' : 'Cerrar sesión'}</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className="onboarding-main">
        <div className="onboarding-progress">
          <p>Paso {step + 1} de 4 <span aria-hidden="true">·</span> {steps[step]}</p>
          <ol aria-label="Progreso de la configuración">
            {steps.map((label, index) => (
              <li key={label} aria-current={index === step ? 'step' : undefined} className={index <= step ? 'is-reached' : ''}>
                <span className="onboarding-sr-only">{label}{index < step ? ', completado' : ''}</span>
              </li>
            ))}
          </ol>
        </div>

        <section className={`onboarding-panel${step === 3 ? ' onboarding-panel-ready' : ''}`} aria-labelledby="onboarding-heading">
          <div className="onboarding-intro">
            {step === 3 && <div className="onboarding-ready-icon"><Check size={32} weight="bold" aria-hidden="true" /></div>}
            <p className="onboarding-eyebrow">{step === 3 ? 'A tu ritmo, cada día' : 'Hagamos lugar a tus hábitos'}</p>
            <h1 id="onboarding-heading" ref={headingRef} tabIndex={-1}>{title}</h1>
            <p className="onboarding-description">{description}</p>
          </div>

          <form ref={formRef} noValidate onSubmit={handleSubmit} aria-busy={saving}>
            {step === 0 && (
              <div className="onboarding-fields">
                <div className="onboarding-field onboarding-field-full">
                  <label htmlFor="onboarding-name">Nombre</label>
                  <input id="onboarding-name" name="name" type="text" autoComplete="given-name" required
                    value={draft.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Tu nombre"
                    aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'onboarding-name-error' : undefined} />
                  {errors.name && <p className="onboarding-field-error" id="onboarding-name-error">{errors.name}</p>}
                </div>
                <div className="onboarding-field">
                  <label htmlFor="onboarding-age">Edad <span>(años)</span></label>
                  <input id="onboarding-age" name="age" type="number" inputMode="numeric" min="1" step="1" required
                    value={draft.age} onChange={(event) => updateField('age', event.target.value)} placeholder="25"
                    aria-invalid={Boolean(errors.age)} aria-describedby={errors.age ? 'onboarding-age-error' : undefined} />
                  {errors.age && <p className="onboarding-field-error" id="onboarding-age-error">{errors.age}</p>}
                </div>
                <div className="onboarding-field">
                  <label htmlFor="onboarding-sex">Sexo</label>
                  <select id="onboarding-sex" name="sex" required value={draft.sex}
                    onChange={(event) => updateField('sex', event.target.value)}
                    aria-invalid={Boolean(errors.sex)} aria-describedby={errors.sex ? 'onboarding-sex-error' : undefined}>
                    <option value="" disabled>Seleccioná</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                  </select>
                  {errors.sex && <p className="onboarding-field-error" id="onboarding-sex-error">{errors.sex}</p>}
                </div>
                <div className="onboarding-field">
                  <label htmlFor="onboarding-height">Altura <span>(cm)</span></label>
                  <input id="onboarding-height" name="height" type="number" inputMode="decimal" min="0" step="any" required
                    value={draft.height} onChange={(event) => updateField('height', event.target.value)} placeholder="175"
                    aria-invalid={Boolean(errors.height)} aria-describedby={errors.height ? 'onboarding-height-error' : undefined} />
                  {errors.height && <p className="onboarding-field-error" id="onboarding-height-error">{errors.height}</p>}
                </div>
                <div className="onboarding-field">
                  <label htmlFor="onboarding-weight">Peso <span>(kg)</span></label>
                  <input id="onboarding-weight" name="weight" type="number" inputMode="decimal" min="0" step="any" required
                    value={draft.weight} onChange={(event) => updateField('weight', event.target.value)} placeholder="70"
                    aria-invalid={Boolean(errors.weight)} aria-describedby={errors.weight ? 'onboarding-weight-error' : undefined} />
                  {errors.weight && <p className="onboarding-field-error" id="onboarding-weight-error">{errors.weight}</p>}
                </div>
                {fieldOrder.some((field) => errors[field]) && (
                  <p className="onboarding-validation-summary onboarding-field-full" role="alert">Revisá los campos indicados para continuar.</p>
                )}
              </div>
            )}

            {step === 1 && (
              <fieldset className="onboarding-preferences">
                <legend className="onboarding-sr-only">Qué querés registrar</legend>
                {preferences.map(({ value, label, description: optionDescription, icon: Icon }) => (
                  <label key={value} className={`onboarding-preference${preference === value ? ' is-selected' : ''}`}>
                    <input type="radio" name="registration-preference" value={value} checked={preference === value}
                      onChange={() => setPreference(value)} />
                    <span className="onboarding-option-icon"><Icon size={25} aria-hidden="true" /></span>
                    <span className="onboarding-option-copy"><strong>{label}</strong><span>{optionDescription}</span></span>
                    <span className="onboarding-radio-indicator" aria-hidden="true">{preference === value && <Check size={13} weight="bold" />}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {step === 2 && (
              <ul className="onboarding-tools">
                <li><span className="onboarding-tool-icon"><Camera size={25} aria-hidden="true" /></span><div><h2>Foto</h2><p>{copy.photo}</p></div></li>
                <li><span className="onboarding-tool-icon"><Sparkle size={25} aria-hidden="true" /></span><div><h2>IA</h2><p>{copy.ai}</p></div></li>
                <li><span className="onboarding-tool-icon"><ChatCircleDots size={25} aria-hidden="true" /></span><div><h2>Coach</h2><p>{copy.coach}</p></div></li>
              </ul>
            )}

            {step === 3 && (
              <div className="onboarding-ready-note">
                <CheckCircle size={22} aria-hidden="true" />
                <p>Podés empezar con un solo registro. Lo demás, paso a paso.</p>
              </div>
            )}

            <div className="onboarding-feedback">
              {requestError && <p className="onboarding-request-error" role="alert">{requestError}</p>}
              <p role="status" aria-live="polite" className={busy || completed ? 'onboarding-status' : 'onboarding-sr-only'}>
                {saving ? 'Guardando tu perfil…' : signingOut ? 'Cerrando sesión…' : completed ? 'Tu perfil está listo. Abriendo Calori…' : ''}
              </p>
            </div>

            <div className="onboarding-navigation">
              {step > 0 && (
                <button type="button" className="onboarding-back" disabled={busy || completed}
                  onClick={() => { setRequestError(''); setStep((current) => current - 1); }}>
                  <ArrowLeft size={18} aria-hidden="true" /> Anterior
                </button>
              )}
              <button type="submit" className="onboarding-primary" disabled={busy || completed}>
                {saving ? <><Spinner size={20} className="onboarding-spinner" aria-hidden="true" /> Guardando…</> : completed ? <><Check size={20} aria-hidden="true" /> Perfil listo</> : <>{step === 3 ? 'Entrar a Calori' : 'Continuar'}<ArrowRight size={19} aria-hidden="true" /></>}
              </button>
            </div>
          </form>
        </section>
        <p className="onboarding-footer-note">Un día a la vez.</p>
      </main>
    </div>
  );
}
