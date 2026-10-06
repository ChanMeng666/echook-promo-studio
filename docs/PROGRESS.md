# PROGRESS — film package (implementer)

**Done:** everything in the package, through decisions D23: six masters rendered in one pass from one clean commit and measured (`out/masters/MANIFEST.json`); film-voice copy approved by the maintainer 2026-10-06; gates green, 11 mutations red.

**Next:** a person watches and listens to the six masters. After any change to `src/`: `npm run verify`, `node capture/mutate.mjs`, `npm run render`, then commit the manifest.

**Half-decided:** nothing open. Unheard: the bed, the level of the voice lines over it, and up to 5 dB of peak limiting in mastering (D19).
