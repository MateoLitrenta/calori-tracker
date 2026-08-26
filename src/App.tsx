import { useState } from 'react';
import Heatmap from './components/Heatmap';
import DailyPanel from './components/DailyPanel';
import SettingsModal from './components/SettingsModal';
import { Fire, Gear, PlusCircle } from '@phosphor-icons/react';
import { useAppStore } from './hooks/useAppStore';
import { formatDateStr, calculateBMR, generateUUID } from './utils/helpers';
import type { UserProfile } from './types';

function App() {
  const {
    profiles,
    activeProfile,
    switchProfile,
    updateProfile,
    createProfile,
    updateRecord,
    loadMockData,
    resetData
  } = useAppStore();

  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateStr(new Date()));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleCreateProfile = () => {
    const newProfile: UserProfile = {
      id: generateUUID(),
      name: `Nuevo Usuario`,
      age: 25,
      sex: 'Masculino',
      height: 175,
      weight: 70,
      goal: 'Mantenimiento',
      records: {}
    };
    createProfile(newProfile);
    setIsSettingsOpen(true);
  };

  const handleSaveProfile = (profile: UserProfile) => {
    updateProfile(profile);
    setIsSettingsOpen(false);
  };

  const handleLoadMock = () => {
    loadMockData();
    setIsSettingsOpen(false);
  };

  const handleReset = () => {
    resetData();
    setIsSettingsOpen(false);
  };

  const currentBMR = calculateBMR(activeProfile);

  return (
    <div className="min-h-screen bg-github-bg text-github-text p-4 md:p-8 flex flex-col items-center">
      
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
          <select 
            value={activeProfile.id}
            onChange={(e) => switchProfile(e.target.value)}
            className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 max-w-[150px]"
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button 
            onClick={handleCreateProfile}
            className="p-2 bg-github-card hover:bg-github-border border border-github-border rounded-md transition-colors text-github-muted hover:text-white"
            title="Crear nuevo perfil"
          >
            <PlusCircle size={20} />
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-github-card hover:bg-github-border border border-github-border rounded-md transition-colors text-github-muted hover:text-white"
            title="Ajustes de Perfil"
          >
            <Gear size={20} />
          </button>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-6">
        <Heatmap 
          records={activeProfile.records} 
          selectedDateStr={selectedDateStr}
          onSelectDate={setSelectedDateStr}
          currentBMR={currentBMR}
        />
        
        <DailyPanel 
          record={activeProfile.records[selectedDateStr]}
          dateStr={selectedDateStr}
          onUpdateRecord={updateRecord}
          currentBMR={currentBMR}
        />
      </main>

      {isSettingsOpen && (
        <SettingsModal
          profile={activeProfile}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveProfile}
          onLoadMock={handleLoadMock}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

export default App;
