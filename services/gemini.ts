import { GoogleGenAI } from "@google/genai";

// Use the Native Audio model for Live API (Keep this as is, it's specific for Live)
export const MODEL_LIVE = 'gemini-2.5-flash-native-audio-preview-12-2025';

// Default Models - Updated to Gemini 3 series per guidelines
export const MODEL_CHAT_SMART = 'gemini-3-pro-preview'; 
export const MODEL_CHAT_FAST = 'gemini-3-flash-preview';
export const MODEL_MAPS = 'gemini-2.0-flash'; // Maps grounding is supported in 2.0/2.5
export const MODEL_SEARCH = 'gemini-3-pro-preview';
export const MODEL_IMAGE_GEN = 'gemini-3-pro-image-preview'; // Keep Pro for Images

// Comprehensive list of available models
export const AVAILABLE_MODELS = [
    // Gemini 3.0 Series
    { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3.0 Pro Image' },
    
    // Gemini 2.0 Series
    { id: 'gemini-2.0-flash-lite-preview-02-05', name: 'Gemini 2.0 Flash Lite' }, // UPDATED
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    
    // Live
    { id: 'gemini-2.5-flash-native-audio-preview-12-2025', name: 'Gemini 2.5 Live' },
];

// Priority list for fallback when 429 occurs
export const FALLBACK_MODELS = [
    MODEL_CHAT_SMART,           
    'gemini-2.0-flash-lite-preview-02-05', // Use Lite as primary fallback
    'gemini-3-flash-preview'
];

let aiClient: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY environment variable is not set");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}