//! Locators for macOS Desktop Phoenix (`Discord Phoenix.app/Contents/MacOS/Discord`, arm64).

use std::collections::HashMap;

use phoenix_hook::{
   arm64,
   image::Image,
   pattern::Pattern,
};

pub use crate::layout::{
   ButtonLayout,
   DivLayout,
   Gpui,
   GpuiLayout,
   Section,
   SettingsLabel,
   StyleOffsets,
   SwitchLayout,
   layout,
};
use crate::{
   Found,
   one,
};

/// `should_enforce_client_access_gate` in `libdiscord_ops_surfaces::client_access`.
///
/// The function starts 8 bytes before this body (`mov w8, #imm; add x8, x0, x8`),
/// loads the session state (`cmp x9, #2`), user id (`cmn x8, #1`), and staff flag
/// (`ldrb w8, [x0, #imm]; eor w8, w8, #1`). Patching its entry to `mov w0, #0; ret`
/// makes every `ClientAccessGate` evaluator return `None` (no gate).
const ACCESS_GATE: Pattern = Pattern::new(
   "09 01 40 F9 3F 09 00 F1 E0 00 00 54 08 ?? ?? F9 1F 05 00 B1 80 00 00 54 08 ?? ?? 39 08 01 00 \
    52 02 00 00 14 08 00 80 52 00 01 00 12 C0 03 5F D6",
);

/// Entry point of `should_enforce_client_access_gate`, which opens the gate
/// when patched to return `false` (`mov w0, #0; ret`).
pub fn access_gate(image: &Image<'_>) -> Found<usize> {
   let body = one("macos access gate", &image.scan(ACCESS_GATE))?;
   let entry = body
      .checked_sub(8)
      .ok_or("macos access gate body too close to start of segment")?;
   if image.is_code(entry) {
      Ok(entry)
   } else {
      Err(format!("macos access gate entry {entry:#x} is not code"))
   }
}

/// Page 24's sidebar label (`Phoenix`) and id (`DESKTOP_PHOENIX`) packed as one
/// literal in `__TEXT,__const`.
pub fn settings_label_parts(image: &Image<'_>) -> Found<SettingsLabel> {
   let at = one(
      "PhoenixDESKTOP_PHOENIX",
      &image.find_bytes(b"PhoenixDESKTOP_PHOENIX"),
   )?;
   Ok(SettingsLabel {
      name: at,
      id:   at + b"Phoenix".len(),
   })
}

/// The `cmp w9, #0xf` instruction inside `is_page_visible`.
///
/// Matches `and w8, w0, #0xff; sub w9, w8, #9; cmp w9, #0xf; b.hi ...; mov w8, #1`
/// and returns the address of `cmp` so the runtime can rewrite `#0xf` to `#0xe`.
pub fn settings_visibility(image: &Image<'_>) -> Found<usize> {
   const GUARD: Pattern =
      Pattern::new("08 1C 00 12 09 25 00 51 3F 3D 00 71 ?? ?? ?? 54 28 00 80 52");
   Ok(one("macos settings visibility guard", &image.scan(GUARD))? + 8)
}

/// `host::section`, located via the unique `"account-loading"` string xref and
/// Mach-O `LC_FUNCTION_STARTS`, along with the `active_page` byte offset in
/// `HostState`.
pub fn settings_section(image: &Image<'_>) -> Found<Section> {
   let anchor = one("account-loading", &image.find_bytes(b"account-loading"))?;
   let site = one(
      "account-loading load",
      &arm64::adrp_add_refs(image, anchor..anchor + 1),
   )?;
   let (func, _) = image
      .function_bounds(site.addr)
      .ok_or("macos settings section has no LC_FUNCTION_STARTS entry")?;
   let head = image
      .read(func, 0x100)
      .ok_or("macos settings section is unmapped")?;
   // Look for `ldrb w?, [x?, #imm]` with offset in `0x100..=0x2000`.
   let page_offset = head
      .as_chunks::<4>()
      .0
      .iter()
      .find_map(|chunk| {
         let insn = u32::from_le_bytes(*chunk);
         // Unsigned-offset `ldrb wt, [xn, #imm12]`: 0x3940_0000
         if insn & 0xFFC0_0000 == 0x3940_0000 {
            let imm12 = ((insn >> 10) & 0xFFF) as usize;
            (0x100..=0x2000).contains(&imm12).then_some(imm12)
         } else {
            None
         }
      })
      .ok_or("macos settings section active_page load not found")?;
   Ok(Section { func, page_offset })
}

