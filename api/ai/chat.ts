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
        temperature: 0.7,
        maxOutputTokens: 800
      }
    };

    if (typeof body.systemInstruction === 'string' && body.systemInstruction.trim()) {
      payload.systemInstruction = {
        parts: [{ text: body.systemInstruction.slice(0, 8000) }]
      };
    }

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

      const reply = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part?.text || '')
        .join('')
        .trim();

      if (!reply) {
        console.error('Gemini returned an empty response.');
        return json({ error: 'La IA respondió sin contenido.' }, 502);
      }

      return json({ reply });
    } catch (error) {
      console.error('Gemini network error:', error instanceof Error ? error.message : 'unknown error');
      return json({ error: 'No se pudo conectar con el servicio de IA.' }, 502);
    }
  }
};
