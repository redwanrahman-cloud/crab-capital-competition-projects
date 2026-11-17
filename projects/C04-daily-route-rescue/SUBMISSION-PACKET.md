# Daily Route Rescue — entry packet

Prepared 16 November 2026. **Materials prepared; public page and app-shell visibility was observed; independent authenticated judge gameplay remains unverified. Update 17 November 2026: competition entry submitted after Captain approval; Devpost displayed “Project submitted!” See SUBMISSION-RECEIPT.json.**

## Project fields

**Title:** Daily Route Rescue  
**Tagline:** Rescue three patients in order on a daily 4×4 route—without crossing your path.

**App listing:** https://developers.reddit.com/apps/daily-route-rescue  
**Test community:** https://www.reddit.com/r/daily_route_resc_dev2/  
**Interactive post:** https://www.reddit.com/r/daily_route_resc_dev2/comments/1xxs5l9/daily_route_rescue_todays_dispatch/  
**Source:** This directory in the public competition repository.

## Description

Daily Route Rescue is a small ambulance-routing puzzle built as a genuine Devvit Interactive Post. Start at the ambulance, rescue patients 1, 2 and 3 in order, then reach the hospital. Each move must be one square horizontally or vertically, and a route cannot revisit a cell.

The server validates moves, scoring and revisions. Player state is associated with the authenticated Reddit user and UTC day and persisted through Redis. Reloading keeps progress; Reset starts that day's route again. Stale page revisions are rejected rather than silently overwriting newer progress.

This bounded MVP selects among eight geometric layouts by UTC date. Layouts repeat, and each winning route has 15 steps worth 625 points. It is a completion puzzle, not a competitive shortest-route game or a unique board for every day. Limited variety is a known limitation.

Original JavaScript, HTML and CSS use the official Devvit Web SDK and CLI pinned at 0.15.3, with esbuild 0.25.12. Codex assisted implementation and review. A separate local demonstration uses explicitly synthetic identities and in-memory storage; it is distinct from real Reddit evidence.

## Actual verification

- Six local tests pass; original restricted-environment failures remain preserved.
- Real owner-account hosted play completed three rescues in 15 steps for 625 points.
- Illegal starting moves were rejected.
- Four-stop progress and Reset each survived a full reload.
- A second tab's stale revision was rejected with “Stale route; refresh and try again”; only one accepted stop remained.
- Independent source/receipt review checked route arithmetic and eight source hashes. It did not witness the hosted browser run.

Separate-user isolation, simultaneous Redis transaction races and independent authenticated judge gameplay remain unverified. Captain explicitly chose to leave two-user testing unverified. No optional demo video is supplied for this entry.

## Judge play instructions

1. Sign in to Reddit with your own account and open the interactive post. Do not use the owner's credentials.
2. Tap the ambulance, then move one cell horizontally or vertically.
3. Rescue 1 → 2 → 3, then reach H without revisiting a cell.
4. Reload partway through to check retained progress.
5. Complete the route and inspect the result; Reset and reload to verify a fresh route.

The dated November 16 solution, in zero-based row-major cells, is `3,2,1,0,4,5,6,7,11,10,9,8,12,13,14,15`. Another day's board may differ.

## Access and final-entry checks

On 16 November, the coordinating operator reported Reddit Mod Discussions showed u/reddit confirming the requested change from private to public. A refreshed clean Incognito session without owner cookies showed the exact post rendering the game app shell, community information Public, Sign Up / Log In, and “Sign in to Reddit to save a route.” The grid was unpopulated until authentication, consistent with the existing identity rule. This verifies public page and app-shell visibility, not independent authenticated gameplay. Earlier private readback and human-verification interruption remain historical; the approved helper installation was denied and the helper is absent.

Before final submission:

- Captain accepted the single-account hosted test; independent authenticated gameplay remains unverified. Devpost sign-in, Captain-approved attestations and actual submission confirmation are complete as of 17 November 2026.
- Keep access free and available throughout judging.
- Entrant personally confirms eligibility, rights, team authority where applicable, relevant contest terms and final form declarations.
- Confirm all required form links and the root play instructions, then obtain an actual submission receipt.

Game-source hashes remain unchanged from the tested build. The original observed installation was 0.0.1.2; updated root play instructions were uploaded as 0.0.2. Those are distinct checkpoints, not a claim that the later version was independently replayed.

See the [official contest rules](https://redditgameofday2026.devpost.com/rules) for authoritative requirements. Apache-2.0 applies to our original contributions; dependencies retain their terms. No organizer acceptance is implied.

