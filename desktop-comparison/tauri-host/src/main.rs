#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::{env, fs, path::PathBuf};
#[cfg(not(windows))]
use std::{
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    thread,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const SHORTCUT: &str = "Ctrl+Alt+Shift+S";
#[cfg(not(windows))]
static CAPTURING: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
mod overlay {
    use std::ffi::c_void;
    use tauri::{AppHandle, Manager};
    unsafe extern "C" {
        fn wsearch_prepare_overlay() -> *mut c_void;
        fn wsearch_begin_capture(hwnd: *mut c_void) -> i32;
        fn wsearch_destroy_overlay(hwnd: *mut c_void);
    }
    struct Handle(usize);
    pub fn prepare(app: &AppHandle) -> std::io::Result<()> {
        // setup, request delivery, and RunEvent::Exit all execute on the HWND's owner thread.
        let hwnd = unsafe { wsearch_prepare_overlay() };
        if hwnd.is_null() {
            return Err(std::io::Error::last_os_error());
        }
        app.manage(Handle(hwnd as usize));
        Ok(())
    }
    pub fn capture(app: &AppHandle) {
        let hwnd = app.state::<Handle>().0;
        if let Err(e) = app.run_on_main_thread(move || {
            if unsafe { wsearch_begin_capture(hwnd as *mut c_void) } == 0 {
                eprintln!("Native screenshot failed");
            }
        }) {
            eprintln!("Capture dispatch: {e}");
        }
    }
    pub fn close(app: &AppHandle) {
        if let Some(hwnd) = app.try_state::<Handle>() {
            unsafe { wsearch_destroy_overlay(hwnd.0 as *mut c_void) };
        }
    }
}

#[cfg(windows)]
use overlay::capture;

fn marker(name: &str, message: &str) {
    if let Some(dir) = env::var_os("WSEARCH_TRIAL_BENCH_DIR") {
        let _ = fs::write(PathBuf::from(dir).join(name), message);
    }
}

#[cfg(not(windows))]
fn capture(app: &AppHandle) {
    if CAPTURING.swap(true, Ordering::AcqRel) {
        return;
    }
    let handle = app.clone();
    thread::spawn(move || {
        let result = env::current_exe().and_then(|exe| {
            let name = if cfg!(windows) {
                "wsearch-capture.exe"
            } else {
                "wsearch-capture"
            };
            let child = exe.with_file_name(name);
            let path = if child.is_file() {
                child
            } else {
                handle
                    .path()
                    .resource_dir()
                    .map_err(std::io::Error::other)?
                    .join(name)
            };
            Command::new(path).status()
        });
        if !matches!(&result, Ok(status) if status.success() || status.code()==Some(1)) {
            eprintln!("Capture: {result:?}");
        }
        marker("completed", &format!("{result:?}"));
        CAPTURING.store(false, Ordering::Release);
    });
}

fn show_info(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("info") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    if let Err(e) = WebviewWindowBuilder::new(app, "info", WebviewUrl::App("index.html".into()))
        .title("wSearch · Tauri")
        .inner_size(520., 280.)
        .build()
    {
        eprintln!("Open settings: {e}");
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            #[cfg(windows)]
            overlay::prepare(app.handle())?;
            let registered = app
                .global_shortcut()
                .on_shortcut(SHORTCUT, |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        capture(app);
                    }
                })
                .is_ok();
            let label = if registered {
                "截图  Ctrl+Alt+Shift+S"
            } else {
                "截图（快捷键被占用）"
            };
            let snap = MenuItem::with_id(app, "capture", label, true, None::<&str>)?;
            let info = MenuItem::with_id(app, "info", "使用说明", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&snap, &info, &exit])?;
            TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../tray.png"
                ))?)
                .tooltip("wSearch · Tauri")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "capture" => capture(app),
                    "info" => show_info(app),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            if env::var_os("WSEARCH_TRIAL_BENCH_DIR").is_some() {
                app.global_shortcut()
                    .on_shortcut("Ctrl+Alt+Shift+F7", |app, _, e| {
                        if e.state == ShortcutState::Pressed {
                            app.exit(0)
                        }
                    })?;
            }
            if env::var_os("WSEARCH_TRIAL_SHOW_UI").is_some() {
                show_info(app.handle());
            }
            marker(
                "ready",
                if registered {
                    "registered"
                } else {
                    "unavailable"
                },
            );
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("initialize Tauri");
    app.run(|_handle, event| {
        #[cfg(windows)]
        if let RunEvent::Exit = &event {
            overlay::close(_handle);
        }
        if let RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            api.prevent_exit();
        }
    });
}
