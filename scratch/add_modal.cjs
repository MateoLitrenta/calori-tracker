const fs = require('fs');
let txt = fs.readFileSync('src/components/DailyPanel.tsx', 'utf8');

txt = txt.replace(
  "setActiveTab('comida');",
  "setActiveTab(null);"
);
txt = txt.replace(
  "setActiveTab('entrenamiento');",
  "setActiveTab(null);"
);

const editModals = `
      {/* Edit Modal para Comidas */}
      {editingMealId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-github-card border border-github-border w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-github-border flex justify-between items-center bg-[#21262d]">
              <h3 className="font-bold text-lg text-white">Editar Comida</h3>
              <button 
                type="button"
                onClick={() => resetForms()}
                className="text-github-muted hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddMeal} className="p-4 flex flex-col gap-4">
              <div className="flex gap-4 flex-wrap">
                <input 
                  required
                  type="text"
                  inputMode="text"
                  placeholder="Descripción (ej: Ensalada)" 
                  value={mealName} onChange={e => setMealName(e.target.value)}
                  className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <select 
                  value={mealType} onChange={e => setMealType(e.target.value as any)}
                  className="bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="Desayuno">Desayuno</option>
                  <option value="Almuerzo">Almuerzo</option>
                  <option value="Merienda">Merienda</option>
                  <option value="Cena">Cena</option>
                  <option value="Snack">Snack</option>
                </select>
                <input 
                  required
                  type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal" 
                  value={mealCals} onChange={e => setMealCals(Number(e.target.value))}
                  className="w-24 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 flex items-center gap-2">
                  <input 
                    type="time" 
                    value={mealTime} 
                    onChange={e => setMealTime(e.target.value)}
                    className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button 
                    type="button"
                    onClick={() => setMealTime(new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'}))}
                    className="p-2 bg-github-bg border border-github-border rounded-md hover:bg-github-border text-github-muted hover:text-white transition-colors"
                    title="Hora actual"
                  >
                    <Clock size={16} />
                  </button>
                </div>
                <input 
                  type="text"
                  placeholder="Notas / Detalles (opcional)" 
                  value={mealDetails} onChange={e => setMealDetails(e.target.value)}
                  className="flex-[2] bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end border-t border-github-border pt-4 mt-2">
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2">
                  <Check weight="bold" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal para Entrenamiento */}
      {editingWorkoutId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-github-card border border-github-border w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-github-border flex justify-between items-center bg-[#21262d]">
              <h3 className="font-bold text-lg text-white">Editar Entrenamiento</h3>
              <button 
                type="button"
                onClick={() => resetForms()}
                className="text-github-muted hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddWorkout} className="p-4 flex flex-col gap-4">
              <div className="flex gap-4 flex-wrap">
                <input 
                  required
                  type="text"
                  placeholder="Actividad (ej: Correr)" 
                  value={workActivity} onChange={e => setWorkActivity(e.target.value)}
                  className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <input 
                  required
                  type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Minutos" 
                  value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
                  className="w-24 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <input 
                  required
                  type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal" 
                  value={workCals} onChange={e => setWorkCals(Number(e.target.value))}
                  className="w-24 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 flex items-center gap-2">
                  <input 
                    type="time" 
                    value={workTime} 
                    onChange={e => setWorkTime(e.target.value)}
                    className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button 
                    type="button"
                    onClick={() => setWorkTime(new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'}))}
                    className="p-2 bg-github-bg border border-github-border rounded-md hover:bg-github-border text-github-muted hover:text-white transition-colors"
                    title="Hora actual"
                  >
                    <Clock size={16} />
                  </button>
                </div>
                <input 
                  type="text"
                  placeholder="Notas / Detalles (opcional)" 
                  value={workDetails} onChange={e => setWorkDetails(e.target.value)}
                  className="flex-[2] bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex gap-4">
                <input 
                  type="number" step="0.1" inputMode="decimal" placeholder="Distancia (km) opcional" 
                  value={workDistance} onChange={e => setWorkDistance(Number(e.target.value))}
                  className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <input 
                  type="text" placeholder="Ritmo (min/km) opcional" 
                  value={workPace} onChange={e => setWorkPace(e.target.value)}
                  className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end border-t border-github-border pt-4 mt-2">
                <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2">
                  <Check weight="bold" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
`;

txt = txt.replace(
  /<\/div>[\s]*\);[\s]*};/s,
  editModals + "\\n    </div>\\n  );\\n};"
);

txt = txt.replace(
  "{editingMealId ? 'Guardar Cambios' : 'Guardar'}",
  "Guardar"
);
txt = txt.replace(
  "{editingWorkoutId ? 'Guardar Cambios' : 'Guardar'}",
  "Guardar"
);

fs.writeFileSync('src/components/DailyPanel.tsx', txt);
