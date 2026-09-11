import { useState, useRef, useEffect } from 'react';
import { PaperPlaneRight, Robot, User } from '@phosphor-icons/react';
import { useAppStore } from '../hooks/useAppStore';
import { buildDailyEnergyContext, formatDateStr, calculateDailyCalorieTarget, getRemainingCalories, generateUUID } from '../utils/helpers';
import type { UserProfile, DailyRecord, MealType } from '../types';
import { generateAIResponse, validActions, type DataAction, type ChatMessage } from '../services/aiService';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

interface Message extends ChatMessage {
  id: string;
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

export default function ChatView() {
  const { user, activeProfile, updateRecord } = useAppStore();
  if (!user) return null;
  return <UserChat key={user.id} userId={user.id} activeProfile={activeProfile} updateRecord={updateRecord} />;
}

function UserChat({ userId, activeProfile, updateRecord }: {
  userId: string; activeProfile: UserProfile | null;
  updateRecord: (dateStr: string, record: DailyRecord) => Promise<boolean>;
}) {
  const storageKey = `calori:assistant:messages:${userId}`;
  const [messages, setMessages] = useState<Message[]>(() => readHistory(storageKey));
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const [pending, setPending] = useState<{ dateStr: string; actions: DataAction[] } | null>(null);

  const appendReply = (text: string) => {
    if (mounted.current) setMessages(prev => [...prev, { id: generateUUID(), role: 'bot', text }]);
  };

  const describeAction = (a: DataAction) => {
    const p = a.payload;
    switch (a.type) {
      case 'add_meal': return `${p.name} · ${p.type} · ${p.calories} kcal`;
      case 'add_workout': return `${p.activity} · ${p.duration} min · ${p.calories} kcal`;
      case 'set_steps': return `${p.steps} pasos (total)`;
      case 'add_water': return `+${p.water} ml de agua`;
      case 'set_weight': return `${p.weight} kg de peso de hoy`;
    }
  };

  const applyActions = async (actions: DataAction[], dateStr: string) => {
    if (!mounted.current || !activeProfile || dateStr !== formatDateStr(new Date())) {
      throw new Error('La fecha cambió. Pedime registrar los datos de hoy nuevamente.');
    }
    const base = activeProfile.records[dateStr] || {
      dateStr, date: new Date(), meals: [], workouts: [], steps: 0, water: 0,
    };
    const record: DailyRecord = { ...base, meals: [...base.meals], workouts: [...base.workouts] };
    for (const a of actions) {
      const p = a.payload;
      switch (a.type) {
        case 'add_meal':
          record.meals.push({ id: generateUUID(), name: p.name as string,
            type: p.type as MealType, calories: p.calories as number }); break;
        case 'add_workout':
          record.workouts.push({ id: generateUUID(), activity: p.activity as string,
            duration: p.duration as number, calories: p.calories as number, muscles: [] }); break;
        case 'set_steps': record.steps = p.steps as number; break;
        case 'add_water': record.water += p.water as number; break;
        case 'set_weight': record.weight = p.weight as number; break;
      }
    }
    if (!await updateRecord(dateStr, record)) {
      throw new Error('No se pudo completar el guardado. Revisá los registros de hoy antes de reintentar.');
    }
    appendReply(`Registrado hoy: ${actions.map(describeAction).join('; ')}.`);
  };

  const confirmActions = async () => {
    if (!pending || busy.current) return;
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
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    try {
      if (messages.length) localStorage.setItem(storageKey, JSON.stringify(messages));
      else localStorage.removeItem(storageKey);
    } catch {
      toast.error('No se pudo guardar la conversación en este dispositivo.');
    }
  }, [messages, storageKey]);

  const todayRecord = activeProfile?.records[formatDateStr(new Date())];
  const remaining = activeProfile
    ? getRemainingCalories(todayRecord, calculateDailyCalorieTarget(activeProfile, todayRecord)) : 0;
  const suggestions = [
    'Analizá mi día',
    '¿Estoy cumpliendo mi objetivo?',
    !todayRecord?.meals.length ? 'Ayudame a planear mis comidas de hoy'
      : remaining > 0 ? `¿Qué puedo comer con ~${remaining.toLocaleString('es-AR')} kcal?`
        : 'Ayudame a planear mis comidas de mañana',
  ];

