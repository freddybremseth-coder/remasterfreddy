# 3D jukebox mechanism — integration and acceptance contract

Status: design/implementation specification only. The 3D prototype described in prior local development is **not committed** on this branch. Do not claim it is deployed.

## Visual scene

Retain the approved photorealistic cabinet and RE-MASTER FREDDY grille emblem. The original photograph already contains machinery in the glass chamber: mask or replace the old plate, arm and pickup in the moving region before compositing a new 3D mechanism. Never simply overlay two mechanisms.

Use a single coordinate system, with X left/right, Y up, Z toward viewer. Anchor all moving elements to calibrated positions:
- rack slot / record center (rear)
- transfer carriage rail endpoints
- gripper pivot and record-edge contact
- turntable spindle (front/lower)
- pickup pivot and outer-groove contact

Record diameter is 7 inches (177.8 mm); platter and gripper should share that scale. Record begins upright in a rack slot and ends horizontal, centered over the spindle. The gripper must remain mechanically connected to the rail-mounted carriage throughout the transfer, including during rotation. It must release only after the disc is supported by the platter.

## Animation states

0. IDLE: empty platter, no loose disc in front of rack.
1. SELECT: top button visibly depresses and illuminates.
2. EXTEND: carriage travels to selected rack slot, gripper opens.
3. GRIP: jaws close at disc rim, not over the label.
4. EXTRACT: disc clears adjacent rack slots before rotating.
5. TRANSFER: connected carriage carries disc toward platter, avoiding glass and cabinet.
6. ROTATE: disc tilts upright-to-horizontal around a physical pivot while gripper stays attached.
7. LOWER: disc center aligns with spindle; disc descends to platter, with increasing contact shadow.
8. RELEASE: jaws open, gripper retracts clear of disc and tonearm.
9. CUE: pickup moves to outer groove and lowers.
10. PLAY: record rotates at 45 rpm; source audio begins at 0.0 seconds only after cue.

The animation clock and audio clock are distinct. Do not trim the song to accommodate the intro. On pause/cancel, stop pending cue callbacks and avoid duplicate playback. On replay, reset mechanism state deterministically.

## Camera / compositing

Provide two QA cameras: fixed frontal view matched to cabinet photo, and orbiting inspection camera. Match lens/perspective, platter ellipse, glass occlusion and contact shadows. Prefer a 3D-rendered mechanism behind a foreground glass/reflection mask. Verify no floating rod, impossible hinge, intersecting plate, duplicate tonearm or premature release.

## QA acceptance

- Capture frames at every state boundary and inspect in frontal and oblique views.
- Confirm record center-to-spindle error < 2 mm in scene units at release.
- Confirm gripper tip-to-rim distance stays within mechanical tolerance during extraction/rotation/lowering.
- Confirm no record visible on platter in IDLE.
- Confirm only one disc on platter during PLAY.
- Confirm audio starts after stylus lands, and final MP4 duration = intro + full audio (within encoder tolerance).
- Check 16:9 and 9:16 framing and iPhone Safari interaction.
- Only connect to the durable backend render queue after visual QA; require explicit approval for YouTube publication.

## Current repository reality

PR #57 currently contains an SVG/FFmpeg offline renderer and a 2D browser preview in `src/AdminJukeboxStudio.tsx`. This specification does not constitute a working Three.js integration or production deployment.
