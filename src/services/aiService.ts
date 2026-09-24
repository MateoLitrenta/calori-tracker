export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  localTime?: string;
}

export interface AudioAttachment {
  kind: 'audio';
  mimeType: string;
  data: string;
}

export interface DataAction {
  type: 'add_meal' | 'add_workout' | 'set_steps' | 'add_water' | 'set_weight';
  payload: Record<string, unknown>;
  estimated: boolean;
}

export function isValidDateStr(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function validActions(value: unknown, today: string): DataAction[] {
  if (!Array.isArray(value) || !isValidDateStr(today)) return [];
  const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const text = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
  const time = (s: unknown) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const details = (s: unknown) => s === undefined || typeof s === 'string';
  return value.filter((a): a is DataAction => {
    if (!a || typeof a !== 'object' || typeof a.estimated !== 'boolean' ||
      !a.payload || typeof a.payload !== 'object' || Array.isArray(a.payload)) return false;
    const p = a.payload;
    if (!isValidDateStr(p.dateStr) || p.dateStr > today ||
      ((a.type !== 'add_meal' && a.type !== 'add_workout') && p.dateStr !== today)) return false;
    switch (a.type) {
      case 'add_meal': return text(p.name) && positive(p.calories) && time(p.time) && details(p.details) &&
        ['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Snack'].includes(p.type);
      case 'add_workout': return text(p.activity) && positive(p.calories) && positive(p.duration) && time(p.time) &&
        typeof p.details === 'string' && (p.distance === undefined || positive(p.distance)) && details(p.pace);
      case 'set_steps': return !a.estimated && Number.isSafeInteger(p.steps) && p.steps >= 0;
      case 'add_water': return !a.estimated && positive(p.water);
      case 'set_weight': return !a.estimated && positive(p.weight);
      default: return false;
    }
  });
}

interface AIResponsePayload {
  reply?: string;
  actions?: unknown;
  error?: string;
}

export async function generateAIResponse(
  messages: ChatMessage[],
  systemInstruction: string,
  today: string,
  attachment?: AudioAttachment
): Promise<{ reply: string; actions: unknown }> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: messages.map(({ role, text, localTime }) => ({ role, text, localTime })),
      systemInstruction,
      today,
      ...(attachment ? { attachment } : {})
    })
  });

  let payload: AIResponsePayload;

  try {
    payload = await response.json() as AIResponsePayload;
  } catch {
    throw new Error('La respuesta del servidor de IA no es válida.');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'No se pudo conectar con el servidor de IA.');
  }

  if (!payload.reply?.trim()) {
    throw new Error('La IA respondió sin contenido.');
  }

  return { reply: payload.reply.trim(), actions: payload.actions ?? [] };
}
