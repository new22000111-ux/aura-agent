<div align="center">
<img width="1200" height="475" alt="Aura Agent Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🌟 Aura Agent

**A lightweight, secure, and autonomous AI agent that runs locally in your browser.**

Aura Agent is a minimalist, voice-first AI assistant powered by **Gemini 2.5 & 3.0** models. It's designed to be secure by default, with all capabilities restricted to browser sandboxing, while remaining powerful and extensible through sub-agents.

---

## ✨ Key Features

### 🔒 **Security First**
- **Browser-Sandboxed**: All tools and operations run within the browser sandbox - no server-side code execution
- **Local Execution**: Your data stays on your device
- **Limited, Controlled Permissions**: Only requests microphone, camera, and geolocation when needed
- **Privacy-Focused**: No telemetry or data collection

### 🎤 **Voice-First Experience**
- Real-time voice conversation with AI
- Natural language understanding and generation
- Conversational context awareness

### 🔍 **Grounded Intelligence**
- **Web Search Integration**: Get real-time information with source attribution
- **Maps Support**: Location-aware responses and navigation
- **Grounded Answers**: Every response includes sources and references

### 🤖 **Autonomous & Extensible**
- **Sub-Agents**: Spawn independent agent instances for parallel task execution
- **Autonomous Mode**: Run background tasks with `enableAutonomy` flag
- **Multi-Agent Orchestration**: Coordinate multiple agents for complex workflows
- **Agent Logs & Monitoring**: Track agent thoughts, actions, and outputs in real-time

### 🎨 **Modern UI**
- Minimalist, dark-mode design
- Responsive layout (mobile-first)
- Real-time agent activity visualization
- Virtual file system explorer

### 🔌 **Multi-LLM Support**
- **Gemini** (primary - with fallback models)
- **OpenAI**
- **Anthropic**
- **OpenRouter**
- **Custom/Ollama** (via baseUrl)

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v18+)
- **npm** or **yarn**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/new22000111-ux/aura-agent.git
   cd aura-agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env.local` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

   Get your Gemini API key from: https://ai.google.dev/

4. **Run the development server:**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

5. **Build for production:**
   ```bash
   npm build
   ```

---

## 🎯 Try It Online

**Experience Aura Agent live:** https://aura-agent-seven.vercel.app

No installation required - just open, allow microphone permissions, and start conversing!

---

## 📁 Project Structure

```
aura-agent/
├── components/              # React components
│   ├── AgentWorkspace.tsx   # Main workspace UI
│   ├── ChatSession.tsx       # Chat interface
│   ├── LiveSession.tsx       # Live voice session
│   ├── CreateSession.tsx     # Session initialization
│   ├── FileExplorer.tsx      # Virtual file explorer
│   └── TelegramTerminal.tsx  # Terminal interface
├── services/                # Core services
│   ├── agentRuntime.ts      # Agent execution engine
│   ├── agentBus.ts          # Inter-agent communication
│   ├── gemini.ts            # Gemini API integration
│   ├── llm.ts               # LLM abstraction layer
│   ├── github.ts            # GitHub integration
│   └── vfs.ts               # Virtual file system
├── utils/                   # Utilities
│   └── audioUtils.ts        # Audio processing
├── types.ts                 # TypeScript types
├── App.tsx                  # Root component
├── index.tsx                # Entry point
├── vite.config.ts           # Build configuration
└── index.html               # HTML template
```

---

## ⚙️ Configuration

### LLM Settings (`types.ts`)

```typescript
export const DEFAULT_LLM_CONFIG: LLMConfig = {
    provider: 'gemini',           // LLM provider
    apiKey: '',                   // Your API key
    modelId: 'gemini-3-flash-preview',
    fallbackModelId: 'gemini-2.0-flash',
    enableAutonomy: false,        // Enable background loops
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 8192
};
```

### Runtime Configuration

**Chat Configuration:**
- `useSearch`: Enable web search
- `useMaps`: Enable maps integration
- `useThinking`: Enable extended thinking mode
- `fastMode`: Reduce latency at cost of quality

---

## 🔧 Core Features Deep-Dive

### 1. **Agent Workspace**
The main interface where you interact with the AI. Supports:
- Chat sessions
- Live voice conversations
- Virtual file management
- Real-time agent logs

### 2. **Virtual File System (VFS)**
In-memory file system for agent operations:
- Create, read, update, delete files
- Persistent during session
- Accessible to sub-agents

### 3. **Agent Bus**
Inter-process communication system:
- Message passing between agents
- Event broadcasting
- Status synchronization

### 4. **Agent Runtime**
The execution engine:
- Tool execution (grounded search, maps, image generation)
- Thinking capability
- Output streaming
- Error handling & recovery

---

## 🛠️ Technologies Used

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **@google/genai** - Gemini SDK
- **Lucide React** - Icons
- **React Markdown** - Content rendering
- **html2canvas** - Screenshot utility

---

## 📋 Dependencies

```json
{
  "react": "^19.2.4",
  "react-dom": "^19.2.4",
  "@google/genai": "^1.40.0",
  "lucide-react": "^0.563.0",
  "react-markdown": "9.0.1",
  "remark-gfm": "4.0.0"
}
```

---

## 🚢 Deployment

### Deploy to Vercel (Recommended)

1. **Push to GitHub**
2. **Connect to Vercel**: https://vercel.com/new
3. **Set environment variables:**
   - `GEMINI_API_KEY`: Your Gemini API key
4. **Deploy!**

### Deploy to Other Platforms

Works with any static hosting + environment variables:
- **Netlify**
- **GitHub Pages**
- **Cloudflare Pages**
- **Firebase Hosting**

---

## 🔐 Security Considerations

✅ **What's Secure:**
- All code execution happens in the browser sandbox
- No backend processing of sensitive data
- API keys handled client-side (best practice: use backend proxy for production)
- Limited browser permissions

⚠️ **Important Notes:**
- Avoid hardcoding API keys in production
- Use environment variables and secure vaults
- Consider implementing a backend proxy for API calls
- Review browser permissions before granting

---

## 🤝 Contributing

We welcome contributions! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

---

## 📝 License

This project is open source and available under the MIT License.

---

## 🌐 Resources

- **Gemini AI Documentation**: https://ai.google.dev/
- **Vite Documentation**: https://vitejs.dev/
- **React Documentation**: https://react.dev/
- **Live Demo**: https://aura-agent-seven.vercel.app

---

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing discussions
- Review the documentation

---

<div align="center">

**Made with ❤️ by the Aura Agent team**

⭐ Star us on GitHub if you find this useful!

</div>