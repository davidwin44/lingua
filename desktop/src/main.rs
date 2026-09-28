//! Lingua for Windows: installer, launcher and uninstaller in one executable.
//!
//! - Run from anywhere except the install folder (e.g. `Lingua-Setup-x.y.z.exe` in Downloads):
//!   installs for the current user into %LOCALAPPDATA%\Programs\Lingua, adds Start menu and
//!   desktop shortcuts, and registers an uninstaller under "Installed apps". No admin rights.
//! - Run from the install folder (the shortcuts): serves the embedded web app on 127.0.0.1 and
//!   opens it in its own Microsoft Edge app window, with a dedicated Edge profile so progress
//!   persists and stays separate from normal browsing. Edge is used because it supports speech
//!   recognition, which the app's pronunciation practice needs.
//! - `--uninstall` removes it again (optionally with the saved progress).
//!
//! Flags: `--silent` (no dialogs; for scripted installs), `--no-launch`, `--purge` (with
//! `--uninstall --silent`: also delete progress), `--run` (launch the app from any location),
//! `--test-root <dir>` (install into a scratch folder with a separate registry key; used for tests).

#![windows_subsystem = "windows"]

use std::env;
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

use include_dir::{include_dir, Dir};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_ICONERROR, MB_ICONINFORMATION, MB_ICONQUESTION, MB_OK, MB_SETFOREGROUND, MB_YESNO,
};
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

/// The built web app (`npm run build` output), embedded at compile time.
static DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

const APP: &str = "Lingua";
const VERSION: &str = env!("CARGO_PKG_VERSION");
const PUBLISHER: &str = "davidwin44";
const REPO_URL: &str = "https://github.com/davidwin44/lingua";
/// Fixed port: browser storage is tied to the origin, so it must never change between runs.
const PORT: u16 = 47823;
const TEST_PORT: u16 = 47824;
const HEALTH_PATH: &str = "/__lingua";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";

struct Options {
    silent: bool,
    launch: bool,
    purge: bool,
    test_root: Option<PathBuf>,
}

struct Layout {
    install_dir: PathBuf,
    exe_path: PathBuf,
    data_dir: PathBuf,
    /// Explicit shortcut folders (test mode). `None` = the user's Start menu and desktop.
    shortcut_dirs: Option<(PathBuf, PathBuf)>,
    reg_name: String,
    port: u16,
}

impl Layout {
    fn new(test_root: Option<&Path>) -> Result<Self, String> {
        if let Some(root) = test_root {
            let install_dir = root.join("app");
            return Ok(Layout {
                exe_path: install_dir.join("Lingua.exe"),
                install_dir,
                data_dir: root.join("data"),
                shortcut_dirs: Some((root.join("start-menu"), root.join("desktop"))),
                reg_name: "Lingua-Test".into(),
                port: TEST_PORT,
            });
        }
        let local = env::var_os("LOCALAPPDATA").map(PathBuf::from).ok_or("LOCALAPPDATA is not set")?;
        let install_dir = local.join("Programs").join(APP);
        Ok(Layout {
            exe_path: install_dir.join("Lingua.exe"),
            install_dir,
            data_dir: local.join(APP),
            shortcut_dirs: None,
            reg_name: APP.into(),
            port: PORT,
        })
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.port)
    }

    fn profile_dir(&self) -> PathBuf {
        self.data_dir.join("EdgeProfile")
    }
}

// ---------------------------------------------------------------- dialogs

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn message(text: &str, flags: u32) -> i32 {
    let title = wide(APP);
    let body = wide(text);
    unsafe { MessageBoxW(std::ptr::null_mut(), body.as_ptr(), title.as_ptr(), flags | MB_SETFOREGROUND) }
}

fn ask(text: &str) -> bool {
    message(text, MB_YESNO | MB_ICONQUESTION) == IDYES
}

fn info(text: &str) {
    message(text, MB_OK | MB_ICONINFORMATION);
}

fn error(text: &str) {
    message(text, MB_OK | MB_ICONERROR);
}

// ---------------------------------------------------------------- helpers

fn same_path(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy()),
        _ => false,
    }
}

