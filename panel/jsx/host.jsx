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
      removeRecMarkers: RM_removeRecMarkers,
      razorAll: RM_razorAll
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

// seconds -> timecode string for QE razor. Non-drop "HH:MM:SS:FF" for integer
// frame rates; drop-frame "HH:MM:SS;FF" for 29.97/59.94 families.
function RM_secToTimecode(sec, fps) {
  var nominal = Math.round(fps);
  var drop = Math.abs(fps - nominal) > 0.001;   // 29.97 / 59.94 etc.
  var totalFrames = Math.round(sec * fps);
  var ff, ss, mm, hh;
  if (!drop) {
    ff = totalFrames % nominal;
    var totalSec = Math.floor(totalFrames / nominal);
    ss = totalSec % 60; mm = Math.floor(totalSec / 60) % 60; hh = Math.floor(totalSec / 3600);
    return RM_pad2(hh) + ':' + RM_pad2(mm) + ':' + RM_pad2(ss) + ':' + RM_pad2(ff);
  }
  // SMPTE drop-frame: drop (2 per 30fps) frame numbers every minute except every 10th
  var dropPerMin = Math.round(nominal / 15);        // 2 @30, 4 @60
  var framesPer10Min = Math.round(fps * 600);
  var framesPerMin = nominal * 60 - dropPerMin;
  var d = Math.floor(totalFrames / framesPer10Min);
  var mRem = totalFrames % framesPer10Min;
  if (mRem >= nominal * 60) {
    totalFrames += dropPerMin * 9 * d + dropPerMin * Math.floor((mRem - nominal * 60) / framesPerMin) + dropPerMin;
  } else {
    totalFrames += dropPerMin * 9 * d;
  }
  ff = totalFrames % nominal;
  ss = Math.floor(totalFrames / nominal) % 60;
  mm = Math.floor(totalFrames / (nominal * 60)) % 60;
  hh = Math.floor(totalFrames / (nominal * 3600));
  return RM_pad2(hh) + ':' + RM_pad2(mm) + ':' + RM_pad2(ss) + ';' + RM_pad2(ff);
}
function RM_pad2(n) { return (n < 10 ? '0' : '') + n; }

// Razor every video + audio track at each of the given timeline seconds.
// QE DOM — undocumented; every call guarded.
function RM_razorAll(cuts) {
  var seq = RM_activeSeq();
  app.enableQE();
  var qeSeq = qe.project.getActiveSequence();
  if (!qeSeq) { throw new Error('QE: no active sequence'); }
  var fps = 254016000000 / Number(seq.timebase);
  var ok = 0, failed = [];
  for (var i = 0; i < cuts.length; i++) {
    var tc = RM_secToTimecode(cuts[i], fps);
    var any = false, lastErr = null;
    for (var v = 0; v < seq.videoTracks.numTracks; v++) {
      try {
        var vt = qeSeq.getVideoTrackAt(v);
        if (vt && vt.razor) { vt.razor(tc); any = true; }
      } catch (e) { lastErr = e; }
    }
    for (var a = 0; a < seq.audioTracks.numTracks; a++) {
      try {
        var at = qeSeq.getAudioTrackAt(a);
        if (at && at.razor) { at.razor(tc); any = true; }
      } catch (e2) { lastErr = e2; }
    }
    if (any) { ok++; }
    else { failed.push({ sec: cuts[i], error: String(lastErr || 'razor unavailable') }); }
  }
  return { cuts: ok, failed: failed, fps: fps };
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
