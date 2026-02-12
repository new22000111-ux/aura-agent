import { vfs } from "./vfs";

const GH_STORAGE_KEY = 'aura_github_config';

interface GithubConfig {
    token: string;
    owner: string;
    repo: string;
    branch?: string;
}

class GithubService {
    private config: GithubConfig | null = null;

    constructor() {
        const saved = localStorage.getItem(GH_STORAGE_KEY);
        if (saved) {
            this.config = JSON.parse(saved);
        }
    }

    saveConfig(config: GithubConfig) {
        this.config = config;
        localStorage.setItem(GH_STORAGE_KEY, JSON.stringify(config));
    }

    getConfig() {
        return this.config;
    }

    isConfigured() {
        return !!(this.config?.token && this.config?.owner && this.config?.repo);
    }

    private getHeaders() {
        if (!this.config?.token) throw new Error("GitHub Token not configured");
        return {
            'Authorization': `Bearer ${this.config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
        };
    }

    async validateUser(): Promise<string> {
        const res = await fetch('https://api.github.com/user', { headers: this.getHeaders() });
        if (!res.ok) throw new Error("Invalid GitHub Token");
        const data = await res.json();
        return data.login;
    }

    async getFile(path: string): Promise<{ content: string; sha: string }> {
        if (!this.isConfigured()) throw new Error("GitHub not configured");
        const url = `https://api.github.com/repos/${this.config!.owner}/${this.config!.repo}/contents/${path}`;
        const res = await fetch(url, { headers: this.getHeaders() });
        
        if (res.status === 404) return { content: '', sha: '' };
        if (!res.ok) throw new Error(`GitHub API Error: ${res.statusText}`);
        
        const data = await res.json();
        // content is base64 encoded
        const content = new TextDecoder().decode(Uint8Array.from(atob(data.content), c => c.charCodeAt(0)));
        return { content, sha: data.sha };
    }

    async pushFile(path: string, content: string, message: string): Promise<string> {
        if (!this.isConfigured()) throw new Error("GitHub not configured");
        
        // 1. Try to get existing SHA (if updating)
        let sha = '';
        try {
            const existing = await this.getFile(path);
            sha = existing.sha;
        } catch (e) { /* New file */ }

        // 2. Encode content
        const contentEncoded = btoa(unescape(encodeURIComponent(content)));

        // 3. Push
        const url = `https://api.github.com/repos/${this.config!.owner}/${this.config!.repo}/contents/${path}`;
        const body: any = {
            message,
            content: contentEncoded,
        };
        if (sha) body.sha = sha;

        const res = await fetch(url, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(`Failed to push: ${err.message}`);
        }
        return `Successfully pushed ${path}`;
    }

    async pullRepo(recursive: boolean = true): Promise<string> {
        if (!this.isConfigured()) throw new Error("GitHub not configured");
        // Get the default branch tree
        // First get repo info to find default branch
        const repoRes = await fetch(`https://api.github.com/repos/${this.config!.owner}/${this.config!.repo}`, { headers: this.getHeaders() });
        const repoData = await repoRes.json();
        const branch = repoData.default_branch;

        const treeUrl = `https://api.github.com/repos/${this.config!.owner}/${this.config!.repo}/git/trees/${branch}?recursive=${recursive ? 1 : 0}`;
        const res = await fetch(treeUrl, { headers: this.getHeaders() });
        if (!res.ok) throw new Error("Failed to fetch repo tree");

        const data = await res.json();
        let count = 0;

        // Filter for blobs (files), limit to avoid browser crash on massive repos
        const files = data.tree.filter((node: any) => node.type === 'blob').slice(0, 50);

        for (const file of files) {
            // Fetch individual file content (raw)
            try {
                // Using raw content URL is faster than API JSON for bulk
                const rawUrl = `https://raw.githubusercontent.com/${this.config!.owner}/${this.config!.repo}/${branch}/${file.path}`;
                const fileRes = await fetch(rawUrl, { 
                    headers: { 'Authorization': `Bearer ${this.config!.token}` } 
                });
                if (fileRes.ok) {
                    const text = await fileRes.text();
                    vfs.writeFile(file.path, text);
                    count++;
                }
            } catch (e) {
                console.warn(`Skipped ${file.path}`, e);
            }
        }
        return `Pulled ${count} files from ${this.config!.owner}/${this.config!.repo}`;
    }

    async createIssue(title: string, body: string): Promise<string> {
        if (!this.isConfigured()) throw new Error("GitHub not configured");
        const url = `https://api.github.com/repos/${this.config!.owner}/${this.config!.repo}/issues`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ title, body })
        });
        if (!res.ok) throw new Error("Failed to create issue");
        const data = await res.json();
        return `Issue created: ${data.html_url}`;
    }
}

export const githubService = new GithubService();