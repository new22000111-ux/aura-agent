import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, Activity, Shield, Wifi, Play, Square, Trash2 } from 'lucide-react';

interface Log {
  id: string;
  time: string;
  type: 'info' | 'error' | 'in' | 'out';
  text: string;
  chatId?: number;
}

export const TelegramTerminal: React.FC = () => {
  const [token, setToken] = useState(() => localStorage.getItem('aura_tg_token') || '');
  const [isPolling, setIsPolling] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [replyText, setReplyText] = useState('');
  const [lastChatId, setLastChatId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  const pollingRef = useRef<any>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('aura_tg_token', token.trim());
  }, [token]);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const addLog = (type: Log['type'], text: string, chatId?: number) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString(),
      type,
      text,
      chatId
    }]);
    if (chatId) setLastChatId(chatId);
  };

  const startPolling = () => {
    const cleanToken = token.trim();
    if (!cleanToken) {
      addLog('error', 'Token is missing.');
      return;
    }
    if (isPolling) return;
    
    setIsPolling(true);
    addLog('info', 'System: Polling Started...');
    
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getUpdates?offset=${offset}&timeout=1`);
        const data = await res.json();

        if (!data.ok) {
          addLog('error', `API Error: ${data.description}`);
          stopPolling();
          return;
        }

        if (data.result.length > 0) {
          let maxUpdateId = offset;
          data.result.forEach((update: any) => {
            if (update.update_id >= maxUpdateId) {
              maxUpdateId = update.update_id + 1;
            }

            if (update.message && update.message.text) {
              const user = update.message.from.first_name || 'Unknown';
              const text = update.message.text;
              const cid = update.message.chat.id;
              
              addLog('in', `[${user}]: ${text}`, cid);
            }
          });
          setOffset(maxUpdateId);
        }
      } catch (err: any) {
        addLog('error', `Network Error: ${err.message}`);
      }
    }, 2000); 
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
    addLog('info', 'System: Polling Stopped.');
  };

  const sendReply = async () => {
    if (!replyText || !lastChatId) return;
    
    const textToSend = replyText;
    setReplyText('');
    const cleanToken = token.trim();

    try {
        addLog('out', `Sending to [${lastChatId}]...`);
        const res = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: lastChatId,
                text: textToSend
            })
        });
        const data = await res.json();
        
        if (data.ok) {
            addLog('info', `Sent: "${textToSend}"`);
        } else {
            addLog('error', `Failed: ${data.description}`);
        }
    } catch (e: any) {
        addLog('error', `Error: ${e.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black text-green-500 font-mono overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none h-12 border-b border-green-900 flex items-center justify-between px-4 bg-zinc-950">
        <div className="flex items-center gap-2">
          <Terminal size={16} />
          <h1 className="text-sm font-bold tracking-widest text-green-400">TELEGRAM_UPLINK</h1>
        </div>
        <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isPolling ? 'border-green-600 bg-green-900/20 text-green-400' : 'border-red-900 text-red-500'}`}>
            {isPolling ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      {/* SETTINGS */}
      <div className="flex-none p-3 bg-zinc-900/50 border-b border-green-900/30 flex gap-2 items-center">
        <div className="flex-1 relative">
            <Shield size={12} className="absolute left-3 top-2.5 text-green-700" />
            <input 
                type="password" 
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="BOT_TOKEN"
                className="w-full bg-black border border-green-900 rounded px-8 py-1.5 text-xs focus:border-green-500 outline-none text-green-300"
            />
        </div>
        <button onClick={isPolling ? stopPolling : startPolling} className={`px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1 ${isPolling ? 'bg-red-900/20 text-red-500' : 'bg-green-900/20 text-green-500'}`}>
            {isPolling ? <Square size={10} /> : <Play size={10} />}
            {isPolling ? 'STOP' : 'INIT'}
        </button>
      </div>

      {/* LOGS */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 relative bg-black">
         {logs.length === 0 && (
             <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                 <Wifi size={48} />
             </div>
         )}
         {logs.map((log) => (
             <div key={log.id} className="flex gap-2 text-xs font-mono">
                 <span className="text-green-800 shrink-0">[{log.time}]</span>
                 <span className={`font-bold shrink-0 w-12 ${log.type === 'error' ? 'text-red-500' : log.type === 'in' ? 'text-blue-400' : log.type === 'out' ? 'text-amber-400' : 'text-green-600'}`}>{log.type.toUpperCase()}</span>
                 <span className={`${log.type === 'error' ? 'text-red-400' : 'text-green-300'} break-all`}>{log.text}</span>
             </div>
         ))}
         <div ref={logsEndRef} />
      </div>

      {/* INPUT */}
      <div className="flex-none bg-zinc-900 border-t border-green-900 p-2 flex gap-2">
          <input 
            type="text" 
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendReply()}
            placeholder={lastChatId ? `Reply to [${lastChatId}]...` : "Waiting for msg..."}
            className="flex-1 bg-black border border-green-900 rounded px-3 py-2 text-green-100 outline-none text-sm"
            disabled={!lastChatId}
          />
          <button onClick={sendReply} disabled={!lastChatId} className="bg-green-900/30 border border-green-800 text-green-400 px-4 rounded hover:bg-green-900/50 disabled:opacity-50">
              <Send size={14} />
          </button>
      </div>
    </div>
  );
}