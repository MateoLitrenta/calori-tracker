import './PremiumViews.css';
import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ClockCounterClockwise, ImageSquare, Microphone, PaperPlaneRight, Plus, User, X } from '@phosphor-icons/react';
import { useAppStore } from '../hooks/useAppStore';
import { buildDailyEnergyContext, formatDateStr, generateUUID } from '../utils/helpers';
import type { UserProfile, DailyRecord, MealType } from '../types';
import { generateAIResponse, transcribeAudio, validActions, isValidDateStr, type MediaAttachment, type DataAction, type ChatMessage } from '../services/aiService';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

interface Message extends ChatMessage {
  id: string;
  localTime?: string;
}

function readHistory(key: string): Message[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored.filter((message): message is Message =>
      message !== null && typeof message === 'object' &&
      typeof message.id === 'string' && typeof message.text === 'string' &&
      (message.role === 'user' || message.role === 'bot')) : [];
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

export default function ChatView({ scrollContainer }: { scrollContainer: RefObject<HTMLElement | null> }) {
  const { user, activeProfile, updateRecord } = useAppStore();
  const [today, setToday] = useState(() => formatDateStr(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
  return <UserChat key={`${user.id}:${today}:${dateStr}`} userId={user.id} activeProfile={activeProfile}
    updateRecord={updateRecord} dateStr={dateStr} today={today} onSelectDate={setSelectedDate} scrollContainer={scrollContainer} />;
}

function UserChat({ userId, activeProfile, updateRecord, dateStr, today, onSelectDate, scrollContainer }: {
  userId: string; activeProfile: UserProfile | null;
  updateRecord: (dateStr: string, record: DailyRecord) => Promise<boolean>;
  dateStr: string; today: string; onSelectDate: (date: string) => void;
  scrollContainer: RefObject<HTMLElement | null>;
}) {
  const storageKey = `calori:assistant:messages:${userId}:${dateStr}`;
  const [messages, setMessages] = useState<Message[]>(() => readDailyHistory(userId, dateStr, today));
  const isPastConversation = dateStr !== today;
  const [showHistory, setShowHistory] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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
  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const container = scrollContainer.current;
    container?.scrollTo({ top: container.scrollHeight, behavior });
  }, [scrollContainer]);
  const didScroll = useRef(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const [pending, setPending] = useState<{ dateStr: string; actions: DataAction[] } | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState(false);

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
    if (!file || imageBusy.current || audioBusy.current || busy.current || pending || !activeProfile) return;
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
    if (!navigator.mediaDevices?.getUserMedia || imageBusy.current || audioBusy.current || busy.current || pending) {
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
    const closeOnOutside = (event: PointerEvent) => {
      if (!photoMenuRef.current?.contains(event.target as Node)) setShowPhotoMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPhotoMenu(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showPhotoMenu]);

  const editProposal = (index: number, field: string, value: string | number | undefined) => {
    setPending(prev => prev && ({ ...prev, actions: prev.actions.map((action, i) =>
      i === index ? { ...action, payload: { ...action.payload, [field]: value } } : action) }));
  };

  const appendReply = (text: string) => {
    if (mounted.current) setMessages(prev => [...prev, { id: generateUUID(), role: 'bot', text }]);
  };

  const describeAction = (a: DataAction) => {
    const p = a.payload;
    switch (a.type) {
      case 'add_meal': return `${p.name} · ${p.type} · ${p.calories} kcal · ${p.time}`;
      case 'add_workout': return `${p.activity} · ${p.duration} min · ${p.calories} kcal · ${p.time}`;
      case 'set_steps': return `${p.steps} pasos (total)`;
      case 'add_water': return `+${p.water} ml de agua`;
      case 'set_weight': return `${p.weight} kg de peso de hoy`;
    }
  };

  const describeDate = (actionDate: string) =>
    new Date(`${actionDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

  const applyActions = async (actions: DataAction[], actionDate: string) => {
    const currentToday = formatDateStr(new Date());
    if (!mounted.current || !activeProfile || isPastConversation || dateStr !== currentToday ||
      !isValidDateStr(actionDate) || actionDate > currentToday) {
      throw new Error('La fecha cambió o no es válida. Pedime registrar los datos nuevamente.');
    }
    if (validActions(actions, currentToday).length !== actions.length ||
      actions.some(action => action.payload.dateStr !== actionDate)) {
      throw new Error('Revisá los datos obligatorios antes de confirmar.');
    }
    const base = activeProfile.records[actionDate] || {
      dateStr: actionDate, date: new Date(`${actionDate}T12:00:00`), meals: [], workouts: [], steps: 0, water: 0,
    };
    const record: DailyRecord = { ...base, meals: [...base.meals], workouts: [...base.workouts] };
    for (const a of actions) {
      const p = a.payload;
      switch (a.type) {
        case 'add_meal':
          record.meals.push({ id: generateUUID(), name: p.name as string,
            type: p.type as MealType, calories: p.calories as number,
            time: p.time as string, details: p.details as string | undefined }); break;
        case 'add_workout':
          record.workouts.push({ id: generateUUID(), activity: p.activity as string,
            duration: p.duration as number, calories: p.calories as number, muscles: [],
            time: p.time as string, details: p.details as string,
            distance: p.distance as number | undefined, pace: p.pace as string | undefined }); break;
        case 'set_steps': record.steps = p.steps as number; break;
        case 'add_water': record.water += p.water as number; break;
        case 'set_weight': record.weight = p.weight as number; break;
      }
    }
    if (!await updateRecord(actionDate, record)) {
      throw new Error('No se pudo completar el guardado. Revisá los registros de esa fecha antes de reintentar.');
    }
    appendReply(`Registrado ${actionDate === currentToday ? 'hoy' : `el ${describeDate(actionDate)}`}: ${actions.map(describeAction).join('; ')}.`);
  };

  const confirmActions = async () => {
    if (!pending || busy.current) return;
    if (validActions(pending.actions, formatDateStr(new Date())).length !== pending.actions.length ||
      pending.actions.some(action => action.payload.dateStr !== pending.dateStr)) {
      toast.error('Revisá nombre/actividad, tipo, calorías, hora y duración. Los valores numéricos deben ser positivos.');
      setIsEditingProposal(true);
      return;
    }
    busy.current = true;
    setIsTyping(true);
    const proposal = pending;
    setPending(null);
    try {
      await applyActions(proposal.actions, proposal.dateStr);
    } catch (error) {
      appendReply(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      busy.current = false;
      if (mounted.current) setIsTyping(false);
    }
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
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 44), 148)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 148 ? 'auto' : 'hidden';
  }, [inputValue]);

  useEffect(() => {
    if (isPastConversation) return;
    try {
      if (messages.length) localStorage.setItem(storageKey, JSON.stringify(messages));
      else localStorage.removeItem(storageKey);
    } catch {
      toast.error('No se pudo guardar la conversación en este dispositivo.');
    }
  }, [messages, storageKey, isPastConversation]);

  const todayRecord = activeProfile?.records[formatDateStr(new Date())];
  const suggestions = [
    'Analizá mi día',
    '¿Cómo está mi balance energético?',
    !todayRecord?.meals.length ? 'Ayudame a planear mis comidas de hoy'
      : '¿Cómo puedo equilibrar mi alimentación y actividad?',
  ];

  const startConversation = () => {
    if (busy.current || audioBusy.current || imageBusy.current || isCameraOpen || isPastConversation) return;
    try {
      localStorage.removeItem(storageKey);
      setMessages([]);
      setInputValue('');
      clearPendingImage();
      setShowPhotoMenu(false);
      setPending(null);
      setIsEditingProposal(false);
    } catch {
      toast.error('No se pudo borrar la conversación local.');
    }
  };

  const hasPending = !!pending;
  useEffect(() => {
    if (!messages.length && !isTyping && !hasPending) return;
    const frame = requestAnimationFrame(() => {
      scrollToEnd(didScroll.current ? 'smooth' : 'instant');
      didScroll.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, isTyping, hasPending, isEditingProposal, scrollToEnd]);

  const handleSend = async (text: string, attachment?: MediaAttachment) => {
    if ((!text.trim() && !attachment) || (audioBusy.current && !attachment) || busy.current || pending || !activeProfile || isPastConversation || dateStr !== formatDateStr(new Date())) return;
    busy.current = true;

    const now = new Date();
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const userMsg: Message = { id: Date.now().toString(), role: 'user',
      text: attachment?.kind === 'image' ? `📷 Foto de comida${text.trim() ? `\n${text.trim()}` : ''}` : text,
      localTime };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInputValue('');
    setIsTyping(true);

    try {
      // Build Dynamic Context
      const todayStr = formatDateStr(now);
      const yesterdayStr = formatDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      const dayBeforeStr = formatDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2));
      const todayRecord = activeProfile?.records?.[todayStr];
      if (!activeProfile) throw new Error('Esperá a que se cargue tu perfil para consultar al asistente.');
      const systemPrompt = `Eres el asistente nutricional de la app Calori Tracker.
${buildDailyEnergyContext(activeProfile, todayRecord)}
HOY: ${todayStr}.
AYER: ${yesterdayStr}.
ANTEAYER: ${dayBeforeStr}.
HORA LOCAL ACTUAL: ${localTime}.
DESFASE LOCAL RESPECTO DE UTC (minutos): ${-now.getTimezoneOffset()}.
Perfil: ${JSON.stringify({ name: activeProfile.name, age: activeProfile.age, sex: activeProfile.sex,
  height: activeProfile.height, weight: activeProfile.weight })}.
Registros de HOY: ${JSON.stringify({ meals: todayRecord?.meals || [], workouts: todayRecord?.workouts || [],
  steps: todayRecord?.steps || 0, water: todayRecord?.water || 0, weight: todayRecord?.weight ?? null })}.
Sé conciso, directo, motivador, siempre en español y enfócate estrictamente en nutrición, salud y entrenamiento. No des explicaciones médicas complejas, sino consejos accionables.`;

      const response = await generateAIResponse(newHistory, systemPrompt, todayStr, attachment);
      if (!mounted.current || dateStr !== formatDateStr(new Date())) return;
      const actions = validActions(response.actions, todayStr);
      const requestedActions = Array.isArray(response.actions) && response.actions.length > 0;
      const proposals = actions.filter(a => a.type === 'add_meal' || a.type === 'add_workout');
      const direct = actions.filter(a => a.type !== 'add_meal' && a.type !== 'add_workout');
      const rejected = requestedActions ? response.actions as DataAction[] : [];
      const replyText = requestedActions && !actions.length
        ? rejected.some(a => isValidDateStr(a?.payload?.dateStr) && a.payload.dateStr > todayStr)
          ? 'Puedo registrar comidas y entrenamientos de hoy o de fechas pasadas, pero no futuras.'
          : rejected.some(a => isValidDateStr(a?.payload?.dateStr) && a.payload.dateStr < todayStr &&
            (a.type === 'set_steps' || a.type === 'add_water' || a.type === 'set_weight'))
            ? 'Por ahora solo puedo registrar agua, pasos y peso del día actual.'
            : 'Revisá la fecha y los datos necesarios para registrar la comida o el entrenamiento.'
        : response.reply.replace(/\b(registré|guardé|cargué|anoté|actualicé)\b/gi, 'puedo ayudarte a registrar');
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: replyText
      };
      setMessages(prev => [...prev, botMsg]);
      if (direct.length) await applyActions(direct, todayStr);
      if (mounted.current && proposals.length) {
        const proposalDate = proposals[0].payload.dateStr as string;
        if (proposals.every(action => action.payload.dateStr === proposalDate)) {
          setIsEditingProposal(false);
          setPending({ dateStr: proposalDate, actions: proposals });
        } else {
          appendReply('Indicame una fecha por vez para confirmar esos registros.');
        }
      }
    } catch (error) {
      if (!mounted.current) return;
      const errorMessage = error instanceof Error && error.message
        ? error.message
        : 'Ha ocurrido un error al intentar conectarme al servidor de IA.';

      console.error('Chat AI error:', error);
      toast.error(errorMessage);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'bot',
        text: `❌ ${errorMessage}`
      }]);
    } finally {
      busy.current = false;
      if (mounted.current) setIsTyping(false);
    }
  };

  const sendComposer = async () => {
    if (isRecording || isRequestingAudio || isProcessingAudio || isProcessingImage || isCameraOpen || isTyping || pending) return;
    if (!pendingImage) {
      await handleSend(inputValue);
      return;
    }
    if (imageBusy.current || audioBusy.current || busy.current || pending) return;
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
    if (audioBusy.current || imageBusy.current || isCameraOpen || busy.current || pending || !activeProfile || isPastConversation) return;
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
        } catch {
          if (mounted.current) toast.error('No pude transcribir el audio. Intentá nuevamente.');
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

  return (
    <div className="premium-view dark assistant-view flex flex-col flex-1 min-h-0 w-full max-w-3xl mx-auto bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* Header */}
      <div className="chat-heading px-6 py-5 border-b border-slate-200 dark:border-[#ffffff0d] bg-slate-50 dark:bg-[#151719] flex flex-wrap items-center gap-3">
        <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-assistant" />
        <div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">Calori</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400">Asistente personal</p>
        </div>
        <div className="chat-heading-actions ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setShowHistory(prev => !prev)} disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pending}
            aria-label="Historial" aria-expanded={showHistory} className="chat-history-button text-xs font-medium disabled:opacity-50">
            <ClockCounterClockwise className="chat-action-icon" size={19} aria-hidden="true" /><span>Historial</span>
          </button>
          <button type="button" onClick={startConversation} disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || isPastConversation}
            aria-label="Nueva conversación" className="text-xs font-medium text-slate-500 dark:text-gray-400 hover:text-orange-500 disabled:opacity-50">
            <Plus className="chat-action-icon" size={19} aria-hidden="true" /><span>Nueva conversación</span>
          </button>
        </div>
      </div>

      {showHistory && (
        <label className="chat-history-picker flex flex-col gap-2 px-4 py-3 text-sm">
          Conversación
          <select value={dateStr} onChange={e => { setShowHistory(false); onSelectDate(e.target.value); }}
            className="w-full min-w-0 rounded-xl border border-slate-300 dark:border-[#ffffff0d] bg-white dark:bg-[#191c1f] px-3 py-2">
            {conversationDates(userId, today).map(date => (
              <option key={date} value={date}>{date === today ? 'Hoy' : new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</option>
            ))}
          </select>
        </label>
      )}
      {isPastConversation && (
        <div className="chat-history-picker px-4 py-3 text-sm">
          <p>{new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-AR')} · Solo lectura</p>
          <button type="button" onClick={() => onSelectDate(today)} className="mt-2 underline">Volver a hoy</button>
        </div>
      )}

      {/* Messages Area */}
      <div className="chat-messages flex-1 p-4 md:p-6 flex flex-col gap-4">
        {pending && (
          <div className="chat-confirmation order-last rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20 p-4 text-sm">
            <p className="font-semibold mb-2">Confirmar registros del {describeDate(pending.dateStr)}</p>
            {pending.actions.map((action, index) => (
              <div key={index} className="mb-3">
                {isEditingProposal ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(action.type === 'add_meal'
                      ? [{ field: 'name', label: 'Nombre', type: 'text' },
                        { field: 'calories', label: 'Calorías (kcal)', type: 'number' },
                        { field: 'time', label: 'Hora', type: 'time' }]
                      : [{ field: 'activity', label: 'Actividad', type: 'text' },
                        { field: 'duration', label: 'Duración (min)', type: 'number' },
                        { field: 'calories', label: 'Calorías (kcal)', type: 'number' },
                        { field: 'time', label: 'Hora', type: 'time' },
                        { field: 'distance', label: 'Distancia (km, opcional)', type: 'number' },
                        { field: 'pace', label: 'Ritmo (min/km, opcional)', type: 'text' }]
                    ).map(({ field, label, type }) => (
                      <label key={field} className="flex flex-col gap-1">
                        {label}
                        <input type={type} value={String(action.payload[field] ?? '')}
                          min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? 'any' : undefined}
                          onChange={e => editProposal(index, field, type === 'number'
                            ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
                          className="w-full min-w-0 rounded-xl border border-slate-300 dark:border-[#ffffff0d] bg-white dark:bg-[#191c1f] px-3 py-2" />
                      </label>
                    ))}
                    {action.type === 'add_meal' && (
                      <label className="flex flex-col gap-1">
                        Tipo
                        <select value={String(action.payload.type)} onChange={e => editProposal(index, 'type', e.target.value)}
                          className="rounded-xl border border-slate-300 dark:border-[#ffffff0d] bg-white dark:bg-[#191c1f] px-3 py-2">
                          {(['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Snack'] as MealType[]).map(type => <option key={type}>{type}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      Detalles
                      <textarea value={String(action.payload.details ?? '')} onChange={e => editProposal(index, 'details', e.target.value)}
                        className="rounded-xl border border-slate-300 dark:border-[#ffffff0d] bg-white dark:bg-[#191c1f] px-3 py-2" />
                    </label>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{describeDate(action.payload.dateStr as string)}</p>
                    <p>{describeAction(action)}{action.estimated ? ' (estimado)' : ''}</p>
                    {typeof action.payload.details === 'string' && <p className="whitespace-pre-wrap">{action.payload.details}</p>}
                    {action.payload.distance !== undefined && <p>Distancia: {String(action.payload.distance)} km</p>}
                    {typeof action.payload.pace === 'string' && action.payload.pace && <p>Ritmo: {action.payload.pace} min/km</p>}
                  </>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-3 mt-3">
              <button type="button" disabled={isTyping} onClick={() => setIsEditingProposal(true)}
                className="rounded-xl border border-slate-300 dark:border-[#ffffff0d] px-3 py-2">Editar</button>
              <button type="button" disabled={isTyping} onClick={confirmActions}
                className="rounded-xl bg-[#f5a064] text-white px-3 py-2 disabled:opacity-50">Confirmar</button>
              <button type="button" disabled={isTyping} onClick={() => { setPending(null); appendReply('Registro cancelado.'); }}
                className="rounded-xl border border-slate-300 dark:border-[#ffffff0d] px-3 py-2">Cancelar</button>
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <div className="chat-empty my-auto py-12 text-center">
            <h3 className="text-lg font-semibold">¿En qué te puedo ayudar hoy?</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
              Tengo en cuenta tus comidas, pasos, entrenamiento y balance energético.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 min-w-0 max-w-[95%] md:max-w-[80%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
            <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center ${msg.role === 'user' ? 'rounded-full bg-slate-200 dark:bg-gray-800' : ''}`}>
              {msg.role === 'user' ? (
                <User size={16} className="text-slate-600 dark:text-gray-300" weight="fill" />
              ) : (
                <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-message" />
              )}
            </div>
            <div className={`chat-bubble ${msg.role === 'bot' && msg.text.startsWith('Registrado ') ? 'chat-saved' : ''} px-4 py-3 rounded-3xl text-sm shadow-none ${
              msg.role === 'user' 
                ? 'chat-user text-white rounded-tr-sm whitespace-pre-wrap' 
                : 'bg-slate-100 text-slate-900 dark:bg-[#191c1f] dark:text-gray-100 rounded-tl-sm border border-slate-200 dark:border-[#ffffff0d]'
            }`}>
              {msg.role === 'bot' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-snug prose-p:mb-2 prose-ul:my-1 prose-li:my-0 last:prose-p:mb-0">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3 max-w-[75%] mr-auto">
            <img src="/brand/calori-logo-symbol.png" alt="" className="brand-symbol brand-symbol-message" />
            <div className="px-4 py-4 rounded-3xl bg-slate-100 dark:bg-[#191c1f] rounded-tl-sm border border-slate-200 dark:border-[#ffffff0d] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      {!isPastConversation && <div className="chat-composer p-4 border-t border-slate-200 dark:border-[#ffffff0d] bg-slate-50 dark:bg-[#151719]">
        {/* Quick Suggestions */}
        <div className="flex overflow-x-auto gap-2 pb-3 mb-2 hide-scrollbar">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSend(suggestion)}
              disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pendingImage || !!pending || !activeProfile}
              className="chat-suggestion flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] text-slate-700 dark:text-gray-300 hover:border-orange-500 hover:text-orange-500 dark:hover:border-orange-500 dark:hover:text-orange-400 disabled:opacity-50 transition-colors whitespace-nowrap shadow-none"
            >
              {suggestion}
            </button>
          ))}
        </div>

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
            <button type="button" onClick={stopRecording} className="chat-finish-dictation">Finalizar dictado</button>
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
          className="chat-composer-form flex items-center gap-2 relative"
        >
          <textarea
            ref={textInputRef}
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault();
                void sendComposer();
              }
            }}
            onFocus={() => scrollToEnd('smooth')}
            disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || !!pending || !activeProfile}
            placeholder="Escribe un mensaje..."
            className="chat-textarea min-w-0 flex-1 bg-white dark:bg-[#1e2124] border border-slate-300 dark:border-[#ffffff0d] rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#f5a064] dark:focus:border-[#f5a064] shadow-none disabled:opacity-50"
          />
          <div ref={photoMenuRef} className="relative flex-none">
            <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void selectImage(file); }}
              className="hidden" tabIndex={-1} aria-label="Elegir foto de galería" />
            <button type="button" onClick={() => setShowPhotoMenu(previous => !previous)}
              disabled={isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pending || !activeProfile}
              aria-label="Adjuntar foto de comida" aria-haspopup="menu" aria-expanded={showPhotoMenu}
              className="chat-image-button flex items-center justify-center rounded-xl transition-colors disabled:opacity-50">
              <ImageSquare size={20} weight="fill" />
            </button>
            {showPhotoMenu && (
              <div className="chat-photo-menu" role="menu" aria-label="Opciones de foto">
                <button type="button" role="menuitem" onClick={() => { void openCamera(); }}>Tomar foto</button>
                <button type="button" role="menuitem" onClick={() => { setShowPhotoMenu(false); galleryInputRef.current?.click(); }}>Elegir de galería</button>
              </div>
            )}
          </div>
          <button type="button" onClick={startRecording}
            disabled={isRecording || isRequestingAudio || isProcessingAudio || isProcessingImage || isCameraOpen || isTyping || !!pending || !activeProfile}
            aria-label="Iniciar dictado por voz"
            className={`chat-audio-button flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 ${isRecording ? 'chat-audio-recording' : ''}`}>
            <Microphone size={20} weight="fill" />
          </button>
          <button
            type="submit"
            disabled={(!inputValue.trim() && !pendingImage) || isTyping || isRequestingAudio || isRecording || isProcessingAudio || isProcessingImage || isCameraOpen || !!pending || !activeProfile}
            aria-label="Enviar mensaje"
            className="p-2 bg-[#f5a064] hover:bg-[#f8b17f] disabled:bg-slate-300 dark:disabled:bg-[#34383b] text-white rounded-xl transition-colors flex items-center justify-center"
          >
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </form>
      </div>}
      {isCameraOpen && createPortal(
        <div className="chat-camera-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
          <div className="chat-camera-panel w-full max-w-lg rounded-3xl p-4" role="dialog" aria-modal="true" aria-label="Tomar foto">
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
          </div>
        </div>, document.body
      )}
      <div className="chat-scroll-end" aria-hidden="true" />
      
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
