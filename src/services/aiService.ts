import { GoogleGenerativeAI } from '@google/generative-ai';

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
    return "⚠️ Para conectar con la IA real, necesitas agregar tu clave en el archivo `.env.local` como `VITE_AI_API_KEY=tu_clave_aqui` y reiniciar la aplicación.";
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Tomar solo los últimos 8 mensajes para ahorrar tokens y mantener contexto reciente
    const recentMessages = messages.slice(-8);
    
    // Extraer el último mensaje que es el prompt actual del usuario
    const lastMessage = recentMessages.pop();
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error("El último mensaje debe ser del usuario.");
    }

    // Formatear el historial para el SDK
    const history = recentMessages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const generationConfig = {
      temperature: 0.7,
      maxOutputTokens: 800,
    };

    try {
      // Petición principal (Gemini 1.5 Flash)
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: systemInstruction
      });
      const chat = model.startChat({ history, generationConfig });
      const result = await chat.sendMessage(lastMessage.text);
      return result.response.text();
      
    } catch (err1) {
      console.warn("Fallo con gemini-1.5-flash. Intentando fallback a gemini-2.0-flash...", err1);
      
      // Fallback a Gemini 2.0 Flash
      const modelFallback = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        systemInstruction: systemInstruction
      });
      const chatFallback = modelFallback.startChat({ history, generationConfig });
      const resultFallback = await chatFallback.sendMessage(lastMessage.text);
      return resultFallback.response.text();
    }

  } catch (error) {
    console.error("AI Service Error Detallado:", error);
    return "❌ Hubo un error de conexión con la IA. Verifica tu conexión a internet o tu API Key e intenta nuevamente.";
  }
}
