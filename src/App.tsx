import { useCallback, useEffect, useRef, useState } from 'react';
import WysiwygEditor, { WysiwygEditorHandle } from './components/WysiwygEditor';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import ThemeManager from './components/ThemeManager';
import PromptDialog from './components/PromptDialog';
import TableDialog, { type TableSize } from './components/TableDialog';
import type { FileNode, Settings } from './types';
import { applyAction, type EditorAction, type Selection } from './lib/editorActions';

type SaveState = 'saved' | 'saving' | 'unsaved';

export default function App() {
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [settings, setSettings] = useState<Settings>({ theme: 'light', fontSize: 16, autosaveMs: 1000 });
  const [themeNames, setThemeNames] = useState<string[]>(['light', 'dark']);
  const [sidebarMode, setSidebarMode] = useState<'files' | 'outline'>('files');
  const [typewriter, setTypewriter] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const editorRef = useRef<WysiwygEditorHandle>(null);
  const [promptDialog, setPromptDialog] = useState<{
    message: string;
    defaultValue: string;
  } | null>(null);
  const [tableDialog, setTableDialog] = useState(false);
  const promptResolve = useRef<((v: string | null) => void) | null>(null);
  const tableResolve = useRef<((s: TableSize | null) => void) | null>(null);
  const undoStack = useRef<{ content: string; selection: Selection }[]>([]);
  const redoStack = useRef<{ content: string; selection: Selection }[]>([]);
  const settingsLoadedRef = useRef(false);

  // Persist settings (theme, last folder, …) whenever they change, but only
  // after the initial load has completed so defaults don't clobber the file.
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    void window.api.saveSettings(settings);
  }, [settings]);
  const contentRef = useRef('');
  const savedContentRef = useRef('');
  const watchRef = useRef<(() => void) | null>(null);
  const watchedDirRef = useRef<string | null>(null);
  const [diskNote, setDiskNote] = useState<string | null>(null);
  // New content read from disk while the app had unsaved edits; the status
  // bar offers an explicit "reload from disk" action using this.
  const [pendingDisk, setPendingDisk] = useState<string | null>(null);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const ask = useCallback(
    (message: string, defaultValue: string): Promise<string | null> => {
      return new Promise(resolve => {
        promptResolve.current = resolve;
        setPromptDialog({ message, defaultValue });
      });
    },
    []
  );

  const askTable = useCallback((): Promise<TableSize | null> => {
    return new Promise(resolve => {
      tableResolve.current = resolve;
      setTableDialog(true);
    });
  }, []);

  const finishPrompt = useCallback((v: string | null) => {
    setPromptDialog(null);
    const r = promptResolve.current;
    promptResolve.current = null;
    r?.(v);
  }, []);

  const finishTable = useCallback((s: TableSize | null) => {
    setTableDialog(false);
    const r = tableResolve.current;
    tableResolve.current = null;
    r?.(s);
  }, []);

  const refreshTree = useCallback(async (dir: string) => {
    setTree(await window.api.listFiles(dir));
  }, []);

  const ensureWatched = useCallback(async (dir: string) => {
    if (watchedDirRef.current === dir) return;
    watchRef.current?.();
    watchedDirRef.current = dir;
    watchRef.current = await window.api.watchDir(dir);
  }, []);

  const openFile = useCallback(async (p: string) => {
    const text = await window.api.readFile(p);
    setCurrentPath(p);
    setContent(text);
    setSelection({ start: 0, end: 0 });
    setSaveState('saved');
    savedContentRef.current = text;
    undoStack.current = [];
    redoStack.current = [];
    setDiskNote(null);
    setPendingDisk(null);
    // Watch the file's own directory so external edits show up even when
    // no folder was opened (e.g. the app started with a single file).
    const dir = p.slice(0, p.lastIndexOf('/'));
    if (dir) await ensureWatched(dir);
  }, [ensureWatched]);

  const openFolderAt = useCallback(async (dir: string) => {
    setRootDir(dir);
    setSidebarMode('files');
    refreshTree(dir);
    setSettings(s => ({ ...s, lastFolder: dir }));
    await ensureWatched(dir);
  }, [refreshTree, ensureWatched]);

  const openFolder = useCallback(async () => {
    const dir = await window.api.openFolder();
    if (!dir) return;
    void openFolderAt(dir);
  }, [openFolderAt]);

  const createFile = useCallback(async (p: string) => {
    await window.api.createFile(p);
    if (rootDir) refreshTree(rootDir);
  }, [rootDir, refreshTree]);

  const renameFile = useCallback(async (from: string, to: string) => {
    await window.api.renameFile(from, to);
    if (currentPath === from) setCurrentPath(to);
    if (rootDir) refreshTree(rootDir);
  }, [rootDir, currentPath, refreshTree]);

  const deleteFile = useCallback(async (p: string) => {
    await window.api.deleteFile(p);
    if (rootDir) refreshTree(rootDir);
  }, [rootDir, refreshTree]);

  useEffect(() => {
    window.api.setSourceMenuState(sourceMode);
  }, [sourceMode]);

  // Re-read the open file from disk and apply it: auto-reload when there
  // are no unsaved edits, otherwise offer an explicit reload.
  const syncFromDiskRef = useRef<(p: string) => void>(() => {});
  syncFromDiskRef.current = (p: string) => {
    void window.api.readFile(p).then(t => {
      if (t === contentRef.current) return;
      if (contentRef.current === savedContentRef.current) {
        setContent(t);
        savedContentRef.current = t;
        setSelection({ start: 0, end: 0 });
        undoStack.current = [];
        redoStack.current = [];
        setDiskNote(null);
        setPendingDisk(null);
      } else {
        setPendingDisk(t);
        setDiskNote('File changed on disk — kept your unsaved edits');
      }
    }).catch(() => {
      setDiskNote('File was moved or deleted on disk');
      setPendingDisk(null);
    });
  };

  useEffect(() => {
    const offWatch = window.api.onWatch((_event, filename) => {
      if (rootDir) refreshTree(rootDir);
      const wd = watchedDirRef.current;
      if (wd && currentPath && filename) {
        const wdNorm = wd.replace(/\/$/, '');
        // Match the open file even if the event carries an absolute name or
        // the platform reports the name relative to a subdirectory.
        const joined = filename.startsWith('/') ? filename : `${wdNorm}/${filename}`;
        if (joined === currentPath) {
          // Any fs event on the open file (change, rename, unlink): external
          // editors often replace the file via rename, so don't trust the
          // event name — just re-read and compare.
          syncFromDiskRef.current(joined);
        }
      }
    });
    const offOpen = window.api.onOpenFile(openFile);
    const offOpenFolder = window.api.onOpenFolder(dir => void openFolderAt(dir));
    window.api.loadSettings().then(s => {
      settingsLoadedRef.current = true;
      setSettings(s);
      // Restore the folder from the last session if it still exists.
      if (s.lastFolder) {
        window.api
          .listFiles(s.lastFolder)
          .then(() => openFolderAt(s.lastFolder!))
          .catch(() => {});
      }
    });
    window.api.listThemes().then(ts => setThemeNames(['light', 'dark', ...ts]));
    return () => {
      offWatch();
      offOpen();
      offOpenFolder();
    };
  }, [rootDir, openFile, refreshTree, currentPath, openFolderAt]);

  // fs.watch is unreliable (recursive watches die on unwatchable entries,
  // directory events miss files in subdirectories): poll the open file so
  // external edits always show up.
  useEffect(() => {
    if (!currentPath) return;
    const iv = setInterval(() => syncFromDiskRef.current(currentPath), 800);
    return () => clearInterval(iv);
  }, [currentPath]);

  // Poll the tree so the sidebar stays fresh even for events the watcher
  // misses (subdirectories, permission quirks).
  useEffect(() => {
    if (!rootDir) return;
    let lastJson = '';
    const iv = setInterval(async () => {
      try {
        const t = await window.api.listFiles(rootDir);
        const j = JSON.stringify(t);
        if (j !== lastJson) {
          lastJson = j;
          setTree(t);
        }
      } catch {
        // directory vanished; next open/folder action will recover
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [rootDir]);

  useEffect(() => {
    if (!currentPath) return;
    setSaveState('unsaved');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await window.api.writeFile(currentPath, content);
        setSaveState('saved');
        savedContentRef.current = content;
        setDiskNote(null);
      } catch {
        setSaveState('unsaved');
      }
    }, settings.autosaveMs);
    return () => clearTimeout(t);
  }, [content, currentPath, settings.autosaveMs]);

  const handleNew = useCallback(() => {
    setCurrentPath(null);
    setContent('');
    setSelection({ start: 0, end: 0 });
    setSaveState('saved');
    savedContentRef.current = '';
    undoStack.current = [];
    redoStack.current = [];
    setDiskNote(null);
    setPendingDisk(null);
  }, []);

  const handleSaveAs = useCallback(async () => {
    const p = await window.api.saveDialog();
    if (!p) return;
    setSaveState('saving');
    try {
      await window.api.writeFile(p, content);
      setCurrentPath(p);
      setSaveState('saved');
      savedContentRef.current = content;
      setDiskNote(null);
      if (rootDir) refreshTree(rootDir);
    } catch {
      setSaveState('unsaved');
    }
  }, [content, rootDir, refreshTree]);

  const handleSave = useCallback(async () => {
    if (!currentPath) {
      await handleSaveAs();
      return;
    }
    setSaveState('saving');
    try {
      await window.api.writeFile(currentPath, content);
      setSaveState('saved');
      savedContentRef.current = content;
      setDiskNote(null);
      setPendingDisk(null);
    } catch {
      setSaveState('unsaved');
    }
  }, [content, currentPath, handleSaveAs]);

  const handleLink = useCallback(() => {
    void ask('Link URL', 'https://').then(url => {
      if (!url) return;
      if (sourceMode) {
        const r = applyAction(content, selection, 'link', url);
        setContent(r.content);
        setSelection(r.selection);
      } else {
        editorRef.current?.execute('link', url);
      }
    });
  }, [ask, content, selection, sourceMode]);

  const handleTable = useCallback(() => {
    void askTable().then(size => {
      if (!size) return;
      const arg = `${size.rows},${size.cols}`;
      if (sourceMode) {
        const r = applyAction(content, selection, 'table', arg);
        setContent(r.content);
        setSelection(r.selection);
      } else {
        editorRef.current?.execute('table', arg);
      }
    });
  }, [askTable, content, selection, sourceMode]);

  const reloadFromDisk = useCallback(() => {
    const t = pendingDisk;
    if (t === null) return;
    setContent(t);
    savedContentRef.current = t;
    setSelection({ start: 0, end: 0 });
    undoStack.current = [];
    redoStack.current = [];
    setDiskNote(null);
    setPendingDisk(null);
  }, [pendingDisk]);

  const doUndo = useCallback(() => {
    const st = undoStack.current.pop();
    if (!st) return;
    if (redoStack.current.length >= 100) redoStack.current.shift();
    redoStack.current.push({ content, selection });
    setContent(st.content);
    setSelection(st.selection);
  }, [content, selection]);

  const doRedo = useCallback(() => {
    const st = redoStack.current.pop();
    if (!st) return;
    if (undoStack.current.length >= 100) undoStack.current.shift();
    undoStack.current.push({ content, selection });
    setContent(st.content);
    setSelection(st.selection);
  }, [content, selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && key === 'n') {
        e.preventDefault();
        handleNew();
      } else if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        handleLink();
      } else if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleSave, handleNew, handleLink, doUndo, doRedo]);

  useEffect(() => {
    return window.api.onMenu(a => {
      if (a === 'new') handleNew();
      else if (a === 'save') void handleSave();
      else if (a === 'saveAs') void handleSaveAs();
      else if (a === 'undo') doUndo();
      else if (a === 'redo') doRedo();
      else if (a === 'openFolder') void openFolder();
      else if (a === 'source') setSourceMode(m => !m);
      else if (a.startsWith('fmt:')) {
        const action = a.slice(4) as EditorAction;
        if (action === 'link') handleLink();
        else if (action === 'table') handleTable();
        else if (sourceMode) {
          const r = applyAction(content, selection, action);
          setContent(r.content);
          setSelection(r.selection);
        } else {
          editorRef.current?.execute(action);
        }
      }
    });
  }, [handleNew, handleSave, handleSaveAs, openFolder, handleLink, handleTable, doUndo, doRedo, content, selection, sourceMode, editorRef]);

  const onChange = useCallback((c: string, s: Selection) => {
    if (c !== content) {
      undoStack.current.push({ content, selection });
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
    }
    setContent(c);
    setSelection(s);
  }, [content, selection]);

  const wordCount = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          mode={sidebarMode}
          onToggle={() => setSidebarMode(m => (m === 'files' ? 'outline' : 'files'))}
          tree={tree}
          rootDir={rootDir}
          currentPath={currentPath}
          onOpenFile={openFile}
          onCreate={createFile}
          onRename={renameFile}
          onDelete={deleteFile}
          content={content}
          onJump={pos => setSelection({ start: pos, end: pos })}
          ask={ask}
        />
        <div className="flex flex-1 flex-col">
          <Toolbar
            onAction={a => {
              if (a === 'link') {
                handleLink();
                return;
              }
              if (a === 'table') {
                handleTable();
                return;
              }
              if (sourceMode) {
                const r = applyAction(content, selection, a);
                setContent(r.content);
                setSelection(r.selection);
              } else {
                editorRef.current?.execute(a);
              }
            }}
            theme={settings.theme}
            themes={themeNames}
            onThemeChange={theme => setSettings(s => ({ ...s, theme }))}
            typewriter={typewriter}
            onToggleTypewriter={() => setTypewriter(t => !t)}
            sourceMode={sourceMode}
            onToggleSourceMode={() => setSourceMode(m => !m)}
          />
          <div className="flex-1 overflow-auto">
            {sourceMode ? (
              <textarea
                className="source-view"
                aria-label="Raw markdown source"
                spellCheck={false}
                value={content}
                onChange={e => {
                  const v = e.target.value;
                  const start = e.target.selectionStart ?? v.length;
                  const end = e.target.selectionEnd ?? v.length;
                  setContent(v);
                  setSelection({ start, end });
                }}
              />
            ) : (
              <WysiwygEditor
                ref={editorRef}
                content={content}
                selection={selection}
                onChange={onChange}
                fontSize={settings.fontSize}
                typewriter={typewriter}
                file={currentPath}
              />
            )}
          </div>
          <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-1 text-xs opacity-70">
            <span title={currentPath ?? undefined}>
              {currentPath ?? 'Untitled (Ctrl+S to save)'}
            </span>
            <span>{saveState}</span>
            {diskNote && (
              pendingDisk !== null ? (
                <button onClick={reloadFromDisk} className="cursor-pointer hover:underline">
                  ⚠ {diskNote} — reload from disk?
                </button>
              ) : (
                <span>⚠ {diskNote}</span>
              )
            )}
            <span>{wordCount} words</span>
          </div>
        </div>
      </div>
      <ThemeManager theme={settings.theme} onThemeChange={theme => setSettings(s => ({ ...s, theme }))} />
      {promptDialog && (
        <PromptDialog
          message={promptDialog.message}
          defaultValue={promptDialog.defaultValue}
          onSubmit={v => finishPrompt(v)}
          onCancel={() => finishPrompt(null)}
        />
      )}
      {tableDialog && <TableDialog onSubmit={s => finishTable(s)} onCancel={() => finishTable(null)} />}
    </div>
  );
}