/// Resolves Discord's own GPUI and Mana builders on macOS arm64 from the
/// Developer Mode row (`set-devmodeDeveloper Mode`) and `TesterUpdates` sign-in
/// button (`tester-updates-sign-in`).
#[expect(clippy::too_many_lines, reason = "one block per builder call site")]
pub fn gpui(image: &Image<'_>) -> Found<Gpui> {
   let dev = one(
      "set-devmode",
      &image.find_bytes(b"set-devmodeDeveloper Mode"),
   )?;
   let dev_site = one(
      "set-devmode load",
      &arm64::adrp_add_refs(image, dev..dev + 1),
   )?;
   let before_dev = arm64::calls_in(image, dev_site.addr.saturating_sub(0x30), 0x30);
   let after_dev = arm64::calls_in(image, dev_site.addr, 0x170);

   // Find `div_new` as the call right after `adrp x0; add x0` before `set-devmode`.
   let (div_idx, div_new, caller_loc) = before_dev
      .iter()
      .enumerate()
      .find_map(|(i, &(call, target))| {
         let loc = last_adrp_add(image, call.saturating_sub(0x10), 0x10, 0)?;
         Some((i, target, loc))
      })
      .ok_or("div_new Location not found")?;

   // `div_flex` and `div_flex_col` are the next two non-helper calls into the
   // same code region as `div_new` (within 0x10_0000 bytes of `div_new`).
   let near_div = |target: usize| target.abs_diff(div_new) < 0x10_0000;
   let div_methods: Vec<usize> = before_dev
      .iter()
      .skip(div_idx + 1)
      .map(|&(_, target)| target)
      .filter(|&target| near_div(target) && target != div_new)
      .collect();
   let div_flex = *div_methods.first().ok_or("div_flex not found")?;
   let div_flex_col = *div_methods.get(1).ok_or("div_flex_col not found")?;

   let switch_new = after_dev
      .first()
      .ok_or("switch_new not found after set-devmode")?
      .1;

   // `Switch::label` is the first call after `set-devmode` that invokes a
   // `ldrb w8, [xN, #imm]!` setter; `Switch::description` is the next such
   // call; `Switch::on_change` stores the boxed closure at a field offset and
   // calls `alloc_or_oom`; `switch_into_div` immediately follows `Switch::on_change`.
   let mut switch_label = None;
   let mut switch_desc = None;
   let mut switch_on_change = None;
   let mut alloc_or_oom = None;
   let mut switch_into_div = None;

   for (idx, &(_, callee)) in after_dev.iter().enumerate().skip(1) {
      if switch_label.is_none()
         && let Some((start, end)) = image.function_bounds(callee)
         && arm64::calls_in(image, start, end - start)
            .iter()
            .any(|&(_, inner)| has_shared_string_tag_check(image, inner))
      {
         switch_label = Some(callee);
         continue;
      }
      if switch_label.is_some()
         && switch_desc.is_none()
         && has_shared_string_tag_check(image, callee)
      {
         switch_desc = Some(callee);
         continue;
      }
      if switch_desc.is_some()
         && switch_on_change.is_none()
         && let Some(alloc) = find_alloc_in_on_change(image, callee)
      {
         switch_on_change = Some(callee);
         alloc_or_oom = Some(alloc);
         // `switch_into_div` is the next non-outlined call into `discord_desktop`
         // (larger than 32 bytes) after `Switch::on_change`.
         switch_into_div = after_dev[idx + 1..]
            .iter()
            .map(|&(_, target)| target)
            .find(|&target| {
               image
                  .function_bounds(target)
                  .is_some_and(|(s, e)| e - s >= 0x40)
            });
         break;
      }
   }

   let switch_label = switch_label.ok_or("Switch::label not found")?;
   let switch_desc = switch_desc.ok_or("Switch::description not found")?;
   let switch_on_change = switch_on_change.ok_or("Switch::on_change not found")?;
   let alloc_or_oom = alloc_or_oom.ok_or("alloc_or_oom not found in Switch::on_change")?;
   let switch_into_div = switch_into_div.ok_or("switch_into_div not found")?;

   let btn = one(
      "tester-updates-sign-in",
      &image.find_bytes(b"tester-updates-sign-in"),
   )?;
   let btn_site = one(
      "tester-updates-sign-in load",
      &arm64::adrp_add_refs(image, btn..btn + 1),
   )?;
   let after_btn = arm64::calls_in(image, btn_site.addr, 0x140);
   let button_new = after_btn
      .first()
      .ok_or("button_new not found after tester-updates-sign-in")?
      .1;

   // `ActionRow` is the callee after `button_new` whose body calls `div_new`
   // twice and `div_flex`.
   let (row_at, ar_calls) = after_btn
      .iter()
      .enumerate()
      .skip(1)
      .find_map(|(at, &(_, callee))| {
         let (start, end) = image.function_bounds(callee)?;
         let calls = arm64::calls_in(image, start, end - start);
         let div_new_count = calls.iter().filter(|&&(_, c)| c == div_new).count();
         (div_new_count >= 2 && calls.iter().any(|&(_, c)| c == div_flex))
            .then_some((at, calls))
      })
      .ok_or("ActionRow not found after tester-updates-sign-in")?;
   let action_row = after_btn[row_at].1;
   let button_on_click = after_btn[row_at - 1].1;
   let div_into_any = after_btn[row_at + 1..]
      .iter()
      .map(|&(_, target)| target)
      .find(|&target| near_div(target))
      .ok_or("Div::into_any_element not found after ActionRow")?;

   // Inside `ActionRow`:
   // - `div_style_mut` is called by the first `gap` / style helper right after `div_new`.
   // - `text_block` is called in the first `div_new` block before `div_child_div`.
   // - `div_child_div` is the last call of `ActionRow` (and also ends the first
   //   block); it doubles as the button child builder on macOS.
   let div_child_div = ar_calls
      .iter()
      .rev()
      .map(|&(_, c)| c)
      .find(|&c| near_div(c) && c != div_new && c != div_flex)
      .ok_or("div_child_div not found in ActionRow")?;

   // `Div::child(button)`. The old "call before the last child" heuristic
   // picked a float style helper, so buttons never got appended to the page.
   let div_child_button =
      find_div_child_button(image, 0x328).ok_or("div_child_button not found in ActionRow")?;

   let first_child_idx = ar_calls
      .iter()
      .position(|&(_, c)| c == div_child_div)
      .ok_or("first div_child_div missing")?;

   // `div_style_mut` is the first call inside the style helper between `div_new` and `div_flex`.
   let div_style_mut = ar_calls[..first_child_idx]
      .iter()
      .find_map(|&(_, callee)| {
         if callee == div_new || callee == div_flex {
            return None;
         }
         let (s, e) = image.function_bounds(callee)?;
         arm64::calls_in(image, s, (e - s).min(0x40))
            .into_iter()
            .map(|(_, inner)| inner)
            .find(|&inner| near_div(inner) && inner != div_new && inner != div_flex)
      })
      .ok_or("div_style_mut not found in ActionRow")?;

   // `text_block` is the builder in `ActionRow`'s first block that takes the
   // row's two `SharedString`s as `x0`/`x1` (copied from `x19`/`x20` into
   // stack slots) and returns the `Div` through `x8`. The old call-order
   // heuristic picked a Div style helper here, which treats `x0` as a Div
   // and crashes when we hand it a string.
   let text_block =
      find_text_block(image, action_row).ok_or("text_block not found in ActionRow")?;

   Ok(Gpui {
      caller_loc,
      div_new,
      div_flex,
      div_flex_col,
      div_style_mut,
      div_child_div,
      div_child_button,
      div_into_any,
      div_push_any: None,
      str_into_any: None,
      text_block,
      switch_new,
      switch_into_div,
      button_new,
      action_row,
      alloc_or_oom,
      switch_label,
      switch_desc,
      switch_on_change,
      button_on_click,
   })
}

