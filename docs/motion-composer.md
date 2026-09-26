# 3echo Motion composer

The mograph stage renders with the 3echo Motion composer, a Remotion project that ships inside the plugin at `vendor/3echo-motion/composer`. Its licence and notice sit next to it (`vendor/3echo-motion/LICENSE`, `NOTICE.md`) and cover that folder; the rest of the plugin is MIT. Nothing else in the pipeline uses it, and there is no separate checkout to install.

## Templates

| Template | Composition | Output |
|---|---|---|
| `title` | HeroTitle | overlay, ProRes 4444 with alpha |
| `endtag` | EndTagOverlay | overlay, ProRes 4444 with alpha |
| `captions` | CaptionOverlayOnly | overlay, ProRes 4444 with alpha |
| `cinematic`, `explainer`, `talkinghead`, `collageburst`, `lyricoverlay` | CinematicRenderer, Explainer, TalkingHead, CollageBurst, LyricOverlay | full frame, ProRes HQ |

The map lives in `scripts/lib-mograph.js`; `scripts/test/motion-composer.smoke.js` fails if a template names a composition that is not in `src/Root.tsx`.

## How it runs

1. `scripts/mograph-setup.js` (once per machine) copies the composer to `~/.creative-studio-post/mograph/composer`, runs `npm ci` from its lockfile and `remotion browser ensure`, and writes `ready.json` with a hash of the bundled files. The folder is in the home directory on purpose: node_modules on a synced Desktop (iCloud on macOS) stalls reads and the render sits idle. `MOGRAPH_HOME` moves it.
2. `scripts/check-mograph.js` reports at start of session whether it is ready. A plugin update that changes the composer changes the hash, and the check asks for setup again.
3. `scripts/mograph-render.js` renders one request: template to composition id, `--props` from a file, fps, size and duration from the job, stdin closed (a question ends the run instead of hanging it), a stall watchdog, the alpha channel checked with ffprobe, and a preview frame.

## Why the render used to hang

The old instruction was `npx remotion render {template} out=... props=...` against a checkout on the Desktop. Nothing checked that the packages were installed, so `npx` could stop on "Need to install... ok to proceed?"; lowercase template names are not composition ids, so Remotion could stop on "Select composition"; the first render downloads a headless browser in silence. Each of those waits for a person with no CPU and no log line. `mograph-render.js` removes all three.

## Changing a composition

Edit under `vendor/3echo-motion/composer/src`, then run `node scripts/test/motion-composer.smoke.js`, render one sample of each overlay template with `mograph-render.js`, and bump the plugin version. Every machine is asked to run `mograph-setup.js` again by the hash check.

## Environment

- Node 18+ (Remotion 4). npm on PATH for setup.
- Network once, for setup: about 200 packages plus a 113 MB headless browser.
- ffmpeg and ffprobe on PATH (the alpha check and preview frame).
