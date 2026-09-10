export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

interface AIResponsePayload {
  reply?: string;
  error?: string;
}

export async function generateAIResponse(
  messages: ChatMessage[],
  systemInstruction: string
): Promise<string> {
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

  return payload.reply.trim();
}
