import { Modality } from "@google/genai";

// No more separate modes. The Workspace is the App.

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text?: string;
  image?: string; 
  groundingUrls?: Array<{ title: string; uri: string }>;
  isThinking?: boolean;
}

export interface ChatConfig {
  useSearch: boolean;
  useMaps: boolean;
  useThinking: boolean;
  fastMode: boolean;
}

// Image Generation Configs (Internal Use for Tools)
export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export type ImageSize = "1K" | "2K";

// Workspace & Agent Types
export interface VirtualFile {
  name: string;
  content: string;
  language: string;
  lastModified: number;
}

export interface AgentLog {
  id: string;
  type: 'thought' | 'action' | 'output' | 'error' | 'sub-agent' | 'image' | 'system';
  content: string; // Text content or Base64 Image Data
  metadata?: any; // For grounding, execution stats, etc.
  timestamp: number;
  agentName: string;
  processId?: string; // 'main' | 'background' | 'user'
}

export interface WorkspaceState {
  files: Record<string, VirtualFile>;
  selectedFile: string | null;
  logs: AgentLog[];
  isRunning: boolean;
}

// --- LLM CONFIGURATION TYPES ---

export type LLMProvider = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom';

export interface LLMConfig {
    provider: LLMProvider;
    apiKey: string;
    baseUrl?: string; // For Custom/Ollama/OpenRouter
    modelId: string;
    fallbackModelId: string; // NEW: Configurable fallback model
    enableAutonomy: boolean; // NEW: Control background loop
    // Advanced Hyperparameters
    temperature: number;
    topP: number;
    topK?: number;
    maxOutputTokens?: number;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
    provider: 'gemini',
    apiKey: '', // User must provide
    modelId: 'gemini-3-flash-preview', 
    fallbackModelId: 'gemini-2.0-flash', // UPDATED: Default fallback per user request
    enableAutonomy: false, 
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 8192
};