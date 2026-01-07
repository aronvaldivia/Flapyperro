
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export async function generateDeathRoast(score: number): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `The player just died in Flappy Bird with a score of ${score}. 
                 Write a very short, funny, and slightly snarky one-sentence roast about their failure. 
                 Keep it under 15 words. Spanish or English? Let's go with Spanish since the user asked in Spanish.`,
      config: {
        temperature: 0.8,
        maxOutputTokens: 50,
      },
    });

    return response.text?.trim() || "¡Vaya golpe! Inténtalo de nuevo.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "¡Incluso la gravedad se ríe de ti!";
  }
}
