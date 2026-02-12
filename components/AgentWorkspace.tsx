import React, { useState, useEffect, useRef } from 'react';
import { Play, Mic, Eye, Activity, BrainCircuit, Menu, Folder, MessageSquare, Settings as SettingsIcon, Save, Volume2, VolumeX, Github, X, Server, Shield, Sliders } from 'lucide-react';
import { vfs } from '../services/vfs';
import { AgentRuntime, DEFAULT_SYSTEM_INSTRUCTION } from '../services/agentRuntime';
import { VirtualFile, AgentLog, LLMConfig, DEFAULT_LLM_CONFIG, LLMProvider } from '../types';
import { blobToBase64 } from '../utils/audioUtils';
import { FileExplorer } from './FileExplorer';
import { githubService } from '../services/github';

declare const html2canvas: any;

type ViewMode = 'chat' | 'files' | 'preview' | 'settings';
type SettingsTab = 'general' | 'llm' | 'advanced';

const LLM_PROVIDERS: {id: LLMProvider, name: string}[] = [
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'openrouter', name: 'OpenRouter' },
    { id: 'custom', name: 'Custom (Ollama/Compatible)' }
];

export const AgentWorkspace: React.FC = () => {
  // State
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<Record<string, VirtualFile>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>('chat');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Configuration State
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_LLM_CONFIG);
  const [systemInstruction, setSystemInstruction] = useState(DEFAULT_SYSTEM_INSTRUCTION);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  
  // UI State
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('llm');
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [ghConfig, setGhConfig] = useState({ token: '', owner: '', repo: '' });
  const [ghConnected, setGhConnected] = useState(false);
  const [previewTab, setPreviewTab] = useState<'code' | 'preview'>('preview');

  // Refs
  const runtimeRef = useRef<AgentRuntime | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // --- INIT ---
  useEffect(() => {
    refreshFiles();
    
    // Load Config
    const savedConfigStr = localStorage.getItem('aura_llm_config');
    const savedInstruction = localStorage.getItem('aura_instruction');
    const savedGh = githubService.getConfig();

    let initialConfig = DEFAULT_LLM_CONFIG;
    if (savedConfigStr) {
        initialConfig = JSON.parse(savedConfigStr);
        setConfig(initialConfig);
    } else {
        // First time user? Check env var fallback for Gemini
        if (process.env.API_KEY) {
            initialConfig = { ...DEFAULT_LLM_CONFIG, apiKey: process.env.API_KEY };
            setConfig(initialConfig);
        } else {
            setShowOnboarding(true);
        }
    }

    if (savedInstruction) setSystemInstruction(savedInstruction);
    if (savedGh) {
        setGhConfig({ token: savedGh.token, owner: savedGh.owner, repo: savedGh.repo });
        setGhConnected(true);
    }

    // Start Runtime
    runtimeRef.current = new AgentRuntime(initialConfig, (log) => {
        setLogs(prev => [...prev, log]);
        if (log.type === 'action') refreshFiles();
    });
    
    if (!showOnboarding) {
        runtimeRef.current.startAutonomy();
    }

    (window as any).takeAppScreenshot = async () => {
        if (!workspaceRef.current || typeof html2canvas === 'undefined') return null;
        const canvas = await html2canvas(workspaceRef.current, { scale: 0.5 });
        return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    };

    return () => {
        runtimeRef.current?.stopAutonomy();
    }
  }, []);

  // --- EFFECTS ---
  useEffect(() => {
    if (activeView === 'chat') logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, activeView]);

  useEffect(() => {
      if (activeView === 'preview' && previewRef.current && files['index.html']) {
          const doc = previewRef.current.contentDocument;
          if (doc) {
              doc.open();
              doc.write(files['index.html'].content);
              doc.close();
          }
      }
  }, [files['index.html']?.lastModified, activeView]);

  // --- HANDLERS ---

  const refreshFiles = () => {
    setFiles({ ...vfs.getAllFiles() });
    if (!selectedFile) {
        const keys = vfs.listFiles();
        if (keys.includes('style.css')) setSelectedFile('style.css');
        else if (keys.length > 0) setSelectedFile(keys[0]);
    }
  };

  const saveConfiguration = () => {
      localStorage.setItem('aura_llm_config', JSON.stringify(config));
      localStorage.setItem('aura_instruction', systemInstruction);
      
      if (runtimeRef.current) {
          runtimeRef.current.updateConfig(config);
          runtimeRef.current.setSystemInstruction(systemInstruction);
      }
      setShowOnboarding(false);
      runtimeRef.current?.startAutonomy();
      alert("Configuration Saved");
  };

  const handleInput = async (input: { text?: string; audio?: string }) => {
    if (!input.text && !input.audio) return;
    if (input.text) setPrompt('');

    setLogs(prev => [...prev, {
        id: Date.now().toString(),
        type: 'output',
        content: input.text || (input.audio ? 'Audio Signal...' : ''),
        timestamp: Date.now(),
        agentName: 'User',
        processId: 'main'
    }]);

    runtimeRef.current?.startSession(input);
  };

  const toggleRecording = async () => {
    if (isRecording) {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            audioChunksRef.current = [];
            recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
            recorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const base64Audio = await blobToBase64(audioBlob);
                handleInput({ audio: base64Audio });
                stream.getTracks().forEach(t => t.stop());
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
        } catch (e) {
            console.error("Mic error", e);
        }
    }
  };

  const renderLogContent = (log: AgentLog) => {
      const isBg = log.processId === 'background';
      if (log.type === 'thought') return <div className="text-xs text-zinc-500 font-mono italic pl-2 border-l-2 border-zinc-800 my-1">THINK: {log.content}</div>;
      if (log.type === 'action') return <div className="text-xs text-amber-500 font-mono my-1">ACT: {log.content}</div>;
      if (log.type === 'error') return <div className="text-xs text-red-400 font-mono my-1 bg-red-950/30 p-1 rounded">ERR: {log.content}</div>;
      return <div className="text-sm text-zinc-200 whitespace-pre-wrap">{log.content}</div>;
  };

  const saveGithubConfig = async () => {
    githubService.saveConfig(ghConfig);
    try {
        await githubService.validateUser();
        setGhConnected(true);
        setShowGithubModal(false);
    } catch(e) { alert("GitHub Connection Failed"); }
  };

  // --- RENDER ---

  return (
    <div ref={workspaceRef} className="flex flex-col h-full w-full bg-black text-zinc-100 font-sans relative">
      
      {/* HEADER */}
      <div className="flex-none h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-4">
              <div className="relative">
                  <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400">
                      <Menu size={20} />
                  </button>
                  {isMenuOpen && (
                      <div className="absolute top-12 left-0 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 z-50 flex flex-col">
                          <button onClick={() => { setActiveView('chat'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='chat'?'text-white':'text-zinc-400'}`}><MessageSquare size={16}/> Chat</button>
                          <button onClick={() => { setActiveView('files'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='files'?'text-white':'text-zinc-400'}`}><Folder size={16}/> Files</button>
                          <button onClick={() => { setActiveView('preview'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='preview'?'text-white':'text-zinc-400'}`}><Eye size={16}/> Preview</button>
                          <div className="h-px bg-zinc-800 my-1"></div>
                          <button onClick={() => { setActiveView('settings'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='settings'?'text-white':'text-zinc-400'}`}><SettingsIcon size={16}/> Settings</button>
                      </div>
                  )}
              </div>
              <span className="font-bold tracking-wide text-zinc-200">AURA <span className="text-xs font-normal text-zinc-500 ml-2">{config.provider.toUpperCase()}</span></span>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setShowGithubModal(true)} className={`p-2 rounded-full ${ghConnected ? 'text-emerald-500 bg-emerald-950/30' : 'text-zinc-600'}`}><Github size={16}/></button>
          </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden relative">
          
          {/* CHAT */}
          {activeView === 'chat' && (
              <div className="absolute inset-0 flex flex-col bg-black">
                  <div className="flex-1 overflow-y-auto p-4 space-y-6">
                      {logs.map((log) => (
                        <div key={log.id} className={`flex flex-col space-y-1 ${log.agentName === 'User' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[90%] ${log.agentName === 'User' ? 'bg-zinc-900 px-4 py-2 rounded-xl text-white' : 'w-full pl-0'}`}>
                                {renderLogContent(log)}
                            </div>
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                  </div>
                  <div className="p-4 bg-black border-t border-zinc-900">
                      <div className="relative flex items-center gap-2">
                          <button onClick={toggleRecording} className={`p-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-zinc-900 text-zinc-500'}`}><Mic size={20}/></button>
                          <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInput({text: prompt})} className="w-full bg-zinc-900 border-none rounded-full py-3 px-5 text-sm text-white focus:ring-1 focus:ring-indigo-500" placeholder="Type a message..." />
                          <button onClick={() => handleInput({text: prompt})} className="absolute right-2 p-2 bg-indigo-600 rounded-full text-white"><Play size={14}/></button>
                      </div>
                  </div>
              </div>
          )}

          {/* FILES */}
          {activeView === 'files' && (
              <div className="absolute inset-0 bg-zinc-950 flex flex-col">
                  <div className="flex-1 overflow-hidden flex">
                    <FileExplorer 
                        files={files}
                        selectedFile={selectedFile}
                        onSelect={setSelectedFile}
                        onCreate={() => {}}
                        onDelete={(name) => { vfs.deleteFile(name); refreshFiles(); }}
                        onUpload={() => {}}
                    />
                    <div className="flex-1 bg-zinc-900 p-4">
                        {selectedFile && files[selectedFile] ? (
                            <textarea value={files[selectedFile].content} onChange={(e) => { vfs.writeFile(selectedFile, e.target.value); refreshFiles(); }} className="w-full h-full bg-transparent text-zinc-300 font-mono text-xs resize-none focus:outline-none" spellCheck={false}/>
                        ) : <div className="text-zinc-600">Select a file</div>}
                    </div>
                  </div>
              </div>
          )}

          {/* PREVIEW */}
          {activeView === 'preview' && (
               <div className="absolute inset-0 bg-white">
                  <iframe ref={previewRef} className="w-full h-full border-none" sandbox="allow-scripts allow-modals allow-same-origin allow-forms" />
               </div>
          )}

          {/* SETTINGS */}
          {activeView === 'settings' && (
              <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center p-6 overflow-y-auto">
                  <div className="w-full max-w-3xl space-y-6">
                      <h2 className="text-2xl font-light text-white mb-6">Settings</h2>
                      
                      {/* Tabs */}
                      <div className="flex space-x-1 bg-zinc-900 p-1 rounded-lg w-fit">
                          <button onClick={() => setSettingsTab('llm')} className={`px-4 py-2 text-xs font-bold rounded-md ${settingsTab==='llm'?'bg-zinc-800 text-white':'text-zinc-500'}`}>Provider & Model</button>
                          <button onClick={() => setSettingsTab('general')} className={`px-4 py-2 text-xs font-bold rounded-md ${settingsTab==='general'?'bg-zinc-800 text-white':'text-zinc-500'}`}>System Identity</button>
                          <button onClick={() => setSettingsTab('advanced')} className={`px-4 py-2 text-xs font-bold rounded-md ${settingsTab==='advanced'?'bg-zinc-800 text-white':'text-zinc-500'}`}>Hyperparameters</button>
                      </div>

                      {/* LLM Tab */}
                      {settingsTab === 'llm' && (
                          <div className="space-y-4 animate-fade-in">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-zinc-500 uppercase">Provider</label>
                                  <div className="grid grid-cols-2 gap-2">
                                      {LLM_PROVIDERS.map(p => (
                                          <button 
                                            key={p.id}
                                            onClick={() => setConfig({...config, provider: p.id})}
                                            className={`p-3 rounded-lg border text-left text-sm transition-all ${config.provider === p.id ? 'bg-indigo-500/10 border-indigo-500 text-white' : 'bg-black border-zinc-800 text-zinc-400'}`}
                                          >
                                              {p.name}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-zinc-500 uppercase">API Key</label>
                                  <input type="password" value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" placeholder="sk-..." />
                              </div>

                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-zinc-500 uppercase">Model ID</label>
                                  <input type="text" value={config.modelId} onChange={(e) => setConfig({...config, modelId: e.target.value})} className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" placeholder="e.g. gpt-4o, claude-3-5-sonnet" />
                              </div>
                              
                              {(config.provider === 'custom' || config.provider === 'openrouter') && (
                                  <div className="space-y-2">
                                      <label className="text-xs font-bold text-zinc-500 uppercase">Base URL</label>
                                      <input type="text" value={config.baseUrl || ''} onChange={(e) => setConfig({...config, baseUrl: e.target.value})} className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" placeholder="https://api.openai.com/v1" />
                                  </div>
                              )}
                          </div>
                      )}

                      {/* General Tab */}
                      {settingsTab === 'general' && (
                          <div className="space-y-4 animate-fade-in">
                               <div className="space-y-2">
                                  <label className="text-xs font-bold text-zinc-500 uppercase">System Instructions</label>
                                  <textarea value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} className="w-full h-64 bg-black border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-300 focus:border-indigo-500 outline-none resize-none" />
                              </div>
                          </div>
                      )}

                      {/* Advanced Tab */}
                      {settingsTab === 'advanced' && (
                          <div className="space-y-6 animate-fade-in">
                              <div className="p-4 border border-zinc-800 rounded-xl bg-zinc-900/50">
                                  <div className="flex items-center justify-between">
                                      <div>
                                          <div className="text-sm font-medium text-white">Enable Autonomy (Background Loop)</div>
                                          <div className="text-xs text-zinc-500">Allow Aura to think and act autonomously in the background. Disabling this saves quota.</div>
                                      </div>
                                      <div onClick={() => setConfig({...config, enableAutonomy: !config.enableAutonomy})} className={`w-12 h-6 rounded-full cursor-pointer transition-colors relative ${config.enableAutonomy ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
                                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config.enableAutonomy ? 'left-7' : 'left-1'}`}></div>
                                      </div>
                                  </div>
                              </div>

                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-zinc-500 uppercase flex justify-between"><span>Temperature</span> <span>{config.temperature}</span></label>
                                  <input type="range" min="0" max="2" step="0.1" value={config.temperature} onChange={(e) => setConfig({...config, temperature: parseFloat(e.target.value)})} className="w-full accent-indigo-500" />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-zinc-500 uppercase flex justify-between"><span>Top P</span> <span>{config.topP}</span></label>
                                  <input type="range" min="0" max="1" step="0.05" value={config.topP} onChange={(e) => setConfig({...config, topP: parseFloat(e.target.value)})} className="w-full accent-indigo-500" />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-zinc-500 uppercase">Max Output Tokens</label>
                                  <input type="number" value={config.maxOutputTokens} onChange={(e) => setConfig({...config, maxOutputTokens: parseInt(e.target.value)})} className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" />
                              </div>
                          </div>
                      )}

                      <button onClick={saveConfiguration} className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                          <Save size={18}/> Save Changes
                      </button>
                  </div>
              </div>
          )}
      </div>

      {/* ONBOARDING MODAL */}
      {showOnboarding && (
          <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6">
              <div className="w-full max-w-lg space-y-8 text-center animate-fade-in">
                  <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-900/50">
                          <Server size={40} className="text-white" />
                      </div>
                      <h1 className="text-4xl font-bold text-white tracking-tight">Welcome to Aura</h1>
                      <p className="text-zinc-400">Open Source Autonomous Agent Platform.</p>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-left space-y-4 shadow-xl">
                      <h3 className="text-lg font-medium text-white">Quick Setup</h3>
                      
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase">Choose Provider</label>
                          <select 
                            value={config.provider}
                            onChange={(e) => {
                                const prov = e.target.value as LLMProvider;
                                // Set default model for provider
                                let defModel = 'gpt-4o';
                                if (prov === 'gemini') defModel = 'gemini-2.0-flash-lite';
                                if (prov === 'anthropic') defModel = 'claude-3-5-sonnet-20240620';
                                if (prov === 'openrouter') defModel = 'anthropic/claude-3.5-sonnet';
                                setConfig({...config, provider: prov, modelId: defModel});
                            }}
                            className="w-full bg-black border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                          >
                              {LLM_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                      </div>

                      <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase">API Key</label>
                          <input 
                            type="password" 
                            value={config.apiKey} 
                            onChange={(e) => setConfig({...config, apiKey: e.target.value})} 
                            className="w-full bg-black border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                            placeholder="sk-..." 
                          />
                      </div>
                      
                      <button 
                        onClick={saveConfiguration}
                        disabled={!config.apiKey && config.provider !== 'custom'} // Custom might use localhost no key
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                      >
                          Initialize System
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* GITHUB MODAL */}
      {showGithubModal && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-6">
                  <div className="flex justify-between items-center">
                      <h3 className="text-lg font-light text-white flex items-center gap-2"><Github size={20}/> GitHub Connect</h3>
                      <button onClick={() => setShowGithubModal(false)} className="text-zinc-500 hover:text-white"><X size={20}/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs uppercase font-bold text-zinc-500 mb-1 block">Access Token</label>
                          <input type="password" value={ghConfig.token} onChange={e => setGhConfig({...ghConfig, token: e.target.value})} className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" placeholder="ghp_..." />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs uppercase font-bold text-zinc-500 mb-1 block">Owner</label>
                              <input type="text" value={ghConfig.owner} onChange={e => setGhConfig({...ghConfig, owner: e.target.value})} className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" placeholder="username" />
                          </div>
                          <div>
                              <label className="text-xs uppercase font-bold text-zinc-500 mb-1 block">Repo</label>
                              <input type="text" value={ghConfig.repo} onChange={e => setGhConfig({...ghConfig, repo: e.target.value})} className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" placeholder="repository" />
                          </div>
                      </div>
                  </div>
                  <button onClick={saveGithubConfig} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                      <Save size={16}/> Connect
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};