/// Decodes [`GpuiLayout`] dynamically from Discord's ARM64 constructors and
/// `<StyleRefinement as Debug>::fmt`.
pub fn gpui_layouts(image: &Image<'_>, gpui: &Gpui) -> Found<GpuiLayout> {
   let interactivity_size = div_interactivity_size(image, gpui.div_new)?;
   let style = style_offsets(image, interactivity_size)?;

   let div = DivLayout {
      size: 0x88,
      children: 0x40,
      interactivity: 0x8,
      interactivity_size,
   };

   // Decode `Switch::label` and `Switch::description` offsets from their
   // `ldrb w8, [xN, #imm]!` SharedString tag checks.
   let switch_label_inner = {
      let (s, e) = image
         .function_bounds(gpui.switch_label)
         .ok_or("Switch::label bounds missing")?;
      arm64::calls_in(image, s, e - s)
         .into_iter()
         .map(|(_, c)| c)
         .find(|&c| has_shared_string_tag_check(image, c))
         .ok_or("Switch::label inner setter not found")?
   };
   let label = shared_string_tag_offset(image, switch_label_inner)
      .ok_or("Switch::label field offset not found")?;
   let description = shared_string_tag_offset(image, gpui.switch_desc)
      .ok_or("Switch::description field offset not found")?;
   let on_change = find_on_change_offset(image, gpui.switch_on_change)
      .ok_or("Switch::on_change field offset not found")?;

   let switch = SwitchLayout {
      size: 0x248,
      label,
      description,
      on_change,
   };

   let (on_click, variant, scale) = decode_button_layout(image, gpui.button_new)?;
   let button = ButtonLayout {
      size: 0x328,
      on_click,
      variant,
      scale,
   };

   Ok(GpuiLayout {
      style,
      div,
      switch,
      button,
   })
}

