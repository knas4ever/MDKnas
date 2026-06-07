import { useState, useEffect } from 'react';
import { Editor } from './components/Editor';
import { Sidebar } from './components/Sidebar';
import './themes/default.css';
import './themes/dark.css';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className={`app-wrapper theme-${theme}`}>
      <header className="header">
        <button onClick={toggleTheme} className="p-2 border rounded">
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </header>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex-1">
          <Editor />
        </div>
      </div>
    </div>
  );
}

export default App;
