import { useState } from 'react';
import Heatmap from './components/Heatmap';
import DailyPanel from './components/DailyPanel';
import SettingsModal from './components/SettingsModal';
import AuthModal from './components/AuthModal';
import { Fire, Gear, SignOut, SignIn } from '@phosphor-icons/react';
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

  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateStr(new Date()));
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
    <div className="min-h-screen bg-github-bg text-github-text p-4 md:p-8 flex flex-col items-center">
      <Toaster position="bottom-right" />
      <header className="w-full max-w-4xl mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-github-border rounded-lg">
            <Fire size={32} weight="fill" className="text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Calori Tracker</h1>
            <p className="text-github-muted text-sm hidden sm:block">Monitorea tu balance calórico diario</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
              <span className="text-sm font-semibold text-github-muted hidden sm:inline-block">
                {activeProfile?.name || user.email}
              </span>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 bg-github-card hover:bg-github-border border border-github-border rounded-md transition-colors text-github-muted hover:text-white"
                title="Ajustes de Perfil"
              >
                <Gear size={20} />
              </button>
              <button 
                onClick={signOut}
                className="p-2 bg-github-card hover:bg-red-900/50 border border-github-border hover:border-red-900 rounded-md transition-colors text-github-muted hover:text-red-400"
                title="Cerrar Sesión"
              >
                <SignOut size={20} />
              </button>
            </>
          )}
        </div>
      </header>

      <main className={`w-full max-w-4xl flex flex-col gap-6 transition-all duration-300 ${!user ? 'opacity-40 pointer-events-none blur-[2px] select-none' : ''}`}>
        <Heatmap 
          records={records} 
          selectedDateStr={selectedDateStr}
          onSelectDate={setSelectedDateStr}
          currentBMR={currentBMR}
        />
        
        <DailyPanel 
          record={records[selectedDateStr]}
          dateStr={selectedDateStr}
          onUpdateRecord={updateRecord}
          currentBMR={currentBMR}
        />
      </main>

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
