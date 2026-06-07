import { useState } from 'react';
import { parseMarkdown } from './lib/markdown';

function App() {
  const [content, setContent] = useState('# Hello World');

  return (
    <div className="flex h-screen">
      <textarea 
        className="w-2/3 p-4 border-r"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div 
        className="w-1/3 p-4"
        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
      />
    </div>
  );
}

export default App
