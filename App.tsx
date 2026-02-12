import React from 'react';
import { AgentWorkspace } from './components/AgentWorkspace';

export default function App() {
  return (
    // Use h-[100dvh] to respect mobile browser address bars dynamically
    <div className="h-[100dvh] w-screen bg-black overflow-hidden flex flex-col">
      <AgentWorkspace />
    </div>
  );
}