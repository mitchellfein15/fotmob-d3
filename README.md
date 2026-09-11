# D3 Matchroom

Local D3 soccer match analysis with a server-side Spiideo importer. Requires Node.js 22+. No npm dependencies.

## Start

    node server.mjs

Open http://127.0.0.1:4173. The server binds to this computer only. Stop with Ctrl+C. Your npm launcher is currently broken; the direct Node command does not require npm.

## Connect and import the complete visible event feed

1. Sign in to Spiideo with your normal email/password in your browser.
2. Open this match. Open Developer Tools → Network → Fetch/XHR.
3. Select a successful `tags` request. Right-click → Copy → Copy as cURL (bash).
4. In Matchroom, expand **Connection & scheduling**. Paste the request into the local credential form and click **Connect**.
5. Click **Sync this match**. Watch progress. Once successful, the saved match replaces the sample in the dashboard.

The cURL command is parsed, NEVER executed. Application headers (including custom headers), authentication, Origin, Referer, and User-Agent are retained. Browser-only and transport headers are omitted. Connect first verifies the exact copied GET request; diagnostics show the endpoint and header names, never their values. Credentials stay in server memory, are not returned to the browser, and are cleared when the server restarts. Do not paste them into chat or Git. You can also provide `SPIIDEO_AUTHORIZATION` in the server environment. No password login or refresh-token endpoint is assumed or implemented.

A live unauthenticated request to the supplied tags endpoint returned HTTP 403. An authenticated end-to-end import has not been verified yet. When a required request returns 401/403, the app identifies the endpoint and pauses scheduled retries while retaining the in-memory session. It does not assume every 403 means expiration. A denied optional game-details request becomes a warning, preserving successfully downloaded events and rosters.

## What a sync collects

- All contender pages at `/v2/games/{gameId}/contenders`.
- Every participant page for each contender, keeping both `type=player` and `type=coach` query parameters.
- All tags from `/v2/games/{gameId}/tags?includeHidden=false&pageSize=250`, starting WITHOUT the copied cursor.
- Optional game details at `/v2/games/{gameId}`. If this inferred endpoint is unavailable, the import records a warning and retains event/roster results.

The contender route follows the supplied resource structure but still needs authenticated verification. The participants and tags routes and `nextParameters.nextToken` follow the supplied examples. All pagination cursors are treated as opaque strings. Unknown pagination shapes, repeated cursors, cross-match records, and failed pages stop the import rather than silently truncating it. Hidden tags are intentionally excluded, matching the original request.

Every successful import saves raw response pages, normalized records, counts, warnings, and import time in `storage/{gameId}.json` outside the served directory. The previous successful snapshot remains if a required request fails. Complete successful snapshots replace the prior records, reconciling source corrections and deletions. Non-action tags remain in raw storage but are excluded from player statistics.

“All visible pages fetched” means pagination was exhausted for those endpoints. It does NOT certify Spiideo processing is finished, prove complete event tagging, establish player minutes, or enable ratings. Empty feeds can be rechecked later. Raw data is not served through the dashboard API.

## Other games and scheduling

Enter one or more game UUIDs in **Track matches**, save settings, then click **Sync tracked games**. Each match is saved separately and appears in the saved-match selector. Up to 100 games per run are supported.

Enable scheduled syncing to recheck tracked games every 1, 3, 6, 12, or 24 hours. The server and computer must stay running and the session must remain valid. This is an application timer, not a Windows scheduled task. No account-level automation was created. Settings persist; credentials do not.

For automatic discovery of newly added games, open your recordings/competition view in Spiideo and copy the API request URL that returns its game list. Put it in **Discover new games automatically**, select `id` for game records or `gameId` for records referencing a game, and save. Discovery follows every page before syncing found IDs. Only `https://api.spiideo.net/v2/` requests are accepted. Filter the source request to the desired season/team; more than 100 games is rejected. Do not put credentials in the URL.

The account/competition game-list endpoint has not been supplied or guessed. Discovery requires that one-time configuration. If its response is not a `content` array with valid UUIDs under the selected field, the app reports an error and does not guess identities.

## Interface

- Both team rosters, player search and stats, player snapshots, and event-type filtering.
- Synced matches survive reloads; the original sample remains a fallback until a match is synced.
- Manual JSON page imports still operate only in browser memory; export before reloading if needed. Session exports are archival JSON, not individual-response import files.
- Outfield positions, score, verified minutes, and calibrated ratings remain pending.

## Checks and architecture

    node --test
    node --check server.mjs
    node --check dist/app.js
    node --check dist/sync-ui.js

`lib/spiideo.mjs`: fixed-origin API client, pagination, retries, data validation.
`lib/store.mjs`: atomic local JSON snapshots.
`lib/sync.mjs`: connection state, sequential syncing, discovery, schedules.
`server.mjs`: localhost API with Host/Origin checks and a required custom header for mutations; no cross-origin API access.
`dist/sync-ui.js`: local connection, saved match selection, scheduling UI.
`dist/model.js`: player statistics; ratings are not fabricated.

Tests use simulated upstream responses for pagination, rate limits, expired access, deduplication, both rosters, atomic failure recovery, cross-origin protection, and original sample statistics. They do not establish that your current Spiideo account can access the inferred game-details or contender routes.

No cloud deployment or remote authentication is configured. Add real access control before any remote hosting.

## Local network permissions

If Matchroom is started by an agent inside a network-restricted sandbox, the server can load its local UI but fail every outgoing Spiideo request with EACCES. A browser refresh or new credential cannot fix that. Start `node server.mjs` in a normal local terminal, or approve running that specific server command outside the sandbox. The server still binds only to 127.0.0.1. The importer now distinguishes local permission failures from Spiideo HTTP errors and reports redirects explicitly.
