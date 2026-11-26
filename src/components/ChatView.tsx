import './CoachFitness.css';
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useSyncExternalStore, type RefObject, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CaretDown, ChartLineUp, CheckCircle, ClockCounterClockwise, ImageSquare, Microphone, PaperPlaneRight, Plus, Target, X } from '@phosphor-icons/react';
import UserAvatar from './UserAvatar';
import CoachInsightCard from './CoachInsightCard';
import CoachGoalConfirmation from './CoachGoalConfirmation';
import CoachGoalsPanel from './CoachGoalsPanel';
import { CoachGoalCards } from './CoachGoalCard';
import { useCoachGoals, type CoachGoalsResource } from '../hooks/useCoachGoals';
import { goalProgressQuery } from '../utils/coachGoalPresentation';
import { confirmCoachGoal } from '../services/coachGoals';
import type { CoachGoalProposal } from '../utils/coachGoals';
import { buildCoachCard, parseCoachCard } from '../utils/coachPresentation';
import { buildCoachContext } from '../utils/coachContext';
import { buildProactiveInsight, type ProactiveInsight } from '../utils/coachProactive';
import { useAppStore } from '../hooks/useAppStore';
import { buildDailyEnergyContext, formatCalories, formatDateStr, generateUUID } from '../utils/helpers';
import type { UserProfile, MealType } from '../types';
import { changedEntryDayMessage, reviewEntryBase, snapshotEntryRecord } from '../lib/entrySubmission';
import type { RecordWriter } from '../lib/recordFeedback';
import { findRecordedCoachAction, parseRecordedCoachActions, type RecordedCoachAction } from '../lib/coachActionReview';
import { prepareCoachMealAction } from '../lib/coachMealNames';
import type { ActionCommitDraft, CoachConversationStore, CoachMessage as Message, PendingCoachRecord } from '../lib/coachConversation';
import { getFocusedCoachProposalField } from '../lib/coachViewport';
import { followCoachProposalViewport, revealCoachProposalField } from '../lib/coachProposalViewport';
import { createCoachConfirmationViewport } from '../lib/coachConfirmationViewport';
import { generateAIResponse, transcribeAudio, validActions, isValidDateStr, type MediaAttachment, type DataAction } from '../services/aiService';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

function ProposedEntrySummary({ action }: { action: DataAction }) {
  const p = action.payload;
  return <>
    <p className="chat-proposal-kind">{action.type === 'add_meal' ? String(p.type) : 'Ejercicio'}</p>
    <h4 className="chat-proposal-name">{String(action.type === 'add_meal' ? p.name || 'Comida por completar' : p.activity)}</h4>
    <dl className="chat-proposal-metrics">
      <div><dt>Energía</dt><dd>{formatCalories(p.calories as number)} <span>kcal</span></dd></div>
      <div><dt>Hora</dt><dd><time dateTime={String(p.time)}>{String(p.time)}</time> <span>hs</span></dd></div>
      {action.type === 'add_workout' && <div><dt>Duración</dt><dd>{(p.duration as number).toLocaleString('es-AR', { maximumFractionDigits: 20 })} <span>min</span></dd></div>}
    </dl>
    {action.estimated && <p className="chat-proposal-estimate">Propuesta con estimaciones</p>}
    {typeof p.details === 'string' && p.details.trim() && <p className="chat-proposal-notes whitespace-pre-wrap">{p.details}</p>}
    {(p.distance !== undefined || (typeof p.pace === 'string' && p.pace)) && <dl className="chat-proposal-extra">
      {p.distance !== undefined && <div><dt>Distancia</dt><dd>{(p.distance as number).toLocaleString('es-AR', { maximumFractionDigits: 20 })} km</dd></div>}
      {typeof p.pace === 'string' && p.pace && <div><dt>Ritmo</dt><dd>{p.pace} min/km</dd></div>}
    </dl>}
  </>;
}

function readHistory(key: string): Message[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored.filter((message): message is Message =>
      message !== null && typeof message === 'object' &&
      typeof message.id === 'string' && typeof message.text === 'string' &&
      (message.role === 'user' || message.role === 'bot')).map(message => {
        const { coachCard, goalProgress, recordedActions, ...textMessage } = message;
        const card = message.role === 'bot' ? parseCoachCard(coachCard) : undefined;
        const recorded = message.role === 'bot' ? parseRecordedCoachActions(recordedActions) : undefined;
        return { ...textMessage, ...(card ? { coachCard: card } : {}),
          ...(recorded ? { recordedActions: recorded } : {}),
          ...(message.role === 'bot' && typeof goalProgress === 'string' && ['all', 'workout_sessions', 'step_days'].includes(goalProgress) ? { goalProgress } : {}) };
      }) : [];
  } catch {
    return [];
  }
}

function readDailyHistory(userId: string, dateStr: string, today: string): Message[] {
  const legacyKey = `calori:assistant:messages:${userId}`;
  const key = `${legacyKey}:${dateStr}`;
  const current = readHistory(key);
  if (dateStr !== today) return current;
  try {
    if (localStorage.getItem(`${legacyKey}:migrated`)) return current;
    const legacy = readHistory(legacyKey);
    const currentIds = new Set(current.map(message => message.id));
    const merged = [...legacy.filter(message => !currentIds.has(message.id)), ...current];
    if (merged.length) localStorage.setItem(key, JSON.stringify(merged));
    localStorage.setItem(`${legacyKey}:migrated`, today);
    return merged;
  } catch {
    // Preserve the original key if storage is unavailable or full.
    return current.length ? current : readHistory(legacyKey);
  }
}

function conversationDates(userId: string, today: string): string[] {
  const prefix = `calori:assistant:messages:${userId}:`;
  try {
    return [...new Set([today, ...Object.keys(localStorage)
      .filter(key => key.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(prefix.length)) && readHistory(key).length)
      .map(key => key.slice(prefix.length))])].sort().reverse();
  } catch {
    return [today];
  }
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function prepareImage(file: Blob): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
      image.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('La imagen está vacía.');
    for (const [maxDimension, quality] of [[1600, 0.82], [1200, 0.75], [900, 0.7]] as const) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la imagen.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo comprimir la imagen.')), 'image/jpeg', quality));
      if (blob.size > 0 && blob.size <= MAX_IMAGE_BYTES) return blob;
    }
    throw new Error('No pude preparar esta imagen. Probá con una foto más liviana.');
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(blob);
  });
}

function suggestionLabel(prompt: string) {
  if (prompt.includes('objetivo confirmado')) return 'Mi próximo paso';
  if (prompt.includes('antes de comparar')) return 'Revisar mis datos';
  if (prompt.includes('organizar mis próximos entrenamientos')) return 'Organizar entrenamientos';
  if (prompt.includes('entrenamiento')) return 'Revisar entrenamientos';
  if (prompt.includes('pasos')) return 'Mis pasos';
  if (prompt.includes('completar mi registro')) return 'Completar mi registro';
  if (prompt.includes('mi actividad')) return 'Datos para mi actividad';
  if (prompt.includes('Cómo funciona Calori')) return 'Cómo funciona Calori';
  if (prompt.includes('días con comidas registradas')) return 'Mis registros de comida';
  if (prompt.includes('registrar mis comidas') || prompt.includes('registrar una comida')) return 'Registrar comidas';
  return prompt;
}

