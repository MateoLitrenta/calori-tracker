import React, { useState } from 'react';
import { X, Spinner } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import clsx from 'clsx';

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
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            user_id: data.user.id,
            name,
            age,
            weight_kg: weight,
            height_cm: height,
            gender: sex,
            goal: 'Mantenimiento'
          });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md bg-github-bg border border-github-border rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between p-4 border-b border-github-border">
          <div className="flex gap-4">
            <button
              onClick={() => setIsLogin(true)}
              className={clsx(
                "text-lg font-semibold transition-colors",
                isLogin ? "text-white" : "text-github-muted hover:text-white"
              )}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={clsx(
                "text-lg font-semibold transition-colors",
                !isLogin ? "text-white" : "text-github-muted hover:text-white"
              )}
            >
              Registrarse
            </button>
          </div>
          <button onClick={onClose} className="text-github-muted hover:text-white p-1 rounded hover:bg-github-border transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1">
              <label className="text-sm text-github-muted">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                placeholder="tu@email.com"
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-sm text-github-muted">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {!isLogin && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-github-muted">Nombre completo</label>
                  <input
                    type="text"
                    inputMode="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    placeholder="Ej. Mateo"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-github-muted">Edad</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      min={1}
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-github-muted">Sexo</label>
                    <select
                      value={sex}
                      onChange={(e) => setSex(e.target.value as any)}
                      className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    >
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-github-muted">Peso (kg)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      min={1}
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                      className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-github-muted">Altura (cm)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      min={1}
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="bg-github-card border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-full"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white rounded-md py-2 px-4 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
