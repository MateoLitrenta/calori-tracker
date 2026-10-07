import { useState, useEffect } from 'react';
import Heatmap from './Heatmap';
import DailyPanel from './DailyPanel';
import type { UserProfile, DailyRecord } from '../types';
import { formatDateStr } from '../utils/helpers';
import './HomeVariants.css';

export default function HomeView({ activeProfile, updateRecord }: {
  activeProfile: UserProfile;
  updateRecord: (dateStr: string, record: DailyRecord) => Promise<boolean>;
}) {
  
  const [selectedDateStr, setSelectedDateStr] = useState<string>(formatDateStr(new Date()));
  const [selectedGroup, setSelectedGroup] = useState<{type: 'day'|'week'|'month'|'year', label: string, dates: string[]} | null>(null);

  // Auto-select today on mount if no group is selected
  useEffect(() => {
    if (!selectedGroup) {
      setSelectedGroup({ type: 'day', label: selectedDateStr, dates: [selectedDateStr] });
    }
  }, [selectedDateStr, selectedGroup]);

  const records = activeProfile?.records || {};

  return (
    <div className="home-variants dark flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <DailyPanel
        record={records[selectedDateStr]}
        dateStr={selectedDateStr}
        onUpdateRecord={updateRecord}
        profile={activeProfile}
        selectedGroup={selectedGroup}
        records={records}
      />
      <Heatmap 
        records={records} 
        selectedDateStr={selectedDateStr}
        selectedGroup={selectedGroup}
        onSelectDate={(dateStr) => {
          setSelectedDateStr(dateStr);
          setSelectedGroup({ type: 'day', label: dateStr, dates: [dateStr] });
        }}
        onSelectGroup={(type, label, dates) => setSelectedGroup({ type, label, dates })}
        profile={activeProfile}
      />
    </div>
  );
}
