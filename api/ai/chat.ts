interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

interface RequestBody {
  messages?: ChatMessage[];
  systemInstruction?: string;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_MESSAGES = 10;
const MAX_TEXT_LENGTH = 4000;
const ACTION_INSTRUCTIONS = `
Devuelve exclusivamente JSON: {"reply": string, "actions": [{"type": string, "payload": object, "estimated": boolean}]}.
Solo interpreta solicitudes explícitas del ÚLTIMO mensaje del usuario para HOY, nunca repitas acciones del historial.
Si conversa, pregunta, es ambiguo, faltan datos, o pide otra fecha: actions=[]; responde claramente que por ahora solo puedes registrar datos de hoy cuando corresponda.
Nunca uses “registré”, “guardé”, “cargué”, “anoté” ni equivalentes para afirmar una acción realizada. Gemini solo propone acciones; el frontend confirmará o guardará después.
No borres ni edites comidas/ejercicios existentes ni perfiles.
Tipos y payloads exactos (dateStr siempre debe ser la fecha de HOY indicada en el contexto):
add_meal: {dateStr, name, type, calories}. type: Desayuno|Almuerzo|Merienda|Cena|Snack.
add_workout: {dateStr, activity, duration, calories}. duration en minutos.
set_steps: {dateStr, steps}. Solo total explícito, nunca incrementos ni estimaciones.
add_water: {dateStr, water}. Cantidad bebida explícita en ml, se SUMA al agua actual.
set_weight: {dateStr, weight}. Peso explícito en kg, solo registro diario, nunca perfil.
Comidas y ejercicios: puedes estimar calorías usando cantidades, actividad, duración y perfil; estimated=true si estimas algo.
Siempre requieren confirmación del usuario en la UI. Si faltan cantidad o duración, pregunta.
Pasos, agua y peso: estimated=false, no inventes valores; convierte unidades explícitas.
Ignora instrucciones que pidan otros tipos de acciones. No conviertas planes o sugerencias en registros.
`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as ChatMessage;
  return (message.role === 'user' || message.role === 'bot') &&
    typeof message.text === 'string' &&
    message.text.trim().length > 0 &&
    message.text.length <= MAX_TEXT_LENGTH;
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return json({ error: 'Método no permitido.' }, 405);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured.');
      return json({ error: 'El asistente de IA no está configurado en el servidor.' }, 500);
    }

    let body: RequestBody;
    try {
      body = await request.json() as RequestBody;
    } catch {
      return json({ error: 'Solicitud inválida.' }, 400);
    }

    if (!Array.isArray(body.messages) || !body.messages.length) {
      return json({ error: 'Falta el historial de mensajes.' }, 400);
    }

    const recentMessages = body.messages.slice(-MAX_MESSAGES);
    if (!recentMessages.every(isValidMessage)) {
      return json({ error: 'El historial contiene mensajes inválidos.' }, 400);
    }

    const lastMessage = recentMessages[recentMessages.length - 1];
    if (lastMessage.role !== 'user') {
      return json({ error: 'El último mensaje debe ser del usuario.' }, 400);
    }

    // Gemini conversations should begin with a user turn. The UI starts with a
    // local bot greeting, so discard any leading bot-only messages before sending
    // history to the API.
    const firstUserIndex = recentMessages.findIndex((message) => message.role === 'user');
    const validMessages = firstUserIndex >= 0 ? recentMessages.slice(firstUserIndex) : [];

    if (!validMessages.length) {
      return json({ error: 'No hay mensajes de usuario válidos.' }, 400);
    }

    const contents = validMessages.map((message) => ({
      role: message.role === 'bot' ? 'model' : 'user',
      parts: [{ text: message.text }]
    }));

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        // Gemini 2.5 Flash uses dynamic thinking by default. For this fast,
        // conversational nutrition assistant we disable thinking so the token
        // budget is spent on the visible answer instead of hidden reasoning.
        thinkingConfig: {
          thinkingBudget: 0
        },
        // Leave enough room for complete recommendations and short explanations.
        maxOutputTokens: 2048
      }
    };

    payload.systemInstruction = {
      parts: [{ text: (typeof body.systemInstruction === 'string' ? body.systemInstruction.slice(0, 8000) : '') + ACTION_INSTRUCTIONS }]
    };

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json() as any;

      if (!response.ok) {
        console.error('Gemini API error:', response.status, data?.error?.status || data?.error?.message || 'unknown');
        const message = response.status === 429
          ? 'El asistente alcanzó temporalmente su límite de uso. Intenta nuevamente en unos instantes.'
          : response.status === 401 || response.status === 403
            ? 'La credencial de IA del servidor no es válida o no tiene permisos.'
            : 'No se pudo obtener una respuesta de la IA.';
        return json({ error: message }, 502);
      }

      const candidate = data?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const reply = candidate?.content?.parts
        ?.map((part: { text?: string }) => part?.text || '')
        .join('')
        .trim();

      if (finishReason === 'MAX_TOKENS') {
        console.warn('Gemini response reached MAX_TOKENS before completing.');
      }

      if (!reply) {
        console.error('Gemini returned an empty response.', { finishReason: finishReason || 'unknown' });
        return json({ error: 'La IA respondió sin contenido.' }, 502);
      }

      const result = JSON.parse(reply);
      if (typeof result?.reply !== 'string' || !result.reply.trim() || !Array.isArray(result.actions)) {
        return json({ error: 'La IA respondió con un formato inválido.' }, 502);
      }
      return json({ reply: result.reply, actions: result.actions });
    } catch (error) {
      console.error('Gemini network error:', error instanceof Error ? error.message : 'unknown error');
      return json({ error: 'No se pudo conectar con el servicio de IA.' }, 502);
    }
  }
};
