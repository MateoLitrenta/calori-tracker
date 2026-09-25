const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 512 * 1024;

export async function prepareAvatar(file: File): Promise<Blob> {
  if (/\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type)) {
    throw new Error('HEIC/HEIF todavía no es compatible. Elegí una foto JPG, PNG o WebP.');
  }
  const supportedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
  if (!supportedType || file.size > MAX_INPUT_BYTES) {
    throw new Error('Elegí una foto JPG, PNG o WebP de hasta 10 MB.');
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No pudimos leer la foto. Probá con otra imagen.'));
      element.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('La foto no tiene un tamaño válido.');

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - side) / 2;
    const sourceY = (image.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador no pudo preparar la foto.');

    for (const size of [512, 448, 384, 320]) {
      canvas.width = size;
      canvas.height = size;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, side, side, 0, 0, size, size);
      for (const type of ['image/webp', 'image/jpeg']) {
        for (const quality of [0.84, 0.72, 0.6]) {
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
          if (blob?.type === type && blob.size <= MAX_UPLOAD_BYTES) return blob;
        }
      }
    }
    throw new Error('No pudimos reducir la foto a 500 KB. Probá con otra imagen.');
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
