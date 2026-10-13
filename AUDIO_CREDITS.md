# Audio

## Background music

**Meeting the Forest (Loop Seamless) by BonfireLightMusic**, by BonfireLightMusic (Ihor).

- Track: https://pixabay.com/music/video-games-meeting-the-forest-loop-seamless-by-bonfirelightmusic-603836/
- License: Pixabay Content License, https://pixabay.com/service/license-summary/
- Full terms: https://pixabay.com/service/terms/
- Downloaded by the project owner on 2026-10-13.
- Game asset: `public/audio/meeting-the-forest.mp3`.
- Adaptation: stereo MP3 converted to mono, 44.1 kHz, 80 kbps for mobile delivery (1,174,248 bytes). No composition edits.
- SHA-256: `0428178d11ae55051a6484fdfe5d3d85236ecc40e7738e34569b5d04257e99c8`.

This third-party recording retains its own license, independently of the game code. It is included as the game's soundtrack; do not redistribute or sell it as standalone music.

## Sound effects

Shot pops and descending elimination tones are original procedural effects in `src/audio.js`, synthesized with Web Audio. They require no external recordings or downloads.

Audio starts after a user gesture. The sound button and its adjacent volume dropdown control both music and effects, remembering mute and master volume independently. Hidden tabs pause music and suppress missed effects.
