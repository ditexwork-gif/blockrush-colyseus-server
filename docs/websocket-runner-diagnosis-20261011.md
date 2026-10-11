# WebSocket diagnosis and second deployment stop point

Diagnosis only. No production merge, deploy, restart, Site publication, DNS or account-setting change was performed during this investigation. Temporary owned diagnostic rooms were created and their clients disconnected.

## Root cause and evidence

The 1006 was a runner/network failure, not a rejection by the Colyseus application.

1. The frozen failed runner (`scripts/deployment-smoke-failed-run.mjs`, SHA-256 `fa149fab3adb7e458b50a0833c06095a63a06ec59ba742c74e535e3806926684`) was rerun unchanged against the restored baseline, including its mid-run token-refresh implementation. It failed on its first LIVE Quick Play connection with the same empty-message 1006 and no checks passed.
2. Instrumenting the same `ws` transport exposed `getaddrinfo EAI_AGAIN de-fra-ae0a271a.colyseus.cloud`. The transport was attempting direct DNS/network access instead of this environment's configured proxy. This happens before TLS, HTTP upgrade or server admission.
3. The same baseline endpoint, SDK, Origin and private LIVE create/snapshot request passed when an `HttpsProxyAgent` using the existing configured proxy was supplied. No TLS verification was disabled and no alternate network route was introduced.
4. The corrected runner passed seven hosted baseline checks: origin-aware LIVE create/join/start, origin-aware DEV create/join/start, cross-environment join/reconnect rejection, isolated listings with private rooms excluded, missing/invalid/wrong-origin token rejection, LIVE socket-loss reconnection, and DEV socket-loss reconnection.
5. `src/environment-admission.js` in the recorded deployed baseline `3d9665234306e8b57145c043fb11e5193333b48d` and prepared runtime `7c95bf779350b92f4aba4d2dc5bd4579a620e4e0` is byte-identical (Git blob `8050cabdb52ad0ed43edda05e4ee04d719c5df63`). The transport's `beforeUpgrade: upgradeAdmission` remains unchanged. The failed connection was built-in LIVE, before any new editor-map or room-details check executed.

The earlier deployment's three completed LIVE checks still stand: Quick Play create/join/start, real sanitized public room details/timers/bot count, and invite create/join/start with private listing exclusion. This diagnosis clears the 1006 as a server regression; it does not substitute for completing all hosted checks after a redeploy.

## Token timing and Origin

The failed first check used the LIVE SDK. Its upgrade had the exact intended Origin `https://blockrush-arena.dimitrigvianishvili.chatgpt.site` in the `ws` options and **no `_authToken`**. Although the runner minted and refreshed a DEV token before that step, the LIVE client does not use it. Expiration of that DEV token cannot explain this failure. DNS failure prevented the prepared Origin header from reaching the server.

The failed deployment run did not preserve mint/upgrade timing logs, so exact historical DEV issuance timestamps cannot be recovered. We do not claim otherwise. The frozen source shows refresh before every named check; it did not update a previously created room's captured SDK reconnection URL.

Corrected hosted baseline evidence logs only claim timing and Origin, never credential bytes: DEV initial upgrades had 91 and 80 seconds left; the refreshed DEV reconnect upgrade had 114 seconds left. They joined/reconnected successfully, proving the signed Origin-bound admission accepted those actual connections. A local real-WebSocket test independently inspects the server-received Origin header.

## Runner changes

