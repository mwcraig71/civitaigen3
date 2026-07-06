# UI Improvements — July 5, 2026

Section-by-section review and fixes. Verified: tsc error count is one BELOW
the pre-change baseline (366 vs 367 — one latent type bug fixed), eslint 0
errors, all tests pass.

## Generation page (the "clunky" one)

**LoRA selector — full redesign** (`client/src/components/lora-selector.tsx`)
- Was: favorites-only until you typed a search; selected LoRAs rendered as huge
  blocks with always-visible sliders and word lists; small touch targets.
- Now: Favorites / All LoRAs tabs with search across the active tab; selected
  LoRAs are compact rows — thumbnail, name, a strength button that opens a
  popover (slider + reset + trigger words), and a remove X; whole row is the
  click target in the browse list; heart toggles favorite in place (add AND
  remove — before you could only unfavorite); skeleton loading; "Browse all
  LoRAs" escape hatch on the empty favorites state; active count badge (n/10).

**Form structure** (`client/src/components/generation-panel.tsx`)
- Model selection and the LoRA selector were buried inside one 900-line
  "Advanced Settings" collapse along with everything else. Both are primary
  controls — they now live at top level, always visible.
- What remains in Advanced Settings is grouped under labeled section headers:
  Character, Scenes & Events / Prompts / Seed / Output.
- Generate button now shows a spinner + "Starting…" while the request is
  in flight.

## Navigation (`client/src/components/header.tsx`)
- Was: 10 links crammed into the desktop nav; a 13-item flat mobile list.
- Now: 5 primary destinations (Fip Fap, Generate, Easy Mode, My Gallery,
  Community) + a "Create" dropdown for the tools (Transform, Characters,
  Scene Builder, Events, Saved Prompts, Models). Data-driven (two arrays) so
  future changes are one-line edits. Mobile menu grouped into Main / Create /
  Account sections with 44px touch targets. Active-state highlighting kept,
  including on the Create trigger when a child route is active.

## Fip Fap feed (TikTok alignment) (`client/src/pages/fip-fap.tsx`)
- Was: like/download/upscale/prompt/report in a horizontal row at the bottom,
  competing with the caption text.
- Now: TikTok-style vertical action rail on the right edge — like count under
  the heart, frosted circular buttons, 44px targets, press feedback
  (active:scale). Caption/info column keeps clear of the rail.
- Image loading placeholder is a clean pulse instead of a "Loading..." text box.
- (Already good and untouched: full-screen snap scrolling, swipe gestures,
  eager-loading of adjacent images.)

## Small fixes
- Toasts: TOAST_REMOVE_DELAY was 1,000,000 ms (a known shadcn template bug);
  now 5s.
- `GenerationRewardPopup` declared its prop as the DB `Generation` type while
  fip-fap passes the client type — narrowed to the structural subset it
  actually uses (fixes a latent type error).

## Recommended next (not done)
- The character-selection and model-search dropdowns inside generation-panel
  have hand-rolled overlay/positioning logic; replace with shadcn Command
  (combobox) for reliable mobile behavior.
- easy-mode and generate share duplicated model-search UI; extract one
  component.
- generation-panel.tsx is still 4,300+ lines — split into per-section files
  when you next work on it.
- Consider renaming "Fip Fap" in nav to "Feed" for clarity to new users.
