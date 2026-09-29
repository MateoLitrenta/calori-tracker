import { useEffect, useRef, useState } from 'react';
import { Camera, ImageSquare, X } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

const cache = new Map<string, { expires: number; url: string }>();

export function MealThumbnail({ path, size = 56 }: { path: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const cached = cache.get(path);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
    } else {
      void supabase.storage.from('meal-photos').createSignedUrl(path, 3600).then(({ data, error }) => {
        if (!error && data?.signedUrl) {
          cache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
          if (live) setUrl(data.signedUrl);
        }
      });
    }
    return () => { live = false; };
  }, [path]);
  return url ? <img src={url} alt="Foto de la comida" width={size} height={size} className="flex-none object-cover rounded-[var(--radius-control)]" style={{ width: size, height: size }} /> : null;
}

export async function prepareMealPhoto(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo abrir la foto.'));
      image.src = url;
    });
    for (const [side, quality] of [[1200, .78], [1000, .7], [800, .62]] as const) {
      const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.width || !canvas.height) throw new Error('No se pudo procesar la foto.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo comprimir la foto.')), 'image/jpeg', quality));
      if (blob.size > 0 && blob.size < 1024 * 1024) return blob;
    }
    throw new Error('La foto es demasiado grande. Probá con otra.');
  } finally { URL.revokeObjectURL(url); }
}

export function MealPhotoPicker({ blob, path, onChange, onRemove, onBusyChange }: {
  blob: Blob | null; path?: string | null; onChange: (blob: Blob) => void; onRemove: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!blob) { setPreview(null); return; }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  const stopCamera = () => {
    cameraRequest.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false);
  };
  useEffect(() => () => { cameraRequest.current += 1; stream.current?.getTracks().forEach(track => track.stop()); }, []);
  const select = async (file?: Blob, filename = '') => {
    if (!file || busy) return;
    if (/\.(heic|heif)$/i.test(filename) || /image\/(heic|heif)/i.test(file.type)) {
      toast.error('HEIC todavía no está soportado. Elegí JPG, PNG o WebP.'); return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Elegí una foto JPG, PNG o WebP.'); return;
    }
    setBusy(true);
    onBusyChange(true);
    try { onChange(await prepareMealPhoto(file)); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo preparar la foto.'); }
    finally { setBusy(false); onBusyChange(false); }
  };
  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('Cámara no disponible. Elegí una foto de la galería.'); return; }
    const request = ++cameraRequest.current;
    setCamera(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (request !== cameraRequest.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      else { media.getTracks().forEach(track => track.stop()); }
    } catch { stopCamera(); toast.error('No pude acceder a la cámara. Revisá los permisos.'); }
  };
  const capture = async () => {
    const source = video.current;
    if (!source?.videoWidth || !source.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = source.videoWidth; canvas.height = source.videoHeight;
    canvas.getContext('2d')?.drawImage(source, 0, 0);
    stopCamera();
    const image = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (image) await select(image);
  };
  return <div className="flex flex-col gap-2">
    {(preview || path) && <div className="flex items-center gap-3">
      {preview ? <img src={preview} alt="Vista previa de la comida" className="h-20 w-20 object-cover rounded-[var(--radius-widget)]" /> : path ? <MealThumbnail path={path} size={80} /> : null}
      <button type="button" onClick={onRemove} className="min-h-11 px-3 rounded-[var(--radius-control)] text-slate-600 dark:text-gray-300 border border-slate-300 dark:border-white/10">Quitar foto</button>
    </div>}
    <div className="flex flex-wrap gap-2">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void select(file, file.name); event.target.value = ''; }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-11 px-3 rounded-[var(--radius-control)] border border-slate-300 dark:border-white/10 text-slate-700 dark:text-gray-200 flex items-center gap-2"><ImageSquare size={18} /> Elegir de galería</button>
      <button type="button" disabled={busy} onClick={() => void openCamera()} className="min-h-11 px-3 rounded-[var(--radius-control)] border border-slate-300 dark:border-white/10 text-slate-700 dark:text-gray-200 flex items-center gap-2"><Camera size={18} /> Tomar foto</button>
    </div>
    {busy && <span className="text-xs text-slate-500 dark:text-gray-400">Procesando foto…</span>}
    {camera && <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col items-center justify-center gap-4 p-4">
      <button type="button" onClick={stopCamera} className="self-end text-white p-3" aria-label="Cerrar cámara"><X size={24} /></button>
      <video ref={video} playsInline muted autoPlay className="max-h-[70vh] max-w-full rounded-[var(--radius-widget)]" />
      <button type="button" onClick={() => void capture()} className="min-h-11 px-6 bg-[#f5a064] text-[#151719] rounded-[var(--radius-control)] font-semibold">Capturar</button>
    </div>}
  </div>;
}
