---
title: The paper that remembers itself
emoji: 🧲
colorFrom: red
colorTo: yellow
sdk: static
pinned: false
---

# The paper that remembers itself

**Hopfield 1982, running its own equations on its own print.**

**Live: [unt1l1f1nd-paper-remembers.static.hf.space](https://unt1l1f1nd-paper-remembers.static.hf.space).**
Scribble on any page and let go.

![the cursor scribbles equations 7 and 8 off page 2556 into noise; let go and the print rebuilds itself, exactly, every pixel](media/hero-scribble.gif)

*Not a rendering: every frame is the real network at work, with all five
pages stored, and it lands back on p. 2556 with zero pixels wrong.*

The site is the five scanned pages of J. J. Hopfield's *Neural networks and
physical systems with emergent collective computational abilities* (PNAS
79:2554–2558, 1982). The paper describes a memory built out of simple on/off
switches that vote on each other. Here, every pixel of the print is one of
those switches: ink means on, blank paper means off. That makes
760 × 1032 = 784,320 switches, and all five pages are stored in one network
of them. Scribble anywhere and let go: the network runs the paper's own
recall rule and the whole page heals, picking the right page out of five by
itself, with nobody telling it which one you wrecked. The pull that drags it
back is equation [7], printed on the very page being repaired.

The paper even names what you're watching. On p. 2557, in Hopfield's own
italics: *"The phase space flow is apparently dominated by attractors which
are the nominally assigned memories, each of which dominates a substantial
region around it."* In plain words: wreck a stored page in many different
ways and every version slides back to the same ending. That sentence is one
of the stored memories: the line that named the endings sits inside one.

## What is faithful to the paper

- **Recall is the paper's rule [1], exactly.** One switch at a time, picked
  at random, each flipping to agree with what the rest of the page tells it,
  never two at once. One wrinkle, also from the paper: print is mostly blank
  with a little ink, and in the paper's plain 0/1 setup that lopsidedness
  makes a noisy page fall into its own photographic negative. Hopfield covers
  this on p. 2557 (shift each switch's tipping point, which is the same as
  counting switches as +1/−1 instead of 1/0), and the healing demo uses that
  version. The Fig. 2 experiment uses the plain 0/1 version, because that is
  what the paper's own simulations ran.
- **The energy is the paper's equation [7], recomputed live.** One number
  for how much the page disagrees with its wiring, and the recall rule can
  only make it fall; the paper proves that in [8]. The downhill trace on
  the page is a theorem, not an animation.
- **The failure modes are the model's own physics, left in.** Wipe out more
  than half a page and it heals into its own photographic negative: in this
  kind of memory, the exact opposite of every stored page is stored just as
  deeply, free of charge. Wreck a page badly enough and it can land on a
  *different* page instead. The readout names whichever ending you actually
  fell into.
- **The merge warning is demonstrated, not dodged.** P. 2557 warns that
  "memories too close to each other are confused and tend to merge," and
  five mostly white journal pages are about as alike as memories get. Store
  them with the paper's own 1982 recipe (equation [2]) and they really do
  merge; a toggle on the page switches to that recipe and lets you watch
  all five blur into one ghost.
- **Fig. 2 is re-run live.** The paper's capacity experiment: a network of
  100 switches, a growing number of random memories, the 1982 recipe; the
  network is started at each stored memory in turn and left to settle, and a
  bar chart counts how many of its pixels it failed to hold. The paper's
  limit, about 0.15 memories per switch before recall falls apart, shows up
  in your browser in milliseconds. At n = 5 the memories are, as the paper
  puts it, "almost always stable"; at n = 15 about half held with fewer than
  5 errors while "the rest evolved to states quite different."

## What is adapted, and says so

- **The five pages are written into the network with a 1985 recipe, not the
  1982 one.** The 1982 storage recipe (equation [2]) provably cannot keep
  five nearly identical pages apart; that is exactly what the merge toggle
  shows. The 1985 "projection" recipe (Personnaz–Guyon–Dreyfus) can. The
  network, the recall rule, and the energy are unchanged; the only
  difference is how the memories are written into the wiring. The page says
  this out loud in "The fine print." One small side effect: under this
  recipe each pixel's own current value gets a tiny say in its own update,
  a few parts in a million of the tally, where the 1982 paper gives it none
  (`T_ii = 0`). Kept because that is the standard form of the recipe, and it
  is what makes every stored page an exact fixed point.
- The paper's own simulations used networks of 30 and 100 switches. The demo
  uses 784,320: same equations, bigger net.
- **The wiring table is never actually built.** The recall rule wants a
  table of connection strengths between every pair of pixels; for 784,320
  pixels that is roughly 600 billion numbers, far more than a browser can
  hold. But the whole table is built from just five pages, so the same sums
  can be computed from five running scores ("how much does the screen look
  like page 1, page 2, …"), kept up to date as each pixel flips. Same
  numbers, same decisions, update by update; just never the giant table.
  (The 1985 recipe adds one extra step through a tiny 5 × 5 table of how
  much the pages overlap.)
- Damage is by cursor only: drag across the print and every pixel under the
  brush flips on a coin toss. No corrupt/erase buttons; the
  photographic-negative ending is reachable by scribbling out more than half
  of a page.
- The order of updates is slightly tidied. In the paper, each switch
  re-checks itself at random moments, independently; one might go twice
  before its neighbour goes once. The demo shuffles all the pixels and
  visits each once per sweep, reshuffling every sweep. The endings are
  identical and the energy still only falls; the sweep version just makes
  "finished" easy to detect (one full sweep with nothing left to flip).
- On load, a short narrated intro scribbles the first page and heals it
  back, so the whole idea lands in seconds before anyone scrolls. Skippable;
  suppressed under `?debug`.
- Each page carries a plain-English reading note beside it, so scrolling the
  paper doubles as a guided read of it.

## Prior art

Interactive Hopfield demos are a genre: cleaning noise off letters and
photos, network visualizers,
[hopfield-layers](https://ml-jku.github.io/hopfield-layers/) for the
attention connection. We found no prior instance of the self-referential
version: the paper's own scanned print as the stored memories, repaired by
the equation printed on it. If you know one, open an issue.

## The author

John J. Hopfield (b. 1933), condensed-matter physicist turned biophysicist
(Bell Labs, Princeton, Caltech). This paper, five pages contributed to PNAS
by himself as Academy members could, founded attractor neural networks, and
in 2024 won him the Nobel Prize in Physics, shared with Geoffrey Hinton,
"for foundational discoveries and inventions that enable machine learning
with artificial neural networks." Forty-two years between the print and the
prize.

## Files

- `index.html`: the five pages, the reading notes, the instrument rail, the
  Fig. 2 bench
- `hopfield.js`: the 1982 network (rules [1] and [2], energy [7], both
  storage recipes, and the five-running-scores trick above)
- `app.js`: turn the print into on/off patterns, scribble, heal animation,
  verdicts, energy instrument, intro narration, Fig. 2 replication
- `media/page-*.png`: the scan, 150 dpi renders (the source PDF itself is
  deliberately not in the repo; see Provenance & rights)
- `media/og-card.png`: the link-preview image, a real frame of the network
  mid-scribble
- `?debug` in the URL skips the intro

## Dev

    python3 -m http.server 8080     # then http://localhost:8080

Regenerate page renders (needs your own copy of the scan, not shipped):
`pdftoppm -png -r 150 hopfield1982.pdf media/page`

## Provenance & rights

The paper is © 1982 National Academy of Sciences. **The original is free to
read from the publisher, [pnas.org](https://www.pnas.org/doi/10.1073/pnas.79.8.2554),
and that is where it should be read.**

Only reduced-resolution page renders ship here, for non-commercial,
educational use, with the original copyright notice left intact on the print.
They are the substrate this demonstration runs on, not a reading copy. The
source PDF is not distributed: it is not tracked in the repository, nor
anywhere in its git history.

This is an independent tribute. It is not published, endorsed by, or connected
with John Hopfield, PNAS, or the National Academy of Sciences. Any rights
holder who would prefer the page images taken down can open an issue here and
they will be removed.

2020 footnote in the margin: Ramsauer et al., *Hopfield Networks is All You
Need* (arXiv:2008.02217): the modern continuous Hopfield update is exactly
transformer attention.
