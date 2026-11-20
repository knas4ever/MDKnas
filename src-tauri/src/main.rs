#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_dialog::DialogExt;

const CHANGELOG: &str = include_str!("../../CHANGELOG.md");
const MAX_DEPTH: u32 = 5;

#[derive(Default)]
struct AppState {
    source_item: Mutex<Option<CheckMenuItem<Wry>>>,
    watch_gen: AtomicU64,
    pending_file: Mutex<Option<String>>,
    pending_folder: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
}

fn err<E: ToString>(e: E) -> String {
    e.to_string()
}

fn user_dir() -> PathBuf {
    // Same folder Electron used, so settings and themes carry over.
    let base = std::env::var_os("APPDATA")
        .or_else(|| std::env::var_os("XDG_CONFIG_HOME"))
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config").into_os_string()))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("MDKnas")
}

fn walk(dir: &Path, depth: u32) -> Result<Vec<FileNode>, String> {
    let mut entries: Vec<(String, PathBuf, bool)> = fs::read_dir(dir)
        .map_err(err)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if matches!(name.as_str(), ".git" | "node_modules" | ".DS_Store") {
                return None;
            }
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            Some((name, e.path(), is_dir))
        })
        .collect();
    entries.sort_by(|a, b| {
        b.2.cmp(&a.2)
            .then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
    });
    Ok(entries
        .into_iter()
        .map(|(name, path, is_dir)| {
            let children = if is_dir {
                Some(if depth < MAX_DEPTH {
                    walk(&path, depth + 1).unwrap_or_default()
                } else {
                    Vec::new()
                })
            } else {
                None
            };
            FileNode { name, path: path.to_string_lossy().into_owned(), is_dir, children }
        })
        .collect())
}

fn md_filter(app: &AppHandle) -> tauri_plugin_dialog::FileDialogBuilder<Wry> {
    app.dialog().file().add_filter("Markdown / Text", &["md", "markdown", "txt"])
}

fn path_string(p: Option<tauri_plugin_dialog::FilePath>) -> Option<String> {
    p.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn files_open_folder(app: AppHandle) -> Option<String> {
    path_string(app.dialog().file().blocking_pick_folder())
}

#[tauri::command]
async fn files_save_dialog(app: AppHandle) -> Option<String> {
    path_string(md_filter(&app).set_file_name("untitled.md").blocking_save_file())
}

#[tauri::command]
fn files_list(dir: String) -> Result<Vec<FileNode>, String> {
    walk(Path::new(&dir), 0)
}

#[tauri::command]
fn files_read(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(err)
}

#[tauri::command]
fn files_write(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(err)
}

#[tauri::command]
fn files_create(path: String, content: Option<String>) -> Result<(), String> {
    fs::write(path, content.unwrap_or_default()).map_err(err)
}

#[tauri::command]
fn files_create_folder(path: String) -> Result<(), String> {
    fs::create_dir_all(path).map_err(err)
}

#[tauri::command]
fn files_rename(from: String, to: String) -> Result<(), String> {
    fs::rename(from, to).map_err(err)
}

#[tauri::command]
fn files_delete(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) }.map_err(err)
}

#[tauri::command]
fn files_open_in_explorer(path: String) -> String {
    match tauri_plugin_opener::open_path(path, None::<&str>) {
        Ok(()) => String::new(),
        Err(e) => e.to_string(),
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(Ok(v)) = s.get(i + 1..i + 3).map(|h| u8::from_str_radix(h, 16)) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// The image bytes travel as the raw request body; the names as headers.
#[tauri::command]
fn files_save_image(request: tauri::ipc::Request<'_>) -> Option<String> {
    let header = |n: &str| {
        request.headers().get(n).and_then(|v| v.to_str().ok()).map(percent_decode)
    };
    let (doc_dir, assets_name, file_name) =
        (header("x-doc-dir")?, header("x-assets-name")?, header("x-file-name")?);
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return None };
    if doc_dir.is_empty() || assets_name.is_empty() {
        return None;
    }
    let assets_dir = Path::new(&doc_dir).join(&assets_name);
    fs::create_dir_all(&assets_dir).ok()?;
    let base = Path::new(&file_name).file_name()?.to_string_lossy().into_owned();
    let safe: String = base
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || (c as u32) < 32 { '_' } else { c })
        .collect();
    let safe = if safe.is_empty() { "image".to_string() } else { safe };
    let (stem, ext) = match safe.rfind('.') {
        Some(d) if d > 0 => (safe[..d].to_string(), safe[d..].to_string()),
        _ => (safe.clone(), String::new()),
    };
    let mut target = assets_dir.join(&safe);
    let mut n = 1;
    while target.exists() {
        target = assets_dir.join(format!("{stem}-{n}{ext}"));
        n += 1;
    }
    fs::write(&target, data).ok()?;
    Some(format!("{}/{}", assets_name, target.file_name()?.to_string_lossy()))
}