- `scripts/origin-aware-websocket.mjs`: explicit proxy-aware `ws` transport, NO_PROXY support, preserved Origin, safe handshake/timing diagnostics, missing proxy support reported before direct connection, classification of DNS/setup/auth-expiry/unknown failures separately from explicit HTTP rejection.
- `scripts/deployment-smoke.mjs`: complete post-deploy sequence, refresh before DEV operations and replacement of the SDK's captured token URL before DEV reconnection; expected rejections must be actual HTTP 403 rather than arbitrary rejected promises. Direct invalid-token/cross-Origin upgrade checks inspect the real HTTP response. Genuine expired-token checks retain the original signed token deliberately.
- `scripts/baseline-isolation-diagnosis.mjs`: corrected hosted baseline check sequence.
- `scripts/run-local-deployment-smoke.mjs`: the complete sequence against an ephemeral local server with a loopback-only test signer. It cannot use its fixture signer against a remote endpoint. A signal/aborted child is not counted as success.
- `scripts/deployment-smoke-failed-run.mjs`: frozen original reproduction, intentionally unfixed; do not use it to judge a release.
- `test/DeploymentRunner.test.ts`: eight regression tests, including actual wire Origin, mandatory proxy routing, missing proxy support, token refresh/reconnect URL, genuine HTTP rejection versus DNS error, and bounded/idempotent cleanup. Already-left rooms are skipped instead of waiting forever for a second leave event.

No server runtime files, production dependencies, matchmaking/gameplay rules or client files changed as part of this runner fix. `https-proxy-agent@7.0.6` was already installed in the execution environment; the runner accepts its existing module path in `BLOCKRIFT_PROXY_AGENT_MODULE`. A machine without a proxy uses direct `ws`; a machine with a configured proxy must provide this test-only module. Credentials are supplied through hidden stdin and retained in process memory, never shell arguments, repository files or diagnostic output.

## Validation

- Server build passes.
- Existing four server suites: 36 passing.
- Runner suite: 8 passing; full suite: 44 passing.
- Corrected hosted baseline diagnosis: seven passing checks, including actual socket-loss reconnection for both environments.
- Complete local deployment smoke against prepared runtime: 15 passing checks, including actual unauthorized WebSocket upgrade HTTP responses, DEV custom geometry transfer, equal/different map-hash matchmaking, real metadata, reconnection and a genuinely expired signed token after its 120-second lifetime. Owned clients disconnected and the local test server shut down.
- Prepared runtime/map/room source files used locally were checked against the GitHub `7c95bf7` source. No server authentication patch is required.

## Complete post-redeploy checklist and execution responsibility

| Check | Can run here | Chrome responsibility |
| --- | --- | --- |
| Cloud deployed revision/status, health, total CCU/rooms | Yes, account session permitting | Owner supplies account verification if session unavailable |
| LIVE Quick Play create/join/start; six-character codes | SDK/network | Ditex checks rendered play and actual lobby button flow |
| LIVE invite create/join/start; private room exclusion | SDK/network | Ditex checks create/join dialog flow |
| LIVE listing contains LIVE public IDs only | HTTP/network | None required for data validation |
| DEV origin plus signed 120-second token; absent/invalid/expired/wrong-Origin rejection | HTTP and real WebSocket upgrade responses | None required for admission validation |
| DEV listing and room IDs are DEV-only | HTTP/SDK | None required for data validation |
| LIVE-to-DEV and DEV-to-LIVE join/reconnect/upgrade rejection | HTTP/SDK/WebSocket | Optional browser confirmation |
| Public title sanitization/default/length; connected humans only; real duration, remaining time, bot count | SDK/HTTP plus local sanitization tests | Check optional title field and displayed details in the DEV UI |
| Private and unlisted data excluded | Hosted private-room checks; local unlisted-room tests | No public client API creates unlisted rooms; local guard test covers it |
| DEV editor-map create/friend transfer; identical hash and geometry; equal hashes match, changed geometry separates | SDK/network | Two Chrome clients, second without map locally saved; rendered map/collision/combat check |
| LIVE custom-map creation remains rejected | SDK/network | None required |
| LIVE and DEV reconnect after real socket loss; same room/seat, DEV same map | SDK/network | Browser disconnect/reconnect and continued rendered play |
| Connected-name updates after leave/reconnect; capabilities enable existing DEV client | SDK/HTTP | Confirm automatic editor-map enablement and real room-details/map-preview UI |
| Input, authoritative combat, collision/spawns/ramp tests | Local server suite | Actual movement/combat feel and rendered geometry in Chrome |
| Lobby/model/music/WebGL rendering, map previews, layout, frame rate | Not asserted by this backend runner | Ditex or Claude in Chrome |
| Owned test clients leave, rooms return to zero when no other users are present | Metrics/Cloud | None |
| Public v93 publication, DNS/domain/plans unchanged | No publishing/settings tools used | Optional owner check |

