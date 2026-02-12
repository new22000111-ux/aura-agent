import React, { useState, useEffect, useRef } from 'react';
import { Play, Mic, Eye, Activity, BrainCircuit, Menu, Folder, MessageSquare, Settings as SettingsIcon, Save, Volume2, VolumeX, Github, X, Server, Shield, Sliders, AlertTriangle, Terminal, ChevronUp, ChevronDown, Zap, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { vfs } from '../services/vfs';
import { AgentRuntime, DEFAULT_SYSTEM_INSTRUCTION } from '../services/agentRuntime';
import { VirtualFile, AgentLog, LLMConfig, DEFAULT_LLM_CONFIG, LLMProvider } from '../types';
import { blobToBase64 } from '../utils/audioUtils';
import { FileExplorer } from './FileExplorer';
import { githubService } from '../services/github';
import { TelegramTerminal } from './TelegramTerminal';

declare const html2canvas: any;

type ViewMode = 'chat' | 'files' | 'preview' | 'settings' | 'telegram';
type SettingsTab = 'general' | 'llm' | 'advanced';

const LLM_PROVIDERS: {id: LLMProvider, name: string}[] = [
    { id: 'gemini', name: 'Google Gemini' },
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'openrouter', name: 'OpenRouter' },
    { id: 'custom', name: 'Custom (Ollama/Compatible)' }
];

// --- HELPER COMPONENTS ---

