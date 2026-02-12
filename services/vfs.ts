import { VirtualFile } from "../types";

const STORAGE_KEY = 'aura_runtime_memory';

// INITIAL STATE:
// index.html -> The Output Display
// style.css  -> The Global App Theme (Empty by default)
// agent_state.json -> The Autonomous Brain's Memory
const INITIAL_FILES: Record<string, VirtualFile> = {
  'index.html': {
    name: 'index.html',
    language: 'html',
    lastModified: Date.now(),
    content: `<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.tailwindcss.com"></script>
<style>body { background-color: #000; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: monospace; }</style>
</head>
<body>
  <div class="text-center">
    <h1 class="text-xl opacity-50">SYSTEM READY</h1>
  </div>
</body>
</html>`
  },
  'style.css': {
    name: 'style.css',
    language: 'css',
    lastModified: Date.now(),
    content: `/* 
   Project Stylesheet
   This file is linked to your project preview.
*/
body {
    background-color: #f4f4f5;
}
`
  },
  'agent_state.json': {
    name: 'agent_state.json',
    language: 'json',
    lastModified: Date.now(),
    content: JSON.stringify({
      status: "IDLE",
      goal: null,
      tasks: [],
      completed_tasks: [],
      notes: "System initialized."
    }, null, 2)
  }
};

class VirtualFileSystem {
  private files: Record<string, VirtualFile>;

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    this.files = saved ? JSON.parse(saved) : INITIAL_FILES;
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.files));
  }

  listFiles(): string[] {
    return Object.keys(this.files);
  }

  readFile(path: string): string {
    if (!this.files[path]) throw new Error(`File not found: ${path}`);
    return this.files[path].content;
  }

  writeFile(path: string, content: string): void {
    const ext = path.split('.').pop() || 'txt';
    let language = 'plaintext';
    if (ext === 'js' || ext === 'ts') language = 'javascript';
    if (ext === 'html') language = 'html';
    if (ext === 'css') language = 'css';
    if (ext === 'json') language = 'json';

    this.files[path] = {
      name: path,
      content,
      language,
      lastModified: Date.now()
    };
    this.save();
  }

  deleteFile(path: string): void {
    delete this.files[path];
    this.save();
  }

  getAllFiles() {
    return this.files;
  }
}

export const vfs = new VirtualFileSystem();