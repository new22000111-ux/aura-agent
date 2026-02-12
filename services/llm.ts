import { GoogleGenAI } from "@google/genai";
import { LLMConfig, LLMProvider } from "../types";

// --- TOOL ADAPTERS ---

// Convert Gemini FunctionDeclaration to OpenAI Tool format
function convertToolsToOpenAI(tools: any[]) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }
    }));
}

// --- LLM SERVICE CLASS ---

export class LLMService {
    private config: LLMConfig;
    private geminiClient: GoogleGenAI | null = null;

    constructor(config: LLMConfig) {
        this.config = config;
        if (config.provider === 'gemini' && config.apiKey) {
            this.geminiClient = new GoogleGenAI({ apiKey: config.apiKey });
        }
    }

    public updateConfig(newConfig: LLMConfig) {
        this.config = newConfig;
        if (newConfig.provider === 'gemini') {
            this.geminiClient = new GoogleGenAI({ apiKey: newConfig.apiKey });
        }
    }

    // Unified Generation Method
    public async generate(
        messages: any[], 
        tools: any[] = [], 
        systemInstruction?: string,
        jsonMode: boolean = false
    ): Promise<{ text: string; toolCalls?: any[] }> {
        
        const { provider, apiKey, baseUrl, modelId, temperature, topP, maxOutputTokens } = this.config;

        // --- GEMINI HANDLER ---
        if (provider === 'gemini') {
            if (!this.geminiClient) throw new Error("Gemini API Key missing");
            
            // Map messages to Gemini Content format
            // Note: Aura uses a simplified history format, we need to ensure it matches Gemini SDK expectations
            // This is a basic mapping. In AgentRuntime we actually store Gemini-compatible objects mostly.
            // But let's be safe.
            
            const reqConfig: any = {
                temperature,
                topP,
                maxOutputTokens,
                systemInstruction,
                tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
                responseMimeType: jsonMode ? "application/json" : "text/plain"
            };

            const response = await this.geminiClient.models.generateContent({
                model: modelId,
                contents: messages,
                config: reqConfig
            });

            const cand = response.candidates?.[0];
            const text = cand?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('') || '';
            const toolCalls = cand?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

            return { text, toolCalls };
        }

        // --- OPENAI / OPENROUTER / CUSTOM HANDLER ---
        if (provider === 'openai' || provider === 'openrouter' || provider === 'custom') {
            const endpoint = baseUrl || (provider === 'openrouter' ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
            
            // Map Messages
            const openAiMessages = [
                ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
                ...messages.map(m => {
                    // Handle Tool Responses in History
                    if (Array.isArray(m.parts)) {
                         // Check if it's a tool response
                         const toolResp = m.parts.find((p: any) => p.functionResponse);
                         if (toolResp) {
                             return {
                                 role: 'tool',
                                 tool_call_id: toolResp.functionResponse.id,
                                 content: JSON.stringify(toolResp.functionResponse.response)
                             };
                         }
                         // Check if it's a tool call (Assistant side)
                         const toolCall = m.parts.find((p: any) => p.functionCall);
                         if (toolCall) {
                             return {
                                 role: 'assistant',
                                 tool_calls: [{
                                     id: toolCall.functionCall.id || 'call_' + Math.random().toString(36).substr(2, 9),
                                     type: 'function',
                                     function: {
                                         name: toolCall.functionCall.name,
                                         arguments: JSON.stringify(toolCall.functionCall.args)
                                     }
                                 }]
                             };
                         }
                         return { role: m.role, content: m.parts[0].text || '' };
                    }
                    return { role: m.role, content: m.text || '' };
                })
            ];

            const openAiTools = convertToolsToOpenAI(tools);

            const res = await fetch(`${endpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://aura-agent.local', 'X-Title': 'Aura Agent' } : {})
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: openAiMessages,
                    tools: openAiTools,
                    temperature,
                    top_p: topP,
                    max_tokens: maxOutputTokens,
                    response_format: jsonMode ? { type: "json_object" } : undefined
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error?.message || res.statusText);
            }

            const data = await res.json();
            const choice = data.choices[0];
            const content = choice.message.content || '';
            const tool_calls = choice.message.tool_calls;

            let mappedToolCalls = undefined;
            if (tool_calls) {
                mappedToolCalls = tool_calls.map((tc: any) => ({
                    id: tc.id,
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments)
                }));
            }

            return { text: content, toolCalls: mappedToolCalls };
        }

        // --- ANTHROPIC HANDLER ---
        if (provider === 'anthropic') {
             // Anthropic requires a different message structure (system is top level, user/assistant only in messages)
             // Implementing basic text support for now, Tool use is complex to map strictly 1:1 in this snippet without a heavy adapter.
             // We will fallback to "System Prompt" based autonomy if tools fail, or strict text.
             // *Actually*, let's implement basic messages.
             
             const endpoint = baseUrl || "https://api.anthropic.com/v1";
             
             // Filter system out of messages
             const anthropicMessages = messages.map(m => {
                 let role = m.role === 'model' ? 'assistant' : m.role;
                 let content = '';
                 if (Array.isArray(m.parts)) content = m.parts.map((p: any) => p.text).join('');
                 else content = m.text || '';
                 return { role, content };
             }).filter(m => m.role !== 'system'); // Remove system from array

             const res = await fetch(`${endpoint}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'dangerously-allow-browser': 'true' // Required for client-side fetch
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: anthropicMessages,
                    system: systemInstruction,
                    max_tokens: maxOutputTokens || 4096,
                    temperature,
                    top_p: topP,
                })
            });
             
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error?.message || res.statusText);
            }
            
            const data = await res.json();
            return { text: data.content[0].text };
        }

        throw new Error(`Provider ${provider} not supported yet.`);
    }
}
