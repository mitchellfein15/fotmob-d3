# D3 Matchroom

Local soccer analysis from Spiideo tag-export XML files. Node.js 22+ is required.

## Admin access and viewer mode

The app opens in read-only viewer mode. Anyone can choose saved matches, browse players and ratings, inspect timelines, and open lineup details. All data-changing API requests require an authenticated admin session.

Set a private password of at least 12 characters in the server's environment before starting it. For local PowerShell use a hidden prompt (the password is not echoed or placed in shell history):

```powershell
$credential = Get-Credential -UserName admin -Message 'Choose your Matchroom admin password (12+ characters)'
$env:ADMIN_PASSWORD = $credential.GetNetworkCredential().Password
node server.mjs
```

Click **Admin sign in**, enter that password, and open the **Admin dashboard**. It contains XML import, official box-score preview/attachment (including saved HTML), tracker import/replacement/removal, and tactical pitch editing. Move players using drag or arrow keys, then select **Save positions** for each team. **Reset positions** restores the default layout; select Save positions to publish the reset. Public Lineups & minutes always displays the saved layout. Unsaved pitch edits are discarded when leaving the dashboard. Legacy browser-only positions are not published automatically.

Sign out returns to viewer mode. Sessions last eight hours and are invalidated by sign-out or a server restart. Five failed sign-in attempts from one address trigger a 15-minute cooldown. Without ADMIN_PASSWORD the server remains read-only; short configured passwords fail startup. Change the environment password and restart to rotate credentials and invalidate all sessions. No password is bundled in frontend files or stored in browser storage.

This is a deployment preparation step: the server still binds to 127.0.0.1 and only accepts its local Host/Origin. Public hosting still requires explicit host/origin configuration, HTTPS, and persistent storage for the storage directory. NODE_ENV=production marks session cookies Secure and requires HTTPS. Do not expose this local server directly by merely removing the host check. Match data and source downloads remain publicly readable by design. Pitch positions now live in the saved match on the server and survive reimports; existing browser-local positions remain untouched but are no longer used.

## Start

Install the XML parser once with `npm.cmd install` on Windows (or `npm install` elsewhere), then run:

    node server.mjs

Open http://127.0.0.1:4173. Matchroom runs locally and imports do not contact Spiideo. Use Ctrl+C to stop.

## Import a game

1. In Spiideo, open the recording, choose **Info → Export tags**.
2. In Matchroom, sign in as admin, open **Admin dashboard → XML import**, choose the downloaded XML, and click **Import XML**.
3. Review **Players**, **Event timeline**, and **Import details**.

Imports persist in the local, ignored `storage/` directory. The most recently selected saved match loads after a refresh. An empty workspace explains that an admin must import a match; no sample statistics are mixed into imports.

The same event content, even in a renamed file, reuses its saved match. A revised export with changed events becomes a separate snapshot so previous data remains available. Saved identity is derived from event content, not the UUID in the export filename. Without a match identifier in the XML, two exports with exactly the same event content cannot be distinguished.

## Interpretation and validation

- Use the action-coded XML rows. Player and team lanes repeat the same actions and are excluded only when a corresponding action can be verified.
- Skip unrecognized tags without a matching action row or a single event-type label, including manual coach tags with multiple labels. Import warnings report the skipped count, and the original XML retains all tags.
- Collapse exact action duplicates based on event type, clip range, and all labels. Retain their XML instance IDs and the complete original XML for auditing. These are duplicate candidates, not proof that separate real-world events could never share the same labels.
- Preserve event outcomes, player roles, substitutions, phases, coordinates, assists, and blockers. Unknown labels remain available.
- Player identities are scoped to team and source label. Names appearing under both teams are flagged, not silently reassigned. This is not a complete roster or starting lineup.
- Video clip start/end values are not precise action timestamps or match-clock minutes. Coordinate values are retained without assuming pitch dimensions or orientation.
- Goal events and shots with outcome GOAL are separate event types; goal totals count only goal events.
- Ratings and playing time remain unavailable. Compare team and player totals against Spiideo before treating the export as verified.

**Import details** shows totals, warnings, representation/duplicate counts, a normalized JSON download, and the original XML download. JSON is for archival or further analysis; the input workflow accepts Spiideo XML.

Malformed XML, document types/entities, unmatched lanes, invalid clip ranges, and unsupported structures fail before saved data is replaced. Imports are limited to 20 MB. The server retains localhost Host/Origin checks and requires an application header for uploads.

