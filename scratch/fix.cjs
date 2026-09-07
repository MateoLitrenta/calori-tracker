const fs = require('fs');
let txt = fs.readFileSync('src/components/DailyPanel.tsx', 'utf8');

txt = txt.replace(
  "onClick={() => setActiveTab(activeTab === 'comida' ? null : 'comida')}", 
  "onClick={() => handleTabToggle('comida')}"
);
txt = txt.replace(
  "onClick={() => setActiveTab(activeTab === 'entrenamiento' ? null : 'entrenamiento')}", 
  "onClick={() => handleTabToggle('entrenamiento')}"
);
txt = txt.replace(
  "onClick={() => setActiveTab(activeTab === 'pasos-agua' ? null : 'pasos-agua')}", 
  "onClick={() => handleTabToggle('pasos-agua')}"
);

// We need to replace the first two "Guardar" buttons
let count = 0;
txt = txt.replace(/<Check weight="bold" \/> Guardar/g, (match) => {
  count++;
  if (count === 1) return '<Check weight="bold" /> {editingMealId ? "Guardar Cambios" : "Guardar"}';
  if (count === 2) return '<Check weight="bold" /> {editingWorkoutId ? "Guardar Cambios" : "Guardar"}';
  return match;
});

const topEffect = `  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (tabContainerRef.current && !tabContainerRef.current.contains(event.target as Node)) {
        setActiveTab(null);
      }
    };
    if (activeTab) {
      document.addEventListener('click', handleClickOutside as EventListener);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside as EventListener);
    };
  }, [activeTab]);`;

txt = txt.replace(topEffect, '');

const resetForms = `  const resetForms = () => {
    setEditingMealId(null);
    setMealName('');
    setMealCals('');
    setMealDetails('');
    setMealTime('');
    
    setEditingWorkoutId(null);
    setWorkActivity('');
    setWorkDuration('');
    setWorkCals('');
    setWorkDetails('');
    setWorkDistance('');
    setWorkPace('');
    setWorkTime('');
  };

  const handleTabToggle = (tab) => {
    if (activeTab === tab) {
      setActiveTab(null);
      resetForms();
    } else {
      setActiveTab(tab);
      resetForms();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tabContainerRef.current && !tabContainerRef.current.contains(event.target)) {
        setActiveTab(null);
        resetForms();
      }
    };
    if (activeTab) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [activeTab]);`;

txt = txt.replace(
  "const [localSteps, setLocalSteps] = useState(currentRecord.steps === 0 ? '' : String(currentRecord.steps));",
  resetForms + "\\n\\n  const [localSteps, setLocalSteps] = useState(currentRecord.steps === 0 ? '' : String(currentRecord.steps));"
);

fs.writeFileSync('src/components/DailyPanel.tsx', txt);
