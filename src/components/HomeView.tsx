import { useState } from 'react';
import Heatmap from './Heatmap';
import DailyPanel from './DailyPanel';
import type { UserProfile } from '../types';
import type { RecordWriter } from '../lib/recordFeedback';
import type { HabitDraftController } from '../lib/habitDraft';
import { formatDateStr } from '../utils/helpers';
import './HomeVariants.css';

export default function HomeView({ activeProfile, updateRecord, habitDrafts }: {
  activeProfile: UserProfile;
  updateRecord: RecordWriter;
  habitDrafts?: HabitDraftController | null;
}) {
  // Only a deliberate day selection changes the daily summary and record writer.
  const [selectedDateStr, setSelectedDateStr] = useState(() => formatDateStr(new Date()));
  const records = activeProfile.records || {};

  return (
    <div className="home-variants dark flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <DailyPanel
        record={records[selectedDateStr]}
        dateStr={selectedDateStr}
        onUpdateRecord={updateRecord}
        profile={activeProfile}
        records={records}
        habitDrafts={habitDrafts}
      />
      <Heatmap
        records={records}
        selectedDateStr={selectedDateStr}
        onSelectDate={setSelectedDateStr}
        profile={activeProfile}
      />
    </div>
  );
}
