# PIXEL WORLD 3 rollout: paused

Paused at the owner's request on 2026-11-11, partway through drawing every person and building in
2D (`docs/PIXELWORLD3.md`). Nothing in this folder changes the game. The stage work below is not
merged: the code on this branch is still the foundations (z1 flats, figures behind `castlook=d`).

`pw3-branches.bundle` holds all 14 unfinished branches. It was test-restored into a clean clone and
every tip matched. Every branch type-checks (`tsc --noEmit`, 0 errors). Full tests and builds were
not run on the paused branches, and three of them end in a commit marked WIP.

## Where each group stands

A round is one drawing pass by a lead followed by an independent judge. `open-findings.md` has each
group's last report, what it did not do, and the judges' high and medium findings with fixes.

| Group | Branch | Covers | State at the pause |
| --- | --- | --- | --- |
| p0 | `pw3/people` | shared figure code | Done, 2 rounds. Round 2 fixes were not re-judged. Every people branch starts from it. |
| civ | `pw3/g-civ` | casual, office, patient, nurse, doctor zombies | Drawn, not judged yet. |
| uni | `pw3/g-uni` | uniformed zombies (cop, soldier, biker and others) | Drawn, not judged yet. |
| act | `pw3/g-act` | all civilian looks and acts | Drawn. Judge was stopped mid-run. |
| crawl | `pw3/g-crawl` | crawler family | Drawn, not judged yet. |
| run | `pw3/g-run` | runners and other fast movers | First drawing stopped before its report. Work is committed. |
| bloat | `pw3/g-bloat` | spitters, bloaters | First drawing stopped before its report. Ends in WIP commit 7483e37. |
| heavy | `pw3/g-heavy` | brutes, riot cop, human bosses | First drawing stopped before its report. Ends in WIP commit 3c28dfd. |
| bz2t | `pw3/g-bz2t` | z2 exterior, title city | Done, 2 rounds, last judge at bar. 3 mediums open. |
| bz1 | `pw3/g-bz1` | the rest of z1 | Judged not at bar (4 high, 4 medium). Round 2 stopped midway. Ends in WIP commit 8711d24. |
| bz3 | `pw3/g-bz3` | every z3 structure | Judged not at bar (3 high, 5 medium). Round 2 not started. |
| bd1 | `pw3/g-bd1` | d1 gate, palisade, kiosk, tower, landing | Judged not at bar (1 high, 4 medium). Round 2 stopped midway. |
| bd3 | `pw3/g-bd3` | d3 visitor centre, kiosk, pylons, trestle | Judged not at bar (2 high, 6 medium). Round 2 stopped midway. |

`pw3/flats` (b0) is the shared flats code. It is done and every building branch starts from it.

## Restoring

From a checkout of `claude/arcade-rail-shooter` (the bundle needs commit f4e8f85):

```sh
git fetch docs/pixelworld3/paused/pw3-branches.bundle 'refs/heads/*:refs/heads/*'
git worktree add ../wt/people pw3/people
git worktree add ../wt/flats pw3/flats
for k in civ uni run bloat act crawl heavy bz1 bz2t bz3 bd1 bd3; do git worktree add ../wt/g-$k pw3/g-$k; done
```

Each worktree needs its own `npm ci`. The rollout helpers expect these copies:

| In this folder | Goes to |
| --- | --- |
| `heavy.sh` | `/tmp/pw2/heavy.sh` |
| `pw-shim.sh` | the session scratchpad (its path is written into the workflow prompts: update it) |
| `inventory.md`, `people-round3.json`, `flats-round3.json` | `/tmp/pw3/rollout/` |
| `rollout-workflow.js.txt` | any `.js` path, run with the Workflow tool, `args: {groups: [...]}` |

The workflow's group table holds worktrees at `/home/user/wt/`, ports 5821 to 5845. The visual
reference is commit 4b94112 (the look before PIXEL WORLD 3), checked out and served on port 5791.

## What is left, in order

1. People: finish `run`, `bloat`, `heavy`; judge and refine `civ`, `uni`, `act`, `crawl`; merge all into `pw3/people`.
2. Buildings: a further round on `bz1`, `bz3`, `bd1`, `bd3`; merge all into `pw3/flats`.
3. Title-screen horde (`MENU_HORDE`, `castMenu.ts`), then set `DEFAULT_CAST_LOOK` to `'d'` and retire `drawnfig`.
4. Whole-game sweep (people, buildings, aim, performance, memory, load time) and fixes.
5. Merge to `claude/arcade-rail-shooter`, update `scripts/single-size.json`, docs and the saved-versions table, keep a saved copy of the current look.
6. Verify: `tsc`, full vitest, `npm run build`, `npm run build:artifact`, phone e2e. Republish the main artifact.

Never checked on any of this work: a real iPhone or WebKit. Gameplay and difficulty must not change.

## Open question for the owner

Should the parked cars (still 3D models, now the most blocky thing in frame) be drawn too? Unanswered, so left alone.
