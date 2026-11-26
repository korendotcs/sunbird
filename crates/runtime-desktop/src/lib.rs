//! phoenix on Desktop Phoenix: the access gate, the HTTP transport hooks, the
//! Sunbird pages in User Settings, message accessories, member list
//! decorations and the tray.

#![cfg(any(
   windows,
   all(target_os = "linux", target_arch = "x86_64"),
   all(target_os = "macos", target_arch = "aarch64")
))]

#[cfg(target_arch = "x86_64")]
mod accessories;
#[cfg(target_arch = "x86_64")]
mod badges;
#[cfg(target_os = "macos")]
mod captcha;
#[cfg(target_arch = "x86_64")]
mod composer;
#[cfg(target_arch = "x86_64")]
mod context_menu;
#[cfg(target_arch = "x86_64")]
mod discord;
#[cfg(target_arch = "x86_64")]
mod double_click;
#[cfg(target_arch = "x86_64")]
mod emoji;
mod fetch;
#[cfg(target_arch = "x86_64")]
mod gateway_send;
mod gpui;
#[cfg(target_arch = "x86_64")]
mod headers;
#[cfg(target_arch = "x86_64")]
mod icons;
#[cfg(target_arch = "x86_64")]
mod js;
#[cfg(target_arch = "x86_64")]
mod members;
#[cfg(target_arch = "x86_64")]
mod message;
#[cfg(target_arch = "x86_64")]
mod modal;
mod os;
#[cfg(windows)]
mod restart;
mod settings;
#[cfg(target_arch = "x86_64")]
mod staff;

#[cfg(target_arch = "x86_64")]
use std::time::Duration;
use std::{
   ffi::c_void,
   path::{Path, PathBuf},
   sync::{Arc, Mutex, PoisonError},
};

use phoenix_hook::image::Image;
use phoenix_runtime::{
   Error, Notice, Platform, Plugin, Started,
   discord::{Authorization, DiscordError},
   fetch::{FetchError, Request, Response},
   remote::{self, Done},
   store::{Rows, StoreError},
};
use phoenix_sigs::registry::GatewayRegistry;
use rquickjs::{Ctx, Object};

struct Desktop;

/// A `POST /ui/choose` or `POST /ui/sheet` body.
#[cfg(target_arch = "x86_64")]
#[derive(serde::Deserialize)]
struct DialogRequest {
   title: Option<String>,
   message: Option<String>,
   text: Option<String>,
   monospace: Option<bool>,
   highlight: Option<bool>,
   options: Option<Vec<DialogItem>>,
}

#[cfg(target_arch = "x86_64")]
#[derive(serde::Deserialize)]
#[serde(untagged)]
enum DialogItem {
   Label(String),
   Item {
      label: String,
      #[serde(default)]
      danger: bool,
   },
}

#[cfg(target_arch = "x86_64")]
#[derive(serde::Serialize)]
struct DialogAnswer {
   index: i32,
}

/// The target and its swapped gateway registry, once [`prepare`] hooked them.
static PREPARED: Mutex<Option<(Image<'static>, &'static GatewayRegistry)>> = Mutex::new(None);

/// Hooks Discord from `DllMain` on Windows or the constructor on Unix, before
/// its own code runs.
///
/// Desktop Phoenix settles on the access gate in its first frames and stops
/// reading the gateway registry and HTTP vtables once started, so hooks swapped
/// later from [`start`]'s thread never run. [`start`] picks up what this
/// hooked.
pub fn prepare() -> Result<(), Error> {
   phoenix_runtime::set_platform(&Desktop);
   let image = phoenix_runtime::target()?;
   open_access_gate(&image);
   #[cfg(windows)]
   restart::install(&image);
   #[cfg(target_arch = "x86_64")]
   staff::prepare(&image);
   settings::install(&image);
   #[cfg(target_os = "macos")]
   {
      fetch::preload();
      captcha::install();
   }
   #[cfg(target_arch = "x86_64")]
   {
      modal::install(&image);
      // Before accessories hooks `MessageRow::render`, whose prologue the header
      // locators check.
      let header = headers::locate(&image);
      accessories::install(&image);
      members::install(&image);
      headers::install(&image, header);
      icons::install(&image);
      context_menu::install(&image);
      message::install(&image);
      badges::install(&image);
      emoji::install(&image);
      composer::install(&image);
   }
   <os::Os as os::DesktopOs>::install(&image);
   let registry = phoenix_runtime::hook(&image);
   #[cfg(target_arch = "x86_64")]
   {
      if registry.is_ok() {
         discord::install(&image);
         gateway_send::install(&image);
         accessories::install_optimistic_delete(&image);
      }
      // The index is tens of MB and nothing reads it after startup.
      phoenix_sigs::desktop::release_call_index();
   }
   *PREPARED.lock().unwrap_or_else(PoisonError::into_inner) = Some((image, registry?));
   Ok(())
}

