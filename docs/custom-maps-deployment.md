# Editor arenas in multiplayer — preparation only

Baseline: `66f9c9acaebaddfc85552f69fe1d33654cc2ba81` on main. Do not merge or deploy until Ditex separately approves the shared-server deployment.

## What changes

DEV custom rooms receive one immutable, validated arena definition. The server independently computes its SHA-256 checksum and refuses mismatches. Quick Play filters by map checksum as well as environment, map, mode and public/private state. Friends receive the room's arena; they do not need it in their own browser storage. Reconnection keeps the same arena revision. Collision, spawn elevation, map bounds, rotated walls and ramp ray intersections use that definition. LIVE creation of custom rooms is rejected so the unchanged public v93 client cannot encounter arenas it cannot load. Existing built-in movement, durations, weapons, damage and admission/isolation code remain unchanged.

Arena data is transferred with the initial snapshot rather than in each 20 Hz schema patch. Transfer is limited to 48 KiB after removing thumbnails and authoring metadata; maps need 6–16 unobstructed spawn points, at most 600 objects and at most 2,048 expanded colliders. Invalid maps get an explicit error; there is no silent Foundry fallback. Large maps may need simplifying before multiplayer. No persistent map hosting, R2 upload, DNS change, new service or paid plan is required.

## Deploy after approval

1. In Colyseus Cloud, open blockrush-server. Record the deployed commit, Node version, instance count, endpoint, environment-variable names and current settings. Do not paste secret values into chat. Confirm the rollback commit remains accessible. Expected baseline is 66f9c9a; if the app differs, stop and inspect it before merging.
2. Confirm both CCU and room count are zero immediately before deployment. Include LIVE and DEV rooms. If any match is active, wait for it to finish; do not restart it.
3. Review the preparation branch and run `npm ci`, `npm run build`, and `npm test` locally. It retains the repository's dependencies and lockfile.
4. Merge the preparation branch into main using a normal merge or fast-forward, with no force push. The account's existing push-to-main integration triggers the deployment. Do not change plans, instances, DNS or environment secrets.
5. Watch Colyseus Cloud's deployment entry until it succeeds. Previous deployments took 27–35 seconds; budget about one minute. A restart drops any connections still present. With zero rooms there should be no active matches to interrupt; preserve the zero-room precondition.
6. Check health, LIVE Quick Play, LIVE friend create/join/start, existing LIVE/DEV separation, and reconnection on the original built-in arenas. If anything fails, revert the merge immediately and leave the new readiness flags false.
7. Enable `backendCustomMapsReady` for DEV only in the canonical client environment config and republish the owner-only DEV Site. Create an editor-map DEV friend room; join from a second browser without that map saved. Verify identical map name/geometry/checksum, walls/ramps/spawns, combat and reconnection. Test equal-map Quick Play matching and separate rooms after a map edit.
8. Keep LIVE's readiness flag false and the public game unchanged. Removing the server DEV-only gate and enabling or publishing LIVE requires Ditex's explicit approval after DEV testing.

## Roll back

Set the DEV client readiness flag back to false and republish its prior saved version if necessary. Revert the normal merge commit on main with `git revert -m 1 <merge-commit>` and push normally. For a fast-forward, revert the preparation commit with `git revert <preparation-commit>`. Watch the triggered deployment until it succeeds and confirm its code matches the recorded baseline. Do not reset or force-push main. Retest built-in LIVE and DEV joining and isolation. No storage or secret migration is part of this patch.

## Local validation

TypeScript build passes. Existing authoritative-room suite: 20 passing. Existing environment isolation suite: 5 passing. New custom-map suite: 5 passing, including actual socket-loss reconnection, friend transfer, checksum rejection, map revision separation, large arena bounds, lowered floors, rotated wall rays and ramp rays. Rendered gameplay in the owner's browser is still needed after the approved deployment.