## What changed

API credentials, copied cURL requests, upstream HTTP calls, scheduling, discovery, polling, and partial JSON imports have been removed. Existing saved snapshots are preserved and can still be selected; they may lack XML-specific details. Old settings or diagnostic files are ignored.

## Checks

    npm.cmd test
    npm.cmd run check

Tests cover XML lane handling, exact duplicates, name/team identity, coordinates, malformed files, repeat imports, local persistence, and HTTP access controls. They do not establish agreement with Spiideo's live statistics.

The supplied Wooster / Case Western export produces 1,421 retained events from 3,919 XML entries, excluding 2,491 player/team representations and collapsing 7 identical action rows. Team totals: Case Western 334 passes / 210 completed / 11 shots / 3 goals; Wooster 294 / 156 / 3 / 0. These totals have not been independently verified in Spiideo.

## Add official box-score information

After importing XML, sign in and open **Admin dashboard → Official box score**. Paste a men's soccer box-score URL from **athletics.case.edu** or **woosterathletics.com**, then click **Preview box score**. Supported links use the form:

    https://athletics.case.edu/boxscore.aspx?id=9897&path=msoc

Review the date, both team matches, all player matches, statistical differences, and warnings. Check the same-game confirmation and click **Attach box score**. The XML does not contain a verified date, so this review matters, particularly for repeated fixtures between the same teams.

If URL retrieval fails, save the athletics box-score webpage as HTML and choose it under **Use a saved webpage**. Enter its original supported URL as provenance. Only its data tables are parsed; scripts are not executed. A PDF or screenshot is not supported by this importer.

The attachment preserves:
- Both official player tables, starters/substitutes, jersey numbers, position labels, published integer minutes, and official statistics.
- Goalkeeper time to the second, saves, and goals conceded.
- Play-by-play records, period boundaries, explicit second-half lineups, and substitutions.
- Reconstructed per-period playing stints, source URL, retrieval time, source hash, and the original HTML in private storage.

Name matching normalizes whitespace, punctuation, accents, and first/last name order, then requires a unique match within a team. Team suggestions use roster overlap and must be reviewed. Jersey differences and unmatched XML identities remain visible. The importer never merges same-name players across teams or silently reassigns Spiideo events.

Halftime lineup announcements are authoritative for the second-half starting state; the accompanying substitutions are retained without applying them twice. Missing boundaries, unknown players, inconsistent substitutions, or dismissals withhold reconstructed minutes. Published minutes are retained even when the sequence cannot be reconstructed. Differences over one minute are flagged; positions remain published roster labels rather than roles for each playing stint.

Official and Spiideo statistics remain separate. This game has 17–8 official shots versus 11–3 in Spiideo. Reimporting identical XML preserves its attached box score. Replacing an attachment archives its previous records and HTML in the saved match's raw history. Changed XML creates a separate snapshot and needs a new attachment.

URL fetching is limited to HTTPS on the two supported hosts and the soccer box-score route, without redirects, cookies, or credentials. Requests time out, and HTML is limited to 8 MB. Preview drafts expire after 15 minutes and cannot attach if the underlying XML was reimported.

## Supplied Spiideo analytics screenshots

The screenshots show additional analytics, including XG in the offensive view and distribution breakdowns by area, direction, and range. These screenshots are reference evidence, not a complete data import.

The distribution screenshot shows Alex Eby at 25/36 passes and Aydin Sumer at 3/8; their current same-team XML rows show 24/35 and 2/7. The export also contains one successful pass for each under Wooster. Combining the same-name rows would numerically reconcile those screenshot values, but the application preserves the conflicting source assignments until explicitly reviewed. This is independent of attaching an official roster.

Several column abbreviations and ratio definitions need Spiideo tooltips or an actual analytics response before implementing richer statistical interpretation. No screenshot-derived XG or statistics have been added to the match.

The test fixture is a reduced HTML capture of the public 2026-09-06 CWRU/Wooster box score, retrieved 2026-09-12. It contains only the individual-statistics and play-by-play sections plus the date.

## Experimental player ratings

The Players view now ranks players by an experimental 1–10 rating. Click a player for the exact contribution breakdown. Ratings are recalculated from the saved match when it loads; importing or replacing a box score updates them automatically. The scoring formula is versioned in dist/ratings.js.

