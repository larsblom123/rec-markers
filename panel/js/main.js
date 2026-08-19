// Rec Markers — panel logic: parse the recorder log, let the user order the
// recordings, then place sequence markers via the jsx host.

(function () {
  'use strict';

  var IN_PREMIERE = typeof window.__adobe_cep__ !== 'undefined';
  var recordings = [];   // [{name, startMs, stopMs, durationSec, stamps:[{offsetSec, wall}], include, colorIdx}]
  var order = [];        // indices into recordings, display order

  // ---------- tiny DOM helpers ----------
  function $(id) { return document.getElementById(id); }
  function setStatus(msg, isErr) {
    var el = $('status');
    el.textContent = msg;
    el.className = isErr ? 'err' : '';
  }
  function uiLog(msg, warn) {
    var line = document.createElement('div');
    if (warn) line.className = 'warn';
    line.textContent = msg;
    $('log').appendChild(line);
    $('log').scrollTop = 1e9;
  }
  function clearLog() { $('log').innerHTML = ''; }

  // ---------- jsx bridge (LarryEdit pattern) ----------
  function evalJsx(script, cb) { window.__adobe_cep__.evalScript(script, cb); }
  function loadHost(cb) {
    var p = window.__adobe_cep__.getSystemPath('extension').replace(/\\/g, '/');
    var script = 'try { $.evalFile("' + p + '/jsx/json.jsx"); $.evalFile("' + p +
                 '/jsx/host.jsx"); "loaded"; } catch (e) { "loadfail: " + e; }';
    evalJsx(script, function (res) {
      cb(res === 'loaded' ? null : new Error(String(res)));
    });
  }
  function callJsx(fn, args, cb) {
    if (!IN_PREMIERE) { return cb(new Error('Not running inside Premiere.')); }
    var payload = JSON.stringify({ fn: fn, args: args || [] });
    var script = 'RM_dispatch(' + JSON.stringify(payload) + ')';
    evalJsx(script, function (res) {
      if (res === 'EvalScript error.') {
        loadHost(function (loadErr) {
          if (loadErr) { return cb(new Error('jsx not loadable: ' + loadErr.message)); }
          evalJsx(script, function (res2) {
            if (res2 === 'EvalScript error.') { return cb(new Error('EvalScript error (see host.jsx)')); }
            finish(res2);
          });
        });
        return;
      }
      finish(res);
    });
    function finish(res) {
      var obj;
      try { obj = JSON.parse(res); }
      catch (e) { return cb(new Error('bad jsx response: ' + String(res).slice(0, 200))); }
      if (!obj.ok) { return cb(new Error(obj.error || 'jsx error')); }
      cb(null, obj.result);
    }
  }

  // ---------- log parsing ----------
  function parseDt(s) {           // "2026-08-17 16:55:49" -> ms epoch
    return new Date(s.replace(' ', 'T')).getTime();
  }
  function hmsToSec(h, m, s) { return (+h) * 3600 + (+m) * 60 + (+s); }
  function secToHms(sec) {
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var RE_START  = /^EVENT:START RECORDING\s*@\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
  var RE_STOP   = /^EVENT:STOP RECORDING\s*@\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
  var RE_HOTKEY = /^HOTKEY:\S*\s*@\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
  var RE_OFFSET = /^(\d+):(\d{2}):(\d{2})\s+Record Time Marker/;

  function parseLog(text) {
    var lines = text.split(/\r?\n/);
    var recs = [];
    var cur = null;
    var pendingWall = null;   // wallclock of the last HOTKEY line, awaiting its offset line

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var m = RE_START.exec(line);
      if (m) {
        pendingWall = null;
        // the log writes every event twice — ignore a repeated START of the same recording
        if (cur && cur.name === m[1] && cur.stopMs === null) continue;
        cur = { name: m[1], startMs: parseDt(m[1]), stopMs: null, durationSec: null, stamps: [] };
        recs.push(cur);
        continue;
      }

      m = RE_STOP.exec(line);
      if (m) {
        pendingWall = null;
        if (cur && cur.stopMs === null) {
          cur.stopMs = parseDt(m[1]);
          cur.durationSec = (cur.stopMs - cur.startMs) / 1000;
        }
        continue;
      }

      m = RE_HOTKEY.exec(line);
      if (m) { pendingWall = m[1]; continue; }

      m = RE_OFFSET.exec(line);
      if (m && pendingWall !== null) {
        var off = hmsToSec(m[1], m[2], m[3]);
        if (cur) {
          var dup = false;
          for (var d = 0; d < cur.stamps.length; d++) {
            if (cur.stamps[d].offsetSec === off) { dup = true; break; }
          }
          if (!dup) cur.stamps.push({ offsetSec: off, wall: pendingWall });
        }
        pendingWall = null;
        continue;
      }
      // "0:00:00 Record Time Marker" after START/STOP: no pendingWall -> ignored
    }

    for (var r = 0; r < recs.length; r++) {
      recs[r].stamps.sort(function (a, b) { return a.offsetSec - b.offsetSec; });
      recs[r].colorIdx = r % 8;
      recs[r].include = recs[r].stamps.length > 0;
    }
    return recs;
  }

  // ---------- recordings UI ----------
  var DOT_COLORS = ['#4caf50', '#e05252', '#b76ee0', '#e0a94c', '#e6e04e',
                    '#eaeaea', '#5bc8e0', '#5b78e0'];

  function renderRecs() {
    var host = $('recList');
    host.innerHTML = '';
    if (!order.length) {
      host.innerHTML = '<div class="hint">Nothing parsed yet.</div>';
      return;
    }
    order.forEach(function (recIdx, pos) {
      var rec = recordings[recIdx];
      var row = document.createElement('div');
      row.className = 'rec' + (rec.include ? '' : ' off');

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = rec.include;
      cb.onchange = function () { rec.include = cb.checked; renderRecs(); };

      var idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(pos + 1);

      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = DOT_COLORS[rec.colorIdx];

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = rec.name;

      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = rec.stamps.length + ' ts · ' +
        (rec.durationSec !== null ? secToHms(rec.durationSec) : '?');

      var up = document.createElement('button');
      up.className = 'small';
      up.textContent = '▲';
      up.disabled = pos === 0;
      up.onclick = function () { swap(pos, pos - 1); };

      var down = document.createElement('button');
      down.className = 'small';
      down.textContent = '▼';
      down.disabled = pos === order.length - 1;
      down.onclick = function () { swap(pos, pos + 1); };

      row.appendChild(cb); row.appendChild(idx); row.appendChild(dot);
      row.appendChild(name); row.appendChild(meta);
      row.appendChild(up); row.appendChild(down);
      host.appendChild(row);
    });
  }
  function swap(a, b) {
    var t = order[a]; order[a] = order[b]; order[b] = t;
    renderRecs();
  }

  // ---------- marker building ----------
  function digits(s) { return String(s).replace(/\D+/g, ''); }

  function includedRecs() {
    var out = [];
    order.forEach(function (i) { if (recordings[i].include) out.push(recordings[i]); });
    return out;
  }

  function buildSequential() {
    var startOffset = parseFloat($('startOffset').value) || 0;
    var cursor = startOffset;
    var markers = [];
    includedRecs().forEach(function (rec) {
      var dur = rec.durationSec;
      if (dur === null) {
        dur = rec.stamps.length ? rec.stamps[rec.stamps.length - 1].offsetSec + 1 : 0;
        uiLog('No STOP found for "' + rec.name + '" — assuming length ' + secToHms(dur), true);
      }
      rec.stamps.forEach(function (st) {
        markers.push(makeMarker(rec, st, cursor + st.offsetSec));
      });
      cursor += dur;
    });
    return markers;
  }

  function buildMatched(clips) {
    var markers = [];
    includedRecs().forEach(function (rec) {
      var key = digits(rec.name);          // "20260817165549"
      var matches = clips.filter(function (c) { return digits(c.name).indexOf(key) !== -1; });
      if (!matches.length) {
        uiLog('No clip on the timeline matches "' + rec.name + '" — skipped ' +
              rec.stamps.length + ' timestamps', true);
        return;
      }
      // prefer video clips, keep timeline order
      matches.sort(function (a, b) {
        return (a.isVideo === b.isVideo) ? a.start - b.start : (a.isVideo ? -1 : 1);
      });
      rec.stamps.forEach(function (st) {
        // find the piece of the clip whose source range contains this offset
        var hit = null;
        for (var i = 0; i < matches.length; i++) {
          var c = matches[i];
          if (st.offsetSec >= c.inPoint - 0.5 && st.offsetSec <= c.inPoint + c.duration + 0.5) {
            hit = c; break;
          }
        }
        if (!hit) {
          uiLog('"' + rec.name + '" @ ' + secToHms(st.offsetSec) +
                ' falls outside the trimmed clip — skipped', true);
          return;
        }
        markers.push(makeMarker(rec, st, hit.start + (st.offsetSec - hit.inPoint)));
      });
    });
    return markers;
  }

  function makeMarker(rec, st, sec) {
    return {
      sec: Math.max(0, sec),
      name: secToHms(st.offsetSec),
      comment: 'rec ' + rec.name + ' @ ' + secToHms(st.offsetSec) +
               (st.wall ? ' (clock ' + st.wall.split(' ')[1] + ')' : ''),
      color: rec.colorIdx
    };
  }

  function placeMarkers(markers) {
    if (!markers.length) { setStatus('Nothing to place.', true); return; }
    markers.sort(function (a, b) { return a.sec - b.sec; });
    setStatus('Placing ' + markers.length + ' markers…');
    callJsx('placeMarkers', [markers], function (err, res) {
      if (err) { setStatus(err.message, true); return; }
      setStatus('Done — ' + res.placed + ' markers placed.' +
        (res.failed.length ? ' ' + res.failed.length + ' failed.' : ''));
      res.failed.forEach(function (f) {
        uiLog('Failed @ ' + secToHms(f.sec) + ': ' + f.error, true);
      });
    });
  }

  // ---------- wiring ----------
  $('btnFile').onclick = function () { $('filePick').click(); };
  $('filePick').onchange = function () {
    var f = $('filePick').files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      $('logText').value = reader.result;
      setStatus('Loaded ' + f.name + ' — hit Parse log.');
    };
    reader.readAsText(f);
  };

  $('btnParse').onclick = function () {
    clearLog();
    recordings = parseLog($('logText').value);
    order = recordings.map(function (_, i) { return i; });
    renderRecs();
    var total = recordings.reduce(function (n, r) { return n + r.stamps.length; }, 0);
    if (!recordings.length) {
      setStatus('No recordings found — check the log format.', true);
    } else {
      setStatus(recordings.length + ' recordings, ' + total + ' timestamps.');
      recordings.forEach(function (r) {
        if (!r.stamps.length) uiLog('"' + r.name + '" has no timestamps — unticked.', true);
      });
    }
  };

  Array.prototype.forEach.call(document.querySelectorAll('input[name=mode]'), function (radio) {
    radio.onchange = function () {
      $('seqOpts').style.display =
        document.querySelector('input[name=mode]:checked').value === 'seq' ? '' : 'none';
    };
  });

  $('btnPlace').onclick = function () {
    if (!recordings.length) { setStatus('Parse a log first.', true); return; }
    clearLog();
    var mode = document.querySelector('input[name=mode]:checked').value;
    if (mode === 'seq') {
      placeMarkers(buildSequential());
    } else {
      setStatus('Reading timeline clips…');
      callJsx('listClips', [], function (err, res) {
        if (err) { setStatus(err.message, true); return; }
        uiLog('Sequence "' + res.sequence + '": ' + res.clips.length + ' clips found.');
        placeMarkers(buildMatched(res.clips));
      });
    }
  };

  $('btnRemove').onclick = function () {
    callJsx('removeRecMarkers', [], function (err, res) {
      if (err) { setStatus(err.message, true); return; }
      setStatus('Removed ' + res.removed + ' Rec Markers markers.');
    });
  };

  // ---------- boot ----------
  if (IN_PREMIERE) {
    loadHost(function (err) {
      if (err) { setStatus('jsx load failed: ' + err.message, true); return; }
      callJsx('ping', [], function (err2, res) {
        if (err2) { setStatus(err2.message, true); return; }
        setStatus('Connected — sequence: ' + (res.sequence || 'none open'));
      });
    });
  } else {
    setStatus('Preview mode (not inside Premiere) — parsing works, placing needs Premiere.');
  }
})();
