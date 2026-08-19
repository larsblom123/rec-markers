# Rec Markers — Premiere Pro panel

Turn a multi-recording hotkey-timestamp log into sequence markers, even though the
recorder's timer resets to 0:00:00 for every recording.

## Install (Windows PC)

1. Copy this whole `RecMarkers` folder to the PC.
2. In PowerShell:
   ```powershell
   cd RecMarkers\install
   powershell -ExecutionPolicy Bypass -File setup.ps1
   ```
3. Restart Premiere → **Window > Extensions > Rec Markers**.

Mac install: copy `panel/` to
`~/Library/Application Support/Adobe/CEP/extensions/com.larry.recmarkers`
and run `defaults write com.adobe.CSXS.12 PlayerDebugMode 1; killall cfprefsd`
(repeat for CSXS.9–11 on older Premiere versions).

## Use

1. **Paste or load** the timestamp log → **Parse log**. Each
   `EVENT:START RECORDING @ <date time>` becomes a recording named by that exact
   date+time; duplicate log lines and duplicate offsets are removed; the recording
   length is taken from START→STOP.
2. **Order the recordings** with ▲▼ to match how the clips sit on your timeline.
   Untick any recording you don't want (empty ones start unticked).
3. Pick a mode and **Place markers on timeline** (the sequence must be open/active):
   - **Match clips by name** (default, recommended): finds each clip on the timeline
     whose name contains the recording's date+time (works with OBS-style
     `2026-08-17 16-55-49` names — punctuation is ignored). Markers land on the
     right clip even with gaps, reordering, or trimmed heads/cuts.
   - **Sequential**: assumes the included recordings are back-to-back from the
     start offset; offsets stack (two 1-hour recordings → markers up to 2 hours).
4. Markers are colour-coded per recording; the marker name is the record time and
   the comment carries the recording + wall-clock time.
   **Remove placed markers** deletes only markers this panel created.
5. **Cut around timestamps** (step 4): razors every video+audio track at
   `timestamp − pre` and `timestamp + post`. With **Combine nearby timestamps**
   on, timestamps closer than the proximity merge into one segment — the pre-cut
   is measured from the earliest timestamp, the post-cut after the last one.
   Overlapping segments always merge, so you never get sliver cuts. The panel
   only cuts; select the junk between segments afterwards and ripple delete.

## Debugging

Open the panel in Premiere, then browse to `http://localhost:8098` in Chrome for
DevTools against the panel.