const CodeBlock = ({ children, className }: any) => {
    const [copied, setCopied] = useState(false);
    const text = String(children).replace(/\n$/, '');
    
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';

    return (
        <div className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-[#0d0d0d]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">{lang || 'CODE'}</span>
                <button onClick={handleCopy} className="text-zinc-500 hover:text-white transition-colors">
                    {copied ? <Check size={12} className="text-emerald-500"/> : <Copy size={12}/>}
                </button>
            </div>
            <div className="p-3 overflow-x-auto">
                <code className={`text-xs font-mono text-zinc-300 ${className}`}>
                    {children}
                </code>
            </div>
        </div>
    );
};

export const AgentWorkspace: React.FC = () => {
  // State
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<Record<string, VirtualFile>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>('chat');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // UI Status State
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const [showConsole, setShowConsole] = useState(false); 

  // Configuration State
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_LLM_CONFIG);
  const [systemInstruction, setSystemInstruction] = useState(""); 
  
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
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // --- INIT ---
  useEffect(() => {
    refreshFiles();
    
    // Load Config
    const savedConfigStr = localStorage.getItem('aura_llm_config');
    const savedGh = githubService.getConfig();

    let initialConfig = DEFAULT_LLM_CONFIG;
    if (savedConfigStr) {
        initialConfig = JSON.parse(savedConfigStr);
        // Migration: Ensure fallbackModelId exists for old configs
        if (!initialConfig.fallbackModelId) {
            initialConfig.fallbackModelId = 'gemini-2.0-flash';
        }
        setConfig(initialConfig);
    } else {
        if (process.env.API_KEY) {
            initialConfig = { ...DEFAULT_LLM_CONFIG, apiKey: process.env.API_KEY };
            setConfig(initialConfig);
        } else {
            setShowOnboarding(true);
        }
    }

    try {
        setSystemInstruction(vfs.readFile('system_instruction.md'));
    } catch(e) {
        setSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION);
    }

    if (savedGh) {
        setGhConfig({ token: savedGh.token, owner: savedGh.owner, repo: savedGh.repo });
        setGhConnected(true);
    }

    runtimeRef.current = new AgentRuntime(
        initialConfig, 
        (log) => {
            setLogs(prev => {
                const index = prev.findIndex(l => l.id === log.id);
                if (index !== -1) {
                    const newLogs = [...prev];
                    newLogs[index] = log;
                    return newLogs;
                }
                return [...prev, log];
            });
            if (log.type === 'action') refreshFiles();
        },
        (isActive) => setIsAgentBusy(isActive)
    );
    
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
    if (showConsole) consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showConsole]);

  // --- PREVIEW RENDERER ---
  useEffect(() => {
      if (activeView === 'preview' && previewRef.current) {
          const doc = previewRef.current.contentDocument;
          if (doc) {
              const appCode = files['App.tsx']?.content || '';
              
              const cleanAppCode = appCode
                  .replace(/import\s+.*?from\s+['"].*?['"];?/g, '') 
                  .replace(/export\s+default\s+function\s+App/, 'function App');

              const scriptContent = `
                try {
                    const { useState, useEffect, useRef, useMemo, useCallback } = React;
                    const { createRoot } = ReactDOM;
                    
                    const LucideIcons = window.lucide;
                    Object.keys(LucideIcons).forEach(key => {
                        window[key] = LucideIcons[key];
                    });

                    ${cleanAppCode}

                    const root = createRoot(document.getElementById('root'));
                    root.render(<App />);
                } catch (err) {
                    document.body.innerHTML = '<div style="color:red; padding:20px; font-family:monospace"><h3>Runtime Error</h3><pre>' + err.message + '</pre></div>';
                }
              `;

              const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8" />
                    <script src="https://cdn.tailwindcss.com"></script>
                    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
                    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                    <script src="https://unpkg.com/lucide@latest"></script>
                    <style>
                        body { background-color: #000; color: white; }
                        ::-webkit-scrollbar { width: 6px; }
                        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
                    </style>
                </head>
                <body>
                    <div id="root"></div>
                    <script type="text/babel" data-presets="react">
                        ${scriptContent}
                    </script>
                </body>
                </html>
              `;

              doc.open();
              doc.write(fullHtml);
              doc.close();
          }
      }
  }, [files['App.tsx']?.lastModified, activeView]);

  // --- HANDLERS ---

  const refreshFiles = () => {
    setFiles({ ...vfs.getAllFiles() });
    if (!selectedFile) {
        const keys = vfs.listFiles();
        if (keys.includes('App.tsx')) setSelectedFile('App.tsx');
        else if (keys.length > 0) setSelectedFile(keys[0]);
    }
  };

  const saveConfiguration = () => {
      localStorage.setItem('aura_llm_config', JSON.stringify(config));
      vfs.writeFile('system_instruction.md', systemInstruction);
      refreshFiles();
      if (runtimeRef.current) {
          runtimeRef.current.updateConfig(config);
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

  const renderLogContent = (log: AgentLog, isLast: boolean) => {
      if (log.type === 'thought') {
          return (
              <div className="text-xs text-zinc-500 font-mono my-2 pl-3 border-l-2 border-zinc-800 opacity-70 hover:opacity-100 transition-opacity">
                  <span className="font-bold text-zinc-600 mr-2">THINKING</span>
                  {log.content}
              </div>
          );
      }
      if (log.type === 'action') return <div className="text-xs text-amber-500 font-mono my-1 flex items-center gap-2"><Zap size={10} /> {log.content}</div>;
      
      if (log.type === 'error') {
          return (
              <div className="text-xs font-mono my-2 bg-red-950/20 border border-red-900/50 p-3 rounded-lg flex items-start gap-3">
                  <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                     <span className="text-red-400 font-bold">System Alert</span>
                     <span className="text-zinc-300 whitespace-pre-wrap">{log.content}</span>
                  </div>
              </div>
          );
      }
      
      return (
        <div className="text-sm text-zinc-200 leading-relaxed markdown-body">
             <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                    code(props) {
                        const {children, className, node, ...rest} = props
                        const match = /language-(\w+)/.exec(className || '')
                        return match ? (
                            <CodeBlock className={className}>{children}</CodeBlock>
                        ) : (
                            <code {...rest} className="bg-zinc-800 text-indigo-200 px-1 py-0.5 rounded text-xs font-mono">
                                {children}
                            </code>
                        )
                    },
                    p: ({children}) => <p className="mb-3 last:mb-0">{children}</p>,
                    a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{children}</a>,
                }}
             >
                 {log.content + (isLast && isAgentBusy && log.agentName !== 'User' ? ' ▍' : '')}
             </ReactMarkdown>
        </div>
      );
  };

  const saveGithubConfig = async () => {
    githubService.saveConfig(ghConfig);
    try {
        await githubService.validateUser();
        setGhConnected(true);
        setShowGithubModal(false);
    } catch(e) { alert("GitHub Connection Failed"); }
  };

  const mainLogs = logs.filter(l => l.processId !== 'background');
  const consoleLogs = logs.filter(l => l.processId === 'background');

  return (
    <div ref={workspaceRef} className="flex flex-col h-full w-full bg-black text-zinc-100 font-sans relative">
       <style>{`
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
        .markdown-body { font-size: 14px; }
       `}</style>
      
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
                          <button onClick={() => { setActiveView('telegram'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='telegram'?'text-white':'text-zinc-400'}`}><Terminal size={16}/> Telegram Uplink</button>
                          <button onClick={() => { setActiveView('files'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='files'?'text-white':'text-zinc-400'}`}><Folder size={16}/> Files</button>
                          <button onClick={() => { setActiveView('preview'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='preview'?'text-white':'text-zinc-400'}`}><Eye size={16}/> Preview</button>
                          <div className="h-px bg-zinc-800 my-1"></div>
                          <button onClick={() => { setActiveView('settings'); setIsMenuOpen(false); }} className={`px-4 py-3 text-sm text-left flex gap-3 hover:bg-zinc-800 ${activeView==='settings'?'text-white':'text-zinc-400'}`}><SettingsIcon size={16}/> Settings</button>
                      </div>
                  )}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wide text-zinc-200">AURA</span>
                {isAgentBusy && (
                    <div className="flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
                        <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wide">Processing</span>
                    </div>
                )}
              </div>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setShowConsole(!showConsole)} className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-mono border ${showConsole ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-transparent text-zinc-500 border-transparent hover:bg-zinc-800'}`}>
                 <Terminal size={14}/> {consoleLogs.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>}
             </button>
             <button onClick={() => setShowGithubModal(true)} className={`p-2 rounded-full ${ghConnected ? 'text-emerald-500 bg-emerald-950/30' : 'text-zinc-600'}`}><Github size={16}/></button>
          </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
          
          <div className="flex-1 relative overflow-hidden">
            {/* CHAT */}
            {activeView === 'chat' && (
                <div className="absolute inset-0 flex flex-col bg-black">
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {mainLogs.map((log, idx) => (
                            <div key={log.id} className={`flex flex-col space-y-1 ${log.agentName === 'User' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[90%] ${log.agentName === 'User' ? 'bg-zinc-900 px-4 py-2 rounded-xl text-white' : 'w-full pl-0'}`}>
                                    {renderLogContent(log, idx === mainLogs.length - 1)}
                                </div>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                    {/* INPUT AREA */}
                    <div className="p-4 bg-black border-t border-zinc-900">
                        <div className="relative flex items-center gap-2">
                            <button onClick={toggleRecording} className={`p-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-zinc-900 text-zinc-500'}`}><Mic size={20}/></button>
                            <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInput({text: prompt})} className="w-full bg-zinc-900 border-none rounded-full py-3 px-5 text-sm text-white focus:ring-1 focus:ring-indigo-500" placeholder="Type a message..." />
                            <button onClick={() => handleInput({text: prompt})} className="absolute right-2 p-2 bg-indigo-600 rounded-full text-white"><Play size={14}/></button>
                        </div>
                    </div>
                </div>
            )}

            {/* TELEGRAM */}
            {activeView === 'telegram' && (
                <div className="absolute inset-0 z-10">
                    <TelegramTerminal />
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
                        
                        <div className="flex space-x-1 bg-zinc-900 p-1 rounded-lg w-fit">
                            <button onClick={() => setSettingsTab('llm')} className={`px-4 py-2 text-xs font-bold rounded-md ${settingsTab==='llm'?'bg-zinc-800 text-white':'text-zinc-500'}`}>Provider & Model</button>
                            <button onClick={() => setSettingsTab('general')} className={`px-4 py-2 text-xs font-bold rounded-md ${settingsTab==='general'?'bg-zinc-800 text-white':'text-zinc-500'}`}>System Identity</button>
                            <button onClick={() => setSettingsTab('advanced')} className={`px-4 py-2 text-xs font-bold rounded-md ${settingsTab==='advanced'?'bg-zinc-800 text-white':'text-zinc-500'}`}>Hyperparameters</button>
                        </div>

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
                                
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Fallback Model ID (Recovery)</label>
                                    <input type="text" value={config.fallbackModelId} onChange={(e) => setConfig({...config, fallbackModelId: e.target.value})} className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" placeholder="e.g. gemini-2.0-flash" />
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
          
          {showConsole && (
              <div className="h-64 bg-zinc-950 border-t border-zinc-800 flex flex-col shrink-0">
                  <div className="flex items-center justify-between px-3 py-1 bg-zinc-900 border-b border-zinc-800">
                      <div className="flex items-center gap-2">
                         <Terminal size={12} className="text-amber-500"/>
                         <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">System Console (Background Tasks)</span>
                      </div>
                      <button onClick={() => setShowConsole(false)} className="text-zinc-500 hover:text-white"><ChevronDown size={14}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-2">
                      {consoleLogs.length === 0 && <div className="text-zinc-600 italic">No background activity logged yet. Enable 'Autonomy' in settings to start the loop.</div>}
                      {consoleLogs.map(log => (
                          <div key={log.id} className="border-l-2 border-zinc-800 pl-2">
                              <div className="flex items-center gap-2 mb-1">
                                  <span className="text-zinc-500 text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                  <span className={`text-[10px] font-bold px-1 rounded ${log.type==='error'?'bg-red-900/50 text-red-400': log.type==='action'?'bg-blue-900/30 text-blue-400': 'bg-zinc-800 text-zinc-400'}`}>{log.type.toUpperCase()}</span>
                              </div>
                              <div className="text-zinc-300 whitespace-pre-wrap">{log.content}</div>
                          </div>
                      ))}
                      <div ref={consoleEndRef} />
                  </div>
              </div>
          )}

      </div>

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
                                let defModel = 'gpt-4o';
                                if (prov === 'gemini') defModel = 'gemini-2.0-flash';
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
                        disabled={!config.apiKey && config.provider !== 'custom'} 
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                      >
                          Initialize System
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};