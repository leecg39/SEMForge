# Final implementation evidence index

This file is a stable pointer, not a second copy of mutable release results.

## Canonical v2 release evidence

- `.omo/evidence/phase5-ci/latest/summary.json` — canonical machine-readable source/completion provenance, gate status, and SHA-256 artifact index.
- `.omo/evidence/phase5-ci/latest/summary.md` — canonical human-readable view generated from that same run.

Read source and completion Git identities, timestamps, test observations, step results, and
artifact hashes only from the canonical v2 files above. A clean-source release-gate run rewrites
them together; this stable pointer intentionally repeats none of those values.

## Supplemental acceptance artifact

- `.omo/evidence/final-20260812/minio-versioning.log` — versioned object-store erasure acceptance, indexed with its SHA-256 in the canonical v2 summary.

