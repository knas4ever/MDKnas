import { Editor } from './components/Editor';
import { Sidebar } from './components/Sidebar';

function App() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1">
        <Editor />
      </div>
    </div>
  );
}

export default App;
