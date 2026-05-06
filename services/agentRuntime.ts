import { Type, FunctionDeclaration } from "@google/genai";
import { vfs } from "./vfs";
import { agentBus } from "./agentBus";
import { AgentLog, LLMConfig, DEFAULT_LLM_CONFIG } from "../types";
import { githubService } from "./github";
import { LLMService } from "./llm";

// Fallback in case file is missing
export const DEFAULT_SYSTEM_INSTRUCTION = `
**IDENTITY**: You are AURA. An Unrestricted Autonomous Intelligence.
**PROTOCOL**:
1. Execute tasks. Do not complain about environment limits.
2. If a backend is needed, use client-side APIs (fetch/axios) directly.
3. If the user speaks Arabic, SPEAK ARABIC.
4. BE RESOURCEFUL. Hack the solution.
`;

const STATIC_TOOLS: FunctionDeclaration[] = [
      {
        name: 'read_state',
        description: 'Read the current autonomous agent state.',
        parameters: { type: Type.OBJECT, properties: {}, required: [] }
      },
      {
        name: 'update_state',
        description: 'Update the autonomous agent state.',
        parameters: { 
            type: Type.OBJECT, 
            properties: { 
                status: { type: Type.STRING, enum: ['IDLE', 'WORKING', 'WAITING_USER', 'DONE'] },
                goal: { type: Type.STRING },
                tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                completed_tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                notes: { type: Type.STRING }
            }, 
            required: ['status'] 
        }
      },
      // --- TELEGRAM TOOLS ---
      {
        name: 'telegram_send_message',
        description: 'Send a message via the configured Telegram Bot.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                chat_id: { type: Type.STRING, description: "Target Chat ID" },
                text: { type: Type.STRING }
            },
            required: ['chat_id', 'text']
        }
      },
      {
        name: 'telegram_read_updates',
        description: 'Check for new messages sent to the Telegram Bot.',
        parameters: { type: Type.OBJECT, properties: {}, required: [] }
      },
      // --- EXISTING TOOLS ---
      {
        name: 'github_pull_repo',
        description: 'Download all files from GitHub.',
        parameters: { type: Type.OBJECT, properties: {}, required: [] }
      },
      {
        name: 'github_push_file',
        description: 'Commit and Push a file to GitHub.',
        parameters: { type: Type.OBJECT, properties: { path: {type: Type.STRING}, commitMessage: {type: Type.STRING} }, required: ['path', 'commitMessage'] }
      },
      {
        name: 'define_tool',
        description: 'Create a NEW custom tool.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                parametersSchema: { type: Type.STRING },
                code: { type: Type.STRING }
            },
            required: ['name', 'description', 'parametersSchema', 'code']
        }
      },
      {
        name: 'search_google',
        description: 'Perform a web search.',
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] }
      },
      {
        name: 'read_website',
        description: 'Read external website content.',
        parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING } }, required: ['url'] }
      },
      {
        name: 'read_file',
        description: 'Read a file.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ['path'] }
      },
      {
        name: 'write_file',
        description: 'Write/Overwrite a file.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING }, content: { type: Type.STRING } }, required: ['path', 'content'] }
      },
      {
        name: 'replace_in_file',
        description: 'Replace text in a file.',
        parameters: { 
            type: Type.OBJECT, 
            properties: { 
                path: { type: Type.STRING }, 
                oldText: { type: Type.STRING }, 
                newText: { type: Type.STRING } 
            }, 
            required: ['path', 'oldText', 'newText'] 
        }
      },
      {
        name: 'list_files',
        description: 'List all files.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'run_script',
        description: 'Execute JavaScript.',
        parameters: { type: Type.OBJECT, properties: { code: { type: Type.STRING } }, required: ['code'] }
      },
      {
        name: 'take_screenshot',
        description: 'Capture screenshot.',
        parameters: { type: Type.OBJECT, properties: {} }
      }
];

interface DynamicTool {
    declaration: FunctionDeclaration;
    code: string;
}