function periodLabel(start: string, end: string) {
  const label = (day: string) => new Date(day + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  return start === end ? label(start) : label(start) + ' – ' + label(end);
}

function observationHeading(insight: ProactiveInsight) {
  const m = insight.metrics;
  switch (insight.kind) {
    case 'goal':
      return m.goalType === 'step_days'
        ? `${m.registered} de ${m.target} días con ${Number(m.stepThreshold).toLocaleString('es-AR')} pasos o más`
        : `${m.registered} de ${m.target} ${m.target === 1 ? 'entrenamiento registrado' : 'entrenamientos registrados'}`;
    case 'nutrition_logging': return `Comidas registradas en ${m.mealDays} de 7 días`;
    case 'training': return `${m.workoutCount} ${m.workoutCount === 1 ? 'entrenamiento registrado' : 'entrenamientos registrados'}`;
    case 'steps': return `Pasos registrados en ${m.stepDays} de 7 días`;
    case 'incomplete': return 'Hay registros de agua o peso';
    case 'getting_started': return 'Todavía no hay registros recientes';
    default: return insight.title;
  }
}

function initialSuggestions(insight: ProactiveInsight) {
  const otherTopics = insight.suggestions.filter(prompt => {
    if (prompt.includes('objetivo confirmado')) return insight.kind !== 'goal';
    if (prompt.includes('entrenamiento')) return insight.kind !== 'training';
    if (prompt.includes('pasos')) return insight.kind !== 'steps';
    if (prompt.includes('antes de comparar')) return insight.kind !== 'data_quality';
    if (/comida|completar mi registro/.test(prompt)) return insight.kind !== 'nutrition_logging';
    return true;
  });
  const labels = new Set<string>();
  return otherTopics.filter(prompt => {
    const label = suggestionLabel(prompt);
    if (labels.has(label)) return false;
    labels.add(label);
    return true;
  }).slice(0, 3);
}

export default function ChatView({ scrollContainer, readingPositions }: {
  scrollContainer: RefObject<HTMLElement | null>;
  readingPositions?: RefObject<Map<string, number>>;
}) {
  const { user, activeProfile, avatarRevision, updateRecord, coachConversations } = useAppStore();
  const [today, setToday] = useState(() => formatDateStr(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const goals = useCoachGoals(user?.id);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const checkDate = () => {
      const now = new Date();
      const nextToday = formatDateStr(now);
      if (nextToday !== today) {
        setToday(nextToday);
        setSelectedDate(null);
      }
      clearTimeout(timer);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(checkDate, midnight.getTime() - now.getTime() + 100);
    };
    checkDate();
    window.addEventListener('focus', checkDate);
    document.addEventListener('visibilitychange', checkDate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', checkDate);
      document.removeEventListener('visibilitychange', checkDate);
    };
  }, [today]);
  if (!user) return null;
  const dateStr = selectedDate ?? today;
  return <UserChat key={`${user.id}:${today}:${dateStr}`} userId={user.id} activeProfile={activeProfile} avatarRevision={avatarRevision}
    updateRecord={updateRecord} coachConversations={coachConversations} dateStr={dateStr} today={today} onSelectDate={setSelectedDate} scrollContainer={scrollContainer} readingPositions={readingPositions} goals={goals} />;
}

function UserChat({ userId, activeProfile, avatarRevision, updateRecord, coachConversations, dateStr, today, onSelectDate, scrollContainer, readingPositions, goals }: {
  userId: string; activeProfile: UserProfile | null;
  avatarRevision: number;
  updateRecord: RecordWriter;
  coachConversations: CoachConversationStore;
  dateStr: string; today: string; onSelectDate: (date: string) => void;
  scrollContainer: RefObject<HTMLElement | null>;
  readingPositions?: RefObject<Map<string, number>>;
  goals: CoachGoalsResource;
}) {
  const storageKey = `calori:assistant:messages:${userId}:${dateStr}`;
  const conversation = useMemo(() => coachConversations.open(userId, dateStr,
    () => readDailyHistory(userId, dateStr, today)), [coachConversations, userId, dateStr, today]);
  const messagesScrollRef = useRef<HTMLElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const confirmationViewport = useRef<ReturnType<typeof createCoachConfirmationViewport> | null>(null);
  const cardScrollDecision = useRef<{ id: string; nearEnd: boolean } | null>(null);
  const rememberReplyAnchor = useCallback((id: string) => {
    const log = messagesScrollRef.current ?? scrollContainer.current;
    cardScrollDecision.current = { id, nearEnd: !log || log.scrollHeight - log.clientHeight - log.scrollTop <= 24 };
  }, [scrollContainer]);
  const subscribeConversation = useCallback((notify: () => void) => {
    let previous = conversation.getSnapshot();
    return conversation.subscribe(() => {
      const next = conversation.getSnapshot();
      const nextMessage = next.messages.at(-1);
      const lastMessage = previous.messages.at(-1);
      const pendingIds = previous.pending?.commit.entryIds;
      const confirmsPending = pendingIds && nextMessage?.recordedActions?.some(action => pendingIds.includes(action.entryId));
      if (nextMessage && confirmsPending && (previous.operation === 'record' || next.operation === 'record') &&
          (nextMessage.id !== lastMessage?.id || !next.pending)) {
        confirmationViewport.current?.capture(nextMessage.id);
      } else if (next.operation === 'response' && previous.operation !== 'response') {
        confirmationViewport.current?.release();
      }
      // A request may finish in an old, unmounted UserChat. Capture the reader
      // in the current view before React paints its newly received message.
      if (nextMessage?.role === 'bot' && nextMessage.id !== lastMessage?.id) rememberReplyAnchor(nextMessage.id);
      previous = next;
      notify();
    });
  }, [conversation, rememberReplyAnchor]);
  const { messages, pending, pendingGoal, isEditingProposal, operation } = useSyncExternalStore(subscribeConversation, conversation.getSnapshot);
  const isTyping = operation !== null;
  const isConfirming = operation === 'record';
  const previousOperation = useRef(operation);
  const { reload: reloadGoals } = goals;
  useEffect(() => {
    const completedGoal = previousOperation.current === 'goal' && operation !== 'goal';
    previousOperation.current = operation;
    // Refresh the hook in the currently mounted view, including a view opened
    // again while another instance was waiting for the acknowledgement.
    if (completedGoal) void reloadGoals();
  }, [operation, reloadGoals]);
  const setMessages = (next: SetStateAction<Message[]>) => conversation.update(previous => ({
    messages: typeof next === 'function' ? next(previous.messages) : next,
  }));
  const setPending = (next: SetStateAction<PendingCoachRecord | null>) => conversation.update(previous => ({
    pending: typeof next === 'function' ? next(previous.pending) : next,
  }));
  const setPendingGoal = (next: CoachGoalProposal | null) => conversation.update({ pendingGoal: next });
  const setIsEditingProposal = (next: boolean) => conversation.update({ isEditingProposal: next });
  const hasMessages = messages.length > 0;
  const [initialMessageIds] = useState(() => new Set(messages.map(message => message.id)));
  const [proactiveExpanded, setProactiveExpanded] = useState(!hasMessages);
  const proactiveReference = useRef<string | undefined>(undefined);
  const isPastConversation = dateStr !== today;
  const [showHistory, setShowHistory] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isRequestingAudio, setIsRequestingAudio] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const photoMenuRef = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const cameraDialogRef = useRef<HTMLDialogElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestId = useRef(0);
  const cameraCaptureBusy = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const imageSelection = useRef(0);
  const imageBusy = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingCancelled = useRef(false);
  const audioBusy = useRef(false);
  const composerRef = useRef<HTMLElement | null>(null);
  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const container = messagesScrollRef.current ?? scrollContainer.current;
    container?.scrollTo({ top: container.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior });
  }, [scrollContainer]);
  const didScroll = useRef(false);
  const mounted = useRef(true);
  const confirmedActions = messages.flatMap(message => message.role === 'bot' ? message.recordedActions ?? [] : []);
  const recordedAction = (action: DataAction) => findRecordedCoachAction(action, activeProfile?.records ?? {}, confirmedActions);
  const repeatedActions = pending?.actions.map(recordedAction) ?? [];
  const actionsToSave = pending?.actions.filter((_, index) => !repeatedActions[index] || pending.registerAgain.includes(index)) ?? [];
  const lastMessage = messages.at(-1);
  // A successful write publishes its receipt immediately before removing the
  // proposal. Show the replacement once, not both cards between notifications.
  const receiptAwaitingProposal = isConfirming && pending && lastMessage?.recordedActions?.some(action => pending.commit.entryIds.includes(action.entryId))
    ? lastMessage.id : null;

  const clearPendingImage = () => {
    imageSelection.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    setPendingImage(null);
    setIsProcessingImage(false);
    imageBusy.current = false;
  };

  const selectImage = async (file?: File | Blob) => {
    setShowPhotoMenu(false);
    if (!file || imageBusy.current || audioBusy.current || conversation.isBusy() || pending || pendingGoal || !activeProfile) return;
    clearPendingImage();
    if ((file instanceof File && /\.(heic|heif)$/i.test(file.name)) || /image\/(heic|heif)/i.test(file.type)) {
      toast.error('Este formato de imagen no es compatible todavía. Probá sacar la foto desde la cámara de la app o usar JPG/PNG.');
      return;
    }
    if (!IMAGE_TYPES.has(file.type) || !file.size) {
      toast.error('Elegí una imagen JPG, PNG o WebP válida.');
      return;
    }
    const selection = imageSelection.current;
    imageBusy.current = true;
    setIsProcessingImage(true);
    try {
      const blob = await prepareImage(file);
      if (!mounted.current || selection !== imageSelection.current) return;
      const previewUrl = URL.createObjectURL(blob);
      previewUrlRef.current = previewUrl;
      setPendingImage({ blob, previewUrl });
    } catch (error) {
      if (mounted.current && selection === imageSelection.current) {
        toast.error(error instanceof Error && error.message.startsWith('No pude preparar')
          ? error.message : 'No pude preparar esta imagen. Probá con una foto más liviana.');
      }
    } finally {
      if (selection === imageSelection.current) {
        imageBusy.current = false;
        if (mounted.current) setIsProcessingImage(false);
      }
    }
  };

  const closeCamera = () => {
    cameraRequestId.current += 1;
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setIsCameraReady(false);
    setIsCameraLoading(false);
    setIsCameraOpen(false);
  };

  const openCamera = async () => {
    setShowPhotoMenu(false);
    if (!navigator.mediaDevices?.getUserMedia || imageBusy.current || audioBusy.current || conversation.isBusy() || pending || pendingGoal) {
      toast.error('No pude acceder a la cámara. Revisá los permisos o elegí una foto de la galería.');
      return;
    }
    const requestId = ++cameraRequestId.current;
    setIsCameraReady(false);
    setIsCameraLoading(true);
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false
      });
      if (!mounted.current || requestId !== cameraRequestId.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setIsCameraLoading(false);
    } catch {
      if (mounted.current && requestId === cameraRequestId.current) {
        closeCamera();
        toast.error('No pude acceder a la cámara. Revisá los permisos o elegí una foto de la galería.');
      }
    }
  };

  useEffect(() => {
    if (!isCameraOpen || isCameraLoading || !cameraStreamRef.current || !cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    const stream = cameraStreamRef.current;
    video.srcObject = stream;
    void video.play().catch(() => {
      if (!mounted.current || cameraStreamRef.current !== stream) return;
      stream.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      cameraRequestId.current += 1;
      setIsCameraReady(false);
      setIsCameraOpen(false);
      toast.error('No pude acceder a la cámara. Revisá los permisos o elegí una foto de la galería.');
    });
    return () => { video.srcObject = null; };
  }, [isCameraOpen, isCameraLoading]);

  const capturePhoto = async () => {
    const video = cameraVideoRef.current;
    if (cameraCaptureBusy.current || !isCameraReady || !video?.videoWidth || !video.videoHeight) return;
    cameraCaptureBusy.current = true;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      closeCamera();
      cameraCaptureBusy.current = false;
      toast.error('No pude preparar esta imagen. Probá con una foto más liviana.');
      return;
    }
    try {
      context.drawImage(video, 0, 0);
    } catch {
      closeCamera();
      cameraCaptureBusy.current = false;
      toast.error('No pude preparar esta imagen. Probá con una foto más liviana.');
      return;
    }
    closeCamera();
    imageBusy.current = true;
    setIsProcessingImage(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo capturar la foto.')), 'image/jpeg', 0.9));
      imageBusy.current = false;
      if (mounted.current) await selectImage(blob);
    } catch {
      if (mounted.current) toast.error('No pude preparar esta imagen. Probá con una foto más liviana.');
    } finally {
      cameraCaptureBusy.current = false;
      imageBusy.current = false;
      if (mounted.current) setIsProcessingImage(false);
    }
  };

  useEffect(() => {
    if (!showPhotoMenu) return;
    photoMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      if (!photoMenuRef.current?.contains(event.target as Node)) setShowPhotoMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPhotoMenu(false);
        photoMenuRef.current?.querySelector<HTMLButtonElement>('.chat-image-button')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showPhotoMenu]);

  useEffect(() => {
    const dialog = cameraDialogRef.current;
    if (!isCameraOpen || !dialog) return;
    dialog.showModal();
    const trigger = photoMenuRef.current?.querySelector<HTMLButtonElement>('.chat-image-button');
    return () => { dialog.close(); trigger?.focus({ preventScroll: true }); };
  }, [isCameraOpen]);

  useEffect(() => {
    const composer = composerRef.current;
    const shell = composer?.closest<HTMLElement>('.app-shell-coach');
    if (!composer || !shell) return;
    const measure = () => {
      shell.style.setProperty('--coach-composer-height', `${composer.offsetHeight}px`);
      const field = textInputRef.current;
      if (shell.dataset.coachKeyboard === 'open' && field && field === document.activeElement &&
          field.selectionEnd === field.value.length) {
        field.scrollTop = field.scrollHeight;
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(composer);
    return () => { observer?.disconnect(); shell.style.removeProperty('--coach-composer-height'); };
  }, [isPastConversation]);

  const editProposal = (index: number, field: string, value: string | number | undefined) => {
    if (conversation.isBusy()) return;
    setPending(prev => prev && ({ ...prev, actions: prev.actions.map((action, i) =>
      i === index ? { ...action, payload: { ...action.payload, [field]: value } } : action) }));
  };

  const appendReply = (text: string, recordedActions: RecordedCoachAction[] = []) => {
    const id = generateUUID();
    if (mounted.current) rememberReplyAnchor(id);
    setMessages(prev => [...prev, { id, role: 'bot', text,
      ...(recordedActions.length ? { recordedActions } : {}) }]);
  };

  const describeAction = (a: DataAction) => {
    const p = a.payload;
    switch (a.type) {
      case 'add_meal': return `${p.name} · ${p.type} · ${formatCalories(p.calories as number)} kcal · ${p.time}`;
      case 'add_workout': return `${p.activity} · ${p.duration} min · ${formatCalories(p.calories as number)} kcal · ${p.time}`;
      case 'set_steps': return `${p.steps} pasos (total)`;
      case 'add_water': return `+${p.water} ml de agua`;
      case 'set_weight': return `${p.weight} kg de peso de hoy`;
    }
  };

  const describeDate = (actionDate: string) =>
    new Date(`${actionDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

  const newActionDraft = (actions: DataAction[], actionDate: string): ActionCommitDraft => {
    const profile = conversation.getProfile();
    return {
      dateStr: actionDate,
      base: snapshotEntryRecord(profile?.records[actionDate] || {
        dateStr: actionDate, date: new Date(`${actionDate}T12:00:00`), meals: [], workouts: [], steps: 0, water: 0,
        version: null, generation: profile?.recordGeneration,
      }, profile?.recordGeneration),
      entryIds: actions.map(() => generateUUID()), types: actions.map(action => action.type),
    };
  };

  const applyActions = async (token: symbol, actions: DataAction[], actionDate: string, draft?: ActionCommitDraft, included?: boolean[]) => {
    const currentToday = formatDateStr(new Date());
    const profile = conversation.getProfile();
    if (!conversation.isCurrent(token) || !profile || isPastConversation || dateStr !== currentToday ||
      !isValidDateStr(actionDate) || actionDate > currentToday) {
      throw new Error('La fecha cambió o no es válida. Pedime registrar los datos nuevamente.');
    }
    if (validActions(actions, currentToday).length !== actions.length ||
      actions.some(action => action.payload.dateStr !== actionDate)) {
      throw new Error('Revisá los datos obligatorios antes de confirmar.');
    }
    const latest = profile.records[actionDate] || {
      dateStr: actionDate, date: new Date(`${actionDate}T12:00:00`), meals: [], workouts: [], steps: 0, water: 0,
      version: null, generation: profile.recordGeneration,
    };
    const intent = draft ?? newActionDraft(actions, actionDate);
    if (intent.dateStr !== actionDate || intent.types.length !== actions.length || actions.some((action, index) => action.type !== intent.types[index])) {
      throw new Error('La propuesta cambió. Revisá los registros antes de confirmar de nuevo.');
    }
    const base = reviewEntryBase(intent.base, latest, profile.recordGeneration, () => window.confirm(changedEntryDayMessage));
    if (!base) throw new Error('La propuesta sigue pendiente. Revisá los datos del día antes de reintentar.');
    intent.base = base;
    const record = snapshotEntryRecord(base, profile.recordGeneration);
    const recorded: RecordedCoachAction[] = [];
    for (const [index, a] of actions.entries()) {
      if (included && !included[index]) continue;
      const p = a.payload;
      switch (a.type) {
        case 'add_meal': {
          const meal = { id: intent.entryIds[index], name: p.name as string,
            type: p.type as MealType, calories: p.calories as number,
            time: p.time as string, details: p.details as string | undefined };
          record.meals = record.meals.some(entry => entry.id === meal.id) ? record.meals.map(entry => entry.id === meal.id ? meal : entry) : [...record.meals, meal]; break;
        }
        case 'add_workout': {
          const workout = { id: intent.entryIds[index], activity: p.activity as string,
            duration: p.duration as number, calories: p.calories as number, muscles: [],
            time: p.time as string, details: p.details as string,
            distance: p.distance as number | undefined, pace: p.pace as string | undefined };
          record.workouts = record.workouts.some(entry => entry.id === workout.id) ? record.workouts.map(entry => entry.id === workout.id ? workout : entry) : [...record.workouts, workout]; break;
        }
        case 'set_steps': record.steps = p.steps as number; break;
        case 'add_water': record.water += p.water as number; break;
        case 'set_weight': record.weight = p.weight as number; break;
      }
      if (a.type === 'add_meal' || a.type === 'add_workout') recorded.push({ type: a.type, dateStr: actionDate, entryId: intent.entryIds[index] });
    }
    let failureMessage: string | undefined;
    if (!await updateRecord(actionDate, record, { feedback: 'contextual', onFailure: failure => { failureMessage = failure.message; } })) {
      throw new Error(failureMessage || 'No se pudo completar el guardado. Revisá los registros de esa fecha antes de reintentar.');
    }
    if (conversation.isCurrent(token)) appendReply(`Registrado ${actionDate === currentToday ? 'hoy' : `el ${describeDate(actionDate)}`}: ${actions.filter((_, index) => !included || included[index]).map(describeAction).join('; ')}.`, recorded);
  };

  const confirmActions = async () => {
    const proposal = conversation.getSnapshot().pending;
    if (!proposal || conversation.isBusy()) return;
    const included = proposal.actions.map((action, index) => !recordedAction(action) || proposal.registerAgain.includes(index));
    if (!included.some(Boolean)) return;
    if (validActions(proposal.actions, formatDateStr(new Date())).length !== proposal.actions.length ||
      proposal.actions.some(action => action.payload.dateStr !== proposal.dateStr)) {
      toast.error('Revisá nombre/actividad, tipo, calorías, hora y duración. Los valores numéricos deben ser positivos.');
      setIsEditingProposal(true);
      return;
    }
    const token = conversation.begin('record');
    if (!token) return;
    let confirmed = false;
    try {
      await applyActions(token, proposal.actions, proposal.dateStr, proposal.commit, included);
      confirmed = true;
    } catch (error) {
      if (conversation.isCurrent(token)) appendReply(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      conversation.finish(token, confirmed ? { pending: null, isEditingProposal: false } : {});
    }
  };

  const confirmGoal = async () => {
    const proposal = conversation.getSnapshot().pendingGoal;
    if (!proposal || conversation.isBusy() || isPastConversation || dateStr !== formatDateStr(new Date())) return;
    const token = conversation.begin('goal');
    if (!token) return;
    try {
      const saved = await confirmCoachGoal(proposal, today, userId);
      if (!conversation.isCurrent(token)) return;
      setPendingGoal(null);
      appendReply(saved.status === 'cancelled' ? 'Objetivo cancelado. Tus registros no cambiaron.'
        : proposal.operation === 'update' ? 'Objetivo actualizado y guardado. Lo usaré para evaluar tus registros del período.'
          : 'Objetivo aceptado y guardado. Podés consultarlo en otras conversaciones para revisar tus registros del período.');
    } catch (error) {
      if (conversation.isCurrent(token)) {
        appendReply(error instanceof Error ? error.message : 'No se pudo guardar el objetivo.');
      }
    } finally { conversation.finish(token); }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      cameraRequestId.current += 1;
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      imageSelection.current += 1;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const textarea = textInputRef.current;
    if (!textarea) return;
    const maxHeight = window.matchMedia('(max-width: 767px)').matches ? 124 : 148;
    const previousScroll = textarea.scrollTop;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 44), maxHeight)}px`;
    if (document.activeElement === textarea) {
      textarea.scrollTop = textarea.selectionStart === textarea.value.length ? textarea.scrollHeight : previousScroll;
    }
  }, [inputValue]);

  useLayoutEffect(() => {
    const reader = messagesScrollRef.current;
    const content = messagesContentRef.current;
    if (!reader || !content) return;
    const viewport = createCoachConfirmationViewport(reader, content);
    confirmationViewport.current = viewport;
    return () => { viewport.release(); confirmationViewport.current = null; };
  }, []);

  useLayoutEffect(() => {
    if (!pending) confirmationViewport.current?.commit(messages.at(-1)?.id);
  }, [messages, pending]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    return followCoachProposalViewport(container);
  }, []);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    if (!hasMessages) { container.scrollTop = 0; return; }
    if (typeof ResizeObserver === 'undefined') return;
    let previousHeight = container.clientHeight;
    let previousScrollHeight = container.scrollHeight;
    const observer = new ResizeObserver(() => {
      const wasNearEnd = previousScrollHeight - previousHeight - container.scrollTop <= 24;
      // A proposal field takes precedence over following the last message when
      // the keyboard or the inline editor changes the available reading space.
      if (!revealCoachProposalField(container) && !confirmationViewport.current?.resize() && wasNearEnd) container.scrollTop = container.scrollHeight;
      previousHeight = container.clientHeight;
      previousScrollHeight = container.scrollHeight;
    });
    observer.observe(container);
    if (messagesContentRef.current) observer.observe(messagesContentRef.current);
    return () => observer.disconnect();
  }, [hasMessages]);

  const currentContext = useMemo(() => activeProfile?.user_id === userId ? buildCoachContext(activeProfile, today) : null,
    [activeProfile, userId, today]);
  // The observation waits for the first result and retains its last evidence during refresh.
  const [previousGoals, setPreviousGoals] = useState<Pick<CoachGoalsResource, 'ownerId' | 'status' | 'goals'> | null>(null);
  const { ownerId: goalOwner, status: goalStatus, goals: goalItems } = goals;
  if (goalStatus !== 'loading' && (previousGoals?.ownerId !== goalOwner ||
      previousGoals?.status !== goalStatus || previousGoals?.goals !== goalItems)) {
    setPreviousGoals({ ownerId: goalOwner, status: goalStatus, goals: goalItems });
  }
  const observationSource = goalStatus === 'loading' ? previousGoals : goals;
  const observationStatus = observationSource?.status;
  const observationGoals = observationSource?.ownerId === userId ? observationSource.goals : undefined;
  const proactiveInsight = useMemo(() => observationStatus
    ? buildProactiveInsight(currentContext, observationStatus === 'ready' ? observationGoals : undefined)
    : null, [currentContext, observationStatus, observationGoals]);
  const suggestions = proactiveInsight?.suggestions ?? [];

  const startConversation = () => {
    const current = conversation.getSnapshot();
    if (conversation.isBusy() || current.pending || current.pendingGoal || audioBusy.current || imageBusy.current || isCameraOpen || isPastConversation) return;
    try {
      localStorage.removeItem(storageKey);
      confirmationViewport.current?.release();
      readingPositions?.current.delete(storageKey);
      didScroll.current = false;
      setMessages([]);
      setInputValue('');
      setProactiveExpanded(true);
      proactiveReference.current = undefined;
      clearPendingImage();
      setShowPhotoMenu(false);
      setPending(null);
      setIsEditingProposal(false);
    } catch {
      toast.error('No se pudo borrar la conversación local.');
    }
  };

  const hasPending = !!pending || !!pendingGoal;
  useEffect(() => {
    if (!messages.length && !isTyping && !hasPending) return;
    if (confirmationViewport.current?.ownsScroll()) { didScroll.current = true; return; }
    if (cardScrollDecision.current && cardScrollDecision.current.id === messages.at(-1)?.id && !cardScrollDecision.current.nearEnd) return;
    const frame = requestAnimationFrame(() => {
      const saved = didScroll.current ? undefined : readingPositions?.current.get(storageKey);
      const container = messagesScrollRef.current;
      if (!container || !revealCoachProposalField(container)) {
        if (container && saved !== undefined) container.scrollTop = saved;
        else scrollToEnd('instant');
      }
      didScroll.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, isTyping, hasPending, isEditingProposal, readingPositions, scrollToEnd, storageKey]);

  const handleSend = async (text: string, attachment?: MediaAttachment, proactiveInsightId?: string) => {
    if ((!text.trim() && !attachment) || (audioBusy.current && !attachment) || conversation.isBusy() || conversation.getSnapshot().pending || !activeProfile || isPastConversation || dateStr !== formatDateStr(new Date())) return;
    const token = conversation.begin('response');
    if (!token) return;
    // Keep short evidence follow-ups tied to the observation; a new topic or
    // attachment returns to the ordinary conversation/action flow.
    const evidenceFollowup = /^[¿\s]*(?:por que\b|que registros\b|explica\b|en que te bas|y el periodo anterior\b)/iu.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const observationId = !attachment ? proactiveInsightId ?? (evidenceFollowup ? proactiveReference.current : undefined) : undefined;
    proactiveReference.current = observationId;
    setProactiveExpanded(false);

    const now = new Date();
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const userMsg: Message = { id: Date.now().toString(), role: 'user',
      text: attachment?.kind === 'image' ? `📷 Foto de comida${text.trim() ? `\n${text.trim()}` : ''}` : text,
      localTime };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setPendingGoal(null);
    setInputValue('');

    try {
      // Build Dynamic Context
      const todayStr = formatDateStr(now);
      const yesterdayStr = formatDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      const dayBeforeStr = formatDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2));
      const todayRecord = activeProfile?.records?.[todayStr];
      if (!activeProfile || activeProfile.user_id !== userId) throw new Error('Esperá a que se cargue tu perfil para consultar al asistente.');
      const coachContext = buildCoachContext(activeProfile, todayStr);
      const systemPrompt = `Contexto diario calculado por Calori.
${buildDailyEnergyContext(activeProfile, todayRecord)}
HOY: ${todayStr}.
AYER: ${yesterdayStr}.
ANTEAYER: ${dayBeforeStr}.
HORA LOCAL ACTUAL: ${localTime}.
DESFASE LOCAL RESPECTO DE UTC (minutos): ${-now.getTimezoneOffset()}.`;

      const response = await generateAIResponse(newHistory, systemPrompt, todayStr, attachment, coachContext, observationId);
      if (!conversation.isCurrent(token) || dateStr !== formatDateStr(new Date())) return;
      // Prepare model-supplied titles only once. Edits and retries must retain
      // the exact name the person reviewed, including an intentionally short one.
      // A receipt-backed replay keeps the historical title so changing the
      // naming policy cannot disguise a record already confirmed in this chat.
      const latestConfirmed = conversation.getSnapshot().messages.flatMap(message =>
        message.role === 'bot' ? message.recordedActions ?? [] : []);
      const latestRecords = conversation.getProfile()?.records ?? {};
      const actions = validActions(response.actions, todayStr).map(action =>
        findRecordedCoachAction(action, latestRecords, latestConfirmed) ? action : prepareCoachMealAction(action));
      const requestedActions = Array.isArray(response.actions) && response.actions.length > 0;
      const proposals = actions.filter(a => a.type === 'add_meal' || a.type === 'add_workout');
      const direct = actions.filter(a => a.type !== 'add_meal' && a.type !== 'add_workout');
      const rejected = requestedActions ? response.actions as DataAction[] : [];
      let replyText = requestedActions && !actions.length
        ? rejected.some(a => isValidDateStr(a?.payload?.dateStr) && a.payload.dateStr > todayStr)
          ? 'Puedo registrar comidas y entrenamientos de hoy o de fechas pasadas, pero no futuras.'
          : rejected.some(a => isValidDateStr(a?.payload?.dateStr) && a.payload.dateStr < todayStr &&
            (a.type === 'set_steps' || a.type === 'add_water' || a.type === 'set_weight'))
            ? 'Por ahora solo puedo registrar agua, pasos y peso del día actual.'
            : 'Revisá la fecha y los datos necesarios para registrar la comida o el entrenamiento.'
        : response.reply.replace(/\b(registré|guardé|cargué|anoté|actualicé)\b/gi, 'puedo ayudarte a registrar');
      if (proposals.length && /\b(?:registrar[eé]|(?:lo\s+)?voy\s+a\s+(?:registrar(?:lo)?|cargar(?:lo)?))(?!\w)/iu.test(replyText)) {
        replyText = 'Preparé este registro para que lo confirmes.';
      }
      if (response.goalProposal && /\b(?:guard[eé]|registr[eé]|cancel[eé]|modifiqu[eé]|acept[eé]|actualic[eé])\b|objetivo (?:guardado|aceptado|cancelado|actualizado)/iu.test(response.reply)) {
        replyText = 'Preparé esta propuesta de objetivo para que la revises y confirmes. Todavía no está guardada.';
      }
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: replyText,
        goalProgress: !requestedActions && !response.goalProposal && !attachment ? goalProgressQuery(text) : undefined,
        coachCard: !requestedActions && !response.goalProposal && attachment?.kind !== 'image'
          ? buildCoachCard(response.presentation, coachContext) : undefined
      };
      if (botMsg.goalProgress && mounted.current) void goals.reload();
      if (mounted.current) rememberReplyAnchor(botMsg.id);
      setMessages(prev => [...prev, botMsg]);
      if (response.goalProposal && !requestedActions) setPendingGoal(response.goalProposal);
      if (direct.length) await applyActions(token, direct, todayStr);
      if (conversation.isCurrent(token) && proposals.length) {
        const proposalDate = proposals[0].payload.dateStr as string;
        if (proposals.every(action => action.payload.dateStr === proposalDate)) {
          setIsEditingProposal(proposals.some(action => action.type === 'add_meal' && !String(action.payload.name).trim()));
          setPending({ dateStr: proposalDate, actions: proposals, registerAgain: [], commit: newActionDraft(proposals, proposalDate) });
        } else {
          appendReply('Indicame una fecha por vez para confirmar esos registros.');
        }
      }
    } catch (error) {
      if (!conversation.isCurrent(token)) return;
      const errorMessage = error instanceof Error && error.message
        ? error.message
        : 'Ha ocurrido un error al intentar conectarme al servidor de IA.';

      if (mounted.current) toast.error(errorMessage);
      const id = new Date().getTime().toString();
      if (mounted.current) rememberReplyAnchor(id);
      setMessages(prev => [...prev, {
        id,
        role: 'bot',
        text: `❌ ${errorMessage}`
      }]);
    } finally {
      conversation.finish(token);
    }
  };

  const sendComposer = async () => {
    if (isRecording || isRequestingAudio || isProcessingAudio || isProcessingImage || isCameraOpen || isTyping || pending) return;
    if (!pendingImage) {
      await handleSend(inputValue);
      return;
    }
    if (imageBusy.current || audioBusy.current || conversation.isBusy() || pending || pendingGoal) return;
    imageBusy.current = true;
    setIsProcessingImage(true);
    try {
      const data = await blobToBase64(pendingImage.blob);
      if (!data) throw new Error('La imagen está vacía.');
      if (!mounted.current) return;
      const attachment: MediaAttachment = { kind: 'image', mimeType: pendingImage.blob.type, data };
      clearPendingImage();
      await handleSend(inputValue, attachment);
    } catch {
      if (mounted.current) toast.error('No pude preparar esta imagen. Probá con una foto más liviana.');
    } finally {
      imageBusy.current = false;
      if (mounted.current) setIsProcessingImage(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const cancelRecording = () => {
    recordingCancelled.current = true;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    stopRecording();
    streamRef.current?.getTracks().forEach(track => track.stop());
  };

  const startRecording = async () => {
    if (audioBusy.current || imageBusy.current || isCameraOpen || conversation.isBusy() || pending || pendingGoal || !activeProfile || isPastConversation) return;
    recordingCancelled.current = false;
    setShowPhotoMenu(false);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error('Este navegador no permite grabar audio. Podés escribir tu mensaje.');
      return;
    }
    audioBusy.current = true;
    setIsRequestingAudio(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      setIsRequestingAudio(false);
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let failed = false;
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        if (mounted.current) toast.error('No se pudo grabar el audio. Intentá nuevamente.');
        stream.getTracks().forEach(track => track.stop());
        stopRecording();
      };
      recorder.onstop = async () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        recordingTimer.current = null;
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!mounted.current) return;
        setIsRecording(false);
        if (failed || recordingCancelled.current) {
          audioBusy.current = false;
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (!blob.size) {
          toast.error('La grabación está vacía. Intentá nuevamente.');
          audioBusy.current = false;
          return;
        }
        if (blob.size > 3 * 1024 * 1024) {
          toast.error('El audio supera el límite de 3 MB. Grabá un mensaje más corto.');
          audioBusy.current = false;
          return;
        }
        setIsProcessingAudio(true);
        try {
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
            reader.onerror = () => reject(new Error('No se pudo procesar el audio.'));
            reader.readAsDataURL(blob);
          });
          if (!data) throw new Error('El audio está vacío.');
          if (mounted.current) {
            const transcript = await transcribeAudio({ kind: 'audio', mimeType: blob.type, data });
            if (mounted.current) {
              setInputValue(previous => [previous.trim(), transcript].filter(Boolean).join(' '));
              requestAnimationFrame(() => textInputRef.current?.focus());
            }
          }
        } catch (error) {
          if (mounted.current) toast.error(error instanceof Error ? error.message : 'No pude transcribir el audio. Intentá nuevamente.');
        } finally {
          audioBusy.current = false;
          if (mounted.current) setIsProcessingAudio(false);
        }
      };
      recorder.start();
      setIsRecording(true);
      recordingTimer.current = setTimeout(stopRecording, 60_000);
    } catch {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      audioBusy.current = false;
      if (mounted.current) {
        setIsRequestingAudio(false);
        toast.error('No se pudo acceder al micrófono. Revisá los permisos e intentá nuevamente.');
      }
    }
  };

  const observation = !isPastConversation && currentContext && (
    <aside className="chat-proactive" aria-label="Una observación para vos" data-insight-kind={proactiveInsight?.kind}
      data-conversation={hasMessages ? 'active' : 'empty'}>
      {proactiveInsight ? <details open={proactiveExpanded} onToggle={event => setProactiveExpanded(event.currentTarget.open)}>
        <summary className="chat-proactive-heading">
          <span className="chat-proactive-eyebrow"><ChartLineUp size={17} weight="bold" aria-hidden="true" />{hasMessages ? 'Observación del Coach' : proactiveInsight.kind === 'goal' ? 'Tu objetivo' : 'Tus registros'}</span>
          {!hasMessages && <span className="chat-proactive-title">{observationHeading(proactiveInsight)}</span>}
          <CaretDown className="chat-proactive-toggle" size={18} weight="bold" aria-hidden="true" />
        </summary>
        <div className="chat-proactive-body">
          {hasMessages && <h3 className="chat-proactive-title">{observationHeading(proactiveInsight)}</h3>}
          <p className="chat-proactive-observation">{proactiveInsight.kind === 'goal' ? 'Objetivo confirmado · ' : 'Período · '}
            {periodLabel(proactiveInsight.period.startDate, proactiveInsight.period.endDate)}
          </p>
          <button type="button" className="chat-proactive-action"
            onClick={() => {
              if (!hasMessages) textInputRef.current?.focus({ preventScroll: true });
              return handleSend(proactiveInsight.prompt, undefined, proactiveInsight.id);
            }}
            disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pendingImage || hasPending || !currentContext || goalStatus === 'loading'}>
            {proactiveInsight.kind === 'goal' ? 'Consultar mi avance' : 'Preguntar al Coach'}<ArrowRight size={16} weight="bold" aria-hidden="true" />
          </button>
          <details className="chat-proactive-evidence">
            <summary>En qué se basa <CaretDown size={13} aria-hidden="true" /></summary>
            <p>{proactiveInsight.observation}</p>
            <p>Hoy sigue en curso.</p>
            <ul>{proactiveInsight.evidence.map(item => <li key={item}>{item}</li>)}</ul>
            <p>{proactiveInsight.limitation}</p>
          </details>
          {goalStatus === 'loading' && observationStatus !== 'error' &&
            <p role="status" className="chat-observation-feedback">Actualizando tus objetivos…</p>}
          {observationStatus === 'error' && <div className="chat-observation-feedback">
            <p role="status">{goalStatus === 'loading' ? 'Consultando tus objetivos…' : 'No pude consultar tus objetivos. Esta observación usa tus registros.'}</p>
            <button type="button" className="chat-secondary" disabled={goalStatus === 'loading'}
              onClick={event => {
                event.currentTarget.closest('.chat-proactive')?.querySelector('summary')?.focus({ preventScroll: true });
                void goals.reload();
              }}>Reintentar consulta de objetivos</button>
          </div>}
        </div>
      </details> : <p role="status" className="chat-observation-loading">Consultando tus objetivos…</p>}
    </aside>
  );
  const welcome = !isPastConversation && !hasMessages && !!currentContext && !!proactiveInsight;
  const starters = welcome ? initialSuggestions(proactiveInsight) : [];

  return (
    <div className="assistant-view" data-welcome={welcome}>
      
      {/* Header */}
      <header className="chat-heading">
        <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-assistant" />
        <div className="chat-heading-title">
          <h1 className="screen-title">Coach</h1>
          <p>Nutrición y entrenamiento</p>
        </div>
        <div className="chat-heading-actions">
          <button type="button" onClick={() => { setShowGoals(true); void goals.reload(); }}
            disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || hasPending}
            aria-label="Mis objetivos" aria-haspopup="dialog" aria-expanded={showGoals} title="Mis objetivos">
            <Target className="chat-action-icon" size={19} aria-hidden="true" /><span>Mis objetivos</span>
          </button>
          <button type="button" onClick={() => setShowHistory(prev => !prev)} disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || hasPending}
            aria-label="Historial" aria-expanded={showHistory} title="Historial">
            <ClockCounterClockwise className="chat-action-icon" size={19} aria-hidden="true" /><span>Historial</span>
          </button>
          <button type="button" onClick={startConversation} disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || hasPending || isPastConversation}
            aria-label="Nueva conversación" title="Nueva conversación">
            <Plus className="chat-action-icon" size={19} aria-hidden="true" /><span>Nueva conversación</span>
          </button>
        </div>
      </header>
      {showGoals && <CoachGoalsPanel resource={goals} history={currentContext?.historyDays ?? []} today={today} userId={userId}
        onClose={() => setShowGoals(false)} />}

      {showHistory && (
        <label className="chat-history-picker">
          Conversación
          <select value={dateStr} onChange={e => { setShowHistory(false); onSelectDate(e.target.value); }}
            className="chat-field">
            {conversationDates(userId, today).map(date => (
              <option key={date} value={date}>{date === today ? 'Hoy' : new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</option>
            ))}
          </select>
        </label>
      )}
      {isPastConversation && (
        <div className="chat-history-picker">
          <p>{new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-AR')} · Solo lectura</p>
          {hasPending && <p>Esta propuesta quedó sin confirmar en una conversación anterior. Volvé a hoy para pedir el registro nuevamente.</p>}
          <button type="button" onClick={() => onSelectDate(today)} className="chat-return-today">Volver a hoy</button>
        </div>
      )}

      {hasMessages && observation}

      {/* Messages Area */}
      <section ref={messagesScrollRef} className="chat-messages"
        onScroll={event => {
          confirmationViewport.current?.scroll();
          const positions = readingPositions?.current;
          if (!positions || !didScroll.current) return;
          const log = event.currentTarget;
          if (log.scrollHeight - log.clientHeight - log.scrollTop <= 24) positions.delete(storageKey);
          else positions.set(storageKey, log.scrollTop);
        }}
        role="log" aria-label="Conversación con Coach" aria-live="polite" aria-relevant="additions text">
        <div ref={messagesContentRef} className="chat-message-list">
        {pendingGoal && <CoachGoalConfirmation proposal={pendingGoal} busy={isTyping || isPastConversation}
          onConfirm={() => { void confirmGoal(); }} onDismiss={() => { if (!conversation.isBusy()) setPendingGoal(null); }} />}
        {pending && (
          <div className="chat-confirmation order-last" role="region" aria-label="Propuesta de registros para revisar" aria-busy={isConfirming}>
            <div className="chat-proposal-heading">
              <p className="chat-proposal-state" role="status">{isConfirming ? 'Confirmando el guardado…' : 'Propuesta pendiente'}</p>
              <h3>{pending.actions.length === 1 ? 'Revisá tu registro' : 'Revisá tus registros'}</h3>
              <p className="chat-proposal-date">{describeDate(pending.dateStr)}</p>
            </div>
            {repeatedActions.some(Boolean) && <p className="chat-proposal-replay-notice" aria-live="polite">
              {actionsToSave.length === 1 ? 'Se guardará 1 registro nuevo.' : actionsToSave.length
                ? `Se guardarán ${actionsToSave.length} registros nuevos.` : 'No hay registros nuevos para guardar.'} Los ya registrados no se agregarán otra vez salvo que lo elijas.
            </p>}
            {pending.actions.map((action, index) => (
              <div key={index} className="chat-proposal-item" data-record-state={repeatedActions[index] && !pending.registerAgain.includes(index) ? 'already-saved' : 'new'}>
                {repeatedActions[index] && <div className="chat-already-recorded">
                  <p>Ya registrado en esta conversación</p>
                  <label>
                    <input type="checkbox" checked={pending.registerAgain.includes(index)} disabled={isTyping || isPastConversation}
                      onChange={event => { const checked = event.target.checked; setPending(previous => previous && ({ ...previous,
                        registerAgain: checked ? [...previous.registerAgain.filter(value => value !== index), index]
                          : previous.registerAgain.filter(value => value !== index) })); }}
                      />
                    {action.type === 'add_meal' ? 'Registrar otra comida igual' : 'Registrar otro ejercicio igual'}
                  </label>
                </div>}
                {isEditingProposal ? (
                  <div className="chat-proposal-edit grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(action.type === 'add_meal'
                      ? [{ field: 'name', label: 'Nombre de la comida', type: 'text' },
                        { field: 'calories', label: 'Calorías (kcal)', type: 'number' },
                        { field: 'time', label: 'Hora', type: 'time' }]
                      : [{ field: 'activity', label: 'Actividad', type: 'text' },
                        { field: 'duration', label: 'Duración (min)', type: 'number' },
                        { field: 'calories', label: 'Calorías (kcal)', type: 'number' },
                        { field: 'time', label: 'Hora', type: 'time' },
                        { field: 'distance', label: 'Distancia (km, opcional)', type: 'number' },
                        { field: 'pace', label: 'Ritmo (min/km, opcional)', type: 'text' }]
                    ).map(({ field, label, type }) => (
                      <label key={field} className={`flex flex-col gap-1${field === 'name' ? ' sm:col-span-2' : ''}`}>
                        {label}
                        <input type={type} value={String(action.payload[field] ?? '')} disabled={isTyping || isPastConversation}
                          min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? 'any' : undefined}
                          placeholder={field === 'name' ? 'Ej. milanesa con papas' : undefined}
                          aria-invalid={field === 'name' && !String(action.payload.name ?? '').trim() ? true : undefined}
                          aria-describedby={field === 'name' && !String(action.payload.name ?? '').trim() ? `coach-meal-name-${index}-hint` : undefined}
                          onChange={e => editProposal(index, field, type === 'number'
                            ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
                          className="chat-field" />
                        {field === 'name' && !String(action.payload.name ?? '').trim() && <span
                          id={`coach-meal-name-${index}-hint`} className="chat-proposal-name-hint">
                          Completá el nombre con los alimentos o bebidas que registraste.
                        </span>}
                      </label>
                    ))}
                    {action.type === 'add_meal' && (
                      <label className="flex flex-col gap-1">
                        Tipo
                        <select value={String(action.payload.type)} disabled={isTyping || isPastConversation} onChange={e => editProposal(index, 'type', e.target.value)}
                          className="chat-field">
                          {(['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Snack'] as MealType[]).map(type => <option key={type}>{type}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      Detalles
                      <textarea value={String(action.payload.details ?? '')} disabled={isTyping || isPastConversation} onChange={e => editProposal(index, 'details', e.target.value)}
                        className="chat-field" />
                    </label>
                  </div>
                ) : (
                  <ProposedEntrySummary action={action} />
                )}
              </div>
            ))}
            <p className="chat-proposal-footnote">{isConfirming ? 'Esperando la confirmación del guardado.'
              : isPastConversation ? 'El guardado no está confirmado. Esta conversación es de solo lectura.'
                : 'Confirmá para guardar los registros seleccionados.'}</p>
            <div className="chat-proposal-actions" onPointerDown={event => {
              const reader = messagesScrollRef.current;
              const shell = reader?.closest<HTMLElement>('.app-shell-coach');
              if (event.pointerType === 'touch' && reader && shell?.dataset.coachKeyboard === 'open' &&
                  getFocusedCoachProposalField(reader) && (event.target as HTMLElement).closest('button')) {
                // Keep the keyboard/layout stable between touch down and click.
                // Confirm/cancel still run exclusively through the click handler.
                event.preventDefault();
              }
            }}>
              <button type="button" disabled={isTyping || isPastConversation || !actionsToSave.length} onClick={confirmActions}
                className="chat-proposal-confirm">Confirmar</button>
              <button type="button" disabled={isTyping || isPastConversation} onClick={() => setIsEditingProposal(true)}
                className="chat-secondary">Editar</button>
              <button type="button" disabled={isTyping} onClick={() => {
                if (conversation.isBusy()) return;
                conversation.update({ pending: null, isEditingProposal: false }); appendReply('Registro cancelado.');
              }}
                className="chat-secondary">Cancelar</button>
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <div className="chat-empty">
            {observation}
            {isPastConversation ? <p>No hay mensajes en esta conversación.</p> : !currentContext ? <p role="status">Cargando tus registros…</p> : null}
            {starters.length > 0 && <div className="chat-empty-suggestions" role="group" aria-label="Preguntas sugeridas">
              {starters.map(suggestion => (
                <button key={suggestion} type="button" onClick={() => {
                  textInputRef.current?.focus({ preventScroll: true });
                  return handleSend(suggestion);
                }}
                  disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pendingImage || hasPending || !activeProfile || goalStatus === 'loading'}
                  className="chat-suggestion" title={suggestion} aria-description={suggestion}>
                  {suggestionLabel(suggestion)}<ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>}
          </div>
        )}
        {messages.filter(msg => msg.id !== receiptAwaitingProposal).map((msg) => (
          <div key={msg.id} data-coach-message-id={msg.id} className={`chat-message chat-message-${msg.role} ${msg.recordedActions?.length ? 'chat-message-receipt' : ''} ${msg.role === 'bot' && (msg.coachCard || msg.goalProgress) ? 'chat-message-structured' : ''} ${initialMessageIds.has(msg.id) ? '' : 'chat-message-new'} flex gap-3 min-w-0 max-w-[95%] md:max-w-[80%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
            <div className="chat-message-avatar flex-shrink-0 w-8 h-8 flex items-center justify-center">
              {msg.role === 'user' ? (
                <UserAvatar userId={userId} path={activeProfile?.user_id === userId ? activeProfile.avatar_path : null}
                  revision={avatarRevision} size={32} />
              ) : (
                <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-message" />
              )}
            </div>
            {msg.role === 'bot' && (msg.coachCard || msg.goalProgress) ? (
              <div className="chat-coach-stack">
                {msg.goalProgress && (msg.goalProgress === 'all' || goals.status !== 'ready' || goals.goals.some(goal => goal.status === 'active' && goal.type === msg.goalProgress)) ? <CoachGoalCards resource={goals} history={currentContext?.historyDays ?? []} today={today}
                  type={msg.goalProgress === 'all' ? undefined : msg.goalProgress} limit={2} /> : msg.coachCard && <CoachInsightCard card={msg.coachCard} />}
                <div className="chat-bubble">
                  <div className="chat-markdown">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
            <div className={`chat-bubble ${msg.role === 'bot' && msg.recordedActions?.length ? 'chat-saved' : ''} ${msg.role === 'user' ? 'chat-user' : ''}`}>
              {msg.role === 'bot' ? (
                <div className="chat-markdown">
                  {msg.recordedActions?.length ? <p className="chat-save-status"><CheckCircle size={16} aria-hidden="true" />Guardado confirmado</p> : null}
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                msg.text
              )}
            </div>
            )}
          </div>
        ))}
        {isTyping && !pending && (
          <div className="chat-typing flex gap-3 max-w-[75%] mr-auto" role="status" aria-label="Coach está respondiendo">
            <img src="/brand/calori-logo-symbol.png" alt="" className="chat-message-avatar brand-symbol brand-symbol-message" />
            <div className="chat-bubble chat-typing-indicator">
              <span aria-hidden="true" className="chat-typing-dot" />
              <span aria-hidden="true" className="chat-typing-dot" />
              <span aria-hidden="true" className="chat-typing-dot" />
            </div>
          </div>
        )}
        <div className="chat-scroll-end" aria-hidden="true" />
        </div>
      </section>

      {/* Input Area */}
      {!isPastConversation && <footer ref={composerRef} className={`chat-composer ${isRecording ? 'chat-composer-recording' : ''}`}>
        {/* Quick Suggestions */}
        {hasMessages && currentContext && <details className="chat-composer-suggestions">
          <summary>Sugerencias <CaretDown size={16} aria-hidden="true" /></summary>
          <div className="chat-suggestion-list">
            {!suggestions.length && <p className="chat-empty-label">Buscando sugerencias para tus registros…</p>}
            {suggestions.map(suggestion => (
              <button type="button" key={suggestion} title={suggestion} aria-description={suggestion}
                onClick={event => {
                  const disclosure = event.currentTarget.closest('details');
                  disclosure?.querySelector('summary')?.focus({ preventScroll: true });
                  if (disclosure) disclosure.open = false;
                  void handleSend(suggestion);
                }}
                disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pendingImage || hasPending || !activeProfile || goalStatus === 'loading'}
                className="chat-suggestion">
                {suggestionLabel(suggestion)}
              </button>
            ))}
          </div>
        </details>}

        {pendingImage && (
          <div className="chat-image-preview mb-3 flex items-center gap-3 rounded-xl p-2">
            <img src={pendingImage.previewUrl} alt="Foto de comida adjunta" className="h-14 w-14 rounded-lg object-cover" />
            <span className="min-w-0 flex-1 text-sm">Foto adjunta</span>
            <button type="button" onClick={clearPendingImage} aria-label="Quitar foto"
              className="chat-image-remove flex items-center justify-center rounded-lg">
              <X size={18} weight="bold" />
            </button>
          </div>
        )}
        {isProcessingImage && <p className="chat-audio-status text-xs mb-2" role="status">Preparando imagen…</p>}
        {isRecording && (
          <div className="chat-recording-bar mb-3 flex flex-wrap items-center gap-2 rounded-xl p-2" role="status">
            <span className="chat-recording-label mr-auto text-sm"><span aria-hidden="true">●</span> Grabando…</span>
            <button type="button" onClick={cancelRecording}>Cancelar</button>
            <button type="button" onClick={stopRecording} className="chat-finish-dictation"><span className="chat-desktop-title">Finalizar dictado</span><span className="chat-mobile-title">Finalizar</span></button>
          </div>
        )}
        {(isRequestingAudio || isProcessingAudio) && (
          <p className="chat-audio-status mb-2 flex items-center gap-2 text-xs" role="status">
            {isProcessingAudio && <span className="chat-transcribe-spinner" aria-hidden="true" />}
            {isRequestingAudio ? 'Solicitando acceso al micrófono…' : 'Transcribiendo…'}
          </p>
        )}
        <form 
          onSubmit={(e) => { e.preventDefault(); void sendComposer(); }}
          className="chat-composer-form"
        >
          <textarea
            ref={textInputRef}
            aria-label="Mensaje para Coach"
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault();
                void sendComposer();
              }
            }}
            readOnly={isTyping}
            disabled={isRequestingAudio || isRecording || isProcessingAudio || !!pending || !activeProfile}
            placeholder="Escribí…"
            className="chat-textarea"
          />
          <div ref={photoMenuRef} className="chat-photo-control relative flex-none"
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setShowPhotoMenu(false); }}>
            <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void selectImage(file); }}
              className="hidden" tabIndex={-1} aria-label="Elegir foto de galería" />
            <button type="button" onClick={() => setShowPhotoMenu(previous => !previous)}
              disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || hasPending || !activeProfile}
              aria-label="Adjuntar foto de comida" aria-haspopup="menu" aria-expanded={showPhotoMenu}
              className="chat-image-button">
              <ImageSquare size={21} aria-hidden="true" />
            </button>
            {showPhotoMenu && (
              <div className="chat-photo-menu" role="menu" aria-label="Opciones de foto"
                onKeyDown={event => {
                  if (event.key === 'Tab') {
                    // Continue from the menu button in the normal document tab order.
                    photoMenuRef.current?.querySelector<HTMLButtonElement>('.chat-image-button')?.focus();
                    setShowPhotoMenu(false);
                    return;
                  }
                  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const items = Array.from(event.currentTarget.querySelectorAll('button'));
                  const active = items.indexOf(document.activeElement as HTMLButtonElement);
                  const offset = event.key === 'ArrowDown' ? 1 : -1;
                  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
                    : (active + offset + items.length) % items.length;
                  items[index].focus();
                }}>
                <button type="button" role="menuitem" tabIndex={-1} onClick={() => { void openCamera(); }}>Tomar foto</button>
                <button type="button" role="menuitem" tabIndex={-1} onClick={() => { setShowPhotoMenu(false); galleryInputRef.current?.click(); }}>Elegir de galería</button>
              </div>
            )}
          </div>
          <button type="button" onClick={startRecording}
            disabled={isRecording || isRequestingAudio || isProcessingAudio || isProcessingImage || isCameraOpen || isTyping || hasPending || !activeProfile}
            aria-label="Iniciar dictado por voz"
            className={`chat-audio-button ${isRecording ? 'chat-audio-recording' : ''}`}>
            <Microphone size={21} aria-hidden="true" />
          </button>
          <button
            type="submit"
            disabled={(!inputValue.trim() && !pendingImage) || isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pending || !activeProfile}
            aria-label="Enviar mensaje"
            className="chat-send"
            onPointerDown={event => {
              if (event.pointerType === 'touch' && document.activeElement === textInputRef.current &&
                  event.currentTarget.closest('[data-coach-keyboard="open"]')) {
                // Preserve the editor's focus until the native click submits the form.
                event.preventDefault();
              }
            }}
            onClick={event => {
              // WebKit can move focus to a tapped control even after pointerdown.
              if (event.detail > 0 && event.currentTarget.closest('[data-coach-keyboard="open"]')) {
                textInputRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </form>
      </footer>}
      {isCameraOpen && createPortal(
        <dialog ref={cameraDialogRef} className="chat-camera-panel" aria-label="Tomar foto"
          onCancel={event => { event.preventDefault(); closeCamera(); }}>
            <h3 className="mb-3 text-lg">Tomar foto</h3>
            <div className="chat-camera-frame relative overflow-hidden rounded-2xl">
              <video ref={cameraVideoRef} autoPlay playsInline muted onLoadedMetadata={() => setIsCameraReady(true)}
                className="aspect-[4/3] w-full object-contain" />
              {isCameraLoading && <div className="chat-camera-loading absolute inset-0 flex items-center justify-center text-sm">Abriendo cámara…</div>}
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={closeCamera} className="chat-camera-cancel rounded-xl px-4 py-2">Cancelar</button>
              <button type="button" onClick={() => { void capturePhoto(); }} disabled={!isCameraReady}
                className="chat-camera-capture rounded-xl px-4 py-2 disabled:opacity-50">Capturar</button>
            </div>
        </dialog>, document.body
      )}
    </div>
  );
}