#[tauri::command]
fn files_read_image_data_url(doc_dir: String, rel_path: String) -> Option<String> {
    if doc_dir.is_empty() || rel_path.is_empty() {
        return None;
    }
    let root = fs::canonicalize(&doc_dir).ok()?;
    let abs = fs::canonicalize(root.join(&rel_path)).ok()?;
    if !abs.starts_with(&root) || !abs.is_file() {
        return None;
    }
    let ext = abs.extension()?.to_string_lossy().to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    };
    let bytes = fs::read(&abs).ok()?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

// Polls the directory itself (not recursive), like the Electron watcher.
#[tauri::command]
fn files_watch(app: AppHandle, state: tauri::State<AppState>, dir: String) {
    let generation = state.watch_gen.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        let signature = |d: &str| -> Vec<(String, u64)> {
            let mut v: Vec<(String, u64)> = fs::read_dir(d)
                .map(|rd| {
                    rd.filter_map(|e| e.ok())
                        .map(|e| {
                            let t = e
                                .metadata()
                                .and_then(|m| m.modified())
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            (e.file_name().to_string_lossy().into_owned(), t)
                        })
                        .collect()
                })
                .unwrap_or_default();
            v.sort();
            v
        };
        let mut last = signature(&dir);
        loop {
            std::thread::sleep(Duration::from_millis(800));
            let state = app.state::<AppState>();
            if state.watch_gen.load(Ordering::SeqCst) != generation {
                return;
            }
            let now = signature(&dir);
            if now != last {
                last = now;
                let _ = app.emit("files:watch-event", ("change", ""));
            }
        }
    });
}

#[tauri::command]
fn settings_load() -> Value {
    let mut s = json!({ "theme": "light", "fontSize": 16, "autosaveMs": 1000 });
    if let Ok(raw) = fs::read_to_string(user_dir().join("settings.json")) {
        if let (Ok(Value::Object(saved)), Some(base)) = (serde_json::from_str::<Value>(&raw), s.as_object_mut()) {
            base.extend(saved);
        }
    }
    s
}

#[tauri::command]
fn settings_save(settings: Value) -> Result<(), String> {
    fs::create_dir_all(user_dir()).map_err(err)?;
    let text = serde_json::to_string_pretty(&settings).map_err(err)?;
    fs::write(user_dir().join("settings.json"), text).map_err(err)
}

#[tauri::command]
fn themes_list() -> Vec<String> {
    fs::read_dir(user_dir().join("themes"))
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().to_string_lossy().strip_suffix(".css").map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn themes_read(name: String) -> Result<String, String> {
    if name.contains(['/', '\\']) {
        return Err("invalid theme name".into());
    }
    fs::read_to_string(user_dir().join("themes").join(format!("{name}.css"))).map_err(err)
}

#[tauri::command]
fn app_about(app: AppHandle) -> Value {
    json!({ "name": "MDKnas", "version": app.package_info().version.to_string(), "changelog": CHANGELOG })
}

#[tauri::command]
fn app_open_external(url: String) {
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:") {
        let _ = tauri_plugin_opener::open_url(url, None::<&str>);
    }
}

#[tauri::command]
fn app_source_state(state: tauri::State<AppState>, checked: bool) {
    if let Some(item) = state.source_item.lock().unwrap().as_ref() {
        let _ = item.set_checked(checked);
    }
}

#[tauri::command]
fn app_pending(state: tauri::State<AppState>) -> Value {
    json!({
        "file": state.pending_file.lock().unwrap().take(),
        "folder": state.pending_folder.lock().unwrap().take(),
    })
}