fn find_edge() -> Option<PathBuf> {
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        if let Ok(key) = RegKey::predef(hive).open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe") {
            if let Ok(path) = key.get_value::<String, _>("") {
                let p = PathBuf::from(path.trim_matches('"'));
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    let rel = Path::new("Microsoft").join("Edge").join("Application").join("msedge.exe");
    ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"]
        .iter()
        .filter_map(|v| env::var_os(v))
        .map(|base| PathBuf::from(base).join(&rel))
        .find(|p| p.is_file())
}

/// Is a Lingua server already answering on this port?
fn lingua_running(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(400)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let request = format!("GET {HEALTH_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.contains("lingua-ok")
}

/// Run a PowerShell snippet without flashing a console window. Values are passed as
/// environment variables so paths never need quoting inside the script.
fn powershell(script: &str, vars: &[(&str, &Path)]) -> Result<(), String> {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    for (k, v) in vars {
        cmd.env(k, v);
    }
    let out = cmd.output().map_err(|e| format!("Could not run PowerShell: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

const SHORTCUT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$programs = if ($env:LINGUA_START) { $env:LINGUA_START } else { [Environment]::GetFolderPath('Programs') }
$desktop = if ($env:LINGUA_DESKTOP) { $env:LINGUA_DESKTOP } else { [Environment]::GetFolderPath('DesktopDirectory') }
$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @($programs, $desktop)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $link = $shell.CreateShortcut((Join-Path $dir 'Lingua.lnk'))
  $link.TargetPath = $env:LINGUA_EXE
  $link.WorkingDirectory = $env:LINGUA_DIR
  $link.IconLocation = "$($env:LINGUA_EXE),0"
  $link.Description = 'Lingua: learn Italian'
  $link.Save()
}
"#;

const REMOVE_SHORTCUTS_SCRIPT: &str = r#"
$programs = if ($env:LINGUA_START) { $env:LINGUA_START } else { [Environment]::GetFolderPath('Programs') }
$desktop = if ($env:LINGUA_DESKTOP) { $env:LINGUA_DESKTOP } else { [Environment]::GetFolderPath('DesktopDirectory') }
foreach ($dir in @($programs, $desktop)) { Remove-Item -LiteralPath (Join-Path $dir 'Lingua.lnk') -Force -ErrorAction SilentlyContinue }
"#;

fn shortcut_vars(layout: &Layout) -> Vec<(&'static str, &Path)> {
    let mut vars: Vec<(&'static str, &Path)> = vec![("LINGUA_EXE", layout.exe_path.as_path()), ("LINGUA_DIR", layout.install_dir.as_path())];
    if let Some((start, desktop)) = &layout.shortcut_dirs {
        vars.push(("LINGUA_START", start.as_path()));
        vars.push(("LINGUA_DESKTOP", desktop.as_path()));
    }
    vars
}

fn dir_size_kb(dir: &Path) -> u32 {
    fn walk(p: &Path) -> u64 {
        fs::read_dir(p)
            .map(|rd| {
                rd.flatten()
                    .map(|e| match e.metadata() {
                        Ok(m) if m.is_dir() => walk(&e.path()),
                        Ok(m) => m.len(),
                        Err(_) => 0,
                    })
                    .sum()
            })
            .unwrap_or(0)
    }
    (walk(dir) / 1024) as u32
}

// ---------------------------------------------------------------- install

fn install(layout: &Layout, opts: &Options) -> Result<(), String> {
    if !opts.silent
        && !ask(&format!(
            "Install {APP} {VERSION}?\n\nIt installs for your Windows account only, with Start menu and desktop shortcuts. \
             Lingua opens in its own Microsoft Edge window and keeps your progress on this computer."
        ))
    {
        return Ok(());
    }
    if find_edge().is_none() {
        return Err("Lingua needs Microsoft Edge, which comes with Windows 10 and 11. Install Edge and run this setup again.".into());
    }
    if lingua_running(layout.port) {
        return Err("Lingua is open. Close its window, then run this setup again.".into());
    }

    let current = env::current_exe().map_err(|e| e.to_string())?;
    fs::create_dir_all(&layout.install_dir).map_err(|e| format!("Could not create {}: {e}", layout.install_dir.display()))?;
    if !same_path(&current, &layout.exe_path) {
        fs::copy(&current, &layout.exe_path).map_err(|e| format!("Could not copy Lingua into {}: {e}", layout.install_dir.display()))?;
    }

    powershell(SHORTCUT_SCRIPT, &shortcut_vars(layout)).map_err(|e| format!("Could not create shortcuts: {e}"))?;

    let exe = layout.exe_path.to_string_lossy().to_string();
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(format!(r"{UNINSTALL_KEY}\{}", layout.reg_name))
        .map_err(|e| format!("Could not register the uninstaller: {e}"))?;
    let test_flag = match &opts.test_root {
        Some(root) => format!(" --test-root \"{}\"", root.display()),
        None => String::new(),
    };
    let set = |name: &str, value: &str| key.set_value(name, &value.to_string()).map_err(|e| e.to_string());
    set("DisplayName", APP)?;
    set("DisplayVersion", VERSION)?;
    set("Publisher", PUBLISHER)?;
    set("DisplayIcon", &format!("{exe},0"))?;
    set("InstallLocation", &layout.install_dir.to_string_lossy())?;
    set("UninstallString", &format!("\"{exe}\" --uninstall{test_flag}"))?;
    set("QuietUninstallString", &format!("\"{exe}\" --uninstall --silent{test_flag}"))?;
    set("URLInfoAbout", REPO_URL)?;
    key.set_value("NoModify", &1u32).map_err(|e| e.to_string())?;
    key.set_value("NoRepair", &1u32).map_err(|e| e.to_string())?;
    key.set_value("EstimatedSize", &dir_size_kb(&layout.install_dir)).map_err(|e| e.to_string())?;

    if opts.launch && (opts.silent || ask(&format!("{APP} is installed. Open it now?"))) {
        let mut cmd = Command::new(&layout.exe_path);
        if let Some(root) = &opts.test_root {
            cmd.arg("--test-root").arg(root);
        }
        cmd.creation_flags(DETACHED_PROCESS).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------- uninstall

fn uninstall(layout: &Layout, opts: &Options) -> Result<(), String> {
    if !opts.silent && !ask(&format!("Uninstall {APP}?")) {
        return Ok(());
    }
    if lingua_running(layout.port) {
        return Err("Lingua is open. Close its window, then uninstall again.".into());
    }
    let delete_data = if opts.silent {
        opts.purge
    } else {
        ask("Also delete your Lingua progress on this computer?\n\nChoose No to keep it for a future install. You can export a backup from Lingua's Settings first.")
    };

    powershell(REMOVE_SHORTCUTS_SCRIPT, &shortcut_vars(layout)).ok();
    RegKey::predef(HKEY_CURRENT_USER)
        .delete_subkey_all(format!(r"{UNINSTALL_KEY}\{}", layout.reg_name))
        .ok();
    if delete_data && layout.data_dir.exists() {
        fs::remove_dir_all(&layout.data_dir).map_err(|e| format!("Could not delete saved progress: {e}"))?;
    }

    // An exe can't delete itself while running: remove the folder from a detached helper
    // shortly after this process exits.
    let current = env::current_exe().map_err(|e| e.to_string())?;
    let running_from_install = fs::canonicalize(&current)
        .ok()
        .zip(fs::canonicalize(&layout.install_dir).ok())
        .map(|(c, d)| c.starts_with(d))
        .unwrap_or(false);
    if running_from_install {
        let dir = layout.install_dir.to_string_lossy().to_string();
        Command::new("cmd.exe")
            .raw_arg(format!("/d /c ping 127.0.0.1 -n 3 >nul & rmdir /s /q \"{dir}\""))
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else if layout.install_dir.exists() {
        fs::remove_dir_all(&layout.install_dir).map_err(|e| e.to_string())?;
    }

    if !opts.silent {
        info(&format!("{APP} was uninstalled."));
    }
    Ok(())
}

// ---------------------------------------------------------------- run

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "webmanifest" => "application/manifest+json",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn header(name: &str, value: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn serve(server: tiny_http::Server) {
    for request in server.incoming_requests() {
        let raw = request.url().split(['?', '#']).next().unwrap_or("/").to_string();
        if raw == HEALTH_PATH {
            let _ = request.respond(tiny_http::Response::from_string("lingua-ok"));
            continue;
        }
        let rel = raw.trim_start_matches('/');
        let rel = if rel.is_empty() { "index.html" } else { rel };
        let file = if rel.split('/').any(|seg| seg == ".." || seg.is_empty()) {
            None
        } else {
            DIST.get_file(rel).or_else(|| (!rel.contains('.')).then(|| DIST.get_file("index.html")).flatten())
        };
        let response = match file {
            Some(f) => {
                let name = f.path().to_string_lossy().replace('\\', "/");
                let cache = if name.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
                tiny_http::Response::from_data(f.contents())
                    .with_header(header("Content-Type", content_type(&name)))
                    .with_header(header("Cache-Control", cache))
                    .with_header(header("X-Content-Type-Options", "nosniff"))
            }
            None => tiny_http::Response::from_string("Not found").with_status_code(404),
        };
        let _ = request.respond(response);
    }
}

fn launch_edge(edge: &Path, layout: &Layout) -> Result<Child, String> {
    fs::create_dir_all(layout.profile_dir()).map_err(|e| e.to_string())?;
    Command::new(edge)
        .arg(format!("--app={}", layout.url()))
        .arg(format!("--user-data-dir={}", layout.profile_dir().display()))
        .args(["--no-first-run", "--no-default-browser-check", "--window-size=1180,860"])
        .spawn()
        .map_err(|e| format!("Could not start Microsoft Edge: {e}"))
}

/// Chromium holds `lockfile` in the profile folder open while the profile is in use.
fn profile_in_use(layout: &Layout) -> bool {
    let lock = layout.profile_dir().join("lockfile");
    lock.exists() && fs::OpenOptions::new().read(true).share_mode(0).open(&lock).is_err()
}

fn run_app(layout: &Layout) -> Result<(), String> {
    let edge = find_edge().ok_or("Lingua needs Microsoft Edge, which comes with Windows 10 and 11.")?;
    if lingua_running(layout.port) {
        // Already running: just open another window on the same server.
        launch_edge(&edge, layout)?;
        return Ok(());
    }
    let server = tiny_http::Server::http(("127.0.0.1", layout.port))
        .map_err(|_| format!("Lingua couldn't start because another program is using port {}.", layout.port))?;
    thread::spawn(move || serve(server));

    let mut child = launch_edge(&edge, layout)?;
    // Keep serving while the Lingua window (its Edge profile) is open.
    loop {
        thread::sleep(Duration::from_secs(2));
        let exited = matches!(child.try_wait(), Ok(Some(_)));
        if exited && !profile_in_use(layout) {
            break;
        }
    }
    Ok(())
}

/// Serve without opening Edge (for automated tests). Stops after `seconds`.
fn serve_only(layout: &Layout, seconds: u64) -> Result<(), String> {
    let server = tiny_http::Server::http(("127.0.0.1", layout.port)).map_err(|e| e.to_string())?;
    thread::spawn(move || serve(server));
    thread::sleep(Duration::from_secs(seconds));
    Ok(())
}

// ---------------------------------------------------------------- main

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let has = |flag: &str| args.iter().any(|a| a.eq_ignore_ascii_case(flag));
    let value = |flag: &str| {
        args.iter()
            .position(|a| a.eq_ignore_ascii_case(flag))
            .and_then(|i| args.get(i + 1))
            .map(PathBuf::from)
    };
    let opts = Options {
        silent: has("--silent") || has("/S"),
        launch: !has("--no-launch"),
        purge: has("--purge"),
        test_root: value("--test-root"),
    };

    let result = Layout::new(opts.test_root.as_deref()).and_then(|layout| {
        let installed_copy = env::current_exe().map(|p| same_path(&p, &layout.exe_path)).unwrap_or(false);
        if has("--uninstall") {
            uninstall(&layout, &opts)
        } else if let Some(secs) = value("--serve-only") {
            serve_only(&layout, secs.to_string_lossy().parse().unwrap_or(10))
        } else if has("--run") || installed_copy {
            run_app(&layout)
        } else {
            install(&layout, &opts)
        }
    });

    if let Err(e) = result {
        // Visible when run from a terminal (silent installs); a dialog otherwise.
        eprintln!("Lingua: {e}");
        if !opts.silent {
            error(&e);
        }
        std::process::exit(1);
    }
}
