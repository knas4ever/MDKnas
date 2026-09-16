export default function App() {
  return (
    <div className="h-screen bg-white text-black">
      <header className="flex h-10 items-center border-b border-gray-200 px-4 text-sm">
        Markdown Editor
      </header>
      <main data-testid="editor-root" className="h-full">
        <p>Editor will load here.</p>
      </main>
    </div>
  );
}
