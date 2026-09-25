import React, { useState } from 'react';
import { X, Spinner } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import './AuthEntry.css';

interface AuthModalProps {
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState<number>(25);
  const [weight, setWeight] = useState<number>(70);
  const [height, setHeight] = useState<number>(175);
  const [sex, setSex] = useState<'Masculino' | 'Femenino'>('Masculino');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        toast.success('Sesión iniciada', { style: { background: '#161b22', color: '#fff' } });
        onClose();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });
        if (error) throw error;
        
        if (data.user) {
          // Crear perfil
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            user_id: data.user.id,
            name,
            age,
            weight_kg: weight,
            height_cm: height,
            gender: sex,
            goal: 'Mantenimiento',
            activity_level: 'Sedentario'
          }, { onConflict: 'id' });
          if (profileError) throw profileError;
          
          toast.success('Registro exitoso. ¡Bienvenido!', { style: { background: '#161b22', color: '#fff' } });
          onClose();
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast.error(error.message || 'Ocurrió un error en la autenticación', { style: { background: '#161b22', color: '#fff' } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="auth-modal w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 px-5 pt-5 sm:px-6">
          <img src="/brand/calori-logo-symbol-dark.png" alt="" className="brand-symbol brand-symbol-modal" />
          <span className="text-lg font-semibold tracking-tight">Calori</span>
        </div>
        <div className="auth-modal-header flex shrink-0 items-center justify-between gap-2 p-4 sm:px-6">
          <div className="flex gap-3 sm:gap-5">
            <button
              onClick={() => setIsLogin(true)}
              className={clsx(
                "auth-tab text-sm font-medium transition-colors",
                isLogin && "auth-tab-active"
              )}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={clsx(
                "auth-tab text-sm font-medium transition-colors",
                !isLogin && "auth-tab-active"
              )}
            >
              Registrarse
            </button>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="auth-close shrink-0 p-2 rounded-xl transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="auth-form-scroll min-h-0 overflow-y-auto p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-500 dark:text-gray-400">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                placeholder="tu@email.com"
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-500 dark:text-gray-400">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {!isLogin && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-slate-500 dark:text-gray-400">Nombre completo</label>
                  <input
                    type="text"
                    inputMode="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    placeholder="Ej. Mateo"
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-slate-500 dark:text-gray-400">Edad</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      min={1}
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-slate-500 dark:text-gray-400">Sexo</label>
                    <select
                      value={sex}
                      onChange={(e) => setSex(e.target.value as any)}
                      className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    >
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-slate-500 dark:text-gray-400">Peso (kg)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      min={1}
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                      className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-slate-500 dark:text-gray-400">Altura (cm)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      min={1}
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="auth-primary mt-2 w-full flex items-center justify-center py-3 px-4 transition-colors font-medium disabled:cursor-not-allowed"
            >
              {loading ? (
                <Spinner size={20} className="animate-spin" />
              ) : (
                isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