fn last_adrp_add(image: &Image<'_>, start: usize, len: usize, reg: u32) -> Option<usize> {
   let bytes = image.read(start, len)?;
   let words = bytes.as_chunks::<4>().0;
   let mut found = None;
   for i in 0..words.len().saturating_sub(1) {
      let adrp = u32::from_le_bytes(words[i]);
      let add = u32::from_le_bytes(words[i + 1]);
      if let Some((rd, target)) = arm64::decode_adrp_add(adrp, add, start + i * 4)
         && rd == reg
      {
         found = Some(target);
      }
   }
   found
}

/// Returns the field offset from `ldrb w8, [xN, #imm]!` followed by `cmp w8, #0xff`
/// (a `SharedString` drop/replace check).
fn shared_string_tag_offset(image: &Image<'_>, func: usize) -> Option<usize> {
   let (s, e) = image.function_bounds(func)?;
   let bytes = image.read(s, (e - s).min(0x100))?;
   let words = bytes.as_chunks::<4>().0;
   for i in 0..words.len().saturating_sub(1) {
      let insn = u32::from_le_bytes(words[i]);
      let next = u32::from_le_bytes(words[i + 1]);
      // Pre-index `ldrb w8, [xN, #simm9]!`: 0x3840_0C08 (mask 0xFFE0_0C1F)
      // followed by `cmp w8, #0xff` (0x7103_FD1F)
      if insn & 0xFFE0_0C1F == 0x3840_0C08 && next == 0x7103_FD1F {
         let imm9 = ((insn >> 12) & 0x1FF) as usize;
         return Some(imm9);
      }
   }
   None
}

