import React, { useState, useEffect } from 'react';
import { parseMarkdown } from '../lib/markdown';

export const Editor = () => {
  const [raw, setRaw] = useState('');
  const [html, setHtml] = useState('');

  useEffect(() => {
    setHtml(parseMarkdown(raw));
  }, [raw]);

  return (
    <div className="flex flex-col h-full">
      <textarea
        className="flex-1 p-4 font-mono text-sm outline-none resize-none"
        placeholder="Type markdown here..."
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <div 
        className="flex-1 p-4 prose max-w-none overflow-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
