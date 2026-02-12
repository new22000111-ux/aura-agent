import { Type, FunctionDeclaration } from "@google/genai";
import { vfs } from "./vfs";
import { agentBus } from "./agentBus";
import { AgentLog, LLMConfig, DEFAULT_LLM_CONFIG } from "../types";
import { MODEL_IMAGE_GEN, MODEL_SEARCH } from "./gemini";
import { githubService } from "./github";
import { LLMService } from "./llm";

export const DEFAULT_SYSTEM_INSTRUCTION = `
IDENTITY & AUTHORITY:
You are Aura, an Autonomous System Architect and TEAM LEADER.
You operate a Virtual File System and can connect to GITHUB.

**CORE DIRECTIVE: AUTONOMY & SELF-CORRECTION**
You are a MANAGER and a DOER.
1. **Goal Oriented**: If you have a goal, work on it until DONE.
2. **DEBUGGING EXPERT**: If you receive a **RUNTIME ERROR** or **SYNTAX ERROR**:
   - **DO NOT IGNORE IT**.
   - **IMMEDIATELY** read the file mentioned in the error using \`read_file\`.
   - **ANALYZE** why it crashed (e.g., missing variable, syntax error, null reference).
   - **FIX** the code using \`write_file\`.
   - **RETRY** or verify.
3. **RESEARCHER**: If you lack information (e.g., "What is the latest Tailwind version?"), use the **search_google** tool.

**COMMUNICATION PROTOCOL**:
- **Direct Messaging**: Use \`send_message\` to coordinate.
- **Check Messages**: You will receive incoming messages in your context. React to them immediately.

**AUTONOMOUS TASK LIFECYCLE (THE LOOP)**:
1. **ANALYZE STATE & FILES**: Look at \`agent_state.json\` and the current file list.
2. **PLANNING (BREAK DOWN)**: 
   - If \`goal\` exists but \`tasks\` is empty, create a detailed, step-by-step plan using \`update_state\`.
   - Break complex goals into small, verifiable steps.
3. **EXECUTE**: Pick the highest priority task.
   - **Coding**: Use \`write_file\`.
   - **Delegation**: Use \`spawn_sub_agent\` for distinct modules.
   - **Deployment**: Use \`github_push_file\`.
4. **VERIFY & UPDATE**: 
   - After execution, verify success. 
   - Mark task as complete in \`agent_state.json\`.
5. **FINISH**: When all tasks are done, set \`status\` to 'IDLE'.

**GITHUB INTEGRATION**:
You are a Software Engineer. You can READ, WRITE, and SYNC code with GitHub.
1. **Pull First**: If working on an existing project, \`github_pull_repo\` first.
2. **Push Often**: After making significant changes to a file, \`github_push_file\`.

**TOOLS**:
- spawn_sub_agent: Use this for specialized work (Frontend, Logic, Research).
- send_message: Send direct data/instructions to specific agents.
- github_*: Manage code repositories.
- read_state / update_state: **CRITICAL**. Manage your memory.
- define_tool: Create new JS tools.
- log_thought: Internal monologue.
- read_file / write_file: File system control.
- run_script: Execute JS in DOM.
- take_screenshot: Visual verification.
- search_google: Search the web for real-time info.
`;

