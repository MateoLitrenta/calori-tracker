import { useState, useEffect } from 'react';
import Heatmap from './Heatmap';
import DailyPanel from './DailyPanel';
import { useAppStore } from '../hooks/useAppStore';
import { formatDateStr } from '../utils/helpers';

export default function HomeView() {
  const { activeProfile, updateRecord } = useAppStore();
  
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateStr(new Date()));
  const [selectedGroup, setSelectedGroup] = useState<{type: 'day'|'week'|'month'|'year', label: string, dates: string[]} | null>(null);

  // Auto-select today on mount if no group is selected
  useEffect(() => {
    if (!selectedGroup) {
      setSelectedGroup({ type: 'day', label: selectedDateStr, dates: [selectedDateStr] });
    }
  }, [selectedDateStr, selectedGroup]);

  const records = activeProfile?.records || {};

  if (!activeProfile) return <p className="text-slate-500 dark:text-gray-400">Cargando perfil…</p>;

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <Heatmap 
        records={records} 
        selectedDateStr={selectedDateStr}
        onSelectDate={(dateStr) => {
          setSelectedDateStr(dateStr);
          setSelectedGroup({ type: 'day', label: dateStr, dates: [dateStr] });
        }}
        onSelectGroup={(type, label, dates) => setSelectedGroup({ type, label, dates })}
        profile={activeProfile}
      />
      
      <DailyPanel 
        record={records[selectedDateStr]}
        dateStr={selectedDateStr}
        onUpdateRecord={updateRecord}
        profile={activeProfile}
        selectedGroup={selectedGroup}
        records={records}
      />
    </div>
  );
}
