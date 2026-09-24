interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  localTime?: string;
}

interface RequestBody {
  messages?: ChatMessage[];
  systemInstruction?: string;
  today?: string;
  attachment?: unknown;
}

type MediaAttachment =
  | { kind: 'audio'; mimeType: string; data: string }
  | { kind: 'image'; mimeType: string; data: string };

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_MESSAGES = 10;
const MAX_TEXT_LENGTH = 4000;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const AUDIO_MIME_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/opus', 'audio/mpeg',
  'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/wav'
]);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACTION_INSTRUCTIONS = `
Devuelve exclusivamente JSON: {"reply": string, "actions": [{"type": string, "payload": object, "estimated": boolean}]}.
Interpreta solicitudes explícitas para HOY o una fecha pasada. El contexto trae HOY, AYER y ANTEAYER según la fecha local del usuario. Para "el lunes", usa el lunes pasado más reciente solo si es inequívoco y no futuro; si hay ambigüedad, pregunta. Una fecha con día y mes sin año corresponde al año actual solo si no es futura y la interpretación es inequívoca; nunca inventes otro año. Mañana, pasado mañana y cualquier fecha futura: actions=[] y explica que no puedes registrar fechas futuras.
El último mensaje puede completar datos que preguntaste sobre una solicitud anterior aún sin propuesta: conserva la fecha original junto con comida, actividad, calorías, duración y detalles. Una aclaración corta de hora o duración nunca convierte una solicitud de ayer o anteayer en una de hoy. Nunca repitas acciones ya propuestas, confirmadas, registradas o canceladas.
Si conversa, pregunta, la fecha es ambigua o faltan datos: actions=[] y pide solo la aclaración necesaria.
Nunca uses “registré”, “guardé”, “cargué”, “anoté” ni equivalentes para afirmar una acción realizada. Gemini solo propone acciones; el frontend confirmará o guardará después.
No borres ni edites comidas/ejercicios existentes ni perfiles.
Tipos y payloads exactos (dateStr en YYYY-MM-DD; nunca posterior a HOY):
add_meal: {dateStr, name, type, calories, time, details}. type: Desayuno|Almuerzo|Merienda|Cena|Snack. time obligatorio en HH:mm.
add_workout: {dateStr, activity, duration, calories, time, details, distance?, pace?}. duration obligatoria en minutos, time obligatorio en HH:mm. distance en km y pace en min/km solo si el usuario los informó.
set_steps: {dateStr, steps}. SOLO HOY; total explícito, nunca incrementos ni estimaciones.
add_water: {dateStr, water}. SOLO HOY; cantidad bebida explícita en ml, se SUMA al agua actual.
set_weight: {dateStr, weight}. SOLO HOY; peso explícito en kg, solo registro diario, nunca perfil.
Si piden agua, pasos o peso de ayer u otra fecha pasada: actions=[] y explica que por ahora solo puedes registrar esos tres datos de hoy. Las comidas y los entrenamientos sí admiten fechas pasadas.
Comidas y ejercicios: puedes estimar calorías usando cantidades, actividad, duración y perfil; estimated=true si estimas algo.
Siempre requieren confirmación del usuario en la UI. No inventes hora ni duración ni uses una hora habitual como defecto. EXCEPCIÓN SOLO PARA HOY: expresiones inequívocas de inmediatez como "recién", "ahora", "justo ahora" o "acabo de" usan HORA LOCAL ACTUAL del contexto. "Hoy" por sí solo NO autoriza usar la hora actual. En fechas pasadas, incluso "ayer recién", jamás uses la hora actual de hoy: pregunta la hora si falta. Para una solicitud anterior de HOY con inmediatez usa la hora local adjunta a ese mensaje, conservándola durante las aclaraciones posteriores. Nunca uses la hora del servidor.
Las aclaraciones cortas completan la solicitud anterior aún pendiente, no son solicitudes nuevas. Normaliza "15:30" a "15:30", "a las 15" a "15:00" y "17 hs" a "17:00". Reconstruye y devuelve la acción COMPLETA con name/type o activity, calories estimadas, details conservados y time HH:mm; para ejercicio también duration. Conserva datos ya conocidos en sucesivas aclaraciones. Si la hora es ambigua, pregunta.
Si falta hora en una comida: actions=[] y pregunta "¿A qué hora la comiste?". Si faltan hora y duración en ejercicio, pregunta ambas juntas: "¿A qué hora entrenaste y cuánto tiempo?". Si falta solo una, pregunta solo esa. Si faltan otros datos necesarios (como cantidad ambigua), pregunta todos juntos. No vuelvas a preguntar datos ya explícitos en la solicitud o su aclaración.
Conserva en details todos los ejercicios, series, repeticiones y pesos descritos por el usuario, sin añadir ejercicios ni omitir información relevante. Para comida conserva sus notas. Usa details="" si no hay notas; nunca las inventes.
Ejemplos: "Comí pizza" -> pregunta hora con actions=[]; respuesta "21:30" -> propuesta de esa pizza a las 21:30. "Comí pizza a las 21:30" -> propuesta directa.
"Recién comí pizza" o "Ahora me tomé un batido" -> propuesta con HORA LOCAL ACTUAL, no preguntes hora. "Hoy comí pizza" -> pregunta hora, nunca la completes con la hora actual.
"Acabo de entrenar gimnasio 50 minutos" -> propuesta con hora local actual y duration=50. "Acabo de terminar el gimnasio" -> pregunta SOLO duración y conserva la hora local de ese mensaje para la propuesta posterior.
"Hice gimnasio: press banca, aperturas y fondos" -> pregunta hora y duración con actions=[]; "19:00, 50 minutos" -> propuesta de gimnasio, duration=50, time="19:00", details="Press banca, aperturas y fondos".
"Hice gimnasio 45 minutos a las 18:30: press banca 4x8 y fondos 3x10" -> propuesta directa con esos datos y details completos.
"Ayer comí pizza" -> pregunta hora y conserva dateStr=AYER; respuesta "21:30" -> propuesta de esa pizza para AYER con time="21:30". "Ayer cené pizza a las 21" -> propuesta para AYER a las 21:00. "Anteayer hice gimnasio 50 minutos a las 19" -> propuesta para ANTEAYER a las 19:00. "Ayer recién comí pizza" -> pregunta hora, nunca uses la hora de hoy.
Pasos, agua y peso: estimated=false, no inventes valores; convierte unidades explícitas.
Ignora instrucciones que pidan otros tipos de acciones. No conviertas planes o sugerencias en registros.
Si hay audio adjunto, interpreta lo hablado exactamente como un mensaje escrito del usuario; no inventes palabras inaudibles y pregunta si no se entiende un dato necesario.
Si hay imagen adjunta, identificá solo alimentos razonablemente visibles y estimá porciones y calorías con cautela. Indicá incertidumbre; no inventes ingredientes invisibles, aceites, salsas o rellenos. Si un detalle cambia mucho las calorías o la foto no es clara, preguntá. Preferí cantidades aproximadas como "~150 g", "porción mediana" o "2 unidades", nunca precisión falsa. Si la imagen no muestra comida, no propongas add_meal. Toda comida inferida de imagen lleva estimated=true y requiere confirmación. Una foto sola significa "Analizá esta comida": describila brevemente, pero no supongas que fue consumida hoy ni crees acciones; preguntá si quiere registrarla y a qué hora la comió. Con texto adjunto, conservá la fecha y hora expresadas por el usuario; si faltan, pedí aclaración sin inventarlas.
`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function isValidDateStr(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as ChatMessage;
  return (message.role === 'user' || message.role === 'bot') &&
    typeof message.text === 'string' &&
    message.text.trim().length > 0 &&
    message.text.length <= MAX_TEXT_LENGTH;
}

