import React, { useState } from 'react';
import { getAiClient, MODEL_IMAGE_GEN } from '../services/gemini';
import { AspectRatio, ImageSize } from '../types';
import { Loader2, Download, RefreshCcw, Sparkles } from 'lucide-react';

export const CreateSession: React.FC = () => {
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [imageSize, setImageSize] = useState<ImageSize>('1K');
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const aspectRatios: AspectRatio[] = ["1:1", "3:4", "4:3", "9:16", "16:9"]; // Removed unsupported 21:9

    const handleGenerate = async () => {
        if (!prompt) return;
        setLoading(true);
        setError(null);
        setGeneratedImage(null);

        try {
            const ai = getAiClient();
            const response = await ai.models.generateContent({
                model: MODEL_IMAGE_GEN,
                contents: {
                    parts: [{ text: prompt }]
                },
                config: {
                    imageConfig: {
                        aspectRatio: aspectRatio,
                        imageSize: imageSize
                    }
                }
            });

            // Extract Image
            let imageUrl = null;
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const base64 = part.inlineData.data;
                        imageUrl = `data:image/png;base64,${base64}`;
                        break;
                    }
                }
            }

            if (imageUrl) {
                setGeneratedImage(imageUrl);
            } else {
                setError("No image generated. Please try a different prompt.");
            }

        } catch (err: any) {
            setError(err.message || "Failed to generate image");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-y-auto">
            <div className="p-6 space-y-6 max-w-lg mx-auto w-full">
                
                <div className="space-y-2">
                    <h2 className="text-2xl font-light">Create</h2>
                    <p className="text-sm text-zinc-500">Gemini 3 Pro Image Preview</p>
                </div>

                <div className="space-y-4">
                    {/* Prompt */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">Prompt</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="A futuristic city with vertical gardens..."
                            className="w-full h-24 p-3 bg-zinc-50 rounded-xl border border-zinc-200 focus:ring-1 focus:ring-zinc-900 focus:outline-none resize-none text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Aspect Ratio */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">Aspect Ratio</label>
                            <select 
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                                className="w-full p-2 bg-zinc-50 rounded-lg border border-zinc-200 text-sm focus:outline-none"
                            >
                                {aspectRatios.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>

                        {/* Size */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 mb-1">Resolution</label>
                            <select 
                                value={imageSize}
                                onChange={(e) => setImageSize(e.target.value as ImageSize)}
                                className="w-full p-2 bg-zinc-50 rounded-lg border border-zinc-200 text-sm focus:outline-none"
                            >
                                <option value="1K">1K</option>
                                <option value="2K">2K</option>
                                <option value="4K">4K</option>
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleGenerate}
                        disabled={loading || !prompt}
                        className="w-full bg-zinc-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex justify-center items-center"
                    >
                        {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Sparkles className="mr-2" size={16} />}
                        {loading ? 'Generating...' : 'Generate'}
                    </button>
                </div>

                {/* Output Area */}
                <div className="pt-6 border-t border-zinc-100">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs">
                            {error}
                        </div>
                    )}
                    
                    {generatedImage && (
                        <div className="space-y-3 animate-fade-in">
                            <div className="rounded-2xl overflow-hidden border border-zinc-100 shadow-sm">
                                <img src={generatedImage} alt="Generated" className="w-full h-auto object-cover" />
                            </div>
                            <div className="flex justify-end">
                                <a 
                                    href={generatedImage} 
                                    download={`gemini-art-${Date.now()}.png`}
                                    className="flex items-center space-x-1 text-xs text-zinc-500 hover:text-zinc-900"
                                >
                                    <Download size={14} /> <span>Download</span>
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};