  const startConversation = () => {
    if (busy.current) return;
    try {
      localStorage.removeItem(storageKey);
      setMessages([]);
      setInputValue('');
      setPending(null);
    } catch {
      toast.error('No se pudo borrar la conversación local.');
    }
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (text: string) => {
    if (!text.trim() || busy.current || pending || !activeProfile) return;
    busy.current = true;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInputValue('');
    setIsTyping(true);

    try {
      // Build Dynamic Context
      const todayStr = formatDateStr(new Date());
      const todayRecord = activeProfile?.records?.[todayStr];
      if (!activeProfile) throw new Error('Esperá a que se cargue tu perfil para consultar al asistente.');
      const systemPrompt = `Eres el asistente nutricional de la app Calori Tracker.
${buildDailyEnergyContext(activeProfile, todayRecord)}
HOY: ${todayStr}.
Perfil: ${JSON.stringify({ name: activeProfile.name, age: activeProfile.age, sex: activeProfile.sex,
  height: activeProfile.height, weight: activeProfile.weight, goal: activeProfile.goal,
  activity: activeProfile.activity || 'Sedentario' })}.
Registros de HOY: ${JSON.stringify({ meals: todayRecord?.meals || [], workouts: todayRecord?.workouts || [],
  steps: todayRecord?.steps || 0, water: todayRecord?.water || 0, weight: todayRecord?.weight ?? null })}.
Sé conciso, directo, motivador, siempre en español y enfócate estrictamente en nutrición, salud y entrenamiento. No des explicaciones médicas complejas, sino consejos accionables.`;

      const response = await generateAIResponse(newHistory, systemPrompt);
      if (!mounted.current) return;
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: response.reply
      };
      setMessages(prev => [...prev, botMsg]);
      const actions = validActions(response.actions, todayStr);
      const proposals = actions.filter(a => a.type === 'add_meal' || a.type === 'add_workout');
      const direct = actions.filter(a => a.type !== 'add_meal' && a.type !== 'add_workout');
      if (direct.length) await applyActions(direct, todayStr);
      if (mounted.current && proposals.length) setPending({ dateStr: todayStr, actions: proposals });
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

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-3xl mx-auto bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-[#0f141c] flex flex-wrap items-center gap-3">
        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
          <Robot size={24} weight="fill" />
        </div>
        <div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">Asistente Calori</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400">Siempre activo para ayudarte</p>
        </div>
        <button type="button" onClick={startConversation} disabled={isTyping}
          className="ml-auto text-xs font-medium text-slate-500 dark:text-gray-400 hover:text-orange-500 disabled:opacity-50">
          Nueva conversación
        </button>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        {pending && (
          <div className="order-last rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20 p-4 text-sm">
            <p className="font-semibold mb-2">Confirmar registros de hoy</p>
            {pending.actions.map((action, index) => (
              <p key={index}>{describeAction(action)}{action.estimated ? ' (estimado)' : ''}</p>
            ))}
            <div className="flex gap-3 mt-3">
              <button type="button" disabled={isTyping} onClick={confirmActions}
                className="rounded-lg bg-blue-600 text-white px-3 py-2 disabled:opacity-50">Confirmar</button>
              <button type="button" disabled={isTyping} onClick={() => { setPending(null); appendReply('Registro cancelado.'); }}
                className="rounded-lg border border-slate-300 dark:border-gray-700 px-3 py-2">Cancelar</button>
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <div className="my-auto py-8 text-center">
            <h3 className="text-lg font-semibold">¿En qué te puedo ayudar hoy?</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
              Tengo en cuenta tus comidas, pasos, entrenamiento y objetivo.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-200 dark:bg-gray-800">
              {msg.role === 'user' ? (
                <User size={16} className="text-slate-600 dark:text-gray-300" weight="fill" />
              ) : (
                <Robot size={16} className="text-orange-600 dark:text-orange-400" weight="fill" />
              )}
            </div>
            <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-sm whitespace-pre-wrap' 
                : 'bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-gray-100 rounded-tl-sm border border-slate-200 dark:border-gray-800'
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
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-200 dark:bg-gray-800">
              <Robot size={16} className="text-orange-600 dark:text-orange-400" weight="fill" />
            </div>
            <div className="px-4 py-4 rounded-2xl bg-slate-100 dark:bg-[#0d1117] rounded-tl-sm border border-slate-200 dark:border-gray-800 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-[#0f141c]">
        {/* Quick Suggestions */}
        <div className="flex overflow-x-auto gap-2 pb-3 mb-2 hide-scrollbar">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSend(suggestion)}
              disabled={isTyping || !!pending || !activeProfile}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:border-orange-500 hover:text-orange-500 dark:hover:border-orange-500 dark:hover:text-orange-400 disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
          className="flex gap-2 relative"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isTyping || !!pending || !activeProfile}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-white dark:bg-[#161b22] border border-slate-300 dark:border-gray-700 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 shadow-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping || !!pending || !activeProfile}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center"
          >
            <PaperPlaneRight size={18} weight="fill" />
          </button>
        </form>
      </div>
      
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