Version 1 starts at 6.0. Goals add 1.05 (1.25 for defenders), assists 0.70, and non-goal shots 0.10 up to 1.0. Passing uses completed minus 70% of attempts, weighted 0.055 for midfielders and 0.04 otherwise, bounded to −0.65/+0.85. Duels add 0.09 per win and subtract 0.06 per loss, bounded to −0.65/+0.80 (+1.10 for defenders). Blocks add 0.16 up to 0.50 (0.80 for defenders). Yellow/red cards subtract 0.30/1.20, capped at 2.0. Goalkeepers gain 0.18 per save up to 1.8, lose 0.30 per goal conceded up to 2.0, and gain 0.60 for a clean sheet with at least 60 minutes. Final scores are bounded to 1–10 and rounded to one decimal. These are heuristic weights, not calibrated benchmarks.

Overlapping player shots and goals use the maximum of XML and official counts, never their sum. Assists and goalkeeper statistics come from the official box score. Team shot/goal totals independently use the higher source totals; differences from summed player maxima can occur, and unassigned team shots are not invented for players. Raw sources remain available for inspection. When a match box score is attached, its roster determines which players appear in ratings. XML statistics are used only for players linked unambiguously by normalized name within the same mapped team; jersey differences are allowed. Unmatched, ambiguous, and wrong-team XML identities are excluded from ratings and listed for review under Lineups & minutes. Their source records are retained and their events are not reassigned. Official players without an XML match still appear using box-score statistics. Without an attached box score, all XML players remain eligible.

Playing time uses reconstructed seconds, then goalkeeper clock, then published minutes. Minutes do not scale points; appearances under 15 minutes are labeled brief. Players without recorded appearances have no rating. Unknown positions use generic outfield weights. Missing metrics contribute no points; rating coverage identifies the available sources. This experimental score uses recorded actions and optional tracker effort, not a calibrated overall assessment or screenshot-only xG.

## Pasting tracker data

Load a match, sign in and open **Admin dashboard → Tracker data**, select the team, and paste the tab-separated table including its header. Save to update ratings. Empty the text and save to remove that team's tracker data. Data is saved per match and team and survives reimporting the same XML. The form lists unmatched or ambiguous tracker names; these add no points and do not create new roster players.

`parseTrackerData(rawTSV)` in `dist/tracker.js` returns a Map keyed by `nameKey(name)` (lowercase, letters only). Both helpers are also exported from `dist/ratings.js`. Blank numeric cells become `null`; invalid numbers and duplicate normalized names cause an error. Numbers such as `1,274` become `1274`. All eight physical metrics are attached as `player.physicalStats`, or `null` if there is no unique match. Existing official roster exclusions still apply.

Programmatic use:

```js
import {parseTrackerData, ratedPlayers} from './dist/ratings.js';
const tracker = parseTrackerData(rawTSV);
match.trackerData ??= {};
match.trackerData[teamId] = rawTSV;
const players = ratedPlayers(match, teamId);
```

Tracker weights, caps, and the work-rate baseline are editable at the top of `dist/ratings.js`. The defaults assume total distance in kilometres and hard running/sprinting in metres. Work rate and top speed retain the export's units. Work rate earns 0.01 per unit above 50, capped at 0.40; distance earns 0.02 per kilometre, capped at 0.30; high-intensity running earns 0.0002 per hard-running metre plus 0.0005 per sprinting metre, capped at 0.40 combined. Effort counts and top speed are displayed but do not add rating points. Missing data adds no points or penalties. Ratings retain the existing 1–10 clamp and one-decimal rounding.

### Tactical pitch

Open **Lineups & minutes** for a dark SVG pitch and substitute bench. Recorded starters are evenly spread across fixed GK, DEF, MID and FWD bands (attack at the top); empty bands remain empty. Unknown lineup status or positions appear separately until source records identify them. No exact tactical roles are inferred.

In **Admin dashboard → Pitch positions**, drag a starter anywhere inside the pitch, or focus a player and use arrow keys. Select **Save positions** to publish that team’s layout to the server. **Reset positions** restores the automatic layout for the selected team; save to publish the reset. Everyone can click a player (including substitutes) or press Enter for the rating breakdown in **Lineups & minutes**.

Player images use `avatarUrl` / `photoUrl` (or official `avatarUrl`), and teams use `crestUrl` / `logoUrl`. Local and HTTPS assets are supported, with initials when images are absent or fail. Ratings are green at 7.0+, orange at 6.0–6.9, red below 6.0, and neutral when unavailable. D3 7.9.0 is vendored in `dist/vendor` so the layout works without a CDN.
