import React, { useState } from 'react';
import FileExplorer from './FileExplorer';
import OutlineView from './OutlineView';

export const Sidebar = () => {
  const [activeView, setActiveView] = useState<'files' | 'outline'>('files');

  return (
    <div className="w-64 h-full border-r flex flex-col">
      <div className="flex p-2 border-b">
        <button 
          className={`flex-1 p-1 ${activeView === 'files' ? 'bg-gray-200' : ''}`}
          onClick={() => setActiveView('files')}
        >Files</button>
        <button 
          className={`flex-1 p-1 ${activeView === 'outline' ? 'bg-gray-200' : ''}`}
          onClick={() => setActiveView('outline')}
        >Outline</button>
      </div>
      <div className="flex-1 overflow-auto">
        {activeView === 'files' ? <FileExplorer /> : <OutlineView />}
      </div>
    </div>
  );
};
