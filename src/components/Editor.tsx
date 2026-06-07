import React, { useState, useEffect, useRef } from 'react';
import { parseMarkdown } from '../lib/markdown';

export const Editor = () => {
  const [raw, setRaw] = useState('');
  const [html, setHtml] = useState('');
  const [activeLine, setActiveLine] = useState(0);
  const textareaRef = useRef(null);

  useEffect(() => {
    setHtml(parseMarkdown(raw));
  }, [raw]);

  const handleTextChange = (e) => {
    const value = e.target.value;
    setRaw(value);
    const lines = value.split('\n');
    setActiveLine(lines.length - 1);
  };

  const handleKeyUp = (e) => {
    if (e.key === 'ArrowUp') {
      setActiveLine(prev => Math.max(0, prev - 1));
    } else if (e.key === 'ArrowDown') {
      const lines = raw.split('\n');
      setActiveLine(prev => Math.min(lines.length - 1, prev + 1));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <textarea
        ref={textareaRef}
        className="flex-1 p-4 font-mono text-sm outline-none resize-none leading-relaxed"
        placeholder="Type markdown here..."
        value={raw}
        onChange={handleTextChange}
        onKeyUp={handleKeyUp}
        style={{
          lineHeight: '1.5em',
          paddingTop: '20vh',
          paddingBottom: '20vh',
        }}
      />
      <div 
        className="flex-1 p-4 prose max-w-none overflow-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
