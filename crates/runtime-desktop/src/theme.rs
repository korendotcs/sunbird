//! Native `ClientTheme` support on macOS arm64: intercepts Discord Phoenix's
//! one-time Mana theme JSON parser and merges user color overrides from
//! `~/Library/Application Support/libdiscord/sunbird/theme-overrides.json`.

use std::{
   collections::HashMap,
   ffi::c_void,
   path::PathBuf,
   sync::OnceLock,
};

use phoenix_hook::image::Image;

type ParseFn = unsafe extern "C" fn(*mut c_void, *const u8, usize);

static ORIGINAL: OnceLock<ParseFn> = OnceLock::new();

fn sunbird_dir() -> Option<PathBuf> {
   let home = std::env::var_os("HOME")?;
   Some(PathBuf::from(home).join("Library/Application Support/libdiscord/sunbird"))
}

pub fn overrides_path() -> Option<PathBuf> {
   Some(sunbird_dir()?.join("theme-overrides.json"))
}

pub fn hidden_channels_flag_path() -> Option<PathBuf> {
   Some(sunbird_dir()?.join("show-hidden-channels.enabled"))
}

/// Saves `theme-overrides.json` (or removes it when `json` is `None`).
pub fn set_overrides(json: Option<&str>) -> Result<(), String> {
   let path = overrides_path().ok_or_else(|| "HOME not set".to_owned())?;
   let Some(raw) = json else {
      let _ = std::fs::remove_file(&path);
      return Ok(());
   };
   let _: HashMap<String, HashMap<String, String>> =
      serde_json::from_str(raw).map_err(|err| format!("invalid theme overrides JSON: {err}"))?;
   if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).map_err(|err| format!("create sunbird dir: {err}"))?;
   }
   std::fs::write(&path, raw).map_err(|err| format!("write theme-overrides.json: {err}"))
}

/// Enables or disables `ShowHiddenChannels` for the next launch.
pub fn set_show_hidden_channels(enabled: bool) -> Result<(), String> {
   let path = hidden_channels_flag_path().ok_or_else(|| "HOME not set".to_owned())?;
   if enabled {
      if let Some(parent) = path.parent() {
         std::fs::create_dir_all(parent).map_err(|err| format!("create sunbird dir: {err}"))?;
      }
      std::fs::write(&path, b"1").map_err(|err| format!("write flag: {err}"))
   } else {
      let _ = std::fs::remove_file(&path);
      Ok(())
   }
}

/// Hooks Discord's Mana theme JSON parser on macOS arm64.
pub fn install(image: &Image<'static>) {
   let parse = match phoenix_sigs::macos::theme_json_parse(image) {
      Ok(addr) => addr,
      Err(err) => {
         log::warn!("theme: {err}, leaving default palette");
         return;
      },
   };
   // SAFETY: runs from `prepare()` before Discord's threads start; `detour`
   // matches `parse(x0=ptr, x1=len, x8=sret)` via `hook_sret`.
   let Some(orig) = (unsafe {
      crate::hook_sret::<ParseFn>(
         image,
         |pro| pro.frame,
         parse,
         detour as *const () as usize,
         "theme: failed to hook Mana palette parser",
      )
   }) else {
      return;
   };
   let _ = ORIGINAL.set(orig);
   log::info!("theme: Mana palette hook installed @ {parse:#x}");
}

fn merge_overrides(raw: &str) -> Option<String> {
   let path = overrides_path()?;
   let overrides_raw = std::fs::read_to_string(path).ok()?;
   let overrides: HashMap<String, HashMap<String, String>> =
      serde_json::from_str(&overrides_raw).ok()?;
   if overrides.is_empty() {
      return None;
   }
   let mut doc: serde_json::Value = serde_json::from_str(raw).ok()?;
   let themes = doc.get_mut("themes")?.as_array_mut()?;
   let all_map = overrides.get("all");
   let mut applied = 0usize;
   for theme in themes {
      let id = theme
         .get("id")
         .and_then(serde_json::Value::as_str)
         .unwrap_or("")
         .to_owned();
      let Some(colors) = theme.get_mut("colors").and_then(serde_json::Value::as_object_mut) else {
         continue;
      };
      if let Some(map) = all_map {
         for (k, v) in map {
            if colors.contains_key(k) {
               colors.insert(k.clone(), serde_json::Value::String(v.clone()));
               applied += 1;
            }
         }
      }
      if let Some(map) = overrides.get(&id) {
         for (k, v) in map {
            if colors.contains_key(k) {
               colors.insert(k.clone(), serde_json::Value::String(v.clone()));
               applied += 1;
            }
         }
      }
   }
   if applied == 0 {
      return None;
   }
   log::info!("theme: applied {applied} custom color token overrides");
   serde_json::to_string(&doc).ok()
}

unsafe extern "C" fn detour(sret: *mut c_void, ptr: *const u8, len: usize) {
   let Some(&orig) = ORIGINAL.get() else {
      return;
   };
   if !ptr.is_null() && len > 0 && len < 16 * 1024 * 1024 {
      // SAFETY: Discord passes a valid UTF-8 `&str` pointing to its embedded JSON.
      let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
      if let Ok(raw) = std::str::from_utf8(bytes)
         && let Some(merged) = merge_overrides(raw)
      {
         let leaked: &'static str = Box::leak(merged.into_boxed_str());
         // SAFETY: `leaked` is valid UTF-8 for the lifetime of the process.
         unsafe { orig(sret, leaked.as_ptr(), leaked.len()) };
         return;
      }
   }
   // SAFETY: forwards original arguments untouched.
   unsafe { orig(sret, ptr, len) };
}