const RELEASES_API: &str = "https://api.github.com/repos/knas4ever/MDKnas/releases/latest";

// Microsoft Store installs are updated by the Store itself.
fn is_store_install() -> bool {
    std::env::current_exe().map(|p| p.to_string_lossy().contains("WindowsApps")).unwrap_or(false)
}

// Uses the system curl (present on Linux and Windows 10+) to avoid bundling a TLS stack.
fn curl(args: &[&str]) -> Result<Vec<u8>, String> {
    let mut cmd = std::process::Command::new("curl");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    // The AppImage runtime points LD_LIBRARY_PATH at its bundled libs, which breaks the system curl.
    cmd.env_remove("LD_LIBRARY_PATH").env_remove("LD_PRELOAD");
    let out = cmd.args(["-fsSL", "--max-time", "600", "-H", "User-Agent: MDKnas"]).args(args).output().map_err(err)?;
    if out.status.success() { Ok(out.stdout) } else { Err(String::from_utf8_lossy(&out.stderr).to_string()) }
}

// year.month.day plus the optional daily build number ("2026.11.26-1" or the
// GitHub tag "v2026.11.26.1"). The dot form is what releases publish: builds
// through 2026.11.25 split the tag on '.' only, and "26-1" parses as 0, so a
// hyphen tag looks older than the installed app. The Store's fourth component
// is always 0, so it compares equal to a plain date version.
fn parse_version(v: &str) -> Vec<u32> {
    let mut parts: Vec<u32> = v
        .trim_start_matches('v')
        .split(|c| c == '.' || c == '-')
        .take(4)
        .map(|p| p.parse().unwrap_or(0))
        .collect();
    parts.resize(4, 0);
    parts
}

// The file to replace in place: the AppImage on Linux, the exe itself on Windows
// (a running exe cannot be overwritten, but it can be renamed).
fn update_target() -> Option<(PathBuf, &'static str)> {
    if cfg!(windows) {
        std::env::current_exe().ok().map(|p| (p, "MDKnas-win-x64.exe"))
    } else {
        std::env::var("APPIMAGE").ok().map(|p| (PathBuf::from(p), ".AppImage"))
    }
}

fn install_update(target: &Path, url: &str) -> Result<(), String> {
    let tmp = PathBuf::from(format!("{}.new", target.display()));
    curl(&["-o", &tmp.to_string_lossy(), url])?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755)).map_err(err)?;
    }
    if cfg!(windows) {
        let old = PathBuf::from(format!("{}.old", target.display()));
        let _ = fs::remove_file(&old);
        fs::rename(target, &old).map_err(err)?;
        if let Err(e) = fs::rename(&tmp, target) {
            let _ = fs::rename(&old, target);
            return Err(err(e));
        }
        Ok(())
    } else {
        fs::rename(&tmp, target).map_err(err)
    }
}

const STORE_INSTALLER: &str = "https://get.microsoft.com/installer/download/9N2K3XZF5XTC?cid=DevShareMCLPCS";
const STORE_CATALOG: &str =
    "https://displaycatalog.mp.microsoft.com/v7.0/products/9N2K3XZF5XTC?market=DK&languages=en-US&MS-CV=DGU1mcuYo0WMMp+F.1";

// The newest version listed for the app in the Store, from its package names (Knas.MDKnas_<ver>_...).
fn store_latest_version() -> Result<String, String> {
    let body = String::from_utf8_lossy(&curl(&[STORE_CATALOG])?).to_string();
    body.split("Knas.MDKnas_")
        .skip(1)
        .filter_map(|s| s.split('_').next())
        .max_by_key(|v| parse_version(v))
        .map(String::from)
        .ok_or_else(|| "Store version not found".to_string())
}

