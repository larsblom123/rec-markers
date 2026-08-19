// Minimal JSON shim for ExtendScript (ES3). Loaded before host.jsx.
// stringify: full implementation. parse: validation regex + eval (json2.jsx approach).
// Input only ever comes from our own panel, never from untrusted sources.

if (typeof JSON !== 'object' || JSON === null) {
  JSON = {};
}

(function () {
  var escapes = {
    '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f',
    '\r': '\\r', '"': '\\"', '\\': '\\\\'
  };

  function quote(s) {
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (escapes[ch]) {
        out += escapes[ch];
      } else if (ch < ' ') {
        var code = s.charCodeAt(i).toString(16);
        while (code.length < 4) { code = '0' + code; }
        out += '\\u' + code;
      } else {
        out += ch;
      }
    }
    return out + '"';
  }

  function str(value) {
    var i, out, keys;
    if (value === null) { return 'null'; }
    var t = typeof value;
    if (t === 'undefined' || t === 'function') { return undefined; }
    if (t === 'number') { return isFinite(value) ? String(value) : 'null'; }
    if (t === 'boolean') { return String(value); }
    if (t === 'string') { return quote(value); }
    if (t === 'object') {
      if (Object.prototype.toString.call(value) === '[object Array]' ||
          value instanceof Array) {
        out = [];
        for (i = 0; i < value.length; i++) {
          var av = str(value[i]);
          out.push(av === undefined ? 'null' : av);
        }
        return '[' + out.join(',') + ']';
      }
      out = [];
      for (var k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) {
          var v = str(value[k]);
          if (v !== undefined) { out.push(quote(k) + ':' + v); }
        }
      }
      return '{' + out.join(',') + '}';
    }
    return undefined;
  }

  if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function (value) { return str(value); };
  }

  if (typeof JSON.parse !== 'function') {
    JSON.parse = function (text) {
      text = String(text);
      // json2.jsx-style validation before eval
      if (/^[\],:{}\s]*$/.test(
        text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
            .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
            .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {
        return eval('(' + text + ')');
      }
      throw new Error('JSON.parse: invalid JSON');
    };
  }
})();