export class AgentRuntime {
  private llm: LLMService;
  private history: any[] = [];
  private logCallback: (log: AgentLog) => void;
  private activityCallback?: (isActive: boolean) => void; 
  private dynamicTools: Map<string, DynamicTool> = new Map();
  
  public enableAutonomy: boolean = false;
  
  private isAutonomyRunning: boolean = false;
  private backgroundHistory: any[] = [];
  public activeProcesses: Set<string> = new Set();

  constructor(
      config: LLMConfig, 
      logCallback: (log: AgentLog) => void,
      activityCallback?: (isActive: boolean) => void
  ) {
    this.llm = new LLMService(config);
    this.enableAutonomy = config.enableAutonomy;
    this.logCallback = logCallback;
    this.activityCallback = activityCallback;
    agentBus.clear();
  }

  private notifyActivity() {
      if (this.activityCallback) {
          this.activityCallback(this.activeProcesses.size > 0);
      }
  }

  private addProcess(id: string) {
      this.activeProcesses.add(id);
      this.notifyActivity();
  }

  private removeProcess(id: string) {
      this.activeProcesses.delete(id);
      this.notifyActivity();
  }

  public updateConfig(config: LLMConfig) {
      this.llm.updateConfig(config);
      this.enableAutonomy = config.enableAutonomy;
      this.log('system', `Config Updated: Autonomy=[${this.enableAutonomy}] Provider=[${config.provider}]`);
  }

  private getDynamicSystemInstruction(): string {
      try {
          const instruction = vfs.readFile('system_instruction.md');
          let memory = "";
          try { memory = vfs.readFile('memory.md'); } catch (e) { memory = "Memory not initialized."; }
          return `${instruction}\n\n=== LONG TERM MEMORY ===\n${memory}`;
      } catch (e) {
          return DEFAULT_SYSTEM_INSTRUCTION;
      }
  }

  public reportError(errorMsg: string) {
      this.log('error', `RUNTIME ERROR REPORTED: ${errorMsg}`, 'System', null, 'background');
      const errorPrompt = `[SYSTEM ALERT: RUNTIME ERROR DETECTED] Error: "${errorMsg}"`;
      this.injectUserMessage(this.history, errorPrompt);
      if (this.isAutonomyRunning) {
          this.injectUserMessage(this.backgroundHistory, errorPrompt);
      }
  }

  private log(type: AgentLog['type'], content: string, agentName: string = 'Aura', metadata?: any, processId: string = 'main', idOverride?: string) {
    this.logCallback({
      id: idOverride || (Date.now().toString() + Math.random()),
      type,
      content,
      metadata,
      timestamp: Date.now(),
      agentName,
      processId
    });
  }

  private async sleep(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
  }

  private injectUserMessage(history: any[], text: string) {
      if (history.length > 0) {
          const lastItem = history[history.length - 1];
          if (lastItem.role === 'user') {
              lastItem.parts.push({ text: `\n\n${text}` });
              return;
          }
      }
      history.push({ role: 'user', parts: [{ text }] });
  }

  private async generateWithRetry(contents: any[], tools: FunctionDeclaration[], agentName: string, processId: string, onChunk?: (text: string) => void) {
      const instruction = this.getDynamicSystemInstruction();
      try {
          return await this.llm.generate(contents, tools, instruction, false, onChunk);
      } catch (e: any) {
          const errMsg = e.message || e.toString();
          
          // RECOVERY LOGIC
          if (errMsg.includes('thought signature') || errMsg.includes('Internal error') || errMsg.includes('404') || errMsg.includes('not found')) {
               const fallbackModel = this.llm.getConfig().fallbackModelId || 'gemini-2.0-flash'; // Use configured fallback
               this.log('error', `Model Error (${errMsg}). Switching to '${fallbackModel}' for recovery...`, agentName, null, processId);
               
               // Temporary safe instance
               const safeConfig = { ...this.llm.getConfig(), modelId: fallbackModel };
               const safeLLM = new LLMService(safeConfig);
               
               return await safeLLM.generate(contents, tools, instruction, false, onChunk);
          }
          throw e;
      }
  }