/// Opens the access gate for testing Discord without the plugin runtime.
pub fn open_gate_only() -> Result<(), Error> {
   phoenix_runtime::set_platform(&Desktop);
   let image = phoenix_runtime::target()?;
   open_access_gate(&image);
   #[cfg(windows)]
   restart::install(&image);
   Ok(())
}

/// Starts phoenix inside Desktop Phoenix, on what [`prepare`] hooked.
pub fn start(home: PathBuf, bundled: Vec<Plugin>) -> Result<Started, Error> {
   let prepared = PREPARED
      .lock()
      .unwrap_or_else(PoisonError::into_inner)
      .take();
   if let Some((image, registry)) = prepared {
      return phoenix_runtime::start_hooked(&Desktop, image, registry, home, bundled);
   }
   let image = phoenix_runtime::target()?;
   let registry = phoenix_runtime::hook(&image)?;
   #[cfg(target_arch = "x86_64")]
   {
      discord::install(&image);
      gateway_send::install(&image);
   }
   phoenix_runtime::start_hooked(&Desktop, image, registry, home, bundled)
}

/// Desktop Phoenix shows "This app isn't available for your account" from
/// `libdiscord_ops_surfaces::client_access::ClientAccessGate`, and blocks the
/// login on it. Discord settles on the gate within its first frames, so the
/// loader calls this from `DllMain` or the constructor, before Discord's own
/// code.
fn open_access_gate(image: &Image<'static>) {
   #[cfg(target_arch = "x86_64")]
   {
      let access = match phoenix_sigs::desktop::access_gate(image) {
         Ok(access) => access,
         Err(err) => {
            log::warn!("access gate: {err}, leaving it");
            return;
         },
      };
      // `mov al, 2; ret`
      // SAFETY: Discord's own code, written from `DllMain` or the constructor
      // before it runs.
      match unsafe { image.write_code(access, &[0xB0, 0x02, 0xC3]) } {
         Ok(()) => log::info!("access gate: open"),
         Err(err) => log::error!("access gate: {err}"),
      }
   }
   #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
   {
      /// `mov w0, #2; ret`
      const NO_GATE: [u8; 8] = [0x40, 0x00, 0x80, 0x52, 0xC0, 0x03, 0x5F, 0xD6];
      /// `mov w0, #0; ret`
      const NOT_ENFORCED: [u8; 8] = [0x00, 0x00, 0x80, 0x52, 0xC0, 0x03, 0x5F, 0xD6];

      let access = match phoenix_sigs::macos::access_gate(image) {
         Ok(access) => access,
         Err(err) => {
            log::warn!("access gate: {err}, leaving it");
            return;
         },
      };
      // Located before `read` is rewritten, since it is found through it.
      let enforced = phoenix_sigs::macos::access_enforced(image, access);
      // SAFETY: Discord's own code, written from the constructor before it runs.
      match unsafe { image.write_code(access, &NO_GATE) } {
         Ok(()) => log::info!("access gate: open"),
         Err(err) => log::error!("access gate: {err}"),
      }
      // `push_access` asks `enforced` itself and drops every message alert for
      // a gated account, so notifications and their sounds need this too.
      // SAFETY: as above.
      match enforced.map(|enforced| unsafe { image.write_code(enforced, &NOT_ENFORCED) }) {
         Ok(Ok(())) => log::info!("access gate: not enforced, message alerts are on"),
         Ok(Err(err)) => log::error!("access gate: {err}"),
         Err(err) => log::warn!("{err}, message alerts stay off"),
      }
   }
}

