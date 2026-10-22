# Always Run + Rifts + Map Kit Phase 2 + Quick Play

PREPARED ONLY. No main merge, deployment or restart is authorized by this preparation.

Baseline repository main: fca14db2f88d87fafd1a6a19498520efdf39bec1. This is a verified repository baseline, NOT a fresh Cloud deployment reading. Re-record the Cloud deployed SHA before any approved deployment.

## Change summary

- Authoritative player base = weapon walk × 1.38, clamp upper bound 14; horizontal/slide cap = new base × 1.45 (+5.316% over old cap). ADS, jump, air acceleration, slide boost/friction/cooldown and simulation time budget remain unchanged. Client-controlled sprint no longer changes human speed.
- Server bots retain their actual current conditional sprint/ADS behavior and multiply their prior speeds by 1.38. They did not use Solo's 4.4 m/s baseline; Solo's separate hard baseline becomes 6.072 and retains its 0.58 combat strafe multiplier. No new player-speed assignment is imposed on bots. Review this distinction before deployment.
- Shared front-only A/B portals with 1 s cooldown, exit offset 1.2 m, yaw/velocity delta destination-source+180°, unchanged pitch and other gameplay state. Server owns geometry and teleport decisions. Teleport serial, simulation clock, cooldown and ladder detach clock are serialized for prediction; pre-teleport history is cut and earlier target rewinds rejected. Bullet/projectile collision uses the solid portal surface. Bots treat portals as obstacles and cannot climb ladders.
- Same reviewed 30-prefab collider expansion and ladder movement as DEV. `shoot:false` and ladders excluded from projectile/hitscan blockers. Invalid rift pairs/placement and unsupported geometry fail admission. LIVE still rejects arbitrary editor maps and official geometry remains server-owned.
- Connected-human start/count/listing; immediate connected host migration; orphan public rooms lock and disappear from listing; orphan admission rejected; reconnecting roster bit and snapshot field. Existing 20-second reconnection window remains.
- Listing capabilities advertise movementVersion 2, rifts and mapKit. Each room also advertises movementVersion 2. Human clients reporting v115 or earlier receive a reload error instead of silently predicting old movement.
- Existing Origin/token isolation, rate limits (70 inputs/40 actions), movement-time budget, STRIKE_LIMIT 12, and admission/IP protection preserved.

## Client pairing and deployment plan

Requires client v116 (or a later client retaining this protocol). DEV v116 keeps old online movement on the currently deployed server; rift/prefab maps stay Solo-only until capabilities arrive. No official map placement changes are included.

Only after Ditex explicitly approves the server deploy AND the public client publish:
1. In Colyseus Cloud record current deployed commit, environment/settings, one-instance configuration and rollback SHA. Confirm both 0 players and 0 rooms immediately before proceeding; stop if either nonzero.
2. At a quiet hour, publish the approved v116 LIVE package, preserving its prior public version. This is compatible with the old backend while the capability is absent.
3. Merge this reviewed prep branch to main normally (no force push). A push to main auto-deploys. One instance restarts: prior observations 27–35 seconds; allow roughly 30–60 seconds including readiness checks. Any existing match would be interrupted, hence the zero-room gate.
4. Wait for Cloud success; record deployed commit and duration. Check health, LIVE Quick Play/invite and room listing; DEV invalid/expired/wrong-origin token denial; cross-environment denial; both reconnections; official map geometry protection; editor Map Kit/rift match on DEV; connected host migration/empty-room cleanup; moving fire/ADS and no repeated position corrections.
5. Ditex/Claude verify in Chrome: movement and bot feel, all ladder directions, A↔B at speed and while ADS/reloading/sliding, no visual reconciliation snap, third-party whoosh, bullet blocking, minimap, and mobile/desktop FPS within 5% on Map Kit Test against v115. Local tests cannot establish GPU FPS or live proxy behavior.

## Rollback

Use a normal revert of the deployed forward commit (or `git revert -m 1 <merge>` for a merge), restoring the freshly recorded baseline; push normally and wait for Cloud redeploy. Do not force-reset main. Verify LIVE on the baseline. Client v116 automatically falls back to legacy online movement and blocks new map features when old server capabilities return; its Solo changes remain unless separately reverted.

Revert only for a confirmed server failure. For a runner error, unavailable test, or ambiguous result: stop and report to Ditex before reverting. No automatic rollback for missing WebGL.

## Navigation follow-up

Solo uses a sampled walk graph; adding portals needs paired directed edges, cooldown-aware path costs and steering to the front face. Current server bots use direct steering, so reliable portal use first needs a real path planner. This is not a simple visual toggle and is excluded here.

## Local validation

`npm run build` passed. `npm test`: 61 passing, 0 failing across all seven suites. Includes existing isolation/origin/token checks, official map protection, movement-time-budget abuse, firing authority and new rift/connected-room tests. These are local backend checks, not proof of a Cloud deployment.