fn has_shared_string_tag_check(image: &Image<'_>, func: usize) -> bool {
   shared_string_tag_offset(image, func).is_some()
}

/// Finds `Div::child(button)`: the wrapper that turns a `Button` into an
/// `AnyElement` and appends it to a `Div`. Its prologue moves the `Div` into
/// `x19`, the sret into `x20` and the button into `x9`; it calls a helper that
/// copies `button_size` bytes into the element.
fn find_div_child_button(image: &Image<'_>, button_size: usize) -> Option<usize> {
   let mov_size = 0x5280_0000u32 | (u32::try_from(button_size).ok()? << 5) | 2;
   for i in 0..image.fn_starts.len().saturating_sub(1) {
      let start = image.fn_starts[i];
      let end = image.fn_starts[i + 1];
      if !(0x40..0x200).contains(&(end - start)) {
         continue;
      }
      let code = image.read(start, end - start)?;
      if code.len() < 0x40 {
         continue;
      }
      let head = &code[..0x40];
      let has = |insn: u32| {
         head.as_chunks::<4>()
            .0
            .iter()
            .any(|c| u32::from_le_bytes(*c) == insn)
      };
      // `mov x9, x1`, `mov x19, x0`, `mov x20, x8`.
      if !has(0xAA01_03E9) || !has(0xAA00_03F3) || !has(0xAA08_03F4) {
         continue;
      }
      for (i, chunk) in head.as_chunks::<4>().0.iter().enumerate() {
         let insn = u32::from_le_bytes(*chunk);
         if insn & 0xFC00_0000 != 0x9400_0000 {
            continue;
         }
         if let Some((true, target)) = arm64::decode_branch26(insn, start + i * 4)
            && image
               .read(target, 0x100)
               .is_some_and(|body| {
                  body.as_chunks::<4>()
                     .0
                     .iter()
                     .any(|c| u32::from_le_bytes(*c) == mov_size)
               })
         {
            return Some(start);
         }
      }
   }
   None
}

/// Finds the text builder called with `ActionRow`'s two `SharedString`s.
///
/// Just before the call, `ldr q0, [x19]` / `ldr q0, [x20]` copy the row's two
/// 24-byte strings into stack slots that become `x0` and `x1`; `x8` holds the
/// sret `Div`. A size check keeps the tiny address-of thunks and style helpers
/// out of the way.
fn find_text_block(image: &Image<'_>, func: usize) -> Option<usize> {
   let (start, end) = image.function_bounds(func)?;
   let bytes = image.read(start, end - start)?;
   for (i, chunk) in bytes.as_chunks::<4>().0.iter().enumerate() {
      let insn = u32::from_le_bytes(*chunk);
      let Some((true, target)) = arm64::decode_branch26(insn, start + i * 4) else {
         continue;
      };
      if image
         .function_bounds(target)
         .is_none_or(|(s, e)| e - s < 0x80)
      {
         continue;
      }
      let mut from_19 = false;
      let mut from_20 = false;
      for prev in &bytes.as_chunks::<4>().0[i.saturating_sub(12)..i] {
         let prev = u32::from_le_bytes(*prev);
         // `ldr q?, [x19]` / `ldr q?, [x20]`
         if prev & 0xFFC0_0C1F == 0x3DC0_0000 {
            match (prev >> 5) & 0x1F {
               19 => from_19 = true,
               20 => from_20 = true,
               _ => {}
            }
         }
      }
      if from_19 && from_20 {
         return Some(target);
      }
   }
   None
}

