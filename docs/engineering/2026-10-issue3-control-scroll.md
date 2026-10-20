# Issue 3 — Control Panel sidebar / content scrolling (result)

## Root cause (VERIFIED — reproduced, then fixed, on the real components)
| | School shell (`MainLayout`) | Control shell (`src/app/control/layout.tsx`) |
|---|---|---|
| What scrolls | `<main class="overflow-y-auto">` inside an `h-screen` frame — the document never scrolls | The **document** |
| How the nav stays | It never moves; only `main` scrolls | `position: sticky` on the header (`top-0`) and the sidebar (`top-14`) |

`globals.css` set `html, body { overflow-x: hidden }`. With `hidden` on both, `body` becomes a scroll container (its `overflow-y` computes to `auto`). `body` never scrolls itself (the document does), and a sticky element sticks to its nearest scroll container. So **every sticky element in a document-scrolling page scrolled away with the content**: the Control header, the Control sidebar, the docs' in-page nav and the docs explorer tree.

A second, smaller cause: the sidebar was `min-h-screen`, taller than the space below the header, so its last links could sit below the fold.

The school shell is unaffected because it never depended on sticky.

## Fix
- `globals.css`: inside `@supports (overflow-x: clip)`, `html, body { overflow-x: clip }`. `clip` clips horizontal overflow exactly like `hidden` but does not create a scroll container. Browsers without `clip` keep the `hidden` fallback (old behaviour). The document still scrolls, so printing and window scrolling are unchanged.
- Control layout: one variable, `--ctl-header-h: 3.5rem`, drives:
  - the header height;
  - the sidebar's `top` and its exact height, `calc(100dvh - header)`, replacing `min-h-screen`;
  - the sidebar's own scroll (`overscroll-contain`);
  - `scroll-padding-top`, so anchor jumps land below the header.
- Docs nav (`ControlDoc`), explorer tree and the storage selection bar are offset from the same variable. Previously the storage bar was `top-0`, which would now slide under the sticky header.
- The layouts were not merged: the Control shell keeps document scrolling (printing, window scroll), and the school shell keeps its frame.

## Verification (`.ops-work/scroll-check.ts`)
The check renders the real `ControlLayout` around real docs pages, and the real `MainLayout`, with the compiled app CSS in headless Chrome. "Stays" means: the document (or `main`) actually scrolled, and the nav's top is unchanged and on screen.

| Gate item | Before | After |
|---|---|---|
| 1 Short page (`/control/docs`) 1440/1280/1024 | header and sidebar scrolled away | stay |
| 2 Long page (Conventions to avoid) 1440/1280/1024 | scrolled away | stay |
| 3 Bottom and back to top | — | sidebar top = 56 px at both |
| 4 Navigation between routes | — | NOT VERIFIED in a live router (harness stubs it); sticky lives in the persistent layout, so route changes swap only `children` |
| 5 Menus / drawer | — | mobile "More" drawer (z-50) covers the header (z-40); all 22 links reachable |
| 6 Window resize on a live page | — | 1440×900 → 1100×600 → 800×600 → 1440×500: sidebar height = viewport − 56 each time; hidden below `lg` |
| 7 Phone 390×844 | header scrolled away | header stays; no horizontal overflow |
| 8 Keyboard | — | Tab from the top reaches sidebar links; the last link scrolls into view inside the sidebar |
| 9 School regression | nav stays (main scrolls) | unchanged |
| 10 Tables / code blocks | — | no horizontal page overflow on the docs pages with tables and `<pre>` |
| Explorer tree (Issue 2 G14) | scrolled away | stays |

Remaining NOT VERIFIED: a signed-in session in the real running app (no Control credentials in this environment).
