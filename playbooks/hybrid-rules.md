# Hybrid rules

Real actors, AI backgrounds. The performance is the client's; the pipeline only changes what is behind it.

1. **Separate, never redraw.** The actor reaches the cut as the plate's own pixels with transparency added. A step that regenerates or restyles the actor is not part of this route.
2. **Chroma key first.** A plate on a green or blue screen is keyed by colour (ffmpeg), sampled from its own corners, so any shade of screen works. AI segmentation (rembg) is for plates with no screen; it works frame by frame, so edges can shimmer: check the mask.
3. **One background per location.** Every panel at a location uses the same background, so the room does not change between cuts. The library's picture wins over generating one.
4. **Credits only after a yes.** A generated background is quoted, asked on the board, approved, then generated; `hybrid.js land` refuses without the approval.
5. **Measure the performance.** Every composite reports the share of the actor's pixels kept from the plate. Under 97% is flagged with its before/after still.
6. **Hashes bind the chain.** Plate → cut-out → composite each record the hash of what they were made from; a changed input voids what was made from it.
7. **Moving camera.** A background is a still or a clip that does not track the camera. A plate with a strong camera move will not sit right on a still background: flag it on the board (a camera-tracked or AI-edited background is a later route).