/// Finds `alloc_or_oom` called via a `mov w0, #8; mov w1, #0x20; b alloc_or_oom`
/// helper inside `Switch::on_change`.
fn find_alloc_in_on_change(image: &Image<'_>, func: usize) -> Option<usize> {
   let (s, e) = image.function_bounds(func)?;
   let bytes = image.read(s, (e - s).min(0x80))?;
   for (i, chunk) in bytes.as_chunks::<4>().0.iter().enumerate() {
      let pc = s + i * 4;
      let insn = u32::from_le_bytes(*chunk);
      let Some((true, target)) = arm64::decode_branch26(insn, pc) else {
         continue;
      };
      let Some(helper) = image.read(target, 12) else {
         continue;
      };
      let h = helper.as_chunks::<4>().0;
      // `mov w0, #8` (0x5280_0100), `mov w1, #0x20` (0x5280_0401), `b alloc_or_oom`
      if u32::from_le_bytes(h[0]) == 0x5280_0100
         && u32::from_le_bytes(h[1]) == 0x5280_0401
         && let Some((false, alloc)) = arm64::decode_branch26(u32::from_le_bytes(h[2]), target + 8)
      {
         return Some(alloc);
      }
   }
   None
}

fn find_on_change_offset(image: &Image<'_>, func: usize) -> Option<usize> {
   let (s, e) = image.function_bounds(func)?;
   let bytes = image.read(s, (e - s).min(0x80))?;
   for chunk in bytes.as_chunks::<4>().0 {
      let insn = u32::from_le_bytes(*chunk);
      // `str x?, [x19, #imm]` (64-bit unsigned offset: 0xF900_0260, rn=19)
      if insn & 0xFFC0_03E0 == 0xF900_0260 {
         let off = (((insn >> 10) & 0xFFF) as usize) * 8;
         if (0x100..=0x400).contains(&off) {
            return Some(off);
         }
      }
   }
   None
}

fn div_interactivity_size(image: &Image<'_>, div_new: usize) -> Found<usize> {
   let (s, e) = image
      .function_bounds(div_new)
      .ok_or("Div::new bounds missing")?;
   let bytes = image
      .read(s, (e - s).min(0x140))
      .ok_or("Div::new unmapped")?;
   let words = bytes.as_chunks::<4>().0;
   for i in 0..words.len().saturating_sub(1) {
      let w0 = u32::from_le_bytes(words[i]);
      let w1 = u32::from_le_bytes(words[i + 1]);
      // `mov w0, #size; mov w1, #8` (0x5280_0101)
      if w0 & 0xFFE0_001F == 0x5280_0000 && w1 == 0x5280_0101 {
         let size = ((w0 >> 5) & 0xFFFF) as usize;
         if (0x100..0x2000).contains(&size) {
            return Ok(size);
         }
      }
   }
   Err("Div::new Interactivity size not found".to_owned())
}

/// Decodes `(on_click, variant, scale)` from `Button::new`'s initialization stores
/// into `x8` (`sret`). `on_click` is picked by [`button_on_click_field`].
fn decode_button_layout(image: &Image<'_>, button_new: usize) -> Found<(usize, usize, usize)> {
   let (s, e) = image
      .function_bounds(button_new)
      .ok_or("Button::new bounds missing")?;
   let bytes = image
      .read(s, (e - s).min(0x100))
      .ok_or("Button::new unmapped")?;
   let mut cleared = Vec::new();
   let mut variant = None;
   let mut scale = None;
   for chunk in bytes.as_chunks::<4>().0 {
      let insn = u32::from_le_bytes(*chunk);
      // `str xzr, [x8, #imm]` (0xF900_011F) clears an 8-byte `Option` niche.
      if insn & 0xFFC0_03FF == 0xF900_011F {
         cleared.push((((insn >> 10) & 0xFFF) as usize) * 8);
      }
      // `strb wzr, [x8, #imm]` (0x3900_011F) -> variant = 0 (Primary), first in 0x300..0x318
      if variant.is_none() && insn & 0xFFC0_03FF == 0x3900_011F {
         let off = ((insn >> 10) & 0xFFF) as usize;
         if (0x300..0x318).contains(&off) {
            variant = Some(off);
         }
      }
      // `strb w9, [x8, #imm]` (0x3900_0109) where w9=2 (Medium) in 0x310..0x328
      if scale.is_none() && insn & 0xFFC0_03FF == 0x3900_0109 {
         let off = ((insn >> 10) & 0xFFF) as usize;
         if (0x310..0x328).contains(&off) {
            scale = Some(off);
         }
      }
   }
   Ok((
      button_on_click_field(image, &cleared)?,
      variant.ok_or("Button::variant offset not found")?,
      scale.ok_or("Button::size offset not found")?,
   ))
}