impl Platform for Desktop {
   fn send(&self, request: &Request) -> Result<Response, FetchError> {
      fetch::send(request)
   }

   fn query(&self, database: &Path, sql: &str, args: &[String]) -> Result<Rows, StoreError> {
      phoenix_runtime::store::sqlite(database, sql, args)
   }

   fn discord(
      &self,
      method: &str,
      path: &str,
      headers: Vec<(String, String)>,
      body: Vec<u8>,
   ) -> Result<Response, DiscordError> {
      #[cfg(target_arch = "x86_64")]
      return discord::send(method, path, headers, body);
      #[cfg(not(target_arch = "x86_64"))]
      {
         let _ = (method, path, headers, body);
         Err(DiscordError::NoSession)
      }
   }

   fn authorize(&self, request: &Authorization) -> Result<String, DiscordError> {
      #[cfg(target_arch = "x86_64")]
      return discord::authorize(request);
      #[cfg(not(target_arch = "x86_64"))]
      {
         let _ = request;
         Err(DiscordError::NoSession)
      }
   }

   fn init(&self, ctx: &Ctx<'_>) -> rquickjs::Result<()> {
      #[cfg(target_arch = "x86_64")]
      ctx.store_userdata(js::Desktop::default())
         .map_err(|err| rquickjs::Exception::throw_internal(ctx, &err.to_string()))?;
      #[cfg(not(target_arch = "x86_64"))]
      let _ = ctx;
      Ok(())
   }

   fn api<'js>(
      &self,
      ctx: &Ctx<'js>,
      plugin: &str,
      api: &Object<'js>,
      messages: &Object<'js>,
   ) -> rquickjs::Result<()> {
      #[cfg(target_arch = "x86_64")]
      return js::ui::desktop_patch_api(ctx, plugin, api, messages);
      #[cfg(not(target_arch = "x86_64"))]
      {
         let _ = (ctx, plugin, api, messages);
         Ok(())
      }
   }

   fn console<'js>(&self, ctx: &Ctx<'js>, phoenix: &Object<'js>) -> rquickjs::Result<()> {
      #[cfg(target_arch = "x86_64")]
      return phoenix.set("native", js::native::object(ctx)?);
      #[cfg(not(target_arch = "x86_64"))]
      {
         let _ = (ctx, phoenix);
         Ok(())
      }
   }

   fn unload(&self, ctx: &Ctx<'_>, plugin: &str) {
      #[cfg(target_arch = "x86_64")]
      js::unload(ctx, plugin);
      #[cfg(not(target_arch = "x86_64"))]
      let _ = (ctx, plugin);
   }

   fn staff(&self, image: &'static Image<'static>) {
      #[cfg(target_arch = "x86_64")]
      staff::start(image);
      #[cfg(not(target_arch = "x86_64"))]
      let _ = image;
   }

   fn gateway(&self, store: *mut c_void) {
      #[cfg(target_arch = "x86_64")]
      // SAFETY: every registry handler takes the store state first, and this
      // runs inside one.
      unsafe {
         staff::apply(store);
      }
      #[cfg(not(target_arch = "x86_64"))]
      let _ = store;
   }

   fn started(&self, _first_run: bool, _plugins: &[String]) {
      let Some(state) = phoenix_runtime::state() else {
         return;
      };
      let _ = std::fs::create_dir_all(state.plugins_dir());
      // Any local process could reach the shell's `/eval` and the session, so
      // it only listens once DevTools is opened, and only for holders of this
      // start's token. `SUNBIRD_DEVTOOLS` starts it at launch, for `dev.ps1`.
      remote::require_token(&state.plugins_dir().with_file_name("debug-shell-token"));
      if std::env::var_os("SUNBIRD_DEVTOOLS").is_some() {
         start_shell();
      }
      phoenix_ui_desktop::start_tray(phoenix_ui_desktop::TrayConfig {
         devtools_url:     Arc::new(start_shell),
         plugins_dir:      state.plugins_dir(),
         on_reload_all:    Some(Arc::new(phoenix_runtime::reload_all)),
         on_check_updates: Some(Arc::new(phoenix_runtime::update::check_now)),
      });
      phoenix_ui_desktop::notify(
         "Sunbird ready",
         Some("Open User Settings -> Sunbird, or press Ctrl+Shift+I for DevTools"),
      );
      phoenix_runtime::update::check();
   }

   fn refresh(&self) {
      #[cfg(target_arch = "x86_64")]
      modal::force_redraw();
   }

   fn toast(&self, message: &str) {
      phoenix_ui_desktop::toast(message);
   }

   fn notify(&self, notice: Notice<'_>) {
      match notice {
         Notice::UpdateAvailable(update) => {
            let mut parts = Vec::new();
            if let Some(version) = &update.loader {
               parts.push(format!("Sunbird {version} (restart to update)"));
            }
            if !update.plugins.is_empty() {
               parts.push(format!("plugins: {}", update.plugins.join(", ")));
            }
            let body = if parts.is_empty() {
               "Open Settings -> Sunbird".to_owned()
            } else {
               parts.join(" · ")
            };
            phoenix_ui_desktop::notify("Sunbird update available", Some(&body));
         },
         Notice::PluginsUpdated(names) if !names.is_empty() => {
            let body = format!("Reloaded: {}", names.join(", "));
            phoenix_ui_desktop::notify("Plugins updated", Some(&body));
         },
         Notice::PluginsUpdated(_) => {},
      }
   }

   fn route(&self, request: &remote::Request) -> Option<remote::Reply> {
      let html = || {
         (
            "200 OK",
            "text/html; charset=utf-8",
            phoenix_ui_desktop::DASHBOARD_HTML.as_bytes().to_vec(),
         )
      };
      match (request.method.as_str(), request.path.as_str()) {
         ("GET", "/ui") => Some(html()),
         ("GET", "/") if request.accept.contains("text/html") => Some(html()),
         ("POST", "/ui/devtools") => {
            phoenix_ui_desktop::open_devtools();
            Some(remote::ok_json(&Done::Started))
         },
         ("POST", "/ui/choose") => Some(dialog(&request.body, false)),
         ("POST", "/ui/sheet") => Some(dialog(&request.body, true)),
         _ => None,
      }
   }

   fn routes(&self) -> &'static str {
      ", GET /ui, POST /ui/devtools, POST /ui/{choose,sheet}"
   }
}

