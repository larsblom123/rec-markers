// Rec Markers — ExtendScript host (ES3). Loaded after json.jsx.
// Single entry point RM_dispatch({fn, args}) → JSON {ok, result | error}.

var RM_TAG = '[RecMarkers]';

function RM_dispatch(payloadStr) {
  try {
    var payload = JSON.parse(payloadStr);
    var fns = {
      ping: RM_ping,
      listClips: RM_listClips,
      placeMarkers: RM_placeMarkers,
      removeRecMarkers: RM_removeRecMarkers
    };
    var fn = fns[payload.fn];
    if (!fn) { return JSON.stringify({ ok: false, error: 'unknown fn: ' + payload.fn }); }
    var result = fn.apply(null, payload.args || []);
    return JSON.stringify({ ok: true, result: result });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e) });
  }
}

function RM_activeSeq() {
  if (!app.project || !app.project.activeSequence) {
    throw new Error('No active sequence — open the timeline you want to mark.');
  }
  return app.project.activeSequence;
}

function RM_ping() {
  var seq = app.project ? app.project.activeSequence : null;
  return { app: app.version, sequence: seq ? seq.name : null };
}

// Every clip on every video+audio track of the active sequence.
// Times in seconds. inPoint = where in the SOURCE media the clip starts
// (non-zero when the head is trimmed), start = position on the timeline.
function RM_listClips() {
  var seq = RM_activeSeq();
  var out = [];
  function walk(tracks, prefix) {
    for (var t = 0; t < tracks.numTracks; t++) {
      var track = tracks[t];
      for (var c = 0; c < track.clips.numItems; c++) {
        var clip = track.clips[c];
        out.push({
          track: prefix + (t + 1),
          isVideo: prefix === 'V',
          name: String(clip.name),
          start: clip.start.seconds,
          end: clip.end.seconds,
          inPoint: clip.inPoint.seconds,
          duration: clip.duration.seconds
        });
      }
    }
  }
  walk(seq.videoTracks, 'V');
  walk(seq.audioTracks, 'A');
  return { sequence: seq.name, seqEnd: seq.end ? Number(seq.end) / 254016000000 : null, clips: out };
}

// markers: [{sec, name, comment, color}]
function RM_placeMarkers(markers) {
  var seq = RM_activeSeq();
  var placed = 0;
  var failed = [];
  for (var i = 0; i < markers.length; i++) {
    var m = markers[i];
    try {
      var mk = seq.markers.createMarker(m.sec);
      mk.name = String(m.name || '');
      mk.comments = RM_TAG + ' ' + String(m.comment || '');
      if (typeof m.color === 'number' && mk.setColorByIndex) {
        try { mk.setColorByIndex(m.color); } catch (eColor) {}
      }
      placed++;
    } catch (e) {
      failed.push({ sec: m.sec, error: String(e) });
    }
  }
  return { placed: placed, failed: failed };
}

// Remove every marker this panel created (tagged in comments).
function RM_removeRecMarkers() {
  var seq = RM_activeSeq();
  var markers = seq.markers;
  var doomed = [];
  for (var m = markers.getFirstMarker(); m !== undefined && m !== null; m = markers.getNextMarker(m)) {
    if (String(m.comments).indexOf(RM_TAG) === 0) { doomed.push(m); }
  }
  var removed = 0;
  for (var i = 0; i < doomed.length; i++) {
    try { markers.deleteMarker(doomed[i]); removed++; } catch (e) {}
  }
  return { removed: removed, found: doomed.length };
}