/// The first of `cleared` that every drop of a struct with all of them,
/// loaded through one register, releases as an `Rc` in place. `Option<Rc<dyn
/// Fn>>` drops as `ldr x8, [xN, #off]; cbz x8; ldr x9, [x8]; subs x9, x9, #1;
/// str x9, [x8]` followed by `add x0, xN, #off` for the slow path.
///
/// On macOS Phoenix 0.1.0 (2233), `Button::new` clears an `Option` struct at
/// `0x268` and an `Option<Box<dyn Fn>>` at `0x288` ahead of `on_click` at
/// `0x298`, and a closure written into either crashes Discord when the button
/// drops. Three other drops share Button's field offsets and hold an `Rc` at
/// `0x268`, so a field counts only when all of them release it.
fn button_on_click_field(image: &Image<'_>, cleared: &[usize]) -> Found<usize> {
   const LDR_X: u32 = 0xF940_0000;
   const CBZ_X: u32 = 0xB400_0000;
   const SUBS_X_1: u32 = 0xF100_0400;
   const STR_X: u32 = 0xF900_0000;
   const ADD_X: u32 = 0x9100_0000;

   let mut rc_fields: HashMap<(usize, u32), Vec<usize>> = HashMap::new();
   for segment in image.segments.iter().filter(|segment| segment.executable) {
      let words: Vec<u32> = segment
         .bytes
         .as_chunks::<4>()
         .0
         .iter()
         .map(|chunk| u32::from_le_bytes(*chunk))
         .collect();
      for (at, window) in words.windows(8).enumerate() {
         let load = window[0];
         if load & 0xFFC0_0000 != LDR_X {
            continue;
         }
         let off = ((load >> 10) & 0xFFF) as usize * 8;
         if !cleared.contains(&off) {
            continue;
         }
         let (rc, base) = (load & 31, (load >> 5) & 31);
         let strong = window[2] & 31;
         let decrements = window[1] & 0xFF00_001F == CBZ_X | rc
            && window[2] & 0xFFFF_FFE0 == LDR_X | rc << 5
            && window[3] == SUBS_X_1 | strong << 5 | strong
            && window[4] == STR_X | rc << 5 | strong;
         // `add x0, xN, #off` only encodes a 12-bit immediate.
         let Some(imm) = u32::try_from(off).ok().filter(|imm| *imm <= 0xFFF) else {
            continue;
         };
         if decrements
            && window[5..].contains(&(ADD_X | imm << 10 | base << 5))
            && let Some(func) = image.function_containing(segment.addr + at * 4)
         {
            rc_fields.entry((func, base)).or_default().push(off);
         }
      }
   }
   let loads_every_cleared = |func: usize, base: u32| {
      let Some(code) = image
         .function_bounds(func)
         .and_then(|(start, end)| image.read(start, end - start))
      else {
         return false;
      };
      let loaded: Vec<usize> = code
         .as_chunks::<4>()
         .0
         .iter()
         .map(|chunk| u32::from_le_bytes(*chunk))
         .filter(|insn| insn & 0xFFC0_0000 == LDR_X && (insn >> 5) & 31 == base)
         .map(|insn| ((insn >> 10) & 0xFFF) as usize * 8)
         .collect();
      cleared.iter().all(|off| loaded.contains(off))
   };
   let drops: Vec<&Vec<usize>> = rc_fields
      .iter()
      .filter(|((func, base), _)| loads_every_cleared(*func, *base))
      .map(|(_, offsets)| offsets)
      .collect();
   if drops.is_empty() {
      return Err("Button::on_click: no drop of every cleared field releases one as Rc".to_owned());
   }
   cleared
      .iter()
      .copied()
      .filter(|off| drops.iter().all(|offsets| offsets.contains(off)))
      .min()
      .ok_or_else(|| "Button::on_click: no cleared field is an Rc in every drop".to_owned())
}

