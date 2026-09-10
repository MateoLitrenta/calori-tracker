import { useState } from 'react';
import Heatmap from './components/Heatmap';
import DailyPanel from './components/DailyPanel';
import SettingsModal from './components/SettingsModal';
import AuthModal from './components/AuthModal';
import ThemeToggle from './components/ThemeToggle';
import BottomNav from './components/BottomNav';
import type { Tab } from './components/BottomNav';
import { Fire, Gear, SignOut, SignIn, House, ChatCircle, ChartBar, User } from '@phosphor-icons/react';
import { useAppStore } from './hooks/useAppStore';
import { formatDateStr, calculateBMR } from './utils/helpers';
import type { UserProfile } from './types';
import toast, { Toaster } from 'react-hot-toast';

function App() {
  const {
    user,
    activeProfile,
    updateProfile,
    updateRecord,
    resetData,
    signOut
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateStr(new Date()));
  const [selectedGroup, setSelectedGroup] = useState<{type: 'day'|'week'|'month'|'year', label: string, dates: string[]} | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const handleSaveProfile = async (profile: UserProfile) => {
    try {
      await updateProfile(profile);
      setIsSettingsOpen(false);
      toast.success('Perfil actualizado correctamente', { style: { background: '#161b22', color: '#fff' } });
    } catch (e) {
      toast.error('Error al actualizar el perfil', { style: { background: '#161b22', color: '#fff' } });
    }
  };

  const handleReset = () => {
    resetData();
    setIsSettingsOpen(false);
    toast.success('Datos reiniciados correctamente', { style: { background: '#161b22', color: '#fff' } });
  };

  const currentBMR = activeProfile ? calculateBMR(activeProfile) : 2000;
  const records = activeProfile?.records || {};

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0f141c] text-slate-900 dark:text-white p-4 pb-24 md:p-8 flex flex-col items-center">
      <Toaster position="bottom-right" />
      <header className="w-full max-w-4xl mb-8 flex items-center justify-between gap-3 relative">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-200 dark:bg-gray-800 rounded-lg">
            <Fire size={32} weight="fill" className="text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Calori Tracker</h1>
            <p className="text-slate-500 dark:text-gray-400 text-sm hidden sm:block">Monitorea tu balance calórico diario</p>
          </div>
        </div>

        {/* Desktop Nav */}
        {user && (
          <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
            <button onClick={() => setActiveTab('home')} className={`flex items-center gap-2 font-medium transition-colors ${activeTab === 'home' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'}`}>
              <House size={20} weight={activeTab === 'home' ? 'fill' : 'regular'} /> Inicio
            </button>
            <button onClick={() => setActiveTab('chat')} className={`flex items-center gap-2 font-medium transition-colors ${activeTab === 'chat' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'}`}>
              <ChatCircle size={20} weight={activeTab === 'chat' ? 'fill' : 'regular'} /> Asistente
            </button>
            <button onClick={() => setActiveTab('charts')} className={`flex items-center gap-2 font-medium transition-colors ${activeTab === 'charts' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'}`}>
              <ChartBar size={20} weight={activeTab === 'charts' ? 'fill' : 'regular'} /> Gráficos
            </button>
            <button onClick={() => setActiveTab('profile')} className={`flex items-center gap-2 font-medium transition-colors ${activeTab === 'profile' ? 'text-orange-500' : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'}`}>
              <User size={20} weight={activeTab === 'profile' ? 'fill' : 'regular'} /> Perfil
            </button>
          </nav>
        )}

        <div className="flex items-center gap-3 z-10">
          <ThemeToggle />
          {!user ? (
            <button 
              onClick={() => setIsAuthOpen(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium text-sm transition-colors flex items-center gap-2 shadow-sm"
            >
              <SignIn size={18} />
              Ingresar / Registrarse
            </button>
          ) : (
            <>
              <span className="text-sm font-semibold text-slate-500 dark:text-gray-400 hidden sm:inline-block">
                {activeProfile?.name || user.email}
              </span>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 bg-white dark:bg-[#161b22] hover:bg-slate-200 dark:hover:bg-gray-800 border border-slate-200 dark:border-gray-800 rounded-md transition-colors text-slate-500 dark:text-gray-400 hover:text-white"
                title="Ajustes de Perfil"
              >
                <Gear size={20} />
              </button>
              <button 
                onClick={signOut}
                className="p-2 bg-white dark:bg-[#161b22] hover:bg-red-900/50 border border-slate-200 dark:border-gray-800 hover:border-red-900 rounded-md transition-colors text-slate-500 dark:text-gray-400 hover:text-red-400"
                title="Cerrar Sesión"
              >
                <SignOut size={20} />
              </button>
            </>
          )}
        </div>
      </header>

      <main className={`w-full max-w-4xl flex-1 flex flex-col gap-6 transition-all duration-300 ${!user ? 'opacity-40 pointer-events-none blur-[2px] select-none' : ''}`}>
        {activeTab === 'home' && (
          <>
            <Heatmap 
              records={records} 
              selectedDateStr={selectedDateStr}
              onSelectDate={(dateStr) => {
                setSelectedDateStr(dateStr);
                setSelectedGroup({ type: 'day', label: dateStr, dates: [dateStr] });
              }}
              onSelectGroup={(type, label, dates) => setSelectedGroup({ type, label, dates })}
              currentBMR={currentBMR}
            />
            
            <DailyPanel 
              record={records[selectedDateStr]}
              dateStr={selectedDateStr}
              onUpdateRecord={updateRecord}
              currentBMR={currentBMR}
              selectedGroup={selectedGroup}
              records={records}
            />
          </>
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-2xl animate-in fade-in zoom-in-95">
            <ChatCircle size={48} className="text-slate-300 dark:text-gray-700 mb-4" />
            <h2 className="text-2xl font-bold text-slate-700 dark:text-gray-300">Chat & Asistente</h2>
            <p className="text-slate-500 dark:text-gray-400 mt-2">Próximamente podrás interactuar con IA sobre tu progreso.</p>
          </div>
        )}

        {activeTab === 'charts' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-2xl animate-in fade-in zoom-in-95">
            <ChartBar size={48} className="text-slate-300 dark:text-gray-700 mb-4" />
            <h2 className="text-2xl font-bold text-slate-700 dark:text-gray-300">Gráficos y Estadísticas</h2>
            <p className="text-slate-500 dark:text-gray-400 mt-2">Análisis detallados de tu evolución en el tiempo.</p>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-2xl animate-in fade-in zoom-in-95">
            <User size={48} className="text-slate-300 dark:text-gray-700 mb-4" />
            <h2 className="text-2xl font-bold text-slate-700 dark:text-gray-300">Perfil y Ajustes</h2>
            <p className="text-slate-500 dark:text-gray-400 mt-2">Configura tus preferencias y objetivos.</p>
          </div>
        )}
      </main>

      {user && (
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      {isSettingsOpen && (
        <SettingsModal
          profile={activeProfile}
          userEmail={user?.email}
          userId={user?.id}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveProfile}
          onReset={handleReset}
        />
      )}

      {isAuthOpen && (
        <AuthModal onClose={() => setIsAuthOpen(false)} />
      )}
    </div>
  );
}

export default App;
