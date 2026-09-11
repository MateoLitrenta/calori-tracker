import { useState, useRef, useEffect } from 'react';
import { PaperPlaneRight, Robot, User } from '@phosphor-icons/react';
import { useAppStore } from '../hooks/useAppStore';
import { buildDailyEnergyContext, formatDateStr, calculateDailyCalorieTarget, getRemainingCalories } from '../utils/helpers';
import type { UserProfile } from '../types';
import { generateAIResponse, type ChatMessage } from '../services/aiService';
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
  const { user, activeProfile } = useAppStore();
  if (!user) return null;
  return <UserChat key={user.id} userId={user.id} activeProfile={activeProfile} />;
}

function UserChat({ userId, activeProfile }: { userId: string; activeProfile: UserProfile | null }) {
  const storageKey = `calori:assistant:messages:${userId}`;
  const [messages, setMessages] = useState<Message[]>(() => readHistory(storageKey));
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

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
    if (isTyping) return;
    try {
      localStorage.removeItem(storageKey);
      setMessages([]);
      setInputValue('');
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
    if (!text.trim() || isTyping || !activeProfile) return;

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
Solo puedes conversar y leer este contexto. No puedes registrar, modificar ni borrar comidas, ejercicios, pasos, agua, peso ni ningún dato de la app. No afirmes haber realizado esas acciones.
Sé conciso, directo, motivador, siempre en español y enfócate estrictamente en nutrición, salud y entrenamiento. No des explicaciones médicas complejas, sino consejos accionables.`;

      const replyText = await generateAIResponse(newHistory, systemPrompt);
      if (!mounted.current) return;
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: replyText
      };
      setMessages(prev => [...prev, botMsg]);
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
              disabled={isTyping || !activeProfile}
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
            disabled={isTyping || !activeProfile}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-white dark:bg-[#161b22] border border-slate-300 dark:border-gray-700 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 shadow-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping || !activeProfile}
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
