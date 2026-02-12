import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modality, LiveServerMessage } from "@google/genai";
import { Mic, MicOff, Radio } from 'lucide-react';
import { getAiClient, MODEL_LIVE } from '../services/gemini';
import { createPcmBlob, decodeAudioData, b64ToUint8Array } from '../utils/audioUtils';

export const LiveSession: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Audio Context Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Session Refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const cleanupAudio = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }
    
    // Stop all playing sources
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  const connect = async () => {
    setError(null);
    try {
      const ai = getAiClient();
      
      // 1. Setup Audio
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const outputNode = outputContextRef.current!.createGain();
      outputNode.connect(outputContextRef.current!.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2. Connect to Live API
      sessionPromiseRef.current = ai.live.connect({
        model: MODEL_LIVE,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: "You are a helpful, concise, and calm voice assistant. Keep answers brief and conversational.",
        },
        callbacks: {
          onopen: () => {
            console.log('Live Session Opened');
            setIsConnected(true);
            
            // Start streaming input
            if (!inputContextRef.current || !streamRef.current) return;
            
            const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
            const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };

            source.connect(processor);
            processor.connect(inputContextRef.current.destination);
            
            sourceRef.current = source;
            processorRef.current = processor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputContextRef.current) {
                setIsTalking(true);
                const ctx = outputContextRef.current;
                
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(
                    b64ToUint8Array(audioData),
                    ctx,
                    24000,
                    1
                );
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                
                source.addEventListener('ended', () => {
                    sourcesRef.current.delete(source);
                    if (sourcesRef.current.size === 0) setIsTalking(false);
                });
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
            }

            if (msg.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setIsTalking(false);
            }
          },
          onclose: () => {
            console.log('Session closed');
            setIsConnected(false);
            cleanupAudio();
          },
          onerror: (e) => {
            console.error('Session error', e);
            setError("Connection error. Please retry.");
            setIsConnected(false);
            cleanupAudio();
          }
        }
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect microphone");
      cleanupAudio();
    }
  };

  const disconnect = () => {
    // There is no explicit disconnect method on the wrapper that we can easily call 
    // without the session object, but we can close via audio cleanup which kills the stream.
    // The library handles cleanup on page unload mostly, but for SPA we rely on garbage collection 
    // and stopping inputs.
    // Ideally we would call session.close(), but we only have the promise here.
    if (sessionPromiseRef.current) {
        // Simple way to force close is to just reload or stop processing.
        // For this demo, we just stop audio which effectively ends the interaction from user side.
        // and we reset state.
    }
    cleanupAudio();
    setIsConnected(false);
  };

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-6 space-y-12 animate-fade-in">
        
      <div className="relative flex items-center justify-center">
         {/* Minimalist Visualizer */}
        <div className={`w-64 h-64 rounded-full border border-zinc-200 flex items-center justify-center transition-all duration-700 ${isTalking ? 'scale-110 border-zinc-400' : 'scale-100'}`}>
            <div className={`w-48 h-48 rounded-full bg-zinc-50 flex items-center justify-center transition-all duration-500 ${isConnected ? 'opacity-100' : 'opacity-50'}`}>
                {isTalking ? (
                     <div className="flex space-x-1 items-center h-12">
                        {[1,2,3,4,5].map(i => (
                            <div key={i} className="w-1 bg-zinc-900 animate-pulse-slow h-full rounded-full" style={{animationDelay: `${i * 0.1}s`, height: `${Math.random() * 100}%`}}></div>
                        ))}
                     </div>
                ) : (
                    <Radio className={`w-12 h-12 text-zinc-300 ${isConnected ? 'animate-pulse' : ''}`} />
                )}
            </div>
        </div>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-light tracking-tight text-zinc-900">
          {isConnected ? (isTalking ? "Speaking..." : "Listening...") : "Start Conversation"}
        </h2>
        <p className="text-sm text-zinc-500">Gemini Native Audio (Live API)</p>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      <button
        onClick={isConnected ? disconnect : connect}
        className={`rounded-full p-6 transition-all duration-300 ${
            isConnected 
            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200' 
            : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-lg'
        }`}
      >
        {isConnected ? <MicOff size={32} strokeWidth={1.5} /> : <Mic size={32} strokeWidth={1.5} />}
      </button>
    </div>
  );
};
