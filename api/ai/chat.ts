interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  localTime?: string;
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
Interpreta solicitudes explícitas para HOY. El último mensaje puede completar datos que preguntaste sobre una solicitud anterior aún sin propuesta: usa el historial reciente para conservar comida, actividad y detalles. Nunca repitas acciones ya propuestas, confirmadas, registradas o canceladas.
Si conversa, pregunta, es ambiguo, faltan datos, o pide otra fecha: actions=[]; responde claramente que por ahora solo puedes registrar datos de hoy cuando corresponda.
Nunca uses “registré”, “guardé”, “cargué”, “anoté” ni equivalentes para afirmar una acción realizada. Gemini solo propone acciones; el frontend confirmará o guardará después.
No borres ni edites comidas/ejercicios existentes ni perfiles.
Tipos y payloads exactos (dateStr siempre debe ser la fecha de HOY indicada en el contexto):
add_meal: {dateStr, name, type, calories, time, details}. type: Desayuno|Almuerzo|Merienda|Cena|Snack. time obligatorio en HH:mm.
add_workout: {dateStr, activity, duration, calories, time, details, distance?, pace?}. duration obligatoria en minutos, time obligatorio en HH:mm. distance en km y pace en min/km solo si el usuario los informó.
set_steps: {dateStr, steps}. Solo total explícito, nunca incrementos ni estimaciones.
add_water: {dateStr, water}. Cantidad bebida explícita en ml, se SUMA al agua actual.
set_weight: {dateStr, weight}. Peso explícito en kg, solo registro diario, nunca perfil.
Comidas y ejercicios: puedes estimar calorías usando cantidades, actividad, duración y perfil; estimated=true si estimas algo.
Siempre requieren confirmación del usuario en la UI. No inventes hora ni duración ni uses una hora habitual como defecto. EXCEPCIÓN: expresiones inequívocas de inmediatez como "recién", "ahora", "justo ahora" o "acabo de" usan HORA LOCAL ACTUAL del contexto. "Hoy" por sí solo NO autoriza usar la hora actual. Para una solicitud anterior con inmediatez usa la hora local adjunta a ese mensaje, conservándola durante las aclaraciones posteriores. Nunca uses la hora del servidor. Si no hay referencia local disponible, pregunta la hora.
Las aclaraciones cortas completan la solicitud anterior aún pendiente, no son solicitudes nuevas. Normaliza "15:30" a "15:30", "a las 15" a "15:00" y "17 hs" a "17:00". Reconstruye y devuelve la acción COMPLETA con name/type o activity, calories estimadas, details conservados y time HH:mm; para ejercicio también duration. Conserva datos ya conocidos en sucesivas aclaraciones. Si la hora es ambigua, pregunta.
Si falta hora en una comida: actions=[] y pregunta "¿A qué hora la comiste?". Si faltan hora y duración en ejercicio, pregunta ambas juntas: "¿A qué hora entrenaste y cuánto tiempo?". Si falta solo una, pregunta solo esa. Si faltan otros datos necesarios (como cantidad ambigua), pregunta todos juntos. No vuelvas a preguntar datos ya explícitos en la solicitud o su aclaración.
Conserva en details todos los ejercicios, series, repeticiones y pesos descritos por el usuario, sin añadir ejercicios ni omitir información relevante. Para comida conserva sus notas. Usa details="" si no hay notas; nunca las inventes.
Ejemplos: "Comí pizza" -> pregunta hora con actions=[]; respuesta "21:30" -> propuesta de esa pizza a las 21:30. "Comí pizza a las 21:30" -> propuesta directa.
"Recién comí pizza" o "Ahora me tomé un batido" -> propuesta con HORA LOCAL ACTUAL, no preguntes hora. "Hoy comí pizza" -> pregunta hora, nunca la completes con la hora actual.
"Acabo de entrenar gimnasio 50 minutos" -> propuesta con hora local actual y duration=50. "Acabo de terminar el gimnasio" -> pregunta SOLO duración y conserva la hora local de ese mensaje para la propuesta posterior.
"Hice gimnasio: press banca, aperturas y fondos" -> pregunta hora y duración con actions=[]; "19:00, 50 minutos" -> propuesta de gimnasio, duration=50, time="19:00", details="Press banca, aperturas y fondos".
"Hice gimnasio 45 minutos a las 18:30: press banca 4x8 y fondos 3x10" -> propuesta directa con esos datos y details completos.
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
      parts: [{ text: message.role === 'user' && typeof message.localTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(message.localTime)
        ? `[Hora local de envío: ${message.localTime}]\n${message.text}` : message.text }]
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
      const missing: string[] = [];
      for (const action of result.actions) {
        if (action?.type !== 'add_meal' && action?.type !== 'add_workout') continue;
        const p = action.payload;
        const fields: string[] = [];
        if (typeof p?.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) fields.push('hora');
        if (action.type === 'add_workout' &&
          (typeof p?.duration !== 'number' || !Number.isFinite(p.duration) || p.duration <= 0)) fields.push('duración en minutos');
        if (fields.length) missing.push(`${fields.join(' y ')} de ${action.type === 'add_meal' ? 'la comida' : 'el entrenamiento'}`);
      }
      if (missing.length) {
        return json({ reply: `¿Me indicás ${missing.join('; ')}?`, actions: [] });
      }
      return json({ reply: result.reply, actions: result.actions });
    } catch (error) {
      console.error('Gemini network error:', error instanceof Error ? error.message : 'unknown error');
      return json({ error: 'No se pudo conectar con el servicio de IA.' }, 502);
    }
  }
};
