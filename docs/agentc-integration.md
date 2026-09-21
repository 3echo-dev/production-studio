# AgentC MCP integration

This plugin uses the 3echo AgentC MCP server that the pre-prod plugin already uses. **No new server-side tools are required.** Every AgentC call this plugin makes is against an existing endpoint.

## Connection

- `.mcp.json` declares one HTTP MCP server at `https://agentc.3echo.ai/api/mcp` under the key `3echo`.
- `scripts/check-agentc.js` verifies the config at session start and surfaces a plain-sentence error if the file is missing, mis-keyed, or points at a different URL.
- The actual connection is negotiated by Claude Code; a failed connection is surfaced by the host, not by this script.

## Tools we call (all existing)

| AgentC tool | Called by our skill | Purpose |
|---|---|---|
| `list_workspaces` | orchestrator | Resolve workspace id and credit balance before any spend |
| `get_workspace_capabilities` | orchestrator | Verify Studio access before render calls |
| `estimate_video_job` | broll-generate | Quote credits before the board ask |
| `estimate_image_job` | mograph-generate | Quote credits for plate art |
| `upload_asset` / `import_asset_from_url` | broll-generate, mograph-generate | Bring reference assets into the workspace |
| `create_video_job` | broll-generate | Generate one B-roll variant (SeeDance backend) |
| `create_image_job` | mograph-generate | Generate mograph plate art (GPT image backend) |
| `wait_for_job` | orchestrator | Poll a submitted job to completion |
| `get_job_result` | orchestrator | Read the finished job's asset id |
| `fetch_asset_bytes` | broll-generate, mograph-generate | Download the media bytes to disk |

## What we correctly do NOT need on the server

Earlier drafts of the blueprint listed five "new AgentC tools" — this was wrong. Every one of those turned out to be a local script or a thin wrapper around an existing AgentC call:

| Earlier claim | Reality |
|---|---|
| `sequence_first_cut` | LOCAL Python — OpenMontage's `clip_embedder.py`. No MCP call. |
| `suggest_bgm_options` | LOCAL — script tone parse + library lookup (Suno / Musicbed / Artlist API calls, not AgentC). |
| `sync_audio_track` | LOCAL — ffmpeg on the box. No MCP call. |
| `render_broll_variant` | Thin skill-level wrapper over `create_video_job`. Adds the B-roll tag to the manifest; not a new server tool. |
| `export_premiere_bundle` | LOCAL Python — `scripts/build-fcpxml.py`. No MCP call. |

The blueprint has been updated to reflect this.

## Spend guards

- Every video or image job is quoted before it fires (`estimate_video_job`, `estimate_image_job`).
- The quote is presented on the Post Control board and in chat; the user says yes before the create call.
- `scripts/preflight-generation.js` refuses generation without a signed request and refuses spend past `credit_ceiling_per_job` in `CONFIG.md`.
- `hooks/hooks.mjs` refuses B-roll generation calls that don't carry a signed request in `broll-requests/`.

## Workspace assumptions

- The workspace must have `studioAccessEnabled: true` and `capabilities.studioTools: true`.
- The workspace must carry enough `creditAvailable` for the requested batch; the orchestrator checks before spend.
- The upload limits (100 MB per file, HTTPS-only for `import_asset_from_url`, no private/cookie-gated URLs) are enforced by AgentC; our skills surface the error verbatim.

## When AgentC changes

If AgentC renames a tool or changes a schema, the calling skill breaks first. Update the skill; there is no shim layer. The pre-prod plugin's `make-image` skill is the reference for how these calls should look.