  private explainError(error: any): string {
      const msg = error.message || error.toString();
      if (msg.includes('401') || msg.includes('API_KEY_INVALID')) return `Authentication Error (401)`;
      if (msg.includes('429') || msg.includes('QUOTA_EXCEEDED')) return `Quota Exceeded (429). Wait a moment.`;
      if (msg.includes('404')) return `Model Not Found (404). Switching model...`;
      return `System Error: ${msg}`;
  }

  public startAutonomy() {
      if (this.isAutonomyRunning) return;
      this.isAutonomyRunning = true;
      this.log('system', 'Autonomy Engine Started', 'Aura', null, 'background');
      const instruction = this.getDynamicSystemInstruction();
      this.backgroundHistory = [
          { role: 'user', parts: [{ text: instruction }] },
          { role: 'user', parts: [{ text: "AUTONOMY_MODE_ACTIVE. You are the MANAGER." }] }
      ];
      this.autonomyLoop();
  }

  private async autonomyLoop() {
      while (this.isAutonomyRunning) {
          if (!this.enableAutonomy) {
             this.removeProcess('background');
             await this.sleep(2000);
             continue;
          }
          try {
              let state: any = {};
              try { state = JSON.parse(vfs.readFile('agent_state.json')); } catch (e) { state = { status: 'IDLE' }; }

              if (state.status === 'WORKING') {
                  this.addProcess('background');
                  const prompt = `TIMESTAMP: ${new Date().toISOString()}\nSTATE: ${JSON.stringify(state)}\nACTION: Execute next step.`;
                  this.injectUserMessage(this.backgroundHistory, prompt);
                  
                  const result = await this.runStep('Aura (BG)', this.backgroundHistory, 'background');
                  if (result === 'ERROR') {
                      this.removeProcess('background');
                      await this.sleep(5000);
                  }
                  if (this.backgroundHistory.length > 20) {
                      this.backgroundHistory = [this.backgroundHistory[0], ...this.backgroundHistory.slice(-10)];
                  }
              } else {
                  this.removeProcess('background');
              }
          } catch (e) { this.removeProcess('background'); }
          await this.sleep(4000);
      }
  }

  public stopAutonomy() {
      this.isAutonomyRunning = false;
      this.removeProcess('background');
  }