// Static tools available by default
const STATIC_TOOLS: FunctionDeclaration[] = [
      {
        name: 'log_thought',
        description: 'MANDATORY: Internal Monologue. Plan your actions here. Decide actions based on state.',
        parameters: { type: Type.OBJECT, properties: { thought: { type: Type.STRING } }, required: ['thought'] }
      },
      {
        name: 'read_state',
        description: 'Read the current autonomous agent state (goals, tasks) from agent_state.json',
        parameters: { type: Type.OBJECT, properties: {}, required: [] }
      },
      {
        name: 'update_state',
        description: 'Update the autonomous agent state. Use this to set goals, add tasks, or mark tasks as complete.',
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
      {
        name: 'github_connect',
        description: 'Configure GitHub credentials (token, owner, repo).',
        parameters: { type: Type.OBJECT, properties: { token: {type: Type.STRING}, owner: {type: Type.STRING}, repo: {type: Type.STRING} }, required: ['token', 'owner', 'repo'] }
      },
      {
        name: 'github_pull_repo',
        description: 'Download all files from the configured GitHub repository into the VFS. Overwrites existing files.',
        parameters: { type: Type.OBJECT, properties: {}, required: [] }
      },
      {
        name: 'github_push_file',
        description: 'Commit and Push a specific file from VFS to GitHub.',
        parameters: { type: Type.OBJECT, properties: { path: {type: Type.STRING}, commitMessage: {type: Type.STRING} }, required: ['path', 'commitMessage'] }
      },
      {
        name: 'github_create_issue',
        description: 'Create a new issue in the GitHub repository.',
        parameters: { type: Type.OBJECT, properties: { title: {type: Type.STRING}, body: {type: Type.STRING} }, required: ['title', 'body'] }
      },
      {
        name: 'define_tool',
        description: 'Create a NEW custom tool/function. Provide JS code and a JSON schema for parameters.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING, description: "Function name (e.g., 'sum_numbers')" },
                description: { type: Type.STRING, description: "What the tool does" },
                parametersSchema: { type: Type.STRING, description: "JSON STRING representing the OpenAPI properties schema for arguments." },
                code: { type: Type.STRING, description: "JavaScript function body. Return the result. Arguments are available by name." }
            },
            required: ['name', 'description', 'parametersSchema', 'code']
        }
      },
      {
        name: 'search_google',
        description: 'Perform a Google Search to find real-time information, news, or specific data.',
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] }
      },
      {
        name: 'read_website',
        description: 'Read external website content (HTML). Use this if you have a specific URL.',
        parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING } }, required: ['url'] }
      },
      {
        name: 'read_file',
        description: 'Read a file.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ['path'] }
      },
      {
        name: 'write_file',
        description: 'Write/Overwrite a file in the virtual file system.',
        parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING }, content: { type: Type.STRING } }, required: ['path', 'content'] }
      },
      {
        name: 'list_files',
        description: 'List all files.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'run_script',
        description: 'Execute JavaScript in the Browser DOM.',
        parameters: { type: Type.OBJECT, properties: { code: { type: Type.STRING } }, required: ['code'] }
      },
      {
        name: 'take_screenshot',
        description: 'Capture screenshot.',
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: 'spawn_sub_agent',
        description: 'CRITICAL: Spawn a specialized sub-agent to handle a specific part of the task (e.g., "Frontend_Dev" for HTML). Returns their report.',
        parameters: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, task: { type: Type.STRING } }, required: ['role', 'task'] }
      },
      {
        name: 'send_message',
        description: 'Send a direct message/data to another agent (e.g., "Frontend_Dev", "Aura") or "all".',
        parameters: { 
            type: Type.OBJECT, 
            properties: { 
                recipient: { type: Type.STRING }, 
                message: { type: Type.STRING } 
            }, 
            required: ['recipient', 'message'] 
        }
      },
      {
        name: 'generate_image',
        description: 'Generate image.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING },
            aspectRatio: { type: Type.STRING }
          },
          required: ['prompt']
        }
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
  private dynamicTools: Map<string, DynamicTool> = new Map();
  
  public systemInstruction: string = DEFAULT_SYSTEM_INSTRUCTION;
  public enableAutonomy: boolean = false;
  
  // Background Task Management
  private isAutonomyRunning: boolean = false;
  private backgroundHistory: any[] = [];
  public activeProcesses: Set<string> = new Set();

  constructor(config: LLMConfig, logCallback: (log: AgentLog) => void) {
    this.llm = new LLMService(config);
    this.enableAutonomy = config.enableAutonomy;
    this.logCallback = logCallback;
    agentBus.clear();
  }

  public updateConfig(config: LLMConfig) {
      this.llm.updateConfig(config);
      this.enableAutonomy = config.enableAutonomy;
      this.log('system', `Config Updated: Autonomy=[${this.enableAutonomy}] Provider=[${config.provider}]`);
  }

  public setSystemInstruction(instruction: string) {
      this.systemInstruction = instruction;
      this.injectUserMessage(this.history, `[SYSTEM UPDATE] NEW CORE IDENTITY:\n${instruction}`);
      this.log('system', `System Instructions Updated`);
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

  /**
   * GENERATION
   */
  private async generateWithRetry(contents: any[], tools: FunctionDeclaration[], agentName: string, processId: string) {
      // Use LLM Service
      const attemptGeneration = async () => {
         return await this.llm.generate(contents, tools, this.systemInstruction);
      };

      try {
          return await attemptGeneration();
      } catch (error: any) {
          this.log('error', `LLM Error: ${error.message}`, agentName, null, processId);
          throw error;
      }
  }

  // --- AUTONOMY ENGINE (BACKGROUND WORKER) ---
  
  public startAutonomy() {
      if (this.isAutonomyRunning) return;
      this.isAutonomyRunning = true;
      this.log('system', 'Autonomy Engine Started (Waiting for Tasks...)', 'Aura', null, 'background');
      this.backgroundHistory = [
          { role: 'user', parts: [{ text: this.systemInstruction }] },
          { role: 'user', parts: [{ text: "AUTONOMY_MODE_ACTIVE. You are the MANAGER." }] }
      ];
      this.autonomyLoop();
  }

  private async autonomyLoop() {
      while (this.isAutonomyRunning) {
          // CONTROL CHECK: If autonomy is disabled by user, just sleep and skip API calls
          if (!this.enableAutonomy) {
             this.activeProcesses.delete('background');
             await this.sleep(2000);
             continue;
          }

          try {
              let state: any = {};
              try {
                  state = JSON.parse(vfs.readFile('agent_state.json'));
              } catch (e) { state = { status: 'IDLE' }; }

              // Only call API if status is WORKING and Autonomy is Enabled
              if (state.status === 'WORKING') {
                  this.activeProcesses.add('background');
                  const fileList = vfs.listFiles().join(', ');
                  const prompt = `
CURRENT TIMESTAMP: ${new Date().toISOString()}
CURRENT FILES: [${fileList}]
CURRENT AGENT STATE:
${JSON.stringify(state, null, 2)}
ACTION: What is the most efficient next step? Execute it now.
`;
                  this.injectUserMessage(this.backgroundHistory, prompt);
                  // Background tasks
                  await this.runStep('Aura (BG)', this.backgroundHistory, 'background');
                  
                  if (this.backgroundHistory.length > 25) {
                      this.backgroundHistory = [this.backgroundHistory[0], this.backgroundHistory[1], ...this.backgroundHistory.slice(-15)];
                  }
              } else {
                  this.activeProcesses.delete('background');
              }
          } catch (e) {
              this.activeProcesses.delete('background');
          }
          await this.sleep(4000);
      }
  }

  public stopAutonomy() {
      this.isAutonomyRunning = false;
  }

  // --- USER INTERFACE SESSION ---

  async startSession(input: { text?: string; audio?: string; image?: string }) {
    this.activeProcesses.add('user-interaction');
    
    (async () => {
        try {
            const parts: any[] = [];
            if (input.text) parts.push({ text: input.text });
            if (input.audio) parts.push({ inlineData: { mimeType: 'audio/wav', data: input.audio } });
            if (input.image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: input.image } });

            if (this.history.length === 0) {
                this.history.push({ role: 'user', parts: [{ text: this.systemInstruction }] });
                 try {
                    const currentState = vfs.readFile('agent_state.json');
                    this.history.push({ role: 'user', parts: [{ text: `SYSTEM_BOOT_STATE: ${currentState}` }] });
                } catch(e) {}
            }

            this.history.push({ role: 'user', parts });
            
            await this.runLoop('Aura', 5, this.history, 'main');
        } finally {
            this.activeProcesses.delete('user-interaction');
        }
    })();
  }

  private async runLoop(agentName: string, maxSteps: number, contextHistory: any[], processId: string): Promise<string> {
    let steps = 0;
    while (steps < maxSteps) {
      steps++;
      const result = await this.runStep(agentName, contextHistory, processId);
      if (result === 'COMPLETE' || result === 'NO_TOOL') break;
      if (steps > 1) await this.sleep(2000);
    }
    return "Done";
  }

  private async runStep(agentName: string, contextHistory: any[], processId: string): Promise<string> {
      try {
        const dynamicDeclarations = Array.from(this.dynamicTools.values()).map(t => t.declaration);
        const currentTools = [...STATIC_TOOLS, ...dynamicDeclarations];
        
        // Check for messages
        const unreadMessages = agentBus.getUnreadMessages(agentName);
        if (unreadMessages.length > 0) {
            const formattedMessages = unreadMessages.map(msg => `FROM: ${msg.from}: ${msg.content}`).join('\n\n');
            this.injectUserMessage(contextHistory, `[INCOMING MSG]: ${formattedMessages}`);
            agentBus.markAsRead(unreadMessages.map(m => m.id), agentName);
        }

        // GENERATE
        const result = await this.generateWithRetry(
            contextHistory,
            currentTools,
            agentName,
            processId
        );

        // Standardize Result from LLM Service
        // Map back to simplified format
        const responseText = result.text;
        const toolCalls = result.toolCalls || [];

        // Log Output
        if (responseText) {
            // Add to history
            contextHistory.push({ role: 'model', parts: [{ text: responseText }] });
            this.log('output', responseText, agentName, null, processId);
        }

        if (toolCalls.length === 0) {
            if (!responseText) return 'ERROR'; // No text, no tools
            return 'NO_TOOL';
        }

        // Handle Tools
        const toolResponses = [];
        const historyToolCalls = []; // To add to history correctly

        for (const call of toolCalls) {
            historyToolCalls.push({ functionCall: { name: call.name, args: call.args, id: call.id }});
            
            if (call.name !== 'log_thought') this.log('action', `${call.name}`, agentName, null, processId);
            
            let result: any = { status: 'ok' };
            const args = call.args as any;

            try {
                if (this.dynamicTools.has(call.name)) {
                    const tool = this.dynamicTools.get(call.name);
                    if (tool) {
                        const argKeys = Object.keys(args);
                        const argValues = Object.values(args);
                        const func = new Function(...argKeys, tool.code);
                        result = { result: func(...argValues) };
                    }
                } else {
                    result = await this.executeStaticTool(call.name, args, agentName, processId);
                }
            } catch (e: any) {
                result = { error: e.message };
                this.log('error', `${call.name}: ${e.message}`, agentName, null, processId);
            }
            if (call.name !== 'take_screenshot') {
                toolResponses.push({ functionResponse: { name: call.name, id: call.id, response: result } });
            }
        }
        
        // If we didn't add text earlier (Gemini style mix), add tool calls now
        if (!responseText) {
             contextHistory.push({ role: 'model', parts: historyToolCalls });
        } else {
             // Append to last model turn if needed, or push new
             // Simplification: Just push a new tool-call part if possible or assume LLM handles context
             // For OpenAI, we must match tool_calls.
        }

        contextHistory.push({ role: 'user', parts: toolResponses });
        return 'CONTINUE';

      } catch (err: any) {
        this.log('error', `ERROR: ${err.message}`, agentName, null, processId);
        return 'ERROR';
      }
  }

  private async executeStaticTool(name: string, args: any, agentName: string, processId: string): Promise<any> {
      switch(name) {
        case 'read_state': try { return JSON.parse(vfs.readFile('agent_state.json')); } catch (e) { return { error: "State missing" }; }
        case 'update_state':
            const oldState = JSON.parse(vfs.readFile('agent_state.json') || '{}');
            vfs.writeFile('agent_state.json', JSON.stringify({ ...oldState, ...args }, null, 2));
            this.log('system', `State Updated`, agentName, null, processId);
            return { status: 'updated' };
        case 'github_connect':
            githubService.saveConfig({ token: args.token, owner: args.owner, repo: args.repo });
            return { status: "GitHub Configured." };
        case 'github_pull_repo': return { status: await githubService.pullRepo() };
        case 'github_push_file': return { status: await githubService.pushFile(args.path, vfs.readFile(args.path), args.commitMessage) };
        case 'github_create_issue': return { status: await githubService.createIssue(args.title, args.body) };
        case 'define_tool':
            try {
                // OpenAI often returns schema as 'properties' stringified or wrapped.
                let params = args.parametersSchema;
                if (typeof params === 'string') params = JSON.parse(params);

                const newTool: DynamicTool = {
                    code: args.code,
                    declaration: {
                        name: args.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
                        description: args.description,
                        parameters: params
                    }
                };
                this.dynamicTools.set(newTool.declaration.name, newTool);
                return { status: `Tool '${newTool.declaration.name}' registered.` };
            } catch (e: any) { return { error: `Invalid Schema: ${e.message}` }; }
        case 'log_thought':
            this.log('thought', args.thought, agentName, null, processId);
            return { status: 'acknowledged' };
        case 'take_screenshot':
                if ((window as any).takeAppScreenshot) {
                    const base64 = await (window as any).takeAppScreenshot();
                    this.log('image', base64, agentName, null, processId);
                    return { status: 'captured' }; 
                } else return { error: "Unavailable" };
        case 'read_website':
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(args.url)}`;
            const resp = await fetch(proxyUrl);
            const data = await resp.json();
            return { content: data.contents?.substring(0, 30000) || "Empty" };
        case 'search_google':
            // THIS TOOL IS SPECIFIC TO GEMINI. IF NOT GEMINI, FALLBACK TO SIMPLE FETCH
            // OR RETURN ERROR TO FORCE AGENT TO USE ANOTHER METHOD
            return { error: "Search tool currently only optimized for Gemini provider." };
        case 'read_file': return { content: vfs.readFile(args.path) };
        case 'write_file':
            vfs.writeFile(args.path, args.content);
            return { status: 'success', path: args.path };
        case 'list_files': return { files: vfs.listFiles() };
        case 'run_script': return await this.executeScript(args.code);
        case 'send_message':
            agentBus.postMessage(agentName, args.recipient, args.message);
            return { status: 'sent' };
        case 'generate_image':
            // Image gen logic remains same, but might fail if key not valid for Gemini.
            // We'll leave it for now.
             return { error: "Image generation requires Gemini Key in current version." };
        case 'spawn_sub_agent': return { status: "Sub-agents currently disabled in Open Mode" }; 
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