/// Starts the debug shell if it isn't running and returns the `DevTools` URL.
fn start_shell() -> String {
   remote::set_flag(true);
   remote::ensure_started();
   remote::dashboard_url()
}

#[cfg(not(target_arch = "x86_64"))]
fn dialog(_body: &[u8], _sheet: bool) -> remote::Reply {
   remote::err(
      "501 Not Implemented",
      "native dialogs are not implemented on this target",
   )
}

/// Opens a native choose or sheet dialog for the dashboard and blocks this
/// request's thread until it is answered.
#[cfg(target_arch = "x86_64")]
fn dialog(body: &[u8], sheet: bool) -> remote::Reply {
   let Ok(request) = serde_json::from_slice::<DialogRequest>(body) else {
      return remote::err("400 Bad Request", "expected a JSON dialog request");
   };
   let options = request
      .options
      .unwrap_or_default()
      .into_iter()
      .map(|item| match item {
         DialogItem::Label(label) => modal::ChoiceOption {
            label,
            danger: false,
         },
         DialogItem::Item { label, danger } => modal::ChoiceOption { label, danger },
      })
      .collect::<Vec<_>>();
   let content = if sheet {
      request.text.map(|text| modal::ModalSection::Code {
         title: None,
         text,
         monospace: request.monospace.unwrap_or_default(),
         highlight: request.highlight.unwrap_or_default(),
      })
   } else {
      request
         .message
         .map(|text| modal::ModalSection::Text { title: None, text })
   };
   if content.is_none() && options.is_empty() {
      return remote::err(
         "400 Bad Request",
         if sheet {
            "a sheet needs text"
         } else {
            "a choose dialog needs a message or options"
         },
      );
   }
   let title = request.title.unwrap_or_else(|| "Sunbird".to_owned());
   let index = modal::ask(title, content, options, Duration::from_secs(120));
   remote::ok_json(&DialogAnswer { index })
}