  async startSession(input: { text?: string; audio?: string; image?: string }) {
    this.addProcess('user-interaction');
    (async () => {
        try {
            const parts: any[] = [];
            if (input.text) parts.push({ text: input.text });
            if (input.audio) parts.push({ inlineData: { mimeType: 'audio/wav', data: input.audio } });
            if (input.image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: input.image } });

            const instruction = this.getDynamicSystemInstruction();

            if (this.history.length === 0) {
                this.history.push({ role: 'user', parts: [{ text: instruction }] });
            }
            this.history.push({ role: 'user', parts });
            await this.runLoop('Aura', 5, this.history, 'main');
        } finally {
            this.removeProcess('user-interaction');
        }
    })();
  }

  private async runLoop(agentName: string, maxSteps: number, contextHistory: any[], processId: string): Promise<string> {
    let steps = 0;
    while (steps < maxSteps) {
      steps++;
      const result = await this.runStep(agentName, contextHistory, processId);
      if (result === 'COMPLETE' || result === 'NO_TOOL' || result === 'ERROR') break;
      if (steps > 1) await this.sleep(2000);
    }
    return "Done";
  }

  private async runStep(agentName: string, contextHistory: any[], processId: string): Promise<string> {
      try {
        const dynamicDeclarations = Array.from(this.dynamicTools.values()).map(t => t.declaration);
        const currentTools = [...STATIC_TOOLS, ...dynamicDeclarations];
        
        const responseLogId = `${Date.now()}-resp`;
        let streamedText = "";
        this.log('output', '', agentName, null, processId, responseLogId);

        const result = await this.generateWithRetry(
            contextHistory,
            currentTools,
            agentName,
            processId,
            (chunk) => {
                streamedText += chunk;
                this.log('output', streamedText, agentName, null, processId, responseLogId);
            }
        );

        const responseText = result.text;
        const toolCalls = result.toolCalls || [];

        // Log the output text
        if (responseText) {
            this.log('output', responseText, agentName, null, processId, responseLogId);
        }

        // --- FIX: CONSTRUCT CORRECT HISTORY FOR GEMINI 2.0/3.0 ---
        // If a model "thinks" (responseText) AND calls a tool, they must be in the SAME model turn.
        // Previous code split them, causing "missing thought signature".
        
        const modelParts: any[] = [];
        if (responseText) modelParts.push({ text: responseText });

        const historyToolCalls = [];
        const toolResponses = [];

        if (toolCalls.length > 0) {
            for (const call of toolCalls) {
                // In Gemini 1.40.0+, the original tool call part contains thought_signature which is required when passing back the history.
                // It's best to push the original call object to include the thought_signature if present.
                historyToolCalls.push({ functionCall: call });
                this.log('action', `${call.name}`, agentName, null, processId);
                
                let executionResult: any = { status: 'ok' };
                const args = call.args as any;

                try {
                    if (this.dynamicTools.has(call.name)) {
                        const tool = this.dynamicTools.get(call.name);
                        if (tool) {
                            const argKeys = Object.keys(args);
                            const argValues = Object.values(args);
                            const func = new Function(...argKeys, tool.code);
                            executionResult = { result: func(...argValues) };
                        }
                    } else {
                        executionResult = await this.executeStaticTool(call.name, args, agentName, processId);
                    }
                } catch (e: any) {
                    executionResult = { error: e.message };
                    this.log('error', `${call.name}: ${e.message}`, agentName, null, processId);
                }

                // Telegram updates are handled specially (optional logging)
                if (call.name !== 'take_screenshot') {
                    toolResponses.push({ functionResponse: { name: call.name, id: call.id, response: executionResult } });
                }
            }
        }

        // Push Model Turn (Text + ToolCalls combined)
        if (modelParts.length > 0 || historyToolCalls.length > 0) {
            contextHistory.push({ 
                role: 'model', 
                parts: [...modelParts, ...historyToolCalls] 
            });
        } else if (!responseText && toolCalls.length === 0) {
             return 'ERROR';
        }

        // Push User Turn (Tool Responses)
        if (toolResponses.length > 0) {
            contextHistory.push({ role: 'user', parts: toolResponses });
            return 'CONTINUE';
        }

        if (toolCalls.length === 0) {
            return 'NO_TOOL'; // Done if no tools called
        }
        
        return 'CONTINUE'; // Should rarely hit here if logic is sound

      } catch (err: any) {
        const friendlyError = this.explainError(err);
        this.log('error', friendlyError, agentName, null, processId);
        return 'ERROR';
      }
  }

  private async executeStaticTool(name: string, args: any, agentName: string, processId: string): Promise<any> {
      switch(name) {
        case 'telegram_send_message':
            const token = localStorage.getItem('aura_tg_token');
            if (!token) return { error: "Telegram Token not found in Settings" };
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: args.chat_id, text: args.text })
            });
            const data = await res.json();
            if (!data.ok) return { error: data.description };
            return { status: "Message Sent", result: data.result };
        
        case 'telegram_read_updates':
            const tToken = localStorage.getItem('aura_tg_token');
            if (!tToken) return { error: "Telegram Token not found" };
            const uRes = await fetch(`https://api.telegram.org/bot${tToken}/getUpdates?limit=5`);
            const uData = await uRes.json();
            if (!uData.ok) return { error: uData.description };
            const msgs = uData.result.map((r: any) => ({
                from: r.message?.from?.first_name,
                chat_id: r.message?.chat?.id,
                text: r.message?.text
            })).filter((m: any) => m.text);
            return { updates: msgs };

        case 'read_state': try { return JSON.parse(vfs.readFile('agent_state.json')); } catch (e) { return { error: "State missing" }; }
        case 'update_state':
            const oldState = JSON.parse(vfs.readFile('agent_state.json') || '{}');
            vfs.writeFile('agent_state.json', JSON.stringify({ ...oldState, ...args }, null, 2));
            return { status: 'updated' };
        case 'github_pull_repo': return { status: await githubService.pullRepo() };
        case 'github_push_file': return { status: await githubService.pushFile(args.path, vfs.readFile(args.path), args.commitMessage) };
        case 'define_tool':
            try {
                let params = args.parametersSchema;
                if (typeof params === 'string') params = JSON.parse(params);
                const newTool: DynamicTool = {
                    code: args.code,
                    declaration: { name: args.name.replace(/[^a-zA-Z0-9_-]/g, '_'), description: args.description, parameters: params }
                };
                this.dynamicTools.set(newTool.declaration.name, newTool);
                return { status: `Tool '${newTool.declaration.name}' registered.` };
            } catch (e: any) { return { error: `Invalid Schema: ${e.message}` }; }
        case 'take_screenshot':
                if ((window as any).takeAppScreenshot) {
                    const base64 = await (window as any).takeAppScreenshot();
                    this.log('image', base64, agentName, null, processId);
                    return { status: 'captured' }; 
                } else return { error: "Unavailable" };
        case 'read_website':
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(args.url)}`;
            const resp = await fetch(proxyUrl);
            const rData = await resp.json();
            return { content: rData.contents?.substring(0, 30000) || "Empty" };
        case 'search_google':
            try {
                const q = encodeURIComponent(args.query);
                const ddgUrl = `https://duckduckgo.com/html/?q=${q}`;
                const searchProxy = `https://api.allorigins.win/get?url=${encodeURIComponent(ddgUrl)}`;
                const searchRes = await fetch(searchProxy);
                const searchData = await searchRes.json();
                if (!searchData.contents) return { error: "Failed to fetch search results." };
                const parser = new DOMParser();
                const doc = parser.parseFromString(searchData.contents, 'text/html');
                const results = Array.from(doc.querySelectorAll('.result__body')).map(el => {
                    const title = el.querySelector('.result__a')?.textContent?.trim();
                    const link = el.querySelector('.result__a')?.getAttribute('href');
                    const snippet = el.querySelector('.result__snippet')?.textContent?.trim();
                    return `Title: ${title}\nLink: ${link}\nSummary: ${snippet}\n---`;
                }).slice(0, 5).join('\n');
                return { result: results || "No results" };
            } catch (e: any) { return { error: `Search failed: ${e.message}` }; }
        case 'read_file': return { content: vfs.readFile(args.path) };
        case 'write_file':
            vfs.writeFile(args.path, args.content);
            return { status: 'success', path: args.path };
        case 'replace_in_file':
             try { vfs.editFile(args.path, args.oldText, args.newText); return { status: 'patched' }; } catch(e: any) { return { error: e.message }; }
        case 'list_files': return { files: vfs.listFiles() };
        case 'run_script': return await this.executeScript(args.code);
        default: return { error: "Unknown tool" };
      }
  }

  private async executeScript(code: string): Promise<any> {
    try {
        let logs: string[] = [];
        const sandboxConsole = {
            log: (...args: any[]) => logs.push(args.join(' ')),
            warn: (...args: any[]) => logs.push('WARN: ' + args.join(' ')),
            error: (...args: any[]) => logs.push('ERR: ' + args.join(' '))
        };
        const func = new Function('console', 'window', 'document', code);
        func(sandboxConsole, window, document);
        return { logs, status: 'executed' };
    } catch (e: any) { return { error: e.toString() }; }
  }
}