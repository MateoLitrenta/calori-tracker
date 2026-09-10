export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

export async function generateAIResponse(
  messages: ChatMessage[],
  systemInstruction: string
): Promise<string> {
  const apiKey = import.meta.env.VITE_AI_API_KEY;

  if (!apiKey) {
    return "⚠️ Para conectar con la IA real, necesitas agregar tu clave en el archivo `.env` o `.env.local` como `VITE_AI_API_KEY=tu_clave_aqui` y reiniciar la aplicación.";
  }

  try {
    // Tomar solo los últimos 8 mensajes para ahorrar tokens y mantener contexto reciente
    const history = messages.slice(-8).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const bodyPayload = JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      }
    });

    // Petición principal (Gemini 1.5 Flash)
    let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyPayload
    });

    // Si falla, reintento con fallback (Gemini 2.0 Flash)
    if (!response.ok) {
      const errData1 = await response.json().catch(() => null);
      console.warn("Fallo con gemini-1.5-flash. Intentando fallback a gemini-2.0-flash...", errData1);
      
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyPayload
      });

      // Si también falla el fallback, imprimimos el error detallado final
      if (!response.ok) {
        const errData2 = await response.json().catch(() => ({}));
        console.error("AI Service Error Data Detallado (Fallback Gemini 2.0 fallido):", errData2);
        throw new Error(errData2?.error?.message || 'Error al conectar con ambos modelos de Google AI.');
      }
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts[0].text;
    }
    
    return "Lo siento, la IA no devolvió una respuesta válida.";
  } catch (error) {
    console.error("AI Service Request Failed:", error);
    return "❌ Hubo un error de conexión con la IA. Verifica tu conexión a internet o tu API Key e intenta nuevamente.";
  }
}
