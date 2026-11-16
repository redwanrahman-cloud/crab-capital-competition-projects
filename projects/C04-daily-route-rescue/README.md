# Daily Route Rescue · C04

A daily 4×4 ambulance-routing game with server-validated moves, ordered rescues, deterministic UTC boards and per-user Redis state. Source and local tests are included.

## Actual hosted verification — 16 November 2026

The official Devvit CLI authenticated the owner, uploaded version 0.0.1 and installed playtest 0.0.1.2 in a provider-created **private** test community. A real interactive post rendered and accepted actual browser input:

- Wrong starting cell rejected: “Start at the ambulance.”
- Four valid stops survived a full reload: one rescue, three steps.
- All 16 stops completed: three rescues, 15 steps, **625 points**.
- Reset cleared the route; another full reload retained the empty state.

The original automatic installation warning is preserved privately. Subsequent playtest installation succeeded. The local watcher was stopped; the private app remains installed. Earlier restricted loopback-test failures are retained rather than rewritten. No organizer approval, independent authenticated judge gameplay or competition submission is claimed.

This is single-account hosted gameplay evidence. A further actual two-tab check rejected an outdated revision with “Stale route; refresh and try again” and retained exactly one accepted stop. Separate-user isolation, simultaneous Redis transaction races, raw Redis inspection and independent browser verification remain untested. Successful state changes and reload persistence support hosted backend operation; no raw network trace was captured. Credentials and tokens are excluded.

## Public access

On 16 November, the coordinating operator reported Reddit Mod Discussions showed u/reddit confirming the requested change from private to public. A refreshed clean Incognito session without owner cookies showed the exact post rendering the game app shell, community information Public, Sign Up / Log In, and “Sign in to Reddit to save a route.” The grid was unpopulated until authentication, consistent with the existing identity rule. This verifies public page and app-shell visibility, not independent authenticated gameplay. Earlier private readback and human-verification interruption remain historical; the approved helper installation was denied and the helper is absent.

Open the [interactive post](https://www.reddit.com/r/daily_route_resc_dev2/comments/1xxs5l9/daily_route_rescue_todays_dispatch/) and sign in with your own Reddit account to play and save a route.

## Run locally

Use Node 24.18.0+ for the current provider workflow; the verified local runtime was 26.13.0. Dependencies pin official `@devvit/web` and `devvit` at 0.15.3 and esbuild at 0.25.12.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm start
```

Open http://127.0.0.1:3404/. Local mode uses an explicitly synthetic in-memory adapter. It is not Reddit or persistent across process restarts. Six tests pass, including two isolated local HTTP sessions; those local sessions do not prove separate Reddit-account isolation.

For a hosted copy, use your own authorized Reddit developer account and owned app name. Review the official provider permissions and terms before CLI login, upload or playtest. Those commands change provider state and can create a private test community. No private test-community identity is hardcoded in this source package.

## Gameplay and limits

Start at the ambulance. Rescue 1 → 2 → 3, then reach the hospital. Move horizontally or vertically without revisiting a cell. Completed score is `1000 − 25 × steps`; reset retains the dated board. Identity, date, route validation and score are server-owned. Redis WATCH/read/MULTI/SET/EXEC has fail-closed acknowledgement and eight-day expiration.

Version 1 has eight geometric variants of a solvable serpentine layout. Every successful route has 15 steps and scores 625; this is completion practice, not competitive shortest-route ranking or a unique board for every calendar day. No global leaderboard, rewards or monetization are implemented.

Original contributions are Apache-2.0; see the repository root LICENSE and THIRD-PARTY-NOTICES.md. Dependencies retain their own terms. Platform approval, final eligibility and submission materials remain separate gates.
