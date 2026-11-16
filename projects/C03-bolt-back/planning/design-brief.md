---
status: draft
---

# Design brief: Bolt Back

**Offline preparation draft.** This is an agent-proposed concept, not a completed learner interview or Captain-approved design. The official plan-lens template was used under its MIT license; its setup gate cannot pass without a genuine project, CLAD and Lens Studio MCP. All design choices below are proposed defaults. No Lens has been built.

## The one spatial moment
A learner studies where three mock fasteners sit on a small virtual practice panel, moves them into a tray, and returns them to their original sockets. The correct socket lights up only after the right part is released nearby. The panel stays in the room as the learner moves their viewpoint. (proposed default)

## Why it belongs on glasses
- Uses: draws in the world; keeps the learner's gaze beside the parts being arranged. No camera recognition is claimed. (proposed default)
- Why it's better than the phone or laptop version: the panel, tray and socket positions share a full-size spatial frame that the learner can inspect from different viewpoints without a separate reference screen. Whether this provides a learning advantage remains untested. (proposed default)

## Product or overlay
- Type: product; the entire practice prop is virtual. (proposed default)
- What the real version would sense: nothing about real fasteners or equipment. This is not a repair guide. (proposed default)
- Stand-in for the preview: a virtual panel and tray are the actual practice content; no simulated recognition or hidden camera input. (proposed default)

## Where things live
- Where the user is looking during the main task: down slightly toward the virtual work surface. (proposed default)
- Panel: room-fixed from its initial placement, approximately 75 cm ahead and 20 cm below initial eye level; 24 cm wide by 16 cm high, tilted toward the viewer. Use the genuine template's coordinate convention when building; these are physical design dimensions, not vendor scene-file fields. (proposed default)
- Tray: next to the panel, with total panel-plus-tray footprint no wider than 36 cm. The scene must be checked in stereo preview before any fit/comfort claim. (proposed default)
- Three mock fasteners: 5 cm visible interaction targets marked 1, 2 and 3 as well as distinct colors. Socket spacing is 8 cm, so targets do not overlap. Numbers avoid color-only matching. (proposed default)
- Controls: one large phase button and one Reset button beside the work surface, at least 6 by 4 cm each. No face-fixed dashboard. (proposed default)

## Hands and input
- Study: inspect all three seated parts, then pinch the large Practice button to move the parts to numbered tray positions and hide the socket hints. No forced timer. (proposed default)
- Return a part: use a standard SIK grab/drag/release interaction, driven by the preview mouse. On release within 4 cm of its matching socket, snap and lock it. A wrong socket leaves the part unseated and shows a brief local hint; it never advances progress. (proposed default)
- Targets are big and highlight when aimed at.
- Voice (if any) and the button that does the same job: no voice. All progress and reset actions use standard buttons. (proposed default)

## When things show
- Socket study labels: visible during Study; hidden during Practice except for a short response at the socket just tested. (proposed default)
- Progress: three small indicators on the panel frame, updating only after a correct placement. (proposed default)
- Completion: a short "3 returned" marker beside the panel, with Reset still available. (proposed default)
- If something needs attention out of view: no timed or off-screen obligations; the work stays within the initial forward workspace. (proposed default)

## Done criteria
Each one can be checked in Lens Studio's preview. **All are PENDING, not passed.**
1. Study shows exactly three numbered virtual parts at their sockets. Practice moves them to the tray, hides study hints and sets progress to zero.
2. Standard preview grab/release of a part at its matching socket snaps it into place and increments progress once.
3. Releasing a part at either wrong socket or outside the 4 cm acceptance region does not increment progress, lock the wrong part or complete the exercise.
4. After all three correct placements, progress is three and the completion marker appears; repeated release cannot add a fourth placement. Reset returns the original Study state from every phase.
5. Moving the preview viewpoint leaves the panel in the room. At the designated start viewpoint, every required target and label is visible and selectable; actual glasses comfort remains unproven.

## Out of scope
- Real equipment, disassembly instructions, part recognition, camera capture, safety-critical training, AI inference, voice, internet services, accounts and persistent anchors.
- Custom/two-hand gestures, multi-user sessions, real-device comfort or learning-effectiveness claims.
- Competition submission, publication or installation during this preparation.

## Risks and open questions
- Captain/learner has not selected or approved this concept. Confirm audience, the value of spatial rehearsal, interaction dimensions and wrong-placement feedback in the genuine plan-lens interview.
- Standard grab/drop semantics, snap distance, reachability, visibility and stereo fit require an actual CLAD build and preview. None has been measured.
- Lens Studio 5.23.2 is an organizer-recommended fallback for a CLAD sign-in problem, not proof that every current plugin/package works in it. Check the real environment without changing security settings or inventing MCP configuration.
- The workshop-style prop is abstract. It must never suggest that a real mechanical repair has been validated.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources

Template attribution: Copyright (c) 2026 Devpost, MIT License. Full notice is retained at `references/learn-specs/LICENSE`. The After the build text is retained from the official template; its future submission actions are **not authorized or performed** in this preparation. Current competition rules also allow appropriately shared private repositories; no sharing has been changed here.
