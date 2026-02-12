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

    public getConfig(): LLMConfig {
        return this.config;
    }

    // Unified Generation Method with Streaming Support
    public async generate(
        messages: any[], 
        tools: any[] = [], 
        systemInstruction?: string,
        jsonMode: boolean = false,
        onChunk?: (text: string) => void
    ): Promise<{ text: string; toolCalls?: any[] }> {
        
        const { provider, apiKey, baseUrl, modelId, temperature, topP, maxOutputTokens } = this.config;

        // --- GEMINI HANDLER ---
        if (provider === 'gemini') {
            if (!this.geminiClient) throw new Error("Gemini API Key missing");
            
            const reqConfig: any = {
                temperature,
                topP,
                maxOutputTokens,
                systemInstruction,
                tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
            };

            // REMOVED: forced thinkingBudget: 0. 
            // We now rely on correct history management in AgentRuntime to handle thoughts.

            // Only set responseMimeType if specifically JSON.
            if (jsonMode) {
                reqConfig.responseMimeType = "application/json";
            }

            // Use Streaming Interface
            const responseStream = await this.geminiClient.models.generateContentStream({
                model: modelId,
                contents: messages,
                config: reqConfig
            });

            let fullText = "";
            let toolCalls = [];

            for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) {
                    fullText += text;
                    if (onChunk) onChunk(text);
                }
                
                // Collect tool calls if present (Gemini sends them usually in the final chunk or a specific chunk)
                const calls = chunk.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
                if (calls && calls.length > 0) {
                    toolCalls.push(...calls);
                }
            }

            return { text: fullText, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
        }

        // --- OPENAI / OPENROUTER / CUSTOM HANDLER ---
        if (provider === 'openai' || provider === 'openrouter' || provider === 'custom') {
            const endpoint = baseUrl || (provider === 'openrouter' ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
            
            const openAiMessages = [
                ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
                ...messages.flatMap(m => {
                    if (Array.isArray(m.parts)) {
                         const toolResponses = m.parts.filter((p: any) => p.functionResponse);
                         if (toolResponses.length > 0) {
                             return toolResponses.map((tr: any) => ({
                                 role: 'tool',
                                 tool_call_id: tr.functionResponse.id,
                                 content: JSON.stringify(tr.functionResponse.response)
                             }));
                         }
                         const textParts = m.parts.filter((p: any) => p.text).map((p:any) => p.text).join('');
                         const toolCalls = m.parts.filter((p: any) => p.functionCall);
                         
                         if (toolCalls.length > 0) {
                             return [{
                                 role: 'assistant',
                                 content: textParts || null, 
                                 tool_calls: toolCalls.map((tc: any) => ({
                                     id: tc.functionCall.id || 'call_' + Math.random().toString(36).substr(2, 9),
                                     type: 'function',
                                     function: {
                                         name: tc.functionCall.name,
                                         arguments: JSON.stringify(tc.functionCall.args)
                                     }
                                 }))
                             }];
                         }
                         return [{ role: m.role === 'model' ? 'assistant' : m.role, content: textParts }];
                    }
                    return [{ role: m.role === 'model' ? 'assistant' : m.role, content: m.text || '' }];
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
                    response_format: jsonMode ? { type: "json_object" } : undefined,
                    stream: true // Enable Streaming
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || res.statusText);
            }

            // Stream Reader
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let toolCallsMap: Record<number, any> = {};

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunkStr = decoder.decode(value);
                    const lines = chunkStr.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.slice(6);
                            if (dataStr === '[DONE]') continue;
                            try {
                                const data = JSON.parse(dataStr);
                                const delta = data.choices[0].delta;
                                
                                // Text Content
                                if (delta.content) {
                                    fullText += delta.content;
                                    if (onChunk) onChunk(delta.content);
                                }
                                
                                // Tool Calls (Streaming Deltas)
                                if (delta.tool_calls) {
                                    for (const tc of delta.tool_calls) {
                                        if (!toolCallsMap[tc.index]) {
                                            toolCallsMap[tc.index] = { id: tc.id, name: tc.function.name, args: "" };
                                        }
                                        if (tc.function?.arguments) {
                                            toolCallsMap[tc.index].args += tc.function.arguments;
                                        }
                                    }
                                }
                            } catch (e) { console.error('SSE Parse Error', e); }
                        }
                    }
                }
            }

            const toolCalls = Object.values(toolCallsMap).map((tc: any) => ({
                id: tc.id,
                name: tc.name,
                args: JSON.parse(tc.args || '{}')
            }));

            return { text: fullText, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
        }

        // --- ANTHROPIC HANDLER (Legacy/Simpler) ---
        if (provider === 'anthropic') {
             const endpoint = baseUrl || "https://api.anthropic.com/v1";
             const anthropicMessages = messages.map(m => {
                 let role = m.role === 'model' ? 'assistant' : m.role;
                 let content = '';
                 if (Array.isArray(m.parts)) {
                     content = m.parts.filter((p:any) => p.text).map((p: any) => p.text).join('');
                 } else { content = m.text || ''; }
                 if (!content) content = " "; 
                 return { role, content };
             }).filter(m => m.role !== 'system');

             const res = await fetch(`${endpoint}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'dangerously-allow-browser': 'true'
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
            const data = await res.json();
            return { text: data.content[0].text };
        }

        throw new Error(`Provider ${provider} not supported yet.`);
    }
}