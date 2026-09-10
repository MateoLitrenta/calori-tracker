import { useState, useRef, useEffect } from 'react';
import { PaperPlaneRight, Robot, User } from '@phosphor-icons/react';
import { useAppStore } from '../hooks/useAppStore';
import { calculateBMR, formatDateStr } from '../utils/helpers';
import { generateAIResponse, type ChatMessage } from '../services/aiService';
import toast from 'react-hot-toast';

interface Message extends ChatMessage {
  id: string;
}

const QUICK_SUGGESTIONS = [
  "Sugerir snack de 200 kcal",
  "Ajustar mis macros",
  "¿Cómo voy hoy?"
];

export default function ChatView() {
  const { activeProfile } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'bot',
      text: '¡Hola! Soy tu asistente nutricional. ¿En qué puedo ayudarte a mejorar tu alimentación hoy?'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
    if (!text.trim() || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInputValue('');
    setIsTyping(true);

    try {
      // Build Dynamic Context
      const todayStr = formatDateStr(new Date());
      const todayRecord = activeProfile?.records?.[todayStr];
      const ingested = todayRecord?.meals.reduce((acc, m) => acc + m.calories, 0) || 0;
      
      const bmr = activeProfile ? calculateBMR(activeProfile) : 2000;
      let adjustedTarget = bmr;
      if (activeProfile?.goal === 'Déficit') adjustedTarget -= 400;
      if (activeProfile?.goal === 'Superávit') adjustedTarget += 400;

      const systemPrompt = `Eres el asistente nutricional de la app Calori Tracker. Tu usuario actual se llama ${activeProfile?.name || 'Usuario'}, pesa ${activeProfile?.weight || 70}kg, tiene un objetivo de ${activeProfile?.goal || 'Mantenimiento'} con una meta diaria de ${adjustedTarget} kcal. Hoy ha consumido ${ingested} kcal. Sé conciso, directo, motivador, siempre en español y enfócate estrictamente en nutrición, salud y entrenamiento. No des explicaciones médicas complejas, sino consejos accionables.`;

      const replyText = await generateAIResponse(newHistory, systemPrompt);
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: replyText
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      toast.error('Error al contactar al asistente.');
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'bot',
        text: '❌ Ha ocurrido un error al intentar conectarme al servidor de IA.'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-3xl mx-auto bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-[#0f141c] flex items-center gap-3">
        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
          <Robot size={24} weight="fill" />
        </div>
        <div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-white">Asistente Calori</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400">Siempre activo para ayudarte</p>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-200 dark:bg-gray-800">
              {msg.role === 'user' ? (
                <User size={16} className="text-slate-600 dark:text-gray-300" weight="fill" />
              ) : (
                <Robot size={16} className="text-orange-600 dark:text-orange-400" weight="fill" />
              )}
            </div>
            <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-sm' 
                : 'bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-gray-100 rounded-tl-sm border border-slate-200 dark:border-gray-800'
            }`}>
              {msg.text}
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
          {QUICK_SUGGESTIONS.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSend(suggestion)}
              disabled={isTyping}
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
            disabled={isTyping}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-white dark:bg-[#161b22] border border-slate-300 dark:border-gray-700 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 shadow-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping}
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