fn check_for_updates(app: &AppHandle, silent: bool) {
    use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};
    let say = |title: &str, msg: String| {
        app.dialog().message(msg).title(title).kind(MessageDialogKind::Info).blocking_show();
    };
    let store = is_store_install();
    // Store installs follow the version actually published in the Store, which can lag the GitHub releases.
    let fetched: Result<(Value, String), String> = if store {
        store_latest_version().map(|v| (Value::Null, v))
    } else {
        curl(&[RELEASES_API])
            .and_then(|b| serde_json::from_slice::<Value>(&b).map_err(err))
            .map(|r| { let tag = r["tag_name"].as_str().unwrap_or("").to_string(); (r, tag) })
    };
    let (release, latest) = match fetched {
        Ok(r) => r,
        Err(e) => {
            if !silent { say("Check for Updates", format!("Could not check for updates.\n\n{e}")); }
            return;
        }
    };
    let current = app.package_info().version.to_string();
    if latest.is_empty() || parse_version(&latest) <= parse_version(&current) {
        if !silent { say("Check for Updates", format!("MDKnas {current} is up to date.")); }
        return;
    }
    let page = if store {
        "https://apps.microsoft.com/detail/9N2K3XZF5XTC".to_string()
    } else {
        release["html_url"].as_str().unwrap_or("https://github.com/knas4ever/MDKnas/releases/latest").to_string()
    };
    // Store installs live in a protected folder and are updated through the Store page.
    let target = if store { None } else { update_target() };
    let asset = target.as_ref().and_then(|(_, suffix)| {
        release["assets"].as_array()?.iter().find_map(|x| {
            let name = x["name"].as_str()?;
            if !name.ends_with(suffix) { return None; }
            x["browser_download_url"].as_str().map(String::from)
        })
    });
    let self_update = target.zip(asset);
    let ok = app
        .dialog()
        .message(format!("MDKnas {} is available (you have {current}).", latest.trim_start_matches('v')))
        .title("Update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            if self_update.is_some() || store { "Update".into() } else { "Open download page".into() },
            "Later".into(),
        ))
        .blocking_show();
    if !ok { return; }
    match self_update {
        Some(((path, _), url)) => match install_update(&path, &url) {
            Ok(()) => say("Update installed", "Restart MDKnas to use the new version.".into()),
            Err(e) => say("Update failed", format!("{e}\n\nDownload it manually from:\n{page}")),
        },
        None if store => {
            // Microsoft's own web installer: it fetches and installs the newest Store version.
            let exe = std::env::temp_dir().join("MDKnas Installer.exe");
            let started = curl(&["-o", &exe.to_string_lossy(), STORE_INSTALLER])
                .and_then(|_| std::process::Command::new(&exe).spawn().map(|_| ()).map_err(err));
            if let Err(e) = started {
                say("Update failed", format!("{e}\n\nOpen the Store page instead:\n{page}"));
                let _ = tauri_plugin_opener::open_url(page, None::<&str>);
            }
        }
        None => { let _ = tauri_plugin_opener::open_url(page, None::<&str>); }
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<(Menu<Wry>, CheckMenuItem<Wry>)> {
    let it = |id: &str, label: &str, accel: Option<&str>| MenuItem::with_id(app, id, label, true, accel);
    let sep = || PredefinedMenuItem::separator(app);

    let file = Submenu::with_items(app, "File", true, &[
        &it("new", "New", Some("CmdOrCtrl+N"))?,
        &it("open", "Open…", Some("CmdOrCtrl+O"))?,
        &it("openFolder", "Open Folder…", None)?,
        &sep()?,
        &it("save", "Save", Some("CmdOrCtrl+S"))?,
        &it("saveAs", "Save As…", Some("CmdOrCtrl+Shift+S"))?,
        &sep()?,
        &PredefinedMenuItem::quit(app, None)?,
    ])?;
    let edit = Submenu::with_items(app, "Edit", true, &[
        &it("undo", "Undo", Some("CmdOrCtrl+Z"))?,
        &it("redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?,
        &sep()?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;
    let fmt = |id: &str, label: &str, accel: &str| it(&format!("fmt:{id}"), label, Some(accel));
    let format = Submenu::with_items(app, "Format", true, &[
        &fmt("bold", "Bold", "CmdOrCtrl+B")?,
        &fmt("italic", "Italic", "CmdOrCtrl+I")?,
        &fmt("strikethrough", "Strikethrough", "CmdOrCtrl+Shift+X")?,
        &fmt("underline", "Underline", "CmdOrCtrl+U")?,
        &fmt("highlight", "Highlight", "CmdOrCtrl+Shift+H")?,
        &fmt("code", "Inline Code", "CmdOrCtrl+`")?,
        &fmt("superscript", "Superscript", "CmdOrCtrl+.")?,
        &fmt("subscript", "Subscript", "CmdOrCtrl+,")?,
        &fmt("clearFormat", "Clear Formatting", "CmdOrCtrl+\\")?,
        &sep()?,
        &fmt("paragraph", "Paragraph", "CmdOrCtrl+0")?,
        &fmt("h1", "Heading 1", "CmdOrCtrl+1")?,
        &fmt("h2", "Heading 2", "CmdOrCtrl+2")?,
        &fmt("h3", "Heading 3", "CmdOrCtrl+3")?,
        &fmt("h4", "Heading 4", "CmdOrCtrl+4")?,
        &fmt("h5", "Heading 5", "CmdOrCtrl+5")?,
        &fmt("h6", "Heading 6", "CmdOrCtrl+6")?,
        &sep()?,
        &fmt("ul", "Bullet List", "CmdOrCtrl+Shift+L")?,
        &fmt("tasklist", "Task List", "CmdOrCtrl+Shift+T")?,
        &fmt("ol", "Numbered List", "CmdOrCtrl+Shift+7")?,
        &fmt("quote", "Quote", "CmdOrCtrl+Shift+Q")?,
        &sep()?,
        &fmt("link", "Link…", "CmdOrCtrl+K")?,
        &fmt("image", "Image…", "CmdOrCtrl+Shift+M")?,
        &fmt("hr", "Horizontal Rule", "CmdOrCtrl+Shift+D")?,
        &fmt("codeblock", "Code Block", "CmdOrCtrl+Shift+K")?,
        &fmt("table", "Table…", "CmdOrCtrl+Shift+G")?,
    ])?;
    let source = CheckMenuItem::with_id(app, "source", "Raw Markdown Source", true, false, Some("CmdOrCtrl+Shift+M"))?;
    let view = Submenu::with_items(app, "View", true, &[&source])?;
    let window = Submenu::with_items(app, "Window", true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;
    let help = Submenu::with_items(app, "Help", true, &[])?;
    help.append(&it("checkUpdates", "Check for Updates…", None)?)?;
    help.append(&it("about", "About", None)?)?;
    let menu = Menu::with_items(app, &[&file, &edit, &format, &view, &window, &help])?;
    Ok((menu, source))
}

fn startup_args() -> (Option<String>, Option<String>) {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let value = |flag: &str| args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1)).cloned();
    let file = value("--open").or_else(|| {
        args.iter().find(|a| !a.starts_with('-') && Path::new(a).is_file()).cloned()
    });
    let abs = |p: String| fs::canonicalize(&p).map(|c| c.to_string_lossy().trim_start_matches(r"\\?\").to_string()).unwrap_or(p);
    (file.map(abs), value("--open-folder"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle();
            let (menu, source) = build_menu(handle)?;
            app.set_menu(menu)?;
            let state = app.state::<AppState>();
            *state.source_item.lock().unwrap() = Some(source);
            let (file, folder) = startup_args();
            *state.pending_file.lock().unwrap() = file;
            *state.pending_folder.lock().unwrap() = folder;
            if !is_store_install() {
                if let Ok(exe) = std::env::current_exe() {
                    let _ = fs::remove_file(format!("{}.old", exe.display()));
                }
            }
            let handle = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(5));
                check_for_updates(&handle, true);
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            if id == "open" {
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Some(p) = path_string(md_filter(&app).blocking_pick_file()) {
                        let _ = app.emit("app:open-file", p);
                    }
                });
            } else if id == "checkUpdates" {
                let app = app.clone();
                std::thread::spawn(move || check_for_updates(&app, false));
            } else {
                let _ = app.emit("app:menu", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            files_open_folder,
            files_save_dialog,
            files_list,
            files_read,
            files_write,
            files_create,
            files_create_folder,
            files_rename,
            files_delete,
            files_open_in_explorer,
            files_save_image,
            files_read_image_data_url,
            files_watch,
            settings_load,
            settings_save,
            themes_list,
            themes_read,
            app_about,
            app_open_external,
            app_source_state,
            app_pending,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MDKnas");
}
