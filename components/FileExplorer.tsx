import React, { useRef } from 'react';
import { Plus, Trash2, Upload, File as FileIcon, FileJson, FileCode, FileType } from 'lucide-react';
import { VirtualFile } from '../types';

interface FileExplorerProps {
  files: Record<string, VirtualFile>;
  selectedFile: string | null;
  onSelect: (name: string) => void;
  onCreate: () => void;
  onDelete: (name: string) => void;
  onUpload: (file: File) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ 
  files, selectedFile, onSelect, onCreate, onDelete, onUpload 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
    // Reset input so same file can be uploaded again if needed
    if (e.target) e.target.value = '';
  };

  const getFileIcon = (name: string) => {
      if (name.endsWith('.json')) return <FileJson size={13} />;
      if (name.endsWith('.html')) return <FileCode size={13} />;
      if (name.endsWith('.js') || name.endsWith('.ts')) return <FileCode size={13} />;
      if (name.endsWith('.css')) return <FileType size={13} />;
      return <FileIcon size={13} />;
  };

  return (
    <div className="w-56 bg-zinc-950 border-r border-zinc-900 flex flex-col h-full flex-none">
      <div className="h-10 px-3 border-b border-zinc-900 flex items-center justify-between bg-zinc-950/50">
        <span className="text-[10px] font-mono text-zinc-500 font-bold tracking-wider">FILESYSTEM</span>
        <div className="flex items-center space-x-1">
            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:bg-zinc-900 rounded text-zinc-600 hover:text-zinc-300 transition-colors" title="Upload File">
                <Upload size={12} />
            </button>
            <button onClick={onCreate} className="p-1.5 hover:bg-zinc-900 rounded text-zinc-600 hover:text-zinc-300 transition-colors" title="New File">
                <Plus size={12} />
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileChange} 
            />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
        {Object.keys(files).sort().map(fileName => (
            <div 
                key={fileName}
                className={`group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all border border-transparent ${
                    selectedFile === fileName 
                    ? 'bg-zinc-900 text-indigo-400 border-zinc-800' 
                    : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300'
                }`}
                onClick={() => onSelect(fileName)}
            >
                <div className="flex items-center space-x-2 truncate min-w-0">
                    <span className={selectedFile === fileName ? 'text-indigo-500' : 'opacity-70'}>
                        {getFileIcon(fileName)}
                    </span>
                    <span className="text-[11px] font-mono truncate">{fileName}</span>
                </div>
                {fileName !== 'agent_state.json' && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(fileName); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-600 transition-opacity"
                    >
                        <Trash2 size={10} />
                    </button>
                )}
            </div>
        ))}
      </div>
    </div>
  );
};