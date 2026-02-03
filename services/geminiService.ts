
import { GoogleGenAI } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const geminiService = {
  /**
   * Complex Text Tasks (Assistant)
   */
  getAssistantResponse: async (prompt: string, context: any) => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Context: You are "Root Core Assistant". The user is currently in a mesh network chat environment called Root. 
      Network Status: ${JSON.stringify(context)}.
      User Query: ${prompt}`,
      config: {
        systemInstruction: "You are a highly advanced, technical, and privacy-focused AI assistant built into the 'Root' mesh networking platform. You speak with a clean, logical, yet friendly 'system core' persona. Help users with decentralized networking, protocol security, or general chat assistance.",
        thinkingConfig: { thinkingBudget: 4000 }
      }
    });
    return response.text;
  },

  /**
   * Search Grounding
   */
  getSearchInsights: async (query: string) => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: query,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return {
      text: response.text,
      sources: sources.map((s: any) => ({
        title: s.web?.title,
        uri: s.web?.uri
      }))
    };
  }
};
