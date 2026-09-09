# BLOCKRIFT correction pass — upgrade notes

Date: 2026-09-09

This pass follows `BLOCKRIFT-consolidated-findings.md`. It keeps the Phase 1.1 movement constants frozen and changes the class/loadout UX, held-weapon presentation, multiplayer resilience, Quick Play flow, and idle network behavior.

## Player-facing upgrades

### Real class loadouts

- Added five persistent class slots.
- Assault, Scout, and Runner are available from level 1.
- Vanguard unlocks at level 10; Specialist unlocks at level 18.
- Every class owns an independent name, primary weapon, secondary weapon, reticle, and finish field.
- Selecting a class now selects the exact weapons that spawn in the match.
- Existing flat loadouts migrate into the matching historical class without deleting progression; custom primaries fall back to Assault.

### Loadouts workbench

- Replaced the misleading **Armory** flow with **Loadouts** / **Edit Classes** language.
- Added class and primary/secondary selectors.
- Purchasing a weapon no longer silently equips it.
- Equipping changes only the selected class.
- Weapon trials leave the saved class unchanged.
- The detail preview has a clearer three-quarter angle, larger canvas, controlled lighting, and a stable footer.

### Held weapons and sights

- Reduced the first-person weapon scale and moved it lower/right so it reads as held instead of floating.
- Added visible block-style hands and sleeves.
- Preserved assault-rifle square optics while reducing the frame, glass, and reticle size to keep sightlines clear.
- Kept sniper scope behavior separate from assault-rifle aiming.

### Match flow and presentation

- Quick Play starts immediately when a second human joins.
- A lone Quick Play user receives a server-bot match after 12 seconds instead of being stranded.
- Bots occupy open seats up to six players and are replaced as humans join.
- A started online match now deploys players into the arena automatically.
- Keyboard help fades after the first 30 seconds and stays dismissed on later matches.
- Menu progression text and bar are larger and the daily card no longer overlaps the class area.
- Visible product naming is now **BLOCKRIFT**. Internal Colyseus room identifiers, deployment URLs, and legacy storage keys remain compatible.

## Multiplayer corrections

### Damage no longer causes movement stalls

The server no longer rejects valid catch-up inputs using the old per-frame input-tick allowance. It processes a short backlog at up to three inputs per simulation tick, acknowledges deliberately dropped overflow inputs, rejects duplicate/out-of-order sequence numbers, and validates that simulation output stays finite. This prevents the client from replaying an unacknowledged input forever after a damage snapshot or brief network hiccup.

### Reconnection window

- Removed the page lifecycle handler that intentionally left the room during a tab/page interruption.
- Enabled Colyseus automatic reconnection with bounded retries covering the server's 20-second seat window.
- On a dropped socket, the server clears queued shots/movement and applies a neutral held input so the disconnected player does not keep running.
- On reconnect, the client clears local pending actions and re-baselines its prediction sequence from the next authoritative snapshot.

### Match-only real-time traffic

- Live matches retain a 60 Hz authoritative simulation and 20 Hz delta-schema patches (`50 ms`).
- Waiting and finished rooms use a `1000 ms` heartbeat patch rate.
- Movement, fire, reload, switch, and loadout messages are ignored outside the playing phase.
- Client input/fire methods also refuse to send outside the playing phase.
- Ping remains every two seconds for connection health.

This means the WebSocket remains open for room continuity, but the high-frequency game stream runs only while the round is active.

## Server-authoritative baseline retained

- Client packets contain inputs, view angles, sequence, tick count, and weapon slot—not world positions or health.
- The server owns movement, collision, HP, ammo, rate of fire, reload, kills, score, respawn, and round timing.
- Lag-compensated hitscan rewinds at most one second and validates fire angles against the server-known aim.
- State uses binary, delta-encoded Colyseus schemas.
- Input is capped at 70 messages per second; action traffic is capped separately and repeated violations produce strikes.

## Verification added

- Profile-v3 and old-storage migration.
- Per-class equipment isolation and class unlock gates.
- All weapon balance and browser/server catalog parity checks.
- Prediction acknowledgement and finished-room client traffic suppression.
- Reconnect queue reset.
- Server backlog drain while health changes.
- Server 20-second dropped-seat behavior and movement neutralization.
- Server transition from 20 Hz live patches to 1 Hz finished-room heartbeat.
- Quick Play server-bot fill and second-human auto-start.

## Deployment order

1. Push/deploy `colyseus-server` to Colyseus Cloud and wait for a green deployment.
2. Verify `https://de-fra-ae0a271a.colyseus.cloud/health` and `/metrics`.
3. Publish the matching BLOCKRIFT Site client.
4. Test Quick Play and one private-room match in two browsers.

The client and server must be deployed together because the schema now includes the bot flag and the client depends on the revised phase/reconnection behavior.