Network-only success must not be described as rendered gameplay/browser QA. A missing WebGL renderer is an unavailable check, not a server failure.

## One stop point for a second attempt — Ditex approval required

Repository: `ditexwork-gif/blockrush-colyseus-server`. Preparation branch remains `prep/dev-custom-maps-20261010`; its new head contains only the runner/tests/report delta over `7c95bf7`. The exact updated head is linked in the handoff response.

Recorded current main/rollback commit: `3ce28a7a5c5c24a3c3cce322779dd3606f725c85`. It restores the exact tree of deployed baseline `3d9665234306e8b57145c043fb11e5193333b48d`. Re-record Cloud's actual deployed commit and main immediately before the next attempt. If either differs, stop and reconcile.

Server changes to redeploy are the already reviewed `7c95bf7` runtime: DEV-only immutable validated editor maps, map-hash matchmaking and geometry transfer/reconnection, plus public-only sanitized room title, connected human names, real round time/remaining time/bots and actual editor-map preview geometry. LIVE/DEV origin/token/listing/room-ID/storage isolation remains unchanged. Runner-only additions do not alter the application runtime. No secret, DNS, plan, instance or public Site change is needed.

Immediately before a second push, confirm **0 CCU and 0 total rooms**, including private LIVE/DEV rooms, in Cloud and `/metrics`. If anyone is online or any room remains, stop. Also run a quick corrected baseline connection check first, disconnect its clients, and wait for their rooms to dispose before the zero-count check.

A plain merge of the old prep branch cannot reapply its runtime: the branch was already merged and then reverted. The proposed action is **one normal forward restore commit**, with parent equal to the freshly recorded main and tree exactly equal to the reviewed updated prep head, followed by one non-force main update. Example, after explicit approval and after substituting the reviewed full preparation SHA:

```sh
git switch main
git pull --ff-only origin main
git fetch origin prep/dev-custom-maps-20261010
git status --short  # must be clean
git rev-parse HEAD # must equal the freshly recorded rollback/main SHA
git restore --source=<reviewed-updated-prep-full-sha> --staged --worktree .
git diff --cached --stat
git commit -m "Reapply approved editor maps and room details with verified deployment runner"
git push origin main
```

Record that single new commit. Existing push-to-main integration triggers ONE auto-deploy; do not also click a dashboard Deploy button. Watch Cloud success before checks. Historical deploys took 27–35 seconds; the first attempt was 32 seconds and its rollback 31 seconds. Budget about one minute for restart/unavailability. Any active in-memory match would be lost, hence the required zero-count gate. No service-cost/settings changes are proposed.

Exact rollback of this proposed single forward commit:

```sh
git switch main
git pull --ff-only origin main
git revert <recorded-second-attempt-commit>
git push origin main
```

This normal revert restores the freshly recorded pre-attempt tree and triggers one rollback auto-deploy. Verify Cloud success, source-tree equality, health and corrected baseline LIVE/DEV checks. If unrelated changes land on main, stop instead of undoing them blindly. No reset or force push.

## Proposed rollback rule for Ditex to approve with the second attempt

- **Revert** for a confirmed deployment/build failure or server regression: reproducible incorrect behavior with a functioning runner, explicit unexpected application rejection with correct fresh credentials/Origin, broken isolation, wrong map/state/data, private data exposed, or a baseline-supported LIVE flow now failing. Preserve sanitized request/response evidence and relevant Cloud logs.
- **Stop and ask, without automatically reverting**, when a check cannot run or the runner itself fails: DNS/proxy/TLS/client errors, missing WebGL, missing account access, runner exception/cleanup error, self-expired or wrongly bound test token, unknown 1006, or ambiguous timeout. Clean up owned test clients, report PASS/FAIL/INCONCLUSIVE accurately and leave the deployment unchanged pending Ditex's direction. A transport error alone is not proof of a server regression.
- Do not start another deploy or merge a fix merely because the runner reports an error. The second attempt itself and this revised rule require Ditex's own explicit approval.
