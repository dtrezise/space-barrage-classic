# Space Barrage Classic

This is the classic browser-native port of Aaron Sullivan's 2004 SDL/OpenGL game source. The original vector graphics are recreated with Canvas line drawing, and the original music and sound files are kept under `assets/`. AIFF effects from the original build also have lossless WAV copies for current browser playback.

Status: playable browser port, with fidelity fixes in progress.

Run locally with:

```sh
python3 -m http.server 5174
```

Then open `http://localhost:5174/`.

Controls match the original:

- Mouse: choose barges, place guns and shields, aim and fire.
- Space or right click: rotate shield sections.
- `M`: toggle audio.

The original license and readme are preserved as `ORIGINAL-LICENSE.txt` and `ORIGINAL-README.rtf`.
