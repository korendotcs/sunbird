//! Native `BetterFolders` hook on macOS arm64:
//! - Hooks `Client::toggle_guild_folder` so clicking a folder can open its
//!   servers in a dedicated sibling GPUI Folder Sidebar column (keeping the
//!   main server rail compact) or run in accordion mode (close other folders).
//! - Hooks `gpui::view::any_view::render::<RailView>` to wrap Discord's server
//!   rail in a horizontal flex row with the Folder Sidebar column beside it.

use std::{
   collections::HashMap,
   ffi::c_void,
   sync::{
      LazyLock,
      Mutex,
      OnceLock,
      PoisonError,
      atomic::{
         AtomicBool,
         AtomicI64,
         AtomicUsize,
         Ordering,
      },
   },
};

use phoenix_hook::image::Image;
use serde::Deserialize;

use crate::gpui::{
   self,
   RawAnyElement,
};

type ToggleFn = unsafe extern "C" fn(*mut c_void, i64, u8) -> u8;
type CollapseFn = unsafe extern "C" fn(*mut c_void);
type RailRenderFn =
   unsafe extern "C" fn(*mut RawAnyElement, *mut c_void, *mut c_void, *mut c_void);

#[derive(Clone, Deserialize)]
struct FolderGuild {
   id:   String,
   name: String,
}

#[derive(Clone, Deserialize)]
struct FolderInfo {
   #[serde(default)]
   name:   String,
   #[serde(default)]
   guilds: Vec<FolderGuild>,
}

static ORIG_TOGGLE: OnceLock<ToggleFn> = OnceLock::new();
static COLLAPSE: OnceLock<CollapseFn> = OnceLock::new();
static ORIG_RAIL_RENDER: OnceLock<RailRenderFn> = OnceLock::new();
static LAST_CLIENT: AtomicUsize = AtomicUsize::new(0);

static SIDEBAR_MODE: AtomicBool = AtomicBool::new(false);
static CLOSE_OTHERS: AtomicBool = AtomicBool::new(false);
static CLOSE_ON_SELECT: AtomicBool = AtomicBool::new(false);
static OPEN_FOLDER_ID: AtomicI64 = AtomicI64::new(0);
static RAIL_RENDER_SEEN: AtomicBool = AtomicBool::new(false);

static FOLDERS: LazyLock<Mutex<HashMap<i64, FolderInfo>>> =
   LazyLock::new(|| Mutex::new(HashMap::new()));

fn lookup_folder(folder_id: i64) -> Option<FolderInfo> {
   let map = FOLDERS.lock().unwrap_or_else(PoisonError::into_inner);
   #[expect(
      clippy::cast_sign_loss,
      clippy::cast_possible_truncation,
      reason = "folder ids are 32-bit values that may arrive zero- or sign-extended in i64"
   )]
   let as_u32 = i64::from(folder_id as u32);
   map.get(&folder_id).or_else(|| map.get(&as_u32)).cloned()
}

/// Updates `BetterFolders` behavior flags from JS.
pub fn set_options(sidebar: bool, close_others: bool, close_on_select: bool) {
   SIDEBAR_MODE.store(sidebar, Ordering::Relaxed);
   CLOSE_OTHERS.store(close_others, Ordering::Relaxed);
   CLOSE_ON_SELECT.store(close_on_select, Ordering::Relaxed);
   if !sidebar {
      OPEN_FOLDER_ID.store(0, Ordering::Relaxed);
   }
   crate::modal::force_redraw();
}

/// Loads the `{ "<folder_id>": { "name": "...", "guilds": [{ "id": "...", "name": "..." }] } }`
/// map from JS (read from Discord's real `user_settings_proto` & `guilds` cache).
pub fn set_data(json: &str) -> Result<(), String> {
   let raw: HashMap<String, FolderInfo> =
      serde_json::from_str(json).map_err(|err| format!("invalid folder map: {err}"))?;
   let mut parsed = HashMap::with_capacity(raw.len());
   for (k, v) in raw {
      if let Ok(id) = k.parse::<i64>() {
         parsed.insert(id, v);
      }
   }
   *FOLDERS.lock().unwrap_or_else(PoisonError::into_inner) = parsed;
   crate::modal::force_redraw();
   Ok(())
}

/// Closes the Folder Sidebar column.
pub fn close_sidebar() {
   OPEN_FOLDER_ID.store(0, Ordering::Relaxed);
   crate::modal::force_redraw();
}

/// Called when a guild button inside the Folder Sidebar is clicked.
pub fn on_guild_selected() {
   if CLOSE_ON_SELECT.load(Ordering::Relaxed) {
      close_sidebar();
   }
}