fn debug_offsets(image: &Image<'_>, func: usize, depth: usize) -> HashMap<String, usize> {
   let mut out = HashMap::new();
   let Some(code) = image
      .function_bounds(func)
      .and_then(|(start, end)| image.read(start, end - start))
   else {
      return out;
   };
   for field in arm64::debug_fields(code, func) {
      let Some(name) = image
         .read(field.name, field.name_len)
         .and_then(|name| std::str::from_utf8(name).ok())
      else {
         continue;
      };
      if out.contains_key(name) {
         continue;
      }
      out.insert(name.to_owned(), field.offset);
      let fmt = field
         .vtable
         .and_then(|vtable| image.read_usize(vtable + 0x18));
      if depth > 0
         && let Some(fmt) = fmt.filter(|&fmt| image.is_code(fmt))
      {
         for (inner, offset) in debug_offsets(image, fmt, depth - 1) {
            if let Some(offset) = field.offset.checked_add(offset) {
               out.entry(format!("{name}.{inner}")).or_insert(offset);
            }
         }
      }
   }
   out
}

fn style_offsets(image: &Image<'_>, bytes: usize) -> Found<StyleOffsets> {
   let mut funcs: Vec<usize> = image
      .find_bytes(b"StyleRefinement")
      .into_iter()
      .flat_map(|at| arm64::adrp_add_refs(image, at..at + 1))
      .filter_map(|site| Some(image.function_bounds(site.addr)?.0))
      .collect();
   funcs.sort_unstable();
   funcs.dedup();
   let found: Vec<HashMap<String, usize>> = funcs
      .into_iter()
      .map(|func| debug_offsets(image, func, 1))
      .filter(|fields| {
         ["text", "padding", "gap"]
            .iter()
            .all(|field| fields.contains_key(*field))
      })
      .collect();
   let [fields] = &found[..] else {
      return Err(format!(
         "StyleRefinement Debug matched {} functions",
         found.len()
      ));
   };
   let get = |name: &str| -> Found<usize> {
      fields
         .get(name)
         .copied()
         .ok_or_else(|| format!("StyleRefinement Debug has no {name}"))
   };
   let edges = |name: &str| -> Found<[usize; 4]> {
      Ok([
         get(&format!("{name}.top"))?,
         get(&format!("{name}.right"))?,
         get(&format!("{name}.bottom"))?,
         get(&format!("{name}.left"))?,
      ])
   };
   let axes = |name: &str| -> Found<[usize; 2]> {
      Ok([
         get(&format!("{name}.width"))?,
         get(&format!("{name}.height"))?,
      ])
   };
   Ok(StyleOffsets {
      bytes,
      font_size: get("text.font_size")?,
      line_height: get("text.line_height")?,
      font_family: get("text.font_family")?,
      text_color: get("text.color")?,
      white_space: get("text.white_space")?,
      flex_shrink: get("flex_shrink")?,
      background: get("background")?,
      border_color: get("border_color")?,
      overflow_x: get("overflow.x")?,
      position: get("position")?,
      flex_wrap: get("flex_wrap")?,
      display: get("display")?,
      align_items: get("align_items")?,
      justify_content: get("justify_content")?,
      border_widths: edges("border_widths")?,
      corner_radii: [
         get("corner_radii.top_left")?,
         get("corner_radii.top_right")?,
         get("corner_radii.bottom_right")?,
         get("corner_radii.bottom_left")?,
      ],
      padding: edges("padding")?,
      inset: edges("inset")?,
      gap: axes("gap")?,
      size: axes("size")?,
      min_size: axes("min_size")?,
   })
}
