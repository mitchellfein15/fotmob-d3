# D3 Matchroom

Local soccer analysis from Spiideo tag-export XML files. Node.js 22+ is required.

## Start

Install the XML parser once with `npm.cmd install` on Windows (or `npm install` elsewhere), then run:

    node server.mjs

Open http://127.0.0.1:4173. Matchroom runs locally and imports do not contact Spiideo. Use Ctrl+C to stop.

## Import a game

1. In Spiideo, open the recording, choose **Info → Export tags**.
2. In Matchroom, choose the downloaded XML and click **Import XML**.
3. Review **Players**, **Event timeline**, and **Import details**.

Imports persist in the local, ignored `storage/` directory. The most recently selected saved match loads after a refresh. An empty workspace shows an import prompt; no sample statistics are mixed into imports.

The same event content, even in a renamed file, reuses its saved match. A revised export with changed events becomes a separate snapshot so previous data remains available. Saved identity is derived from event content, not the UUID in the export filename. Without a match identifier in the XML, two exports with exactly the same event content cannot be distinguished.

## Interpretation and validation

- Use the action-coded XML rows. Player and team lanes repeat the same actions and are excluded only when a corresponding action can be verified.
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