/// Collapses all currently expanded guild folders in Discord's sidebar (and
/// closes the Folder Sidebar column).
pub fn collapse_all() -> bool {
   OPEN_FOLDER_ID.store(0, Ordering::Relaxed);
   let client = LAST_CLIENT.load(Ordering::Acquire);
   let Some(&collapse) = COLLAPSE.get() else {
      return false;
   };
   if client == 0 {
      crate::modal::force_redraw();
      return false;
   }
   // SAFETY: `client` is Discord's long-lived `Client` captured from
   // `toggle_guild_folder`, and `collapse` matches `Client::collapse_guild_folders`.
   unsafe { collapse(client as *mut c_void) };
   crate::modal::force_redraw();
   true
}

/// Hooks `toggle_guild_folder` and `any_view::render::<RailView>` from
/// `prepare()`.
pub fn install(image: &Image<'static>) {
   match phoenix_sigs::macos::guild_folders(image) {
      Ok((toggle, collapse)) => {
         // SAFETY: runs from `prepare()` before Discord's threads start; `detour`
         // matches `toggle_guild_folder(&Client, i64, bool) -> bool`.
         if let Some(orig) = unsafe {
            crate::hook::<ToggleFn>(
               image,
               |pro| pro.frame,
               toggle,
               toggle_detour as *const () as usize,
               "folders: failed to hook toggle_guild_folder",
            )
         } {
            // SAFETY: `collapse` is the verified entry of `Client::collapse_guild_folders`.
            let collapse_fn: CollapseFn = unsafe { std::mem::transmute(collapse) };
            let _ = COLLAPSE.set(collapse_fn);
            let _ = ORIG_TOGGLE.set(orig);
            log::info!(
               "folders: toggle_guild_folder hooked @ {toggle:#x}, collapse @ {collapse:#x}"
            );
         }
      },
      Err(err) => log::warn!("folders: {err}, toggle hook disabled"),
   }

   match phoenix_sigs::macos::rail_view_render(image) {
      Ok(rail_render) => {
         // SAFETY: runs from `prepare()` before Discord's threads start;
         // `rail_render_detour` matches `any_view::render::<RailView>` (`x8` sret).
         if let Some(orig) = unsafe {
            crate::hook_sret::<RailRenderFn>(
               image,
               |pro| pro.frame,
               rail_render,
               rail_render_detour as *const () as usize,
               "folders: failed to hook RailView::render",
            )
         } {
            let _ = ORIG_RAIL_RENDER.set(orig);
            log::info!("folders: RailView Folder Sidebar hook installed @ {rail_render:#x}");
         }
      },
      Err(err) => log::warn!("folders: {err}, Folder Sidebar hook disabled"),
   }
}

unsafe extern "C" fn toggle_detour(client: *mut c_void, folder_id: i64, was_expanded: u8) -> u8 {
   if !client.is_null() {
      LAST_CLIENT.store(client as usize, Ordering::Release);
      if SIDEBAR_MODE.load(Ordering::Relaxed)
         && RAIL_RENDER_SEEN.load(Ordering::Relaxed)
         && lookup_folder(folder_id).is_some()
      {
         let prev = OPEN_FOLDER_ID.load(Ordering::Relaxed);
         let next = if prev == folder_id { 0 } else { folder_id };
         OPEN_FOLDER_ID.store(next, Ordering::Relaxed);
         if let Some(&collapse) = COLLAPSE.get() {
            // SAFETY: keep the folder collapsed in the main server list so its
            // servers appear only in the sibling Folder Sidebar column.
            unsafe { collapse(client) };
         }
         crate::modal::force_redraw();
         return 0;
      }
      if CLOSE_OTHERS.load(Ordering::Relaxed)
         && was_expanded == 0
         && let Some(&collapse) = COLLAPSE.get()
      {
         // SAFETY: `client` is the live `&Client` passed into `toggle_guild_folder`.
         unsafe { collapse(client) };
      }
   }
   let Some(&orig) = ORIG_TOGGLE.get() else {
      return was_expanded ^ 1;
   };
   // SAFETY: forwards to original `toggle_guild_folder`.
   unsafe { orig(client, folder_id, was_expanded) }
}

unsafe extern "C" fn rail_render_detour(
   sret: *mut RawAnyElement,
   view: *mut c_void,
   window: *mut c_void,
   cx: *mut c_void,
) {
   RAIL_RENDER_SEEN.store(true, Ordering::Relaxed);
   let Some(&orig) = ORIG_RAIL_RENDER.get() else {
      return;
   };
   // SAFETY: renders Discord's original server rail into `sret`.
   unsafe { orig(sret, view, window, cx) };

   if !SIDEBAR_MODE.load(Ordering::Relaxed) {
      return;
   }
   let folder_id = OPEN_FOLDER_ID.load(Ordering::Relaxed);
   if folder_id == 0 {
      return;
   }
   let Some(info) = lookup_folder(folder_id) else {
      return;
   };
   let guilds: Vec<(String, String)> = info
      .guilds
      .into_iter()
      .map(|g| (g.id, g.name))
      .collect();
   // SAFETY: `sret` holds the live `RawAnyElement` returned by `orig`.
   let _ = unsafe { gpui::wrap_rail_with_folder_sidebar(sret, &info.name, &guilds) };
}
