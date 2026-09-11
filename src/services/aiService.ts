export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

export interface DataAction {
  type: 'add_meal' | 'add_workout' | 'set_steps' | 'add_water' | 'set_weight';
  payload: Record<string, unknown>;
  estimated: boolean;
}

export function validActions(value: unknown, today: string): DataAction[] {
  if (!Array.isArray(value)) return [];
  const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const text = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
  return value.filter((a): a is DataAction => {
    if (!a || typeof a !== 'object' || typeof a.estimated !== 'boolean' ||
      !a.payload || typeof a.payload !== 'object' || Array.isArray(a.payload)) return false;
    const p = a.payload;
    if (p.dateStr !== today) return false;
    switch (a.type) {
      case 'add_meal': return text(p.name) && positive(p.calories) &&
        ['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Snack'].includes(p.type);
      case 'add_workout': return text(p.activity) && positive(p.calories) && positive(p.duration);
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
  systemInstruction: string
): Promise<{ reply: string; actions: unknown }> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages, systemInstruction })
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
