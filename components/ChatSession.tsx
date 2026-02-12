import React, { useState, useRef, useEffect } from 'react';
import { 
    Send, MapPin, Search, Brain, Image as ImageIcon, X, Loader2, Sparkles, Zap
} from 'lucide-react';
import { getAiClient, MODEL_CHAT_SMART, MODEL_CHAT_FAST, MODEL_MAPS, MODEL_SEARCH } from '../services/gemini';
import { ChatMessage, ChatConfig } from '../types';

export const ChatSession: React.FC = () => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<ChatConfig>({
        useSearch: false,
        useMaps: false,
        useThinking: false,
        fastMode: false,
    });
    
    // Auto-scroll
    const endRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSendMessage = async () => {
        if (!input.trim() || loading) return;
        const userText = input;
        setInput('');
        
        const newMessage: ChatMessage = { id: Date.now().toString(), role: 'user', text: userText };
        setMessages(prev => [...prev, newMessage]);
        setLoading(true);

        try {
            const ai = getAiClient();
            let modelName = MODEL_CHAT_SMART;
            let tools: any[] = [];
            let toolConfig: any = undefined;

            // 1. Determine Model & Tools based on user selection
            if (config.fastMode) {
                modelName = MODEL_CHAT_FAST;
            } else if (config.useSearch) {
                modelName = MODEL_SEARCH; // Now gemini-3-flash-preview
                tools = [{ googleSearch: {} }];
            } else if (config.useMaps) {
                modelName = MODEL_MAPS;
                tools = [{ googleMaps: {} }];
                // Get location
                try {
                    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject);
                    });
                    toolConfig = {
                        retrievalConfig: {
                            latLng: {
                                latitude: pos.coords.latitude,
                                longitude: pos.coords.longitude
                            }
                        }
                    };
                } catch (e) {
                    console.warn("Location denied, proceeding without precise location for maps.");
                }
            } else if (config.useThinking) {
                modelName = MODEL_CHAT_SMART; // gemini-3-pro-preview
                // Thinking config is part of generation config, handled below
            }

            // 2. Prepare Config
            const generationConfig: any = {};
            
            if (config.useThinking && modelName === MODEL_CHAT_SMART) {
                // REQ: Set thinkingBudget to 32768 for Gemini 3 Pro
                generationConfig.thinkingConfig = { thinkingBudget: 32768 };
            }

            // 3. Make Request
            const response = await ai.models.generateContent({
                model: modelName,
                contents: userText,
                config: {
                    tools: tools.length > 0 ? tools : undefined,
                    toolConfig: toolConfig,
                    ...generationConfig
                }
            });

            // 4. Process Response
            const responseText = response.text || "I couldn't generate a text response.";
            
            // Extract Grounding Metadata
            let groundingUrls: Array<{ title: string; uri: string }> = [];
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            
            if (groundingChunks) {
                groundingChunks.forEach((chunk: any) => {
                    if (chunk.web) {
                        groundingUrls.push({ title: chunk.web.title, uri: chunk.web.uri });
                    }
                    if (chunk.maps) {
                         // Maps chunks structure can vary, getting URI if available
                         groundingUrls.push({ title: chunk.maps.title || "Map Location", uri: chunk.maps.uri || "" });
                    }
                });
            }

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: responseText,
                groundingUrls: groundingUrls.length > 0 ? groundingUrls : undefined
            }]);

        } catch (err: any) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: `Error: ${err.message}`
            }]);
        } finally {
            setLoading(false);
        }
    };

    const toggleConfig = (key: keyof ChatConfig) => {
        setConfig(prev => {
            const next = { ...prev, [key]: !prev[key] };
            // Mutually exclusive logic
            if (key === 'useSearch' && next.useSearch) { next.useMaps = false; next.fastMode = false; next.useThinking = false; }
            if (key === 'useMaps' && next.useMaps) { next.useSearch = false; next.fastMode = false; next.useThinking = false; }
            if (key === 'fastMode' && next.fastMode) { next.useSearch = false; next.useMaps = false; next.useThinking = false; }
            if (key === 'useThinking' && next.useThinking) { next.useSearch = false; next.useMaps = false; next.fastMode = false; }
            return next;
        });
    };

    return (
        <div className="flex flex-col h-full w-full bg-white relative">
            {/* Header / Config Bar */}
            <div className="flex-none p-4 border-b border-zinc-100 flex items-center space-x-2 overflow-x-auto no-scrollbar">
                <button 
                    onClick={() => toggleConfig('fastMode')}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${config.fastMode ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'}`}
                >
                    <Zap size={12} /> <span>Fast</span>
                </button>
                <button 
                    onClick={() => toggleConfig('useThinking')}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${config.useThinking ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'}`}
                >
                    <Brain size={12} /> <span>Deep Think</span>
                </button>
                <button 
                    onClick={() => toggleConfig('useSearch')}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${config.useSearch ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'}`}
                >
                    <Search size={12} /> <span>Search</span>
                </button>
                <button 
                    onClick={() => toggleConfig('useMaps')}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${config.useMaps ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'}`}
                >
                    <MapPin size={12} /> <span>Maps</span>
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {messages.length === 0 && (
                     <div className="h-full flex flex-col items-center justify-center text-zinc-300 space-y-2">
                        <Sparkles size={48} strokeWidth={1} />
                        <p className="text-sm">How can I help you today?</p>
                     </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            msg.role === 'user' 
                            ? 'bg-zinc-900 text-white rounded-br-none' 
                            : 'bg-zinc-50 text-zinc-800 border border-zinc-100 rounded-bl-none'
                        }`}>
                            {msg.text}
                        </div>
                        {msg.groundingUrls && (
                            <div className="mt-2 flex flex-wrap gap-2 max-w-[85%]">
                                {msg.groundingUrls.map((url, idx) => (
                                    <a 
                                        key={idx} 
                                        href={url.uri} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-xs bg-white border border-zinc-200 text-zinc-500 px-2 py-1 rounded-md truncate max-w-full hover:bg-zinc-50"
                                    >
                                        {url.title || "Source"}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-zinc-50 border border-zinc-100 rounded-2xl rounded-bl-none px-4 py-3">
                             <Loader2 className="animate-spin text-zinc-400" size={16} />
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* Input Area */}
            <div className="flex-none p-4 border-t border-zinc-100 bg-white">
                <div className="relative flex items-center">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Type a message..."
                        className="w-full bg-zinc-50 border-none rounded-full py-3 pl-4 pr-12 focus:ring-1 focus:ring-zinc-200 focus:outline-none text-sm"
                        disabled={loading}
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={loading || !input.trim()}
                        className="absolute right-2 p-2 bg-white rounded-full shadow-sm border border-zinc-100 text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};