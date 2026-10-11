# Single Colyseus deployment — STOP POINT, not deployed

Repository: ditexwork-gif/blockrush-colyseus-server. Preparation branch: `prep/dev-custom-maps-20261010`. Ditex must approve this combined server deployment himself before anyone merges to main or deploys/restarts it.

## Recorded references

- Current repository main / expected Cloud rollback baseline: `66f9c9acaebaddfc85552f69fe1d33654cc2ba81`. This was read from GitHub for this preparation; it does not independently prove the currently running Cloud revision.
- Editor-map implementation: `09fcb14dd9a6647f668c04fb67bdbcdfdc07770d`.
- Automatic DEV capability advertisement: `5c55f90790ecd922d67c84889d1bb395f8134cc7`.
- Existing preparation guide: `db607527bbc9acfbff6c92c71d6b959551452271`.
- The new room-details commit is recorded in the client handoff after the preparation branch is updated. All those commits will be included in ONE normal merge and ONE push to main, only after approval.

## Combined server changes

Editor-map multiplayer is DEV-only. The server validates one immutable map per room and independently checks its SHA-256 hash. Matchmaking includes map hash; friends and reconnecting players receive the same geometry. Custom bounds, rotated walls, ramps and spawn elevation use that definition. LIVE custom-room creation stays rejected. Map transfer remains limited to 48 KiB, 600 objects, 2,048 colliders and 6–16 unobstructed spawns.

For public rooms, `/rooms` and signed `/dev/rooms` additionally return `name`, `connectedPlayers` (display-name strings only), `roundTimeSeconds`, `timeRemainingSeconds` during play/after finish, `botCount`, and editor-only `mapPreview` (dimensions and geometric footprints). Titles are stripped of markup/control characters and limited to 48 Unicode characters. An omitted title defaults to the host's existing sanitized callsign plus `'s match`. Existing callsigns remain limited to 16 ASCII characters. No player/session IDs, IP addresses, tokens or authoring metadata enter the new fields.

Display-name metadata updates on join, disconnect, reconnection and leave. Bot count/phase/deadline update on membership or phase changes. Time remaining is calculated from the actual deadline when listing is requested; no per-tick metadata writes are introduced. Geometry is computed once from the validated editor map. Listing refresh stays at 7.5 seconds on the visible client screen.

Private/invite-only/unlisted rooms remain excluded. Both route queries stay confined to their environment. Origin checks, the signed 120-second DEV token requirement, join and reconnection admission, room-ID namespaces and storage separation are unchanged. No dependencies, paid services, plans, instances, secrets or DNS changes are needed. Existing match duration, weapons, movement and balance are unchanged. No general score/kill-limit setting currently exists, so none is invented.

## Before the one deployment

1. In Colyseus Cloud, open `blockrush-server` (`de-fra-ae0a271a.colyseus.cloud`). Record the deployed full commit SHA, Node version, instance count, endpoint and settings. Record environment-variable names without copying secret values. If the deployed code or main differs from the expected baseline, stop and reconcile it before approval/merge.
2. Confirm **0 CCU and 0 rooms** in Cloud immediately before starting, across both LIVE and DEV, including private rooms. Public room lists alone cannot establish this. The existing `/metrics` values `activeRooms` and `activePlayers` should also be zero; do not restart a server with active matches.
3. Review the exact preparation head and run `npm ci`, `npm run build`, `npm test`. Current local validation is a passing build and 36 passing server tests (20 authoritative-room, 5 editor-map, 5 environment-isolation, 6 room-details).
4. Wait for Ditex's own explicit approval of this combined deployment. No merge/deploy is authorized by this report.

## Approved action, when Ditex authorizes it

Use a normal merge commit so rollback is one operation:

```sh
git switch main
git pull --ff-only origin main
git fetch origin prep/dev-custom-maps-20261010
git merge --no-ff origin/prep/dev-custom-maps-20261010
git push origin main
```

Verify that the fetched preparation SHA is the reviewed SHA in the handoff. Record the resulting merge SHA. **The push to main triggers the account's existing Colyseus Cloud auto-deploy.** Do not also trigger a second dashboard deploy. Watch that single deployment until it succeeds.

Historical account deployments took 27–35 seconds; budget approximately one minute for restart/unavailability. Connections present at restart would be dropped, and in-memory matches would be lost. With the zero-room/zero-CCU precondition, no active matches should be interrupted. Build/provider failure can make this longer; no guarantee of a fixed downtime is implied.

## Post-deploy checks

1. Health succeeds; LIVE Quick Play and private invite create/join/start still work on built-in arenas with six-character codes.
2. LIVE `/rooms` returns only LIVE public IDs. DEV `/dev/rooms` requires a valid origin-bound token and returns only DEV public IDs. No token, invalid/expired token and wrong-origin token requests are rejected. Cross-environment joins/reconnections remain rejected.
3. Create a named public room and join as a second human: title is sanitized, only connected human names appear, round time is the existing actual duration, remaining time decreases, and bot count matches server participants. Private and unlisted titles/names never appear. Disconnect/reconnect and leave update the connected-name list.
4. The prepared DEV client picks up `capabilities.editorMaps: true` automatically on the next signed listing or editor-map Quick Play check. Test creation/join from a second browser without the map saved, matching hash/name/geometry, collision, spawns, combat and reconnection. Equal hashes match together; changed hashes use separate rooms. LIVE custom creation stays rejected.
5. DEV details show real editor-map top-down geometry and real values; the single Server ping value is measured, not a per-room estimate. Public game v93 stays untouched.

## Exact rollback

If any LIVE regression occurs, revert the recorded merge immediately:

```sh
git switch main
git pull --ff-only origin main
git revert -m 1 <recorded-combined-merge-sha>
git push origin main
```

This normal revert triggers one rollback deploy. Confirm the resulting source under `src/`, `package.json` and the lockfile matches the recorded baseline `66f9c9acaebaddfc85552f69fe1d33654cc2ba81`; check Cloud success, health and built-in LIVE/DEV flows. Never reset or force-push main.

If someone uses a fast-forward instead of the recommended merge, reverting only the latest room-details commit is insufficient: editor-map commits would remain. Restore the recorded baseline tree with a normal rollback commit (or revert every preparation commit newest-first in one `git revert --no-commit <baseline>..HEAD`, then commit and push once). Stop if unrelated commits have landed; do not undo them blindly.

The new DEV client hides absent detail fields and disables editor-map support on the next successful listing without that capability. For immediate client rollback, republish saved DEV version 5 (v96); saved version 2 is the older original-lobby fallback. Keep the new DEV version saved for later. No data, storage or secret migration needs undoing.
