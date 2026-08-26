import React, { useState } from 'react';
import { X, User, FloppyDisk, Warning } from '@phosphor-icons/react';
import type { UserProfile } from '../types';

interface SettingsModalProps {
  profile: UserProfile;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
  onLoadMock: () => void;
  onReset: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ profile, onClose, onSave, onLoadMock, onReset }) => {
  const [formData, setFormData] = useState<UserProfile>({ ...profile });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'age' || name === 'height' || name === 'weight' ? Number(value) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-github-card border border-github-border w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        
        <div className="flex justify-between items-center p-4 border-b border-github-border bg-[#21262d]">
          <h2 className="text-xl font-bold flex items-center gap-2"><User /> Configuración de Perfil</h2>
          <button onClick={onClose} className="text-github-muted hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <form id="profile-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-github-muted mb-1">Nombre</label>
              <input required name="name" value={formData.name} onChange={handleChange} className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 focus:outline-none focus:border-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-github-muted mb-1">Edad</label>
                <input required type="number" min="1" name="age" value={formData.age} onChange={handleChange} className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-github-muted mb-1">Sexo</label>
                <select name="sex" value={formData.sex} onChange={handleChange} className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 focus:outline-none focus:border-blue-500">
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-github-muted mb-1">Estatura (cm)</label>
                <input required type="number" min="50" name="height" value={formData.height} onChange={handleChange} className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-github-muted mb-1">Peso (kg)</label>
                <input required type="number" min="20" name="weight" value={formData.weight} onChange={handleChange} className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-github-muted mb-1">Objetivo</label>
              <select name="goal" value={formData.goal} onChange={handleChange} className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 focus:outline-none focus:border-blue-500">
                <option value="Definición/Pérdida">Definición/Pérdida</option>
                <option value="Mantenimiento">Mantenimiento</option>
                <option value="Volumen/Ganancia">Volumen/Ganancia</option>
              </select>
            </div>
          </form>

          <div className="mt-8 border-t border-github-border pt-6 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-red-400 flex items-center gap-2"><Warning /> Zona Peligrosa</h3>
            <button onClick={onLoadMock} className="w-full bg-[#21262d] hover:bg-github-border border border-github-border text-white px-4 py-2 rounded-md font-medium text-sm transition-colors">
              Cargar datos de prueba (6 meses)
            </button>
            <button onClick={onReset} className="w-full bg-red-900/30 hover:bg-red-900/50 border border-red-900 text-red-400 px-4 py-2 rounded-md font-medium text-sm transition-colors">
              Reiniciar todos los datos
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-github-border bg-[#21262d] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md font-medium text-sm transition-colors bg-github-bg hover:bg-github-border border border-github-border">
            Cancelar
          </button>
          <button form="profile-form" type="submit" className="px-4 py-2 rounded-md font-medium text-sm transition-colors bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
            <FloppyDisk /> Guardar
          </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
