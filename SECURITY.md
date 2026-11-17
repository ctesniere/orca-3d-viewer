# Security Policy

## Supported Versions

Security fixes are released for the latest version of the plugin.

## Reporting a Vulnerability

If you discover a security vulnerability in 3D Viewer, please report it responsibly.

**Do NOT open a public issue.**

Instead, use **GitHub's [private vulnerability reporting](https://github.com/momokun7/orca-3d-viewer/security/advisories/new)** feature on this repository.

## Response Timeline

- Acknowledgment: best effort (typically within a few days)
- Fix release: as soon as practical

## Scope

The viewer opens files people did not write themselves, so a model is untrusted input.

- A model that makes the viewer run code, inject markup, or reach the network or file system
- A model that crashes or hangs the viewer or Orca, or exhausts memory beyond Orca's 64 MiB file cap
- The viewer writing to the open file, or asking Orca for anything beyond reading it and the notes feature below
- A model that makes the viewer, or its worker, type into a terminal that is not a running agent, or start an agent nobody chose
- The committed `editor/` bundle differing from what `build/` produces from this repository's sources

Bugs in three.js, Draco or meshoptimizer themselves are best reported upstream; tell us too if the
viewer exposes them.

## How the viewer is contained

- It runs in Orca's isolated plugin frame: its own process, a strict Content-Security-Policy, and no
  network. The manifest asks for no commands.
- It reads the document Orca sends and never edits it or saves it.
- Sending notes to an agent is the one thing that reaches beyond the file. The frame cannot call Orca's
  terminal or agent methods; it asks the plugin's worker, which asks for exactly four capabilities
  (`workspace:read`, `agent:read`, `agent:launch`, `terminal:send`). The worker imports nothing, types
  only into a terminal that `agents.list` reports as a running agent, starts only agents from a fixed
  list, and sends a note as one line with control characters removed. Names in a note come from the
  model, so they are cleaned, shortened, quoted and marked as labels, not instructions. Nothing is sent
  until the person chooses an agent in the Send menu. A compromised frame could still ask the worker to
  send text to an agent, which is why the worker's own checks, and the test that fixes the manifest's
  capabilities, matter.
- URIs inside a model never reach a loader: only `data:` and the frame's own `blob:` URLs pass.
- Text from a model is shown with `textContent`, never parsed as HTML.
- CI runs the viewer in Chromium under Orca's frame policy with hostile and fuzzed models, checks the
  committed bundle is reproducible, and scans dependencies, workflows, history and commit messages.