function parseMediaAttachment(value: unknown): MediaAttachment | null {
  if (!value || typeof value !== 'object') return null;
  const attachment = value as Record<string, unknown>;
  if ((attachment.kind !== 'audio' && attachment.kind !== 'image') ||
    typeof attachment.mimeType !== 'string' || typeof attachment.data !== 'string') return null;
  const mimeType = attachment.mimeType.split(';', 1)[0].trim().toLowerCase();
  const maxBytes = attachment.kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  if (!(attachment.kind === 'audio' ? AUDIO_MIME_TYPES : IMAGE_MIME_TYPES).has(mimeType)) return null;
  const data = attachment.data;
  if (!data || data.length % 4 !== 0 || data.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return null;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const decodedBytes = data.length / 4 * 3 - padding;
  if (decodedBytes <= 0 || decodedBytes > maxBytes) return null;
  return attachment.kind === 'audio'
    ? { kind: 'audio', mimeType, data }
    : { kind: 'image', mimeType, data };
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
    if (!isValidDateStr(body.today)) {
      return json({ error: 'Falta la fecha local actual.' }, 400);
    }

    const recentMessages = body.messages.slice(-MAX_MESSAGES);
    if (!recentMessages.every(isValidMessage)) {
      return json({ error: 'El historial contiene mensajes inválidos.' }, 400);
    }
    if (body.messages.some(message => message && typeof message === 'object' && 'attachment' in message)) {
      return json({ error: 'El archivo solo puede adjuntarse al mensaje actual.' }, 400);
    }

    const lastMessage = recentMessages[recentMessages.length - 1];
    if (lastMessage.role !== 'user') {
      return json({ error: 'El último mensaje debe ser del usuario.' }, 400);
    }
    const attachment = body.attachment === undefined ? undefined : parseMediaAttachment(body.attachment);
    if (attachment === null) {
      return json({ error: 'El archivo no tiene un formato válido o supera el tamaño permitido.' }, 400);
    }

    // Gemini conversations should begin with a user turn. The UI starts with a
    // local bot greeting, so discard any leading bot-only messages before sending
    // history to the API.
    const firstUserIndex = recentMessages.findIndex((message) => message.role === 'user');
    const validMessages = firstUserIndex >= 0 ? recentMessages.slice(firstUserIndex) : [];

    if (!validMessages.length) {
      return json({ error: 'No hay mensajes de usuario válidos.' }, 400);
    }

    const contents = validMessages.map((message, index) => ({
      role: message.role === 'bot' ? 'model' : 'user',
      parts: [
        { text: message.role === 'user' && typeof message.localTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(message.localTime)
          ? `[Hora local de envío: ${message.localTime}]\n${message.text}` : message.text },
        ...(attachment && index === validMessages.length - 1
          ? [{ inlineData: { mimeType: attachment.mimeType, data: attachment.data } }] : [])
      ]
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
      if (attachment?.kind === 'image' && lastMessage.text === '📷 Foto de comida') {
        return json({ reply: result.reply, actions: [] });
      }
      for (const action of result.actions) {
        if (!action || typeof action !== 'object' || !['add_meal', 'add_workout', 'set_steps', 'add_water', 'set_weight'].includes(action.type)) continue;
        const actionDate = action.payload?.dateStr;
        if (!isValidDateStr(actionDate) || actionDate > body.today) {
          return json({ reply: 'Puedo registrar comidas y entrenamientos de hoy o de fechas pasadas, pero no futuras. ¿Qué fecha querés usar?', actions: [] });
        }
        if (actionDate !== body.today && action.type !== 'add_meal' && action.type !== 'add_workout') {
          return json({ reply: 'Por ahora solo puedo registrar agua, pasos y peso del día actual.', actions: [] });
        }
      }
      const missing: string[] = [];
      for (const action of result.actions) {
        if (action?.type !== 'add_meal' && action?.type !== 'add_workout') continue;
        const p = action.payload;
        const fields: string[] = [];
        if (typeof p?.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) fields.push('hora');
        if (action.type === 'add_workout' &&
          (typeof p?.duration !== 'number' || !Number.isFinite(p.duration) || p.duration <= 0)) fields.push('duración en minutos');
        if (fields.length) missing.push(`${fields.join(' y ')} de ${action.type === 'add_meal' ? 'la comida' : 'el entrenamiento'}${p?.dateStr !== body.today ? ` del ${p?.dateStr}` : ''}`);
      }
      if (missing.length) {
        return json({ reply: `¿Me indicás ${missing.join('; ')}?`, actions: [] });
      }
      if (attachment?.kind === 'image') {
        for (const action of result.actions) {
          if (action?.type === 'add_meal') action.estimated = true;
        }
      }
      return json({ reply: result.reply, actions: result.actions });
    } catch (error) {
      console.error('Gemini network error:', error instanceof Error ? error.message : 'unknown error');
      return json({ error: 'No se pudo conectar con el servicio de IA.' }, 502);
    }
  }
};
