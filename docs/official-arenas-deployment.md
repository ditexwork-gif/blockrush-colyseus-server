# Official arenas — preparation only

Baseline main/deployed commit: 147a5222d8474aa71c72e3da1aa1b534e7114d34.
Prep branch: prep/official-arenas-20261011. Do not merge or deploy without Ditex's approval.

Adds Reactor, Overpass and Bazaar from the approved sanitized v3 geometry, including 0.5 m cover. Server owns geometry and SHA-256 hashes, rejects client replacement geometry, validates FFA/TDM, and exposes officialArenas capability and real map previews. Arbitrary LIVE editor maps remain rejected. Existing environment isolation and signed DEV-token checks are preserved.

52 local server tests pass; TypeScript build passes. Seven new tests cover all three arenas in both environments and rejected replacement geometry/unsupported modes/arbitrary LIVE editor maps.

Before any approved deploy: record the actual Cloud commit and environment/settings; confirm 0 CCU and 0 rooms in Cloud and both listings. Stop if anyone is online. Main pushes auto-deploy. Expect roughly 30–40 seconds of restart interruption (previous deployments 27–38 seconds); any active rooms would be lost, so deploy only at zero.

After deployment: LIVE Quick Play and invite create/join, LIVE listing only LIVE rooms; DEV signed-token create/join and DEV-only listing; cross-environment join rejection; missing/invalid/expired/wrong-origin token rejection; reconnection in both environments; human names update after leave; each official arena creates/joins, has canonical hash/preview and allowed modes; arbitrary LIVE editor maps remain rejected. Browser-rendered geometry, weapons/music and gameplay require Ditex/Claude Chrome checks.

Rollback: normal revert commit of the approved forward merge/change on main, no force push; auto-deploy restores the recorded baseline tree. Verify both environments afterwards. Revert only on confirmed server failure. Pause and ask Ditex on runner errors, unsupported checks or ambiguous failures.

No server deployment performed by this preparation.
