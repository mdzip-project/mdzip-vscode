// ../../../mdzip-core-js/node_modules/@progress/pako-esm/dist/pako-esm5.js
var Z_NO_FLUSH = 0;
var Z_PARTIAL_FLUSH = 1;
var Z_SYNC_FLUSH = 2;
var Z_FULL_FLUSH = 3;
var Z_FINISH = 4;
var Z_BLOCK = 5;
var Z_OK = 0;
var Z_STREAM_END = 1;
var Z_NEED_DICT = 2;
var Z_STREAM_ERROR = -2;
var Z_DATA_ERROR = -3;
var Z_BUF_ERROR = -5;
var Z_DEFAULT_COMPRESSION = -1;
var Z_FILTERED = 1;
var Z_HUFFMAN_ONLY = 2;
var Z_RLE = 3;
var Z_FIXED = 4;
var Z_DEFAULT_STRATEGY = 0;
var Z_BINARY = 0;
var Z_TEXT = 1;
var Z_UNKNOWN = 2;
var Z_DEFLATED = 8;
function _has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function assign(obj) {
  var sources = Array.prototype.slice.call(arguments, 1);
  while (sources.length) {
    var source = sources.shift();
    if (!source) {
      continue;
    }
    if (typeof source !== "object") {
      throw new TypeError(source + "must be non-object");
    }
    for (var p in source) {
      if (_has(source, p)) {
        obj[p] = source[p];
      }
    }
  }
  return obj;
}
function shrinkBuf(buf, size) {
  if (buf.length === size) {
    return buf;
  }
  if (buf.subarray) {
    return buf.subarray(0, size);
  }
  buf.length = size;
  return buf;
}
var fnTyped = {
  arraySet: function(dest, src, src_offs, len, dest_offs) {
    if (src.subarray && dest.subarray) {
      dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
      return;
    }
    for (var i = 0; i < len; i++) {
      dest[dest_offs + i] = src[src_offs + i];
    }
  },
  // Join array of chunks to single array.
  flattenChunks: function(chunks) {
    var i, l, len, pos, chunk, result;
    len = 0;
    for (i = 0, l = chunks.length; i < l; i++) {
      len += chunks[i].length;
    }
    result = new Uint8Array(len);
    pos = 0;
    for (i = 0, l = chunks.length; i < l; i++) {
      chunk = chunks[i];
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  },
  Buf8: function(size) {
    return new Uint8Array(size);
  },
  Buf16: function(size) {
    return new Uint16Array(size);
  },
  Buf32: function(size) {
    return new Int32Array(size);
  }
};
var fnUntyped = {
  arraySet: function(dest, src, src_offs, len, dest_offs) {
    for (var i = 0; i < len; i++) {
      dest[dest_offs + i] = src[src_offs + i];
    }
  },
  // Join array of chunks to single array.
  flattenChunks: function(chunks) {
    return [].concat.apply([], chunks);
  },
  Buf8: function(size) {
    return new Array(size);
  },
  Buf16: function(size) {
    return new Array(size);
  },
  Buf32: function(size) {
    return new Array(size);
  }
};
var typedOK = function() {
  var supported = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Int32Array !== "undefined";
  typedOK = function() {
    return supported;
  };
  return supported;
};
var arraySet = function(dest, src, src_offs, len, dest_offs) {
  arraySet = typedOK() ? fnTyped.arraySet : fnUntyped.arraySet;
  return arraySet(dest, src, src_offs, len, dest_offs);
};
var flattenChunks = function(chunks) {
  flattenChunks = typedOK() ? fnTyped.flattenChunks : fnUntyped.flattenChunks;
  return flattenChunks(chunks);
};
var Buf8 = function(size) {
  Buf8 = typedOK() ? fnTyped.Buf8 : fnUntyped.Buf8;
  return Buf8(size);
};
var Buf16 = function(size) {
  Buf16 = typedOK() ? fnTyped.Buf16 : fnUntyped.Buf16;
  return Buf16(size);
};
var Buf32 = function(size) {
  Buf32 = typedOK() ? fnTyped.Buf32 : fnUntyped.Buf32;
  return Buf32(size);
};
var strApplyOK = function() {
  var result = true;
  try {
    String.fromCharCode.apply(null, [0]);
  } catch (_) {
    result = false;
  }
  strApplyOK = function() {
    return result;
  };
  return result;
};
var strApplyUintOK = function() {
  var result = true;
  try {
    String.fromCharCode.apply(null, new Uint8Array(1));
  } catch (_) {
    result = false;
  }
  strApplyUintOK = function() {
    return result;
  };
  return result;
};
var utf8len = function(c) {
  var table = Buf8(256);
  for (var q = 0; q < 256; q++) {
    table[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
  }
  table[254] = table[254] = 1;
  utf8len = function(arg) {
    return table[arg];
  };
  return table[c];
};
function string2buf(str) {
  var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
  for (m_pos = 0; m_pos < str_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 64512) === 56320) {
        c = 65536 + (c - 55296 << 10) + (c2 - 56320);
        m_pos++;
      }
    }
    buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
  }
  buf = new Uint8Array(buf_len);
  for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 64512) === 56320) {
        c = 65536 + (c - 55296 << 10) + (c2 - 56320);
        m_pos++;
      }
    }
    if (c < 128) {
      buf[i++] = c;
    } else if (c < 2048) {
      buf[i++] = 192 | c >>> 6;
      buf[i++] = 128 | c & 63;
    } else if (c < 65536) {
      buf[i++] = 224 | c >>> 12;
      buf[i++] = 128 | c >>> 6 & 63;
      buf[i++] = 128 | c & 63;
    } else {
      buf[i++] = 240 | c >>> 18;
      buf[i++] = 128 | c >>> 12 & 63;
      buf[i++] = 128 | c >>> 6 & 63;
      buf[i++] = 128 | c & 63;
    }
  }
  return buf;
}
function _buf2binstring(buf, len) {
  if (len < 65534) {
    if (buf.subarray && strApplyUintOK() || !buf.subarray && strApplyOK()) {
      return String.fromCharCode.apply(null, shrinkBuf(buf, len));
    }
  }
  var result = "";
  for (var i = 0; i < len; i++) {
    result += String.fromCharCode(buf[i]);
  }
  return result;
}
function buf2binstring(buf) {
  return _buf2binstring(buf, buf.length);
}
function binstring2buf(str) {
  var buf = new Uint8Array(str.length);
  for (var i = 0, len = buf.length; i < len; i++) {
    buf[i] = str.charCodeAt(i);
  }
  return buf;
}
function buf2string(buf, max) {
  var i, out, c, c_len;
  var len = max || buf.length;
  var utf16buf = new Array(len * 2);
  for (out = 0, i = 0; i < len; ) {
    c = buf[i++];
    if (c < 128) {
      utf16buf[out++] = c;
      continue;
    }
    c_len = utf8len(c);
    if (c_len > 4) {
      utf16buf[out++] = 65533;
      i += c_len - 1;
      continue;
    }
    c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
    while (c_len > 1 && i < len) {
      c = c << 6 | buf[i++] & 63;
      c_len--;
    }
    if (c_len > 1) {
      utf16buf[out++] = 65533;
      continue;
    }
    if (c < 65536) {
      utf16buf[out++] = c;
    } else {
      c -= 65536;
      utf16buf[out++] = 55296 | c >> 10 & 1023;
      utf16buf[out++] = 56320 | c & 1023;
    }
  }
  return _buf2binstring(utf16buf, out);
}
function utf8border(buf, max) {
  var pos;
  max = max || buf.length;
  if (max > buf.length) {
    max = buf.length;
  }
  pos = max - 1;
  while (pos >= 0 && (buf[pos] & 192) === 128) {
    pos--;
  }
  if (pos < 0) {
    return max;
  }
  if (pos === 0) {
    return max;
  }
  return pos + utf8len(buf[pos]) > max ? pos : max;
}
function adler32(adler, buf, len, pos) {
  var s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
  while (len !== 0) {
    n = len > 2e3 ? 2e3 : len;
    len -= n;
    do {
      s1 = s1 + buf[pos++] | 0;
      s2 = s2 + s1 | 0;
    } while (--n);
    s1 %= 65521;
    s2 %= 65521;
  }
  return s1 | s2 << 16 | 0;
}
function makeTable() {
  var c, table = [];
  for (var n = 0; n < 256; n++) {
    c = n;
    for (var k = 0; k < 8; k++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}
var crcTable = function() {
  var table = makeTable();
  crcTable = function() {
    return table;
  };
  return table;
};
function crc32(crc, buf, len, pos) {
  var t = crcTable(), end2 = pos + len;
  crc ^= -1;
  for (var i = pos; i < end2; i++) {
    crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
  }
  return crc ^ -1;
}
var BAD = 30;
var TYPE = 12;
function inflate_fast(strm, start) {
  var state;
  var _in;
  var last;
  var _out;
  var beg;
  var end2;
  var dmax;
  var wsize;
  var whave;
  var wnext;
  var s_window;
  var hold;
  var bits;
  var lcode;
  var dcode;
  var lmask;
  var dmask;
  var here;
  var op;
  var len;
  var dist;
  var from;
  var from_source;
  var input, output;
  state = strm.state;
  _in = strm.next_in;
  input = strm.input;
  last = _in + (strm.avail_in - 5);
  _out = strm.next_out;
  output = strm.output;
  beg = _out - (start - strm.avail_out);
  end2 = _out + (strm.avail_out - 257);
  dmax = state.dmax;
  wsize = state.wsize;
  whave = state.whave;
  wnext = state.wnext;
  s_window = state.window;
  hold = state.hold;
  bits = state.bits;
  lcode = state.lencode;
  dcode = state.distcode;
  lmask = (1 << state.lenbits) - 1;
  dmask = (1 << state.distbits) - 1;
  top:
    do {
      if (bits < 15) {
        hold += input[_in++] << bits;
        bits += 8;
        hold += input[_in++] << bits;
        bits += 8;
      }
      here = lcode[hold & lmask];
      dolen:
        for (; ; ) {
          op = here >>> 24;
          hold >>>= op;
          bits -= op;
          op = here >>> 16 & 255;
          if (op === 0) {
            output[_out++] = here & 65535;
          } else if (op & 16) {
            len = here & 65535;
            op &= 15;
            if (op) {
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
              }
              len += hold & (1 << op) - 1;
              hold >>>= op;
              bits -= op;
            }
            if (bits < 15) {
              hold += input[_in++] << bits;
              bits += 8;
              hold += input[_in++] << bits;
              bits += 8;
            }
            here = dcode[hold & dmask];
            dodist:
              for (; ; ) {
                op = here >>> 24;
                hold >>>= op;
                bits -= op;
                op = here >>> 16 & 255;
                if (op & 16) {
                  dist = here & 65535;
                  op &= 15;
                  if (bits < op) {
                    hold += input[_in++] << bits;
                    bits += 8;
                    if (bits < op) {
                      hold += input[_in++] << bits;
                      bits += 8;
                    }
                  }
                  dist += hold & (1 << op) - 1;
                  if (dist > dmax) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD;
                    break top;
                  }
                  hold >>>= op;
                  bits -= op;
                  op = _out - beg;
                  if (dist > op) {
                    op = dist - op;
                    if (op > whave) {
                      if (state.sane) {
                        strm.msg = "invalid distance too far back";
                        state.mode = BAD;
                        break top;
                      }
                    }
                    from = 0;
                    from_source = s_window;
                    if (wnext === 0) {
                      from += wsize - op;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = _out - dist;
                        from_source = output;
                      }
                    } else if (wnext < op) {
                      from += wsize + wnext - op;
                      op -= wnext;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = 0;
                        if (wnext < len) {
                          op = wnext;
                          len -= op;
                          do {
                            output[_out++] = s_window[from++];
                          } while (--op);
                          from = _out - dist;
                          from_source = output;
                        }
                      }
                    } else {
                      from += wnext - op;
                      if (op < len) {
                        len -= op;
                        do {
                          output[_out++] = s_window[from++];
                        } while (--op);
                        from = _out - dist;
                        from_source = output;
                      }
                    }
                    while (len > 2) {
                      output[_out++] = from_source[from++];
                      output[_out++] = from_source[from++];
                      output[_out++] = from_source[from++];
                      len -= 3;
                    }
                    if (len) {
                      output[_out++] = from_source[from++];
                      if (len > 1) {
                        output[_out++] = from_source[from++];
                      }
                    }
                  } else {
                    from = _out - dist;
                    do {
                      output[_out++] = output[from++];
                      output[_out++] = output[from++];
                      output[_out++] = output[from++];
                      len -= 3;
                    } while (len > 2);
                    if (len) {
                      output[_out++] = output[from++];
                      if (len > 1) {
                        output[_out++] = output[from++];
                      }
                    }
                  }
                } else if ((op & 64) === 0) {
                  here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                  continue dodist;
                } else {
                  strm.msg = "invalid distance code";
                  state.mode = BAD;
                  break top;
                }
                break;
              }
          } else if ((op & 64) === 0) {
            here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
            continue dolen;
          } else if (op & 32) {
            state.mode = TYPE;
            break top;
          } else {
            strm.msg = "invalid literal/length code";
            state.mode = BAD;
            break top;
          }
          break;
        }
    } while (_in < last && _out < end2);
  len = bits >> 3;
  _in -= len;
  bits -= len << 3;
  hold &= (1 << bits) - 1;
  strm.next_in = _in;
  strm.next_out = _out;
  strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
  strm.avail_out = _out < end2 ? 257 + (end2 - _out) : 257 - (_out - end2);
  state.hold = hold;
  state.bits = bits;
  return;
}
var MAXBITS = 15;
var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
var CODES = 0;
var LENS = 1;
var DISTS = 2;
var lbase = [
  /* Length codes 257..285 base */
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  13,
  15,
  17,
  19,
  23,
  27,
  31,
  35,
  43,
  51,
  59,
  67,
  83,
  99,
  115,
  131,
  163,
  195,
  227,
  258,
  0,
  0
];
var lext = [
  /* Length codes 257..285 extra */
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  17,
  17,
  17,
  17,
  18,
  18,
  18,
  18,
  19,
  19,
  19,
  19,
  20,
  20,
  20,
  20,
  21,
  21,
  21,
  21,
  16,
  72,
  78
];
var dbase = [
  /* Distance codes 0..29 base */
  1,
  2,
  3,
  4,
  5,
  7,
  9,
  13,
  17,
  25,
  33,
  49,
  65,
  97,
  129,
  193,
  257,
  385,
  513,
  769,
  1025,
  1537,
  2049,
  3073,
  4097,
  6145,
  8193,
  12289,
  16385,
  24577,
  0,
  0
];
var dext = [
  /* Distance codes 0..29 extra */
  16,
  16,
  16,
  16,
  17,
  17,
  18,
  18,
  19,
  19,
  20,
  20,
  21,
  21,
  22,
  22,
  23,
  23,
  24,
  24,
  25,
  25,
  26,
  26,
  27,
  27,
  28,
  28,
  29,
  29,
  64,
  64
];
function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
  var bits = opts.bits;
  var len = 0;
  var sym = 0;
  var min = 0, max = 0;
  var root = 0;
  var curr = 0;
  var drop = 0;
  var left = 0;
  var used = 0;
  var huff = 0;
  var incr;
  var fill;
  var low;
  var mask;
  var next;
  var base = null;
  var base_index = 0;
  var end2;
  var count = Buf16(MAXBITS + 1);
  var offs = Buf16(MAXBITS + 1);
  var extra = null;
  var extra_index = 0;
  var here_bits, here_op, here_val;
  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[lens_index + sym]]++;
  }
  root = bits;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] !== 0) {
      break;
    }
  }
  if (root > max) {
    root = max;
  }
  if (max === 0) {
    table[table_index++] = 1 << 24 | 64 << 16 | 0;
    table[table_index++] = 1 << 24 | 64 << 16 | 0;
    opts.bits = 1;
    return 0;
  }
  for (min = 1; min < max; min++) {
    if (count[min] !== 0) {
      break;
    }
  }
  if (root < min) {
    root = min;
  }
  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    }
  }
  if (left > 0 && (type === CODES || max !== 1)) {
    return -1;
  }
  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }
  for (sym = 0; sym < codes; sym++) {
    if (lens[lens_index + sym] !== 0) {
      work[offs[lens[lens_index + sym]]++] = sym;
    }
  }
  if (type === CODES) {
    base = extra = work;
    end2 = 19;
  } else if (type === LENS) {
    base = lbase;
    base_index -= 257;
    extra = lext;
    extra_index -= 257;
    end2 = 256;
  } else {
    base = dbase;
    extra = dext;
    end2 = -1;
  }
  huff = 0;
  sym = 0;
  len = min;
  next = table_index;
  curr = root;
  drop = 0;
  low = -1;
  used = 1 << root;
  mask = used - 1;
  if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
    return 1;
  }
  for (; ; ) {
    here_bits = len - drop;
    if (work[sym] < end2) {
      here_op = 0;
      here_val = work[sym];
    } else if (work[sym] > end2) {
      here_op = extra[extra_index + work[sym]];
      here_val = base[base_index + work[sym]];
    } else {
      here_op = 32 + 64;
      here_val = 0;
    }
    incr = 1 << len - drop;
    fill = 1 << curr;
    min = fill;
    do {
      fill -= incr;
      table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
    } while (fill !== 0);
    incr = 1 << len - 1;
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr !== 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }
    sym++;
    if (--count[len] === 0) {
      if (len === max) {
        break;
      }
      len = lens[lens_index + work[sym]];
    }
    if (len > root && (huff & mask) !== low) {
      if (drop === 0) {
        drop = root;
      }
      next += min;
      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) {
          break;
        }
        curr++;
        left <<= 1;
      }
      used += 1 << curr;
      if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
        return 1;
      }
      low = huff & mask;
      table[low] = root << 24 | curr << 16 | next - table_index | 0;
    }
  }
  if (huff !== 0) {
    table[next + huff] = len - drop << 24 | 64 << 16 | 0;
  }
  opts.bits = root;
  return 0;
}
var CODES$1 = 0;
var LENS$1 = 1;
var DISTS$1 = 2;
var Z_FINISH$1 = 4;
var Z_BLOCK$1 = 5;
var Z_TREES$1 = 6;
var Z_OK$1 = 0;
var Z_STREAM_END$1 = 1;
var Z_NEED_DICT$1 = 2;
var Z_STREAM_ERROR$1 = -2;
var Z_DATA_ERROR$1 = -3;
var Z_MEM_ERROR = -4;
var Z_BUF_ERROR$1 = -5;
var Z_DEFLATED$1 = 8;
var HEAD = 1;
var FLAGS = 2;
var TIME = 3;
var OS = 4;
var EXLEN = 5;
var EXTRA = 6;
var NAME = 7;
var COMMENT = 8;
var HCRC = 9;
var DICTID = 10;
var DICT = 11;
var TYPE$1 = 12;
var TYPEDO = 13;
var STORED = 14;
var COPY_ = 15;
var COPY = 16;
var TABLE = 17;
var LENLENS = 18;
var CODELENS = 19;
var LEN_ = 20;
var LEN = 21;
var LENEXT = 22;
var DIST = 23;
var DISTEXT = 24;
var MATCH = 25;
var LIT = 26;
var CHECK = 27;
var LENGTH = 28;
var DONE = 29;
var BAD$1 = 30;
var MEM = 31;
var SYNC = 32;
var ENOUGH_LENS$1 = 852;
var ENOUGH_DISTS$1 = 592;
function zswap32(q) {
  return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
}
function InflateState() {
  this.mode = 0;
  this.last = false;
  this.wrap = 0;
  this.havedict = false;
  this.flags = 0;
  this.dmax = 0;
  this.check = 0;
  this.total = 0;
  this.head = null;
  this.wbits = 0;
  this.wsize = 0;
  this.whave = 0;
  this.wnext = 0;
  this.window = null;
  this.hold = 0;
  this.bits = 0;
  this.length = 0;
  this.offset = 0;
  this.extra = 0;
  this.lencode = null;
  this.distcode = null;
  this.lenbits = 0;
  this.distbits = 0;
  this.ncode = 0;
  this.nlen = 0;
  this.ndist = 0;
  this.have = 0;
  this.next = null;
  this.lens = Buf16(320);
  this.work = Buf16(288);
  this.lendyn = null;
  this.distdyn = null;
  this.sane = 0;
  this.back = 0;
  this.was = 0;
}
function inflateResetKeep(strm) {
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  strm.total_in = strm.total_out = state.total = 0;
  strm.msg = "";
  if (state.wrap) {
    strm.adler = state.wrap & 1;
  }
  state.mode = HEAD;
  state.last = 0;
  state.havedict = 0;
  state.dmax = 32768;
  state.head = null;
  state.hold = 0;
  state.bits = 0;
  state.lencode = state.lendyn = Buf32(ENOUGH_LENS$1);
  state.distcode = state.distdyn = Buf32(ENOUGH_DISTS$1);
  state.sane = 1;
  state.back = -1;
  return Z_OK$1;
}
function inflateReset(strm) {
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  state.wsize = 0;
  state.whave = 0;
  state.wnext = 0;
  return inflateResetKeep(strm);
}
function inflateReset2(strm, windowBits) {
  var wrap;
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  } else {
    wrap = (windowBits >> 4) + 1;
    if (windowBits < 48) {
      windowBits &= 15;
    }
  }
  if (windowBits && (windowBits < 8 || windowBits > 15)) {
    return Z_STREAM_ERROR$1;
  }
  if (state.window !== null && state.wbits !== windowBits) {
    state.window = null;
  }
  state.wrap = wrap;
  state.wbits = windowBits;
  return inflateReset(strm);
}
function inflateInit2(strm, windowBits) {
  var ret;
  var state;
  if (!strm) {
    return Z_STREAM_ERROR$1;
  }
  state = new InflateState();
  strm.state = state;
  state.window = null;
  ret = inflateReset2(strm, windowBits);
  if (ret !== Z_OK$1) {
    strm.state = null;
  }
  return ret;
}
var virgin = true;
var lenfix;
var distfix;
function fixedtables(state) {
  if (virgin) {
    var sym;
    lenfix = Buf32(512);
    distfix = Buf32(32);
    sym = 0;
    while (sym < 144) {
      state.lens[sym++] = 8;
    }
    while (sym < 256) {
      state.lens[sym++] = 9;
    }
    while (sym < 280) {
      state.lens[sym++] = 7;
    }
    while (sym < 288) {
      state.lens[sym++] = 8;
    }
    inflate_table(LENS$1, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
    sym = 0;
    while (sym < 32) {
      state.lens[sym++] = 5;
    }
    inflate_table(DISTS$1, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
    virgin = false;
  }
  state.lencode = lenfix;
  state.lenbits = 9;
  state.distcode = distfix;
  state.distbits = 5;
}
function updatewindow(strm, src, end2, copy) {
  var dist;
  var state = strm.state;
  if (state.window === null) {
    state.wsize = 1 << state.wbits;
    state.wnext = 0;
    state.whave = 0;
    state.window = Buf8(state.wsize);
  }
  if (copy >= state.wsize) {
    arraySet(state.window, src, end2 - state.wsize, state.wsize, 0);
    state.wnext = 0;
    state.whave = state.wsize;
  } else {
    dist = state.wsize - state.wnext;
    if (dist > copy) {
      dist = copy;
    }
    arraySet(state.window, src, end2 - copy, dist, state.wnext);
    copy -= dist;
    if (copy) {
      arraySet(state.window, src, end2 - copy, copy, 0);
      state.wnext = copy;
      state.whave = state.wsize;
    } else {
      state.wnext += dist;
      if (state.wnext === state.wsize) {
        state.wnext = 0;
      }
      if (state.whave < state.wsize) {
        state.whave += dist;
      }
    }
  }
  return 0;
}
function inflate(strm, flush2) {
  var state;
  var input, output;
  var next;
  var put;
  var have, left;
  var hold;
  var bits;
  var _in, _out;
  var copy;
  var from;
  var from_source;
  var here = 0;
  var here_bits, here_op, here_val;
  var last_bits, last_op, last_val;
  var len;
  var ret;
  var hbuf = Buf8(4);
  var opts;
  var n;
  var order = (
    /* permutation of code lengths */
    [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
  );
  if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  if (state.mode === TYPE$1) {
    state.mode = TYPEDO;
  }
  put = strm.next_out;
  output = strm.output;
  left = strm.avail_out;
  next = strm.next_in;
  input = strm.input;
  have = strm.avail_in;
  hold = state.hold;
  bits = state.bits;
  _in = have;
  _out = left;
  ret = Z_OK$1;
  inf_leave:
    for (; ; ) {
      switch (state.mode) {
        case HEAD:
          if (state.wrap === 0) {
            state.mode = TYPEDO;
            break;
          }
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.wrap & 2 && hold === 35615) {
            state.check = 0;
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32(state.check, hbuf, 2, 0);
            hold = 0;
            bits = 0;
            state.mode = FLAGS;
            break;
          }
          state.flags = 0;
          if (state.head) {
            state.head.done = false;
          }
          if (!(state.wrap & 1) || /* check if zlib header allowed */
          (((hold & 255) << 8) + (hold >> 8)) % 31) {
            strm.msg = "incorrect header check";
            state.mode = BAD$1;
            break;
          }
          if ((hold & 15) !== Z_DEFLATED$1) {
            strm.msg = "unknown compression method";
            state.mode = BAD$1;
            break;
          }
          hold >>>= 4;
          bits -= 4;
          len = (hold & 15) + 8;
          if (state.wbits === 0) {
            state.wbits = len;
          } else if (len > state.wbits) {
            strm.msg = "invalid window size";
            state.mode = BAD$1;
            break;
          }
          state.dmax = 1 << len;
          strm.adler = state.check = 1;
          state.mode = hold & 512 ? DICTID : TYPE$1;
          hold = 0;
          bits = 0;
          break;
        case FLAGS:
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.flags = hold;
          if ((state.flags & 255) !== Z_DEFLATED$1) {
            strm.msg = "unknown compression method";
            state.mode = BAD$1;
            break;
          }
          if (state.flags & 57344) {
            strm.msg = "unknown header flags set";
            state.mode = BAD$1;
            break;
          }
          if (state.head) {
            state.head.text = hold >> 8 & 1;
          }
          if (state.flags & 512) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32(state.check, hbuf, 2, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = TIME;
        /* falls through */
        case TIME:
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.head) {
            state.head.time = hold;
          }
          if (state.flags & 512) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            hbuf[2] = hold >>> 16 & 255;
            hbuf[3] = hold >>> 24 & 255;
            state.check = crc32(state.check, hbuf, 4, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = OS;
        /* falls through */
        case OS:
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.head) {
            state.head.xflags = hold & 255;
            state.head.os = hold >> 8;
          }
          if (state.flags & 512) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32(state.check, hbuf, 2, 0);
          }
          hold = 0;
          bits = 0;
          state.mode = EXLEN;
        /* falls through */
        case EXLEN:
          if (state.flags & 1024) {
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.length = hold;
            if (state.head) {
              state.head.extra_len = hold;
            }
            if (state.flags & 512) {
              hbuf[0] = hold & 255;
              hbuf[1] = hold >>> 8 & 255;
              state.check = crc32(state.check, hbuf, 2, 0);
            }
            hold = 0;
            bits = 0;
          } else if (state.head) {
            state.head.extra = null;
          }
          state.mode = EXTRA;
        /* falls through */
        case EXTRA:
          if (state.flags & 1024) {
            copy = state.length;
            if (copy > have) {
              copy = have;
            }
            if (copy) {
              if (state.head) {
                len = state.head.extra_len - state.length;
                if (!state.head.extra) {
                  state.head.extra = new Array(state.head.extra_len);
                }
                arraySet(
                  state.head.extra,
                  input,
                  next,
                  // extra field is limited to 65536 bytes
                  // - no need for additional size check
                  copy,
                  /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                  len
                );
              }
              if (state.flags & 512) {
                state.check = crc32(state.check, input, copy, next);
              }
              have -= copy;
              next += copy;
              state.length -= copy;
            }
            if (state.length) {
              break inf_leave;
            }
          }
          state.length = 0;
          state.mode = NAME;
        /* falls through */
        case NAME:
          if (state.flags & 2048) {
            if (have === 0) {
              break inf_leave;
            }
            copy = 0;
            do {
              len = input[next + copy++];
              if (state.head && len && state.length < 65536) {
                state.head.name += String.fromCharCode(len);
              }
            } while (len && copy < have);
            if (state.flags & 512) {
              state.check = crc32(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.name = null;
          }
          state.length = 0;
          state.mode = COMMENT;
        /* falls through */
        case COMMENT:
          if (state.flags & 4096) {
            if (have === 0) {
              break inf_leave;
            }
            copy = 0;
            do {
              len = input[next + copy++];
              if (state.head && len && state.length < 65536) {
                state.head.comment += String.fromCharCode(len);
              }
            } while (len && copy < have);
            if (state.flags & 512) {
              state.check = crc32(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            if (len) {
              break inf_leave;
            }
          } else if (state.head) {
            state.head.comment = null;
          }
          state.mode = HCRC;
        /* falls through */
        case HCRC:
          if (state.flags & 512) {
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (hold !== (state.check & 65535)) {
              strm.msg = "header crc mismatch";
              state.mode = BAD$1;
              break;
            }
            hold = 0;
            bits = 0;
          }
          if (state.head) {
            state.head.hcrc = state.flags >> 9 & 1;
            state.head.done = true;
          }
          strm.adler = state.check = 0;
          state.mode = TYPE$1;
          break;
        case DICTID:
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          strm.adler = state.check = zswap32(hold);
          hold = 0;
          bits = 0;
          state.mode = DICT;
        /* falls through */
        case DICT:
          if (state.havedict === 0) {
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits;
            return Z_NEED_DICT$1;
          }
          strm.adler = state.check = 1;
          state.mode = TYPE$1;
        /* falls through */
        case TYPE$1:
          if (flush2 === Z_BLOCK$1 || flush2 === Z_TREES$1) {
            break inf_leave;
          }
        /* falls through */
        case TYPEDO:
          if (state.last) {
            hold >>>= bits & 7;
            bits -= bits & 7;
            state.mode = CHECK;
            break;
          }
          while (bits < 3) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.last = hold & 1;
          hold >>>= 1;
          bits -= 1;
          switch (hold & 3) {
            case 0:
              state.mode = STORED;
              break;
            case 1:
              fixedtables(state);
              state.mode = LEN_;
              if (flush2 === Z_TREES$1) {
                hold >>>= 2;
                bits -= 2;
                break inf_leave;
              }
              break;
            case 2:
              state.mode = TABLE;
              break;
            case 3:
              strm.msg = "invalid block type";
              state.mode = BAD$1;
          }
          hold >>>= 2;
          bits -= 2;
          break;
        case STORED:
          hold >>>= bits & 7;
          bits -= bits & 7;
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
            strm.msg = "invalid stored block lengths";
            state.mode = BAD$1;
            break;
          }
          state.length = hold & 65535;
          hold = 0;
          bits = 0;
          state.mode = COPY_;
          if (flush2 === Z_TREES$1) {
            break inf_leave;
          }
        /* falls through */
        case COPY_:
          state.mode = COPY;
        /* falls through */
        case COPY:
          copy = state.length;
          if (copy) {
            if (copy > have) {
              copy = have;
            }
            if (copy > left) {
              copy = left;
            }
            if (copy === 0) {
              break inf_leave;
            }
            arraySet(output, input, next, copy, put);
            have -= copy;
            next += copy;
            left -= copy;
            put += copy;
            state.length -= copy;
            break;
          }
          state.mode = TYPE$1;
          break;
        case TABLE:
          while (bits < 14) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.nlen = (hold & 31) + 257;
          hold >>>= 5;
          bits -= 5;
          state.ndist = (hold & 31) + 1;
          hold >>>= 5;
          bits -= 5;
          state.ncode = (hold & 15) + 4;
          hold >>>= 4;
          bits -= 4;
          if (state.nlen > 286 || state.ndist > 30) {
            strm.msg = "too many length or distance symbols";
            state.mode = BAD$1;
            break;
          }
          state.have = 0;
          state.mode = LENLENS;
        /* falls through */
        case LENLENS:
          while (state.have < state.ncode) {
            while (bits < 3) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.lens[order[state.have++]] = hold & 7;
            hold >>>= 3;
            bits -= 3;
          }
          while (state.have < 19) {
            state.lens[order[state.have++]] = 0;
          }
          state.lencode = state.lendyn;
          state.lenbits = 7;
          opts = { bits: state.lenbits };
          ret = inflate_table(CODES$1, state.lens, 0, 19, state.lencode, 0, state.work, opts);
          state.lenbits = opts.bits;
          if (ret) {
            strm.msg = "invalid code lengths set";
            state.mode = BAD$1;
            break;
          }
          state.have = 0;
          state.mode = CODELENS;
        /* falls through */
        case CODELENS:
          while (state.have < state.nlen + state.ndist) {
            for (; ; ) {
              here = state.lencode[hold & (1 << state.lenbits) - 1];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (here_val < 16) {
              hold >>>= here_bits;
              bits -= here_bits;
              state.lens[state.have++] = here_val;
            } else {
              if (here_val === 16) {
                n = here_bits + 2;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                if (state.have === 0) {
                  strm.msg = "invalid bit length repeat";
                  state.mode = BAD$1;
                  break;
                }
                len = state.lens[state.have - 1];
                copy = 3 + (hold & 3);
                hold >>>= 2;
                bits -= 2;
              } else if (here_val === 17) {
                n = here_bits + 3;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                len = 0;
                copy = 3 + (hold & 7);
                hold >>>= 3;
                bits -= 3;
              } else {
                n = here_bits + 7;
                while (bits < n) {
                  if (have === 0) {
                    break inf_leave;
                  }
                  have--;
                  hold += input[next++] << bits;
                  bits += 8;
                }
                hold >>>= here_bits;
                bits -= here_bits;
                len = 0;
                copy = 11 + (hold & 127);
                hold >>>= 7;
                bits -= 7;
              }
              if (state.have + copy > state.nlen + state.ndist) {
                strm.msg = "invalid bit length repeat";
                state.mode = BAD$1;
                break;
              }
              while (copy--) {
                state.lens[state.have++] = len;
              }
            }
          }
          if (state.mode === BAD$1) {
            break;
          }
          if (state.lens[256] === 0) {
            strm.msg = "invalid code -- missing end-of-block";
            state.mode = BAD$1;
            break;
          }
          state.lenbits = 9;
          opts = { bits: state.lenbits };
          ret = inflate_table(LENS$1, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
          state.lenbits = opts.bits;
          if (ret) {
            strm.msg = "invalid literal/lengths set";
            state.mode = BAD$1;
            break;
          }
          state.distbits = 6;
          state.distcode = state.distdyn;
          opts = { bits: state.distbits };
          ret = inflate_table(DISTS$1, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
          state.distbits = opts.bits;
          if (ret) {
            strm.msg = "invalid distances set";
            state.mode = BAD$1;
            break;
          }
          state.mode = LEN_;
          if (flush2 === Z_TREES$1) {
            break inf_leave;
          }
        /* falls through */
        case LEN_:
          state.mode = LEN;
        /* falls through */
        case LEN:
          if (have >= 6 && left >= 258) {
            strm.next_out = put;
            strm.avail_out = left;
            strm.next_in = next;
            strm.avail_in = have;
            state.hold = hold;
            state.bits = bits;
            inflate_fast(strm, _out);
            put = strm.next_out;
            output = strm.output;
            left = strm.avail_out;
            next = strm.next_in;
            input = strm.input;
            have = strm.avail_in;
            hold = state.hold;
            bits = state.bits;
            if (state.mode === TYPE$1) {
              state.back = -1;
            }
            break;
          }
          state.back = 0;
          for (; ; ) {
            here = state.lencode[hold & (1 << state.lenbits) - 1];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (here_bits <= bits) {
              break;
            }
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (here_op && (here_op & 240) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;
            for (; ; ) {
              here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (last_bits + here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            hold >>>= last_bits;
            bits -= last_bits;
            state.back += last_bits;
          }
          hold >>>= here_bits;
          bits -= here_bits;
          state.back += here_bits;
          state.length = here_val;
          if (here_op === 0) {
            state.mode = LIT;
            break;
          }
          if (here_op & 32) {
            state.back = -1;
            state.mode = TYPE$1;
            break;
          }
          if (here_op & 64) {
            strm.msg = "invalid literal/length code";
            state.mode = BAD$1;
            break;
          }
          state.extra = here_op & 15;
          state.mode = LENEXT;
        /* falls through */
        case LENEXT:
          if (state.extra) {
            n = state.extra;
            while (bits < n) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.length += hold & (1 << state.extra) - 1;
            hold >>>= state.extra;
            bits -= state.extra;
            state.back += state.extra;
          }
          state.was = state.length;
          state.mode = DIST;
        /* falls through */
        case DIST:
          for (; ; ) {
            here = state.distcode[hold & (1 << state.distbits) - 1];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (here_bits <= bits) {
              break;
            }
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if ((here_op & 240) === 0) {
            last_bits = here_bits;
            last_op = here_op;
            last_val = here_val;
            for (; ; ) {
              here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (last_bits + here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            hold >>>= last_bits;
            bits -= last_bits;
            state.back += last_bits;
          }
          hold >>>= here_bits;
          bits -= here_bits;
          state.back += here_bits;
          if (here_op & 64) {
            strm.msg = "invalid distance code";
            state.mode = BAD$1;
            break;
          }
          state.offset = here_val;
          state.extra = here_op & 15;
          state.mode = DISTEXT;
        /* falls through */
        case DISTEXT:
          if (state.extra) {
            n = state.extra;
            while (bits < n) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.offset += hold & (1 << state.extra) - 1;
            hold >>>= state.extra;
            bits -= state.extra;
            state.back += state.extra;
          }
          if (state.offset > state.dmax) {
            strm.msg = "invalid distance too far back";
            state.mode = BAD$1;
            break;
          }
          state.mode = MATCH;
        /* falls through */
        case MATCH:
          if (left === 0) {
            break inf_leave;
          }
          copy = _out - left;
          if (state.offset > copy) {
            copy = state.offset - copy;
            if (copy > state.whave) {
              if (state.sane) {
                strm.msg = "invalid distance too far back";
                state.mode = BAD$1;
                break;
              }
            }
            if (copy > state.wnext) {
              copy -= state.wnext;
              from = state.wsize - copy;
            } else {
              from = state.wnext - copy;
            }
            if (copy > state.length) {
              copy = state.length;
            }
            from_source = state.window;
          } else {
            from_source = output;
            from = put - state.offset;
            copy = state.length;
          }
          if (copy > left) {
            copy = left;
          }
          left -= copy;
          state.length -= copy;
          do {
            output[put++] = from_source[from++];
          } while (--copy);
          if (state.length === 0) {
            state.mode = LEN;
          }
          break;
        case LIT:
          if (left === 0) {
            break inf_leave;
          }
          output[put++] = state.length;
          left--;
          state.mode = LEN;
          break;
        case CHECK:
          if (state.wrap) {
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold |= input[next++] << bits;
              bits += 8;
            }
            _out -= left;
            strm.total_out += _out;
            state.total += _out;
            if (_out) {
              strm.adler = state.check = /*UPDATE(state.check, put - _out, _out);*/
              state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
            }
            _out = left;
            if ((state.flags ? hold : zswap32(hold)) !== state.check) {
              strm.msg = "incorrect data check";
              state.mode = BAD$1;
              break;
            }
            hold = 0;
            bits = 0;
          }
          state.mode = LENGTH;
        /* falls through */
        case LENGTH:
          if (state.wrap && state.flags) {
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (hold !== (state.total & 4294967295)) {
              strm.msg = "incorrect length check";
              state.mode = BAD$1;
              break;
            }
            hold = 0;
            bits = 0;
          }
          state.mode = DONE;
        /* falls through */
        case DONE:
          ret = Z_STREAM_END$1;
          break inf_leave;
        case BAD$1:
          ret = Z_DATA_ERROR$1;
          break inf_leave;
        case MEM:
          return Z_MEM_ERROR;
        case SYNC:
        /* falls through */
        default:
          return Z_STREAM_ERROR$1;
      }
    }
  strm.next_out = put;
  strm.avail_out = left;
  strm.next_in = next;
  strm.avail_in = have;
  state.hold = hold;
  state.bits = bits;
  if (state.wsize || _out !== strm.avail_out && state.mode < BAD$1 && (state.mode < CHECK || flush2 !== Z_FINISH$1)) {
    if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
  }
  _in -= strm.avail_in;
  _out -= strm.avail_out;
  strm.total_in += _in;
  strm.total_out += _out;
  state.total += _out;
  if (state.wrap && _out) {
    strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
    state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
  }
  strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE$1 ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
  if ((_in === 0 && _out === 0 || flush2 === Z_FINISH$1) && ret === Z_OK$1) {
    ret = Z_BUF_ERROR$1;
  }
  return ret;
}
function inflateEnd(strm) {
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  var state = strm.state;
  if (state.window) {
    state.window = null;
  }
  strm.state = null;
  return Z_OK$1;
}
function inflateGetHeader(strm, head) {
  var state;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  if ((state.wrap & 2) === 0) {
    return Z_STREAM_ERROR$1;
  }
  state.head = head;
  head.done = false;
  return Z_OK$1;
}
function inflateSetDictionary(strm, dictionary) {
  var dictLength = dictionary.length;
  var state;
  var dictid;
  var ret;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  if (state.wrap !== 0 && state.mode !== DICT) {
    return Z_STREAM_ERROR$1;
  }
  if (state.mode === DICT) {
    dictid = 1;
    dictid = adler32(dictid, dictionary, dictLength, 0);
    if (dictid !== state.check) {
      return Z_DATA_ERROR$1;
    }
  }
  ret = updatewindow(strm, dictionary, dictLength, dictLength);
  if (ret) {
    state.mode = MEM;
    return Z_MEM_ERROR;
  }
  state.havedict = 1;
  return Z_OK$1;
}
var msg = {
  2: "need dictionary",
  /* Z_NEED_DICT       2  */
  1: "stream end",
  /* Z_STREAM_END      1  */
  0: "",
  /* Z_OK              0  */
  "-1": "file error",
  /* Z_ERRNO         (-1) */
  "-2": "stream error",
  /* Z_STREAM_ERROR  (-2) */
  "-3": "data error",
  /* Z_DATA_ERROR    (-3) */
  "-4": "insufficient memory",
  /* Z_MEM_ERROR     (-4) */
  "-5": "buffer error",
  /* Z_BUF_ERROR     (-5) */
  "-6": "incompatible version"
  /* Z_VERSION_ERROR (-6) */
};
function ZStream() {
  this.input = null;
  this.next_in = 0;
  this.avail_in = 0;
  this.total_in = 0;
  this.output = null;
  this.next_out = 0;
  this.avail_out = 0;
  this.total_out = 0;
  this.msg = "";
  this.state = null;
  this.data_type = 2;
  this.adler = 0;
}
function GZheader() {
  this.text = 0;
  this.time = 0;
  this.xflags = 0;
  this.os = 0;
  this.extra = null;
  this.extra_len = 0;
  this.name = "";
  this.comment = "";
  this.hcrc = 0;
  this.done = false;
}
var toString = Object.prototype.toString;
var Inflate = function Inflate2(options) {
  if (!(this instanceof Inflate2)) {
    return new Inflate2(options);
  }
  this.options = assign({
    chunkSize: 16384,
    windowBits: 0,
    to: ""
  }, options || {});
  var opt = this.options;
  if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
    opt.windowBits = -opt.windowBits;
    if (opt.windowBits === 0) {
      opt.windowBits = -15;
    }
  }
  if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
    opt.windowBits += 32;
  }
  if (opt.windowBits > 15 && opt.windowBits < 48) {
    if ((opt.windowBits & 15) === 0) {
      opt.windowBits |= 15;
    }
  }
  this.err = 0;
  this.msg = "";
  this.ended = false;
  this.chunks = [];
  this.strm = new ZStream();
  this.strm.avail_out = 0;
  var status = inflateInit2(
    this.strm,
    opt.windowBits
  );
  if (status !== Z_OK) {
    throw new Error(msg[status]);
  }
  this.header = new GZheader();
  inflateGetHeader(this.strm, this.header);
  if (opt.dictionary) {
    if (typeof opt.dictionary === "string") {
      opt.dictionary = string2buf(opt.dictionary);
    } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
      opt.dictionary = new Uint8Array(opt.dictionary);
    }
    if (opt.raw) {
      status = inflateSetDictionary(this.strm, opt.dictionary);
      if (status !== Z_OK) {
        throw new Error(msg[status]);
      }
    }
  }
};
Inflate.prototype.push = function push(data, mode) {
  var strm = this.strm;
  var chunkSize = this.options.chunkSize;
  var dictionary = this.options.dictionary;
  var status, _mode;
  var next_out_utf8, tail, utf8str;
  var dict;
  var allowBufError = false;
  if (this.ended) {
    return false;
  }
  _mode = mode === ~~mode ? mode : mode === true ? Z_FINISH : Z_NO_FLUSH;
  if (typeof data === "string") {
    strm.input = binstring2buf(data);
  } else if (toString.call(data) === "[object ArrayBuffer]") {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }
  strm.next_in = 0;
  strm.avail_in = strm.input.length;
  do {
    if (strm.avail_out === 0) {
      strm.output = Buf8(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }
    status = inflate(strm, Z_NO_FLUSH);
    if (status === Z_NEED_DICT && dictionary) {
      if (typeof dictionary === "string") {
        dict = string2buf(dictionary);
      } else if (toString.call(dictionary) === "[object ArrayBuffer]") {
        dict = new Uint8Array(dictionary);
      } else {
        dict = dictionary;
      }
      status = inflateSetDictionary(this.strm, dict);
    }
    if (status === Z_BUF_ERROR && allowBufError === true) {
      status = Z_OK;
      allowBufError = false;
    }
    if (status !== Z_STREAM_END && status !== Z_OK) {
      this.onEnd(status);
      this.ended = true;
      return false;
    }
    if (strm.next_out) {
      if (strm.avail_out === 0 || status === Z_STREAM_END || strm.avail_in === 0 && (_mode === Z_FINISH || _mode === Z_SYNC_FLUSH)) {
        if (this.options.to === "string") {
          next_out_utf8 = utf8border(strm.output, strm.next_out);
          tail = strm.next_out - next_out_utf8;
          utf8str = buf2string(strm.output, next_out_utf8);
          strm.next_out = tail;
          strm.avail_out = chunkSize - tail;
          if (tail) {
            arraySet(strm.output, strm.output, next_out_utf8, tail, 0);
          }
          this.onData(utf8str);
        } else {
          this.onData(shrinkBuf(strm.output, strm.next_out));
        }
      }
    }
    if (strm.avail_in === 0 && strm.avail_out === 0) {
      allowBufError = true;
    }
  } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== Z_STREAM_END);
  if (status === Z_STREAM_END) {
    _mode = Z_FINISH;
  }
  if (_mode === Z_FINISH) {
    status = inflateEnd(this.strm);
    this.onEnd(status);
    this.ended = true;
    return status === Z_OK;
  }
  if (_mode === Z_SYNC_FLUSH) {
    this.onEnd(Z_OK);
    strm.avail_out = 0;
    return true;
  }
  return true;
};
Inflate.prototype.onData = function onData(chunk) {
  this.chunks.push(chunk);
};
Inflate.prototype.onEnd = function onEnd(status) {
  if (status === Z_OK) {
    if (this.options.to === "string") {
      this.result = this.chunks.join("");
    } else {
      this.result = flattenChunks(this.chunks);
    }
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};
function zero(buf) {
  var len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
}
var STORED_BLOCK = 0;
var STATIC_TREES = 1;
var DYN_TREES = 2;
var MIN_MATCH = 3;
var MAX_MATCH = 258;
var LENGTH_CODES = 29;
var LITERALS = 256;
var L_CODES = LITERALS + 1 + LENGTH_CODES;
var D_CODES = 30;
var BL_CODES = 19;
var HEAP_SIZE = 2 * L_CODES + 1;
var MAX_BITS = 15;
var Buf_size = 16;
var MAX_BL_BITS = 7;
var END_BLOCK = 256;
var REP_3_6 = 16;
var REPZ_3_10 = 17;
var REPZ_11_138 = 18;
var extra_lbits = (
  /* extra bits for each length code */
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
);
var extra_dbits = (
  /* extra bits for each distance code */
  [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
);
var extra_blbits = (
  /* extra bits for each bit length code */
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]
);
var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
var DIST_CODE_LEN = 512;
var static_ltree;
var static_dtree;
var _dist_code;
var _length_code;
var base_length;
var base_dist;
function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
  this.static_tree = static_tree;
  this.extra_bits = extra_bits;
  this.extra_base = extra_base;
  this.elems = elems;
  this.max_length = max_length;
  this.has_stree = static_tree && static_tree.length;
}
var static_l_desc;
var static_d_desc;
var static_bl_desc;
function TreeDesc(dyn_tree, stat_desc) {
  this.dyn_tree = dyn_tree;
  this.max_code = 0;
  this.stat_desc = stat_desc;
}
function d_code(dist) {
  return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
}
function put_short(s, w) {
  s.pending_buf[s.pending++] = w & 255;
  s.pending_buf[s.pending++] = w >>> 8 & 255;
}
function send_bits(s, value, length) {
  if (s.bi_valid > Buf_size - length) {
    s.bi_buf |= value << s.bi_valid & 65535;
    put_short(s, s.bi_buf);
    s.bi_buf = value >> Buf_size - s.bi_valid;
    s.bi_valid += length - Buf_size;
  } else {
    s.bi_buf |= value << s.bi_valid & 65535;
    s.bi_valid += length;
  }
}
function send_code(s, c, tree) {
  send_bits(
    s,
    tree[c * 2],
    tree[c * 2 + 1]
    /*.Len*/
  );
}
function bi_reverse(code, len) {
  var res = 0;
  do {
    res |= code & 1;
    code >>>= 1;
    res <<= 1;
  } while (--len > 0);
  return res >>> 1;
}
function bi_flush(s) {
  if (s.bi_valid === 16) {
    put_short(s, s.bi_buf);
    s.bi_buf = 0;
    s.bi_valid = 0;
  } else if (s.bi_valid >= 8) {
    s.pending_buf[s.pending++] = s.bi_buf & 255;
    s.bi_buf >>= 8;
    s.bi_valid -= 8;
  }
}
function gen_bitlen(s, desc) {
  var tree = desc.dyn_tree;
  var max_code = desc.max_code;
  var stree = desc.stat_desc.static_tree;
  var has_stree = desc.stat_desc.has_stree;
  var extra = desc.stat_desc.extra_bits;
  var base = desc.stat_desc.extra_base;
  var max_length = desc.stat_desc.max_length;
  var h;
  var n, m;
  var bits;
  var xbits;
  var f;
  var overflow = 0;
  for (bits = 0; bits <= MAX_BITS; bits++) {
    s.bl_count[bits] = 0;
  }
  tree[s.heap[s.heap_max] * 2 + 1] = 0;
  for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
    n = s.heap[h];
    bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
    if (bits > max_length) {
      bits = max_length;
      overflow++;
    }
    tree[n * 2 + 1] = bits;
    if (n > max_code) {
      continue;
    }
    s.bl_count[bits]++;
    xbits = 0;
    if (n >= base) {
      xbits = extra[n - base];
    }
    f = tree[n * 2];
    s.opt_len += f * (bits + xbits);
    if (has_stree) {
      s.static_len += f * (stree[n * 2 + 1] + xbits);
    }
  }
  if (overflow === 0) {
    return;
  }
  do {
    bits = max_length - 1;
    while (s.bl_count[bits] === 0) {
      bits--;
    }
    s.bl_count[bits]--;
    s.bl_count[bits + 1] += 2;
    s.bl_count[max_length]--;
    overflow -= 2;
  } while (overflow > 0);
  for (bits = max_length; bits !== 0; bits--) {
    n = s.bl_count[bits];
    while (n !== 0) {
      m = s.heap[--h];
      if (m > max_code) {
        continue;
      }
      if (tree[m * 2 + 1] !== bits) {
        s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
        tree[m * 2 + 1] = bits;
      }
      n--;
    }
  }
}
function gen_codes(tree, max_code, bl_count) {
  var next_code = new Array(MAX_BITS + 1);
  var code = 0;
  var bits;
  var n;
  for (bits = 1; bits <= MAX_BITS; bits++) {
    next_code[bits] = code = code + bl_count[bits - 1] << 1;
  }
  for (n = 0; n <= max_code; n++) {
    var len = tree[n * 2 + 1];
    if (len === 0) {
      continue;
    }
    tree[n * 2] = bi_reverse(next_code[len]++, len);
  }
}
function tr_static_init() {
  var n;
  var bits;
  var length;
  var code;
  var dist;
  var bl_count = new Array(MAX_BITS + 1);
  static_ltree = new Array((L_CODES + 2) * 2);
  zero(static_ltree);
  static_dtree = new Array(D_CODES * 2);
  zero(static_dtree);
  _dist_code = new Array(DIST_CODE_LEN);
  zero(_dist_code);
  _length_code = new Array(MAX_MATCH - MIN_MATCH + 1);
  zero(_length_code);
  base_length = new Array(LENGTH_CODES);
  zero(base_length);
  base_dist = new Array(D_CODES);
  zero(base_dist);
  length = 0;
  for (code = 0; code < LENGTH_CODES - 1; code++) {
    base_length[code] = length;
    for (n = 0; n < 1 << extra_lbits[code]; n++) {
      _length_code[length++] = code;
    }
  }
  _length_code[length - 1] = code;
  dist = 0;
  for (code = 0; code < 16; code++) {
    base_dist[code] = dist;
    for (n = 0; n < 1 << extra_dbits[code]; n++) {
      _dist_code[dist++] = code;
    }
  }
  dist >>= 7;
  for (; code < D_CODES; code++) {
    base_dist[code] = dist << 7;
    for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
      _dist_code[256 + dist++] = code;
    }
  }
  for (bits = 0; bits <= MAX_BITS; bits++) {
    bl_count[bits] = 0;
  }
  n = 0;
  while (n <= 143) {
    static_ltree[n * 2 + 1] = 8;
    n++;
    bl_count[8]++;
  }
  while (n <= 255) {
    static_ltree[n * 2 + 1] = 9;
    n++;
    bl_count[9]++;
  }
  while (n <= 279) {
    static_ltree[n * 2 + 1] = 7;
    n++;
    bl_count[7]++;
  }
  while (n <= 287) {
    static_ltree[n * 2 + 1] = 8;
    n++;
    bl_count[8]++;
  }
  gen_codes(static_ltree, L_CODES + 1, bl_count);
  for (n = 0; n < D_CODES; n++) {
    static_dtree[n * 2 + 1] = 5;
    static_dtree[n * 2] = bi_reverse(n, 5);
  }
  static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
  static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
  static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
}
function init_block(s) {
  var n;
  for (n = 0; n < L_CODES; n++) {
    s.dyn_ltree[n * 2] = 0;
  }
  for (n = 0; n < D_CODES; n++) {
    s.dyn_dtree[n * 2] = 0;
  }
  for (n = 0; n < BL_CODES; n++) {
    s.bl_tree[n * 2] = 0;
  }
  s.dyn_ltree[END_BLOCK * 2] = 1;
  s.opt_len = s.static_len = 0;
  s.last_lit = s.matches = 0;
}
function bi_windup(s) {
  if (s.bi_valid > 8) {
    put_short(s, s.bi_buf);
  } else if (s.bi_valid > 0) {
    s.pending_buf[s.pending++] = s.bi_buf;
  }
  s.bi_buf = 0;
  s.bi_valid = 0;
}
function copy_block(s, buf, len, header) {
  bi_windup(s);
  if (header) {
    put_short(s, len);
    put_short(s, ~len);
  }
  arraySet(s.pending_buf, s.window, buf, len, s.pending);
  s.pending += len;
}
function smaller(tree, n, m, depth) {
  var _n2 = n * 2;
  var _m2 = m * 2;
  return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
}
function pqdownheap(s, tree, k) {
  var v = s.heap[k];
  var j = k << 1;
  while (j <= s.heap_len) {
    if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
      j++;
    }
    if (smaller(tree, v, s.heap[j], s.depth)) {
      break;
    }
    s.heap[k] = s.heap[j];
    k = j;
    j <<= 1;
  }
  s.heap[k] = v;
}
function compress_block(s, ltree, dtree) {
  var dist;
  var lc;
  var lx = 0;
  var code;
  var extra;
  if (s.last_lit !== 0) {
    do {
      dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1];
      lc = s.pending_buf[s.l_buf + lx];
      lx++;
      if (dist === 0) {
        send_code(s, lc, ltree);
      } else {
        code = _length_code[lc];
        send_code(s, code + LITERALS + 1, ltree);
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s, lc, extra);
        }
        dist--;
        code = d_code(dist);
        send_code(s, code, dtree);
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s, dist, extra);
        }
      }
    } while (lx < s.last_lit);
  }
  send_code(s, END_BLOCK, ltree);
}
function build_tree(s, desc) {
  var tree = desc.dyn_tree;
  var stree = desc.stat_desc.static_tree;
  var has_stree = desc.stat_desc.has_stree;
  var elems = desc.stat_desc.elems;
  var n, m;
  var max_code = -1;
  var node;
  s.heap_len = 0;
  s.heap_max = HEAP_SIZE;
  for (n = 0; n < elems; n++) {
    if (tree[n * 2] !== 0) {
      s.heap[++s.heap_len] = max_code = n;
      s.depth[n] = 0;
    } else {
      tree[n * 2 + 1] = 0;
    }
  }
  while (s.heap_len < 2) {
    node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
    tree[node * 2] = 1;
    s.depth[node] = 0;
    s.opt_len--;
    if (has_stree) {
      s.static_len -= stree[node * 2 + 1];
    }
  }
  desc.max_code = max_code;
  for (n = s.heap_len >> 1; n >= 1; n--) {
    pqdownheap(s, tree, n);
  }
  node = elems;
  do {
    n = s.heap[
      1
      /*SMALLEST*/
    ];
    s.heap[
      1
      /*SMALLEST*/
    ] = s.heap[s.heap_len--];
    pqdownheap(
      s,
      tree,
      1
      /*SMALLEST*/
    );
    m = s.heap[
      1
      /*SMALLEST*/
    ];
    s.heap[--s.heap_max] = n;
    s.heap[--s.heap_max] = m;
    tree[node * 2] = tree[n * 2] + tree[m * 2];
    s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
    tree[n * 2 + 1] = tree[m * 2 + 1] = node;
    s.heap[
      1
      /*SMALLEST*/
    ] = node++;
    pqdownheap(
      s,
      tree,
      1
      /*SMALLEST*/
    );
  } while (s.heap_len >= 2);
  s.heap[--s.heap_max] = s.heap[
    1
    /*SMALLEST*/
  ];
  gen_bitlen(s, desc);
  gen_codes(tree, max_code, s.bl_count);
}
function scan_tree(s, tree, max_code) {
  var n;
  var prevlen = -1;
  var curlen;
  var nextlen = tree[0 * 2 + 1];
  var count = 0;
  var max_count = 7;
  var min_count = 4;
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  tree[(max_code + 1) * 2 + 1] = 65535;
  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1];
    if (++count < max_count && curlen === nextlen) {
      continue;
    } else if (count < min_count) {
      s.bl_tree[curlen * 2] += count;
    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        s.bl_tree[curlen * 2]++;
      }
      s.bl_tree[REP_3_6 * 2]++;
    } else if (count <= 10) {
      s.bl_tree[REPZ_3_10 * 2]++;
    } else {
      s.bl_tree[REPZ_11_138 * 2]++;
    }
    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}
function send_tree(s, tree, max_code) {
  var n;
  var prevlen = -1;
  var curlen;
  var nextlen = tree[0 * 2 + 1];
  var count = 0;
  var max_count = 7;
  var min_count = 4;
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1];
    if (++count < max_count && curlen === nextlen) {
      continue;
    } else if (count < min_count) {
      do {
        send_code(s, curlen, s.bl_tree);
      } while (--count !== 0);
    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        send_code(s, curlen, s.bl_tree);
        count--;
      }
      send_code(s, REP_3_6, s.bl_tree);
      send_bits(s, count - 3, 2);
    } else if (count <= 10) {
      send_code(s, REPZ_3_10, s.bl_tree);
      send_bits(s, count - 3, 3);
    } else {
      send_code(s, REPZ_11_138, s.bl_tree);
      send_bits(s, count - 11, 7);
    }
    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}
function build_bl_tree(s) {
  var max_blindex;
  scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
  scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
  build_tree(s, s.bl_desc);
  for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
    if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
      break;
    }
  }
  s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
  return max_blindex;
}
function send_all_trees(s, lcodes, dcodes, blcodes) {
  var rank2;
  send_bits(s, lcodes - 257, 5);
  send_bits(s, dcodes - 1, 5);
  send_bits(s, blcodes - 4, 4);
  for (rank2 = 0; rank2 < blcodes; rank2++) {
    send_bits(s, s.bl_tree[bl_order[rank2] * 2 + 1], 3);
  }
  send_tree(s, s.dyn_ltree, lcodes - 1);
  send_tree(s, s.dyn_dtree, dcodes - 1);
}
function detect_data_type(s) {
  var black_mask = 4093624447;
  var n;
  for (n = 0; n <= 31; n++, black_mask >>>= 1) {
    if (black_mask & 1 && s.dyn_ltree[n * 2] !== 0) {
      return Z_BINARY;
    }
  }
  if (s.dyn_ltree[9 * 2] !== 0 || s.dyn_ltree[10 * 2] !== 0 || s.dyn_ltree[13 * 2] !== 0) {
    return Z_TEXT;
  }
  for (n = 32; n < LITERALS; n++) {
    if (s.dyn_ltree[n * 2] !== 0) {
      return Z_TEXT;
    }
  }
  return Z_BINARY;
}
var static_init_done = false;
function _tr_init(s) {
  if (!static_init_done) {
    tr_static_init();
    static_init_done = true;
  }
  s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
  s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
  s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
  s.bi_buf = 0;
  s.bi_valid = 0;
  init_block(s);
}
function _tr_stored_block(s, buf, stored_len, last) {
  send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
  copy_block(s, buf, stored_len, true);
}
function _tr_align(s) {
  send_bits(s, STATIC_TREES << 1, 3);
  send_code(s, END_BLOCK, static_ltree);
  bi_flush(s);
}
function _tr_flush_block(s, buf, stored_len, last) {
  var opt_lenb, static_lenb;
  var max_blindex = 0;
  if (s.level > 0) {
    if (s.strm.data_type === Z_UNKNOWN) {
      s.strm.data_type = detect_data_type(s);
    }
    build_tree(s, s.l_desc);
    build_tree(s, s.d_desc);
    max_blindex = build_bl_tree(s);
    opt_lenb = s.opt_len + 3 + 7 >>> 3;
    static_lenb = s.static_len + 3 + 7 >>> 3;
    if (static_lenb <= opt_lenb) {
      opt_lenb = static_lenb;
    }
  } else {
    opt_lenb = static_lenb = stored_len + 5;
  }
  if (stored_len + 4 <= opt_lenb && buf !== -1) {
    _tr_stored_block(s, buf, stored_len, last);
  } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
    send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
    compress_block(s, static_ltree, static_dtree);
  } else {
    send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
    send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
    compress_block(s, s.dyn_ltree, s.dyn_dtree);
  }
  init_block(s);
  if (last) {
    bi_windup(s);
  }
}
function _tr_tally(s, dist, lc) {
  s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 255;
  s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 255;
  s.pending_buf[s.l_buf + s.last_lit] = lc & 255;
  s.last_lit++;
  if (dist === 0) {
    s.dyn_ltree[lc * 2]++;
  } else {
    s.matches++;
    dist--;
    s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++;
    s.dyn_dtree[d_code(dist) * 2]++;
  }
  return s.last_lit === s.lit_bufsize - 1;
}
var MAX_MEM_LEVEL = 9;
var LENGTH_CODES$1 = 29;
var LITERALS$1 = 256;
var L_CODES$1 = LITERALS$1 + 1 + LENGTH_CODES$1;
var D_CODES$1 = 30;
var BL_CODES$1 = 19;
var HEAP_SIZE$1 = 2 * L_CODES$1 + 1;
var MAX_BITS$1 = 15;
var MIN_MATCH$1 = 3;
var MAX_MATCH$1 = 258;
var MIN_LOOKAHEAD = MAX_MATCH$1 + MIN_MATCH$1 + 1;
var PRESET_DICT = 32;
var INIT_STATE = 42;
var EXTRA_STATE = 69;
var NAME_STATE = 73;
var COMMENT_STATE = 91;
var HCRC_STATE = 103;
var BUSY_STATE = 113;
var FINISH_STATE = 666;
var BS_NEED_MORE = 1;
var BS_BLOCK_DONE = 2;
var BS_FINISH_STARTED = 3;
var BS_FINISH_DONE = 4;
var OS_CODE = 3;
function err(strm, errorCode) {
  strm.msg = msg[errorCode];
  return errorCode;
}
function rank(f) {
  return (f << 1) - (f > 4 ? 9 : 0);
}
function zero$1(buf) {
  var len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
}
function flush_pending(strm) {
  var s = strm.state;
  var len = s.pending;
  if (len > strm.avail_out) {
    len = strm.avail_out;
  }
  if (len === 0) {
    return;
  }
  arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out);
  strm.next_out += len;
  s.pending_out += len;
  strm.total_out += len;
  strm.avail_out -= len;
  s.pending -= len;
  if (s.pending === 0) {
    s.pending_out = 0;
  }
}
function flush_block_only(s, last) {
  _tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
  s.block_start = s.strstart;
  flush_pending(s.strm);
}
function put_byte(s, b) {
  s.pending_buf[s.pending++] = b;
}
function putShortMSB(s, b) {
  s.pending_buf[s.pending++] = b >>> 8 & 255;
  s.pending_buf[s.pending++] = b & 255;
}
function read_buf(strm, buf, start, size) {
  var len = strm.avail_in;
  if (len > size) {
    len = size;
  }
  if (len === 0) {
    return 0;
  }
  strm.avail_in -= len;
  arraySet(buf, strm.input, strm.next_in, len, start);
  if (strm.state.wrap === 1) {
    strm.adler = adler32(strm.adler, buf, len, start);
  } else if (strm.state.wrap === 2) {
    strm.adler = crc32(strm.adler, buf, len, start);
  }
  strm.next_in += len;
  strm.total_in += len;
  return len;
}
function longest_match(s, cur_match) {
  var chain_length = s.max_chain_length;
  var scan = s.strstart;
  var match;
  var len;
  var best_len = s.prev_length;
  var nice_match = s.nice_match;
  var limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
  var _win = s.window;
  var wmask = s.w_mask;
  var prev = s.prev;
  var strend = s.strstart + MAX_MATCH$1;
  var scan_end1 = _win[scan + best_len - 1];
  var scan_end = _win[scan + best_len];
  if (s.prev_length >= s.good_match) {
    chain_length >>= 2;
  }
  if (nice_match > s.lookahead) {
    nice_match = s.lookahead;
  }
  do {
    match = cur_match;
    if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
      continue;
    }
    scan += 2;
    match++;
    do {
    } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
    len = MAX_MATCH$1 - (strend - scan);
    scan = strend - MAX_MATCH$1;
    if (len > best_len) {
      s.match_start = cur_match;
      best_len = len;
      if (len >= nice_match) {
        break;
      }
      scan_end1 = _win[scan + best_len - 1];
      scan_end = _win[scan + best_len];
    }
  } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
  if (best_len <= s.lookahead) {
    return best_len;
  }
  return s.lookahead;
}
function fill_window(s) {
  var _w_size = s.w_size;
  var p, n, m, more, str;
  do {
    more = s.window_size - s.lookahead - s.strstart;
    if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
      arraySet(s.window, s.window, _w_size, _w_size, 0);
      s.match_start -= _w_size;
      s.strstart -= _w_size;
      s.block_start -= _w_size;
      n = s.hash_size;
      p = n;
      do {
        m = s.head[--p];
        s.head[p] = m >= _w_size ? m - _w_size : 0;
      } while (--n);
      n = _w_size;
      p = n;
      do {
        m = s.prev[--p];
        s.prev[p] = m >= _w_size ? m - _w_size : 0;
      } while (--n);
      more += _w_size;
    }
    if (s.strm.avail_in === 0) {
      break;
    }
    n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
    s.lookahead += n;
    if (s.lookahead + s.insert >= MIN_MATCH$1) {
      str = s.strstart - s.insert;
      s.ins_h = s.window[str];
      s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + 1]) & s.hash_mask;
      while (s.insert) {
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH$1 - 1]) & s.hash_mask;
        s.prev[str & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = str;
        str++;
        s.insert--;
        if (s.lookahead + s.insert < MIN_MATCH$1) {
          break;
        }
      }
    }
  } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
}
function deflate_stored(s, flush2) {
  var max_block_size = 65535;
  if (max_block_size > s.pending_buf_size - 5) {
    max_block_size = s.pending_buf_size - 5;
  }
  for (; ; ) {
    if (s.lookahead <= 1) {
      fill_window(s);
      if (s.lookahead === 0 && flush2 === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      }
    }
    s.strstart += s.lookahead;
    s.lookahead = 0;
    var max_start = s.block_start + max_block_size;
    if (s.strstart === 0 || s.strstart >= max_start) {
      s.lookahead = s.strstart - max_start;
      s.strstart = max_start;
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
    if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s.insert = 0;
  if (flush2 === Z_FINISH) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.strstart > s.block_start) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_NEED_MORE;
}
function deflate_fast(s, flush2) {
  var hash_head;
  var bflush;
  for (; ; ) {
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush2 === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      }
    }
    hash_head = 0;
    if (s.lookahead >= MIN_MATCH$1) {
      s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH$1 - 1]) & s.hash_mask;
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
    }
    if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
      s.match_length = longest_match(s, hash_head);
    }
    if (s.match_length >= MIN_MATCH$1) {
      bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH$1);
      s.lookahead -= s.match_length;
      if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH$1) {
        s.match_length--;
        do {
          s.strstart++;
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH$1 - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        } while (--s.match_length !== 0);
        s.strstart++;
      } else {
        s.strstart += s.match_length;
        s.match_length = 0;
        s.ins_h = s.window[s.strstart];
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + 1]) & s.hash_mask;
      }
    } else {
      bflush = _tr_tally(s, 0, s.window[s.strstart]);
      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s.insert = s.strstart < MIN_MATCH$1 - 1 ? s.strstart : MIN_MATCH$1 - 1;
  if (flush2 === Z_FINISH) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function deflate_slow(s, flush2) {
  var hash_head;
  var bflush;
  var max_insert;
  for (; ; ) {
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush2 === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      }
    }
    hash_head = 0;
    if (s.lookahead >= MIN_MATCH$1) {
      s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH$1 - 1]) & s.hash_mask;
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
    }
    s.prev_length = s.match_length;
    s.prev_match = s.match_start;
    s.match_length = MIN_MATCH$1 - 1;
    if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
      s.match_length = longest_match(s, hash_head);
      if (s.match_length <= 5 && (s.strategy === Z_FILTERED || s.match_length === MIN_MATCH$1 && s.strstart - s.match_start > 4096)) {
        s.match_length = MIN_MATCH$1 - 1;
      }
    }
    if (s.prev_length >= MIN_MATCH$1 && s.match_length <= s.prev_length) {
      max_insert = s.strstart + s.lookahead - MIN_MATCH$1;
      bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH$1);
      s.lookahead -= s.prev_length - 1;
      s.prev_length -= 2;
      do {
        if (++s.strstart <= max_insert) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH$1 - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
        }
      } while (--s.prev_length !== 0);
      s.match_available = 0;
      s.match_length = MIN_MATCH$1 - 1;
      s.strstart++;
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
    } else if (s.match_available) {
      bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
      if (bflush) {
        flush_block_only(s, false);
      }
      s.strstart++;
      s.lookahead--;
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    } else {
      s.match_available = 1;
      s.strstart++;
      s.lookahead--;
    }
  }
  if (s.match_available) {
    bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
    s.match_available = 0;
  }
  s.insert = s.strstart < MIN_MATCH$1 - 1 ? s.strstart : MIN_MATCH$1 - 1;
  if (flush2 === Z_FINISH) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function deflate_rle(s, flush2) {
  var bflush;
  var prev;
  var scan, strend;
  var _win = s.window;
  for (; ; ) {
    if (s.lookahead <= MAX_MATCH$1) {
      fill_window(s);
      if (s.lookahead <= MAX_MATCH$1 && flush2 === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      }
    }
    s.match_length = 0;
    if (s.lookahead >= MIN_MATCH$1 && s.strstart > 0) {
      scan = s.strstart - 1;
      prev = _win[scan];
      if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
        strend = s.strstart + MAX_MATCH$1;
        do {
        } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);
        s.match_length = MAX_MATCH$1 - (strend - scan);
        if (s.match_length > s.lookahead) {
          s.match_length = s.lookahead;
        }
      }
    }
    if (s.match_length >= MIN_MATCH$1) {
      bflush = _tr_tally(s, 1, s.match_length - MIN_MATCH$1);
      s.lookahead -= s.match_length;
      s.strstart += s.match_length;
      s.match_length = 0;
    } else {
      bflush = _tr_tally(s, 0, s.window[s.strstart]);
      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s.insert = 0;
  if (flush2 === Z_FINISH) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function deflate_huff(s, flush2) {
  var bflush;
  for (; ; ) {
    if (s.lookahead === 0) {
      fill_window(s);
      if (s.lookahead === 0) {
        if (flush2 === Z_NO_FLUSH) {
          return BS_NEED_MORE;
        }
        break;
      }
    }
    s.match_length = 0;
    bflush = _tr_tally(s, 0, s.window[s.strstart]);
    s.lookahead--;
    s.strstart++;
    if (bflush) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
  }
  s.insert = 0;
  if (flush2 === Z_FINISH) {
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
  }
  return BS_BLOCK_DONE;
}
function Config(good_length, max_lazy, nice_length, max_chain, func) {
  this.good_length = good_length;
  this.max_lazy = max_lazy;
  this.nice_length = nice_length;
  this.max_chain = max_chain;
  this.func = func;
}
var configurationTable = function() {
  var table = [
    /*      good lazy nice chain */
    new Config(0, 0, 0, 0, deflate_stored),
    /* 0 store only */
    new Config(4, 4, 8, 4, deflate_fast),
    /* 1 max speed, no lazy matches */
    new Config(4, 5, 16, 8, deflate_fast),
    /* 2 */
    new Config(4, 6, 32, 32, deflate_fast),
    /* 3 */
    new Config(4, 4, 16, 16, deflate_slow),
    /* 4 lazy matches */
    new Config(8, 16, 32, 32, deflate_slow),
    /* 5 */
    new Config(8, 16, 128, 128, deflate_slow),
    /* 6 */
    new Config(8, 32, 128, 256, deflate_slow),
    /* 7 */
    new Config(32, 128, 258, 1024, deflate_slow),
    /* 8 */
    new Config(32, 258, 258, 4096, deflate_slow)
    /* 9 max compression */
  ];
  configurationTable = function() {
    return table;
  };
  return table;
};
function lm_init(s) {
  s.window_size = 2 * s.w_size;
  zero$1(s.head);
  var table = configurationTable();
  s.max_lazy_match = table[s.level].max_lazy;
  s.good_match = table[s.level].good_length;
  s.nice_match = table[s.level].nice_length;
  s.max_chain_length = table[s.level].max_chain;
  s.strstart = 0;
  s.block_start = 0;
  s.lookahead = 0;
  s.insert = 0;
  s.match_length = s.prev_length = MIN_MATCH$1 - 1;
  s.match_available = 0;
  s.ins_h = 0;
}
function DeflateState() {
  this.strm = null;
  this.status = 0;
  this.pending_buf = null;
  this.pending_buf_size = 0;
  this.pending_out = 0;
  this.pending = 0;
  this.wrap = 0;
  this.gzhead = null;
  this.gzindex = 0;
  this.method = Z_DEFLATED;
  this.last_flush = -1;
  this.w_size = 0;
  this.w_bits = 0;
  this.w_mask = 0;
  this.window = null;
  this.window_size = 0;
  this.prev = null;
  this.head = null;
  this.ins_h = 0;
  this.hash_size = 0;
  this.hash_bits = 0;
  this.hash_mask = 0;
  this.hash_shift = 0;
  this.block_start = 0;
  this.match_length = 0;
  this.prev_match = 0;
  this.match_available = 0;
  this.strstart = 0;
  this.match_start = 0;
  this.lookahead = 0;
  this.prev_length = 0;
  this.max_chain_length = 0;
  this.max_lazy_match = 0;
  this.level = 0;
  this.strategy = 0;
  this.good_match = 0;
  this.nice_match = 0;
  this.dyn_ltree = Buf16(HEAP_SIZE$1 * 2);
  this.dyn_dtree = Buf16((2 * D_CODES$1 + 1) * 2);
  this.bl_tree = Buf16((2 * BL_CODES$1 + 1) * 2);
  zero$1(this.dyn_ltree);
  zero$1(this.dyn_dtree);
  zero$1(this.bl_tree);
  this.l_desc = null;
  this.d_desc = null;
  this.bl_desc = null;
  this.bl_count = Buf16(MAX_BITS$1 + 1);
  this.heap = Buf16(2 * L_CODES$1 + 1);
  zero$1(this.heap);
  this.heap_len = 0;
  this.heap_max = 0;
  this.depth = Buf16(2 * L_CODES$1 + 1);
  zero$1(this.depth);
  this.l_buf = 0;
  this.lit_bufsize = 0;
  this.last_lit = 0;
  this.d_buf = 0;
  this.opt_len = 0;
  this.static_len = 0;
  this.matches = 0;
  this.insert = 0;
  this.bi_buf = 0;
  this.bi_valid = 0;
}
function deflateResetKeep(strm) {
  var s;
  if (!strm || !strm.state) {
    return err(strm, Z_STREAM_ERROR);
  }
  strm.total_in = strm.total_out = 0;
  strm.data_type = Z_UNKNOWN;
  s = strm.state;
  s.pending = 0;
  s.pending_out = 0;
  if (s.wrap < 0) {
    s.wrap = -s.wrap;
  }
  s.status = s.wrap ? INIT_STATE : BUSY_STATE;
  strm.adler = s.wrap === 2 ? 0 : 1;
  s.last_flush = Z_NO_FLUSH;
  _tr_init(s);
  return Z_OK;
}
function deflateReset(strm) {
  var ret = deflateResetKeep(strm);
  if (ret === Z_OK) {
    lm_init(strm.state);
  }
  return ret;
}
function deflateSetHeader(strm, head) {
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  if (strm.state.wrap !== 2) {
    return Z_STREAM_ERROR;
  }
  strm.state.gzhead = head;
  return Z_OK;
}
function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
  if (!strm) {
    return Z_STREAM_ERROR;
  }
  var wrap = 1;
  if (level === Z_DEFAULT_COMPRESSION) {
    level = 6;
  }
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  } else if (windowBits > 15) {
    wrap = 2;
    windowBits -= 16;
  }
  if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
    return err(strm, Z_STREAM_ERROR);
  }
  if (windowBits === 8) {
    windowBits = 9;
  }
  var s = new DeflateState();
  strm.state = s;
  s.strm = strm;
  s.wrap = wrap;
  s.gzhead = null;
  s.w_bits = windowBits;
  s.w_size = 1 << s.w_bits;
  s.w_mask = s.w_size - 1;
  s.hash_bits = memLevel + 7;
  s.hash_size = 1 << s.hash_bits;
  s.hash_mask = s.hash_size - 1;
  s.hash_shift = ~~((s.hash_bits + MIN_MATCH$1 - 1) / MIN_MATCH$1);
  s.window = Buf8(s.w_size * 2);
  s.head = Buf16(s.hash_size);
  s.prev = Buf16(s.w_size);
  s.lit_bufsize = 1 << memLevel + 6;
  s.pending_buf_size = s.lit_bufsize * 4;
  s.pending_buf = Buf8(s.pending_buf_size);
  s.d_buf = 1 * s.lit_bufsize;
  s.l_buf = (1 + 2) * s.lit_bufsize;
  s.level = level;
  s.strategy = strategy;
  s.method = method;
  return deflateReset(strm);
}
function deflate(strm, flush2) {
  var old_flush, s;
  var beg, val;
  if (!strm || !strm.state || flush2 > Z_BLOCK || flush2 < 0) {
    return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
  }
  s = strm.state;
  if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === FINISH_STATE && flush2 !== Z_FINISH) {
    return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR : Z_STREAM_ERROR);
  }
  s.strm = strm;
  old_flush = s.last_flush;
  s.last_flush = flush2;
  if (s.status === INIT_STATE) {
    if (s.wrap === 2) {
      strm.adler = 0;
      put_byte(s, 31);
      put_byte(s, 139);
      put_byte(s, 8);
      if (!s.gzhead) {
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
        put_byte(s, OS_CODE);
        s.status = BUSY_STATE;
      } else {
        put_byte(
          s,
          (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16)
        );
        put_byte(s, s.gzhead.time & 255);
        put_byte(s, s.gzhead.time >> 8 & 255);
        put_byte(s, s.gzhead.time >> 16 & 255);
        put_byte(s, s.gzhead.time >> 24 & 255);
        put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
        put_byte(s, s.gzhead.os & 255);
        if (s.gzhead.extra && s.gzhead.extra.length) {
          put_byte(s, s.gzhead.extra.length & 255);
          put_byte(s, s.gzhead.extra.length >> 8 & 255);
        }
        if (s.gzhead.hcrc) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0);
        }
        s.gzindex = 0;
        s.status = EXTRA_STATE;
      }
    } else {
      var header = Z_DEFLATED + (s.w_bits - 8 << 4) << 8;
      var level_flags = -1;
      if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
        level_flags = 0;
      } else if (s.level < 6) {
        level_flags = 1;
      } else if (s.level === 6) {
        level_flags = 2;
      } else {
        level_flags = 3;
      }
      header |= level_flags << 6;
      if (s.strstart !== 0) {
        header |= PRESET_DICT;
      }
      header += 31 - header % 31;
      s.status = BUSY_STATE;
      putShortMSB(s, header);
      if (s.strstart !== 0) {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 65535);
      }
      strm.adler = 1;
    }
  }
  if (s.status === EXTRA_STATE) {
    if (s.gzhead.extra) {
      beg = s.pending;
      while (s.gzindex < (s.gzhead.extra.length & 65535)) {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            break;
          }
        }
        put_byte(s, s.gzhead.extra[s.gzindex] & 255);
        s.gzindex++;
      }
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (s.gzindex === s.gzhead.extra.length) {
        s.gzindex = 0;
        s.status = NAME_STATE;
      }
    } else {
      s.status = NAME_STATE;
    }
  }
  if (s.status === NAME_STATE) {
    if (s.gzhead.name) {
      beg = s.pending;
      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        if (s.gzindex < s.gzhead.name.length) {
          val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.gzindex = 0;
        s.status = COMMENT_STATE;
      }
    } else {
      s.status = COMMENT_STATE;
    }
  }
  if (s.status === COMMENT_STATE) {
    if (s.gzhead.comment) {
      beg = s.pending;
      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        if (s.gzindex < s.gzhead.comment.length) {
          val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.status = HCRC_STATE;
      }
    } else {
      s.status = HCRC_STATE;
    }
  }
  if (s.status === HCRC_STATE) {
    if (s.gzhead.hcrc) {
      if (s.pending + 2 > s.pending_buf_size) {
        flush_pending(strm);
      }
      if (s.pending + 2 <= s.pending_buf_size) {
        put_byte(s, strm.adler & 255);
        put_byte(s, strm.adler >> 8 & 255);
        strm.adler = 0;
        s.status = BUSY_STATE;
      }
    } else {
      s.status = BUSY_STATE;
    }
  }
  if (s.pending !== 0) {
    flush_pending(strm);
    if (strm.avail_out === 0) {
      s.last_flush = -1;
      return Z_OK;
    }
  } else if (strm.avail_in === 0 && rank(flush2) <= rank(old_flush) && flush2 !== Z_FINISH) {
    return err(strm, Z_BUF_ERROR);
  }
  if (s.status === FINISH_STATE && strm.avail_in !== 0) {
    return err(strm, Z_BUF_ERROR);
  }
  if (strm.avail_in !== 0 || s.lookahead !== 0 || flush2 !== Z_NO_FLUSH && s.status !== FINISH_STATE) {
    var bstate = s.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s, flush2) : s.strategy === Z_RLE ? deflate_rle(s, flush2) : configurationTable()[s.level].func(s, flush2);
    if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
      s.status = FINISH_STATE;
    }
    if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
      if (strm.avail_out === 0) {
        s.last_flush = -1;
      }
      return Z_OK;
    }
    if (bstate === BS_BLOCK_DONE) {
      if (flush2 === Z_PARTIAL_FLUSH) {
        _tr_align(s);
      } else if (flush2 !== Z_BLOCK) {
        _tr_stored_block(s, 0, 0, false);
        if (flush2 === Z_FULL_FLUSH) {
          zero$1(s.head);
          if (s.lookahead === 0) {
            s.strstart = 0;
            s.block_start = 0;
            s.insert = 0;
          }
        }
      }
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s.last_flush = -1;
        return Z_OK;
      }
    }
  }
  if (flush2 !== Z_FINISH) {
    return Z_OK;
  }
  if (s.wrap <= 0) {
    return Z_STREAM_END;
  }
  if (s.wrap === 2) {
    put_byte(s, strm.adler & 255);
    put_byte(s, strm.adler >> 8 & 255);
    put_byte(s, strm.adler >> 16 & 255);
    put_byte(s, strm.adler >> 24 & 255);
    put_byte(s, strm.total_in & 255);
    put_byte(s, strm.total_in >> 8 & 255);
    put_byte(s, strm.total_in >> 16 & 255);
    put_byte(s, strm.total_in >> 24 & 255);
  } else {
    putShortMSB(s, strm.adler >>> 16);
    putShortMSB(s, strm.adler & 65535);
  }
  flush_pending(strm);
  if (s.wrap > 0) {
    s.wrap = -s.wrap;
  }
  return s.pending !== 0 ? Z_OK : Z_STREAM_END;
}
function deflateEnd(strm) {
  var status;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  status = strm.state.status;
  if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
    return err(strm, Z_STREAM_ERROR);
  }
  strm.state = null;
  return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
}
function deflateSetDictionary(strm, dictionary) {
  var dictLength = dictionary.length;
  var s;
  var str, n;
  var wrap;
  var avail;
  var next;
  var input;
  var tmpDict;
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR;
  }
  s = strm.state;
  wrap = s.wrap;
  if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) {
    return Z_STREAM_ERROR;
  }
  if (wrap === 1) {
    strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
  }
  s.wrap = 0;
  if (dictLength >= s.w_size) {
    if (wrap === 0) {
      zero$1(s.head);
      s.strstart = 0;
      s.block_start = 0;
      s.insert = 0;
    }
    tmpDict = Buf8(s.w_size);
    arraySet(tmpDict, dictionary, dictLength - s.w_size, s.w_size, 0);
    dictionary = tmpDict;
    dictLength = s.w_size;
  }
  avail = strm.avail_in;
  next = strm.next_in;
  input = strm.input;
  strm.avail_in = dictLength;
  strm.next_in = 0;
  strm.input = dictionary;
  fill_window(s);
  while (s.lookahead >= MIN_MATCH$1) {
    str = s.strstart;
    n = s.lookahead - (MIN_MATCH$1 - 1);
    do {
      s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH$1 - 1]) & s.hash_mask;
      s.prev[str & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = str;
      str++;
    } while (--n);
    s.strstart = str;
    s.lookahead = MIN_MATCH$1 - 1;
    fill_window(s);
  }
  s.strstart += s.lookahead;
  s.block_start = s.strstart;
  s.insert = s.lookahead;
  s.lookahead = 0;
  s.match_length = s.prev_length = MIN_MATCH$1 - 1;
  s.match_available = 0;
  strm.next_in = next;
  strm.input = input;
  strm.avail_in = avail;
  s.wrap = wrap;
  return Z_OK;
}
var toString$1 = Object.prototype.toString;
var Deflate = function Deflate2(options) {
  this.options = assign({
    level: Z_DEFAULT_COMPRESSION,
    method: Z_DEFLATED,
    chunkSize: 16384,
    windowBits: 15,
    memLevel: 8,
    strategy: Z_DEFAULT_STRATEGY,
    to: ""
  }, options || {});
  var opt = this.options;
  if (opt.raw && opt.windowBits > 0) {
    opt.windowBits = -opt.windowBits;
  } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
    opt.windowBits += 16;
  }
  this.err = 0;
  this.msg = "";
  this.ended = false;
  this.chunks = [];
  this.strm = new ZStream();
  this.strm.avail_out = 0;
  var status = deflateInit2(
    this.strm,
    opt.level,
    opt.method,
    opt.windowBits,
    opt.memLevel,
    opt.strategy
  );
  if (status !== Z_OK) {
    throw new Error(msg[status]);
  }
  if (opt.header) {
    deflateSetHeader(this.strm, opt.header);
  }
  if (opt.dictionary) {
    var dict;
    if (typeof opt.dictionary === "string") {
      dict = string2buf(opt.dictionary);
    } else if (toString$1.call(opt.dictionary) === "[object ArrayBuffer]") {
      dict = new Uint8Array(opt.dictionary);
    } else {
      dict = opt.dictionary;
    }
    status = deflateSetDictionary(this.strm, dict);
    if (status !== Z_OK) {
      throw new Error(msg[status]);
    }
    this._dict_set = true;
  }
};
Deflate.prototype.push = function push2(data, mode) {
  var strm = this.strm;
  var chunkSize = this.options.chunkSize;
  var status, _mode;
  if (this.ended) {
    return false;
  }
  _mode = mode === ~~mode ? mode : mode === true ? Z_FINISH : Z_NO_FLUSH;
  if (typeof data === "string") {
    strm.input = string2buf(data);
  } else if (toString$1.call(data) === "[object ArrayBuffer]") {
    strm.input = new Uint8Array(data);
  } else {
    strm.input = data;
  }
  strm.next_in = 0;
  strm.avail_in = strm.input.length;
  do {
    if (strm.avail_out === 0) {
      strm.output = Buf8(chunkSize);
      strm.next_out = 0;
      strm.avail_out = chunkSize;
    }
    status = deflate(strm, _mode);
    if (status !== Z_STREAM_END && status !== Z_OK) {
      this.onEnd(status);
      this.ended = true;
      return false;
    }
    if (strm.avail_out === 0 || strm.avail_in === 0 && (_mode === Z_FINISH || _mode === Z_SYNC_FLUSH)) {
      if (this.options.to === "string") {
        this.onData(buf2binstring(shrinkBuf(strm.output, strm.next_out)));
      } else {
        this.onData(shrinkBuf(strm.output, strm.next_out));
      }
    }
  } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== Z_STREAM_END);
  if (_mode === Z_FINISH) {
    status = deflateEnd(this.strm);
    this.onEnd(status);
    this.ended = true;
    return status === Z_OK;
  }
  if (_mode === Z_SYNC_FLUSH) {
    this.onEnd(Z_OK);
    strm.avail_out = 0;
    return true;
  }
  return true;
};
Deflate.prototype.onData = function onData2(chunk) {
  this.chunks.push(chunk);
};
Deflate.prototype.onEnd = function onEnd2(status) {
  if (status === Z_OK) {
    if (this.options.to === "string") {
      this.result = this.chunks.join("");
    } else {
      this.result = flattenChunks(this.chunks);
    }
  }
  this.chunks = [];
  this.err = status;
  this.msg = this.strm.msg;
};

// ../../../mdzip-core-js/node_modules/@progress/jszip-esm/dist/jszip-esm5.js
var external = {
  Promise
};
var support = {
  base64: true,
  array: true,
  string: true,
  nodebuffer: false,
  nodestream: false,
  get arraybuffer() {
    return typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
  },
  // Returns true if JSZip can read/generate Uint8Array, false otherwise.
  get uint8array() {
    return typeof Uint8Array !== "undefined";
  },
  get blob() {
    return blob();
  }
};
var blob = function() {
  var supported;
  if (typeof ArrayBuffer === "undefined") {
    supported = false;
  } else {
    var buffer = new ArrayBuffer(0);
    try {
      supported = new Blob([buffer], {
        type: "application/zip"
      }).size === 0;
    } catch (e) {
      supported = false;
    }
  }
  blob = function() {
    return supported;
  };
  return supported;
};
var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
var encode = function(input) {
  var output = [];
  var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
  var i = 0, len = input.length, remainingBytes = len;
  var isArray = typeof input !== "string";
  while (i < input.length) {
    remainingBytes = len - i;
    if (!isArray) {
      chr1 = input.charCodeAt(i++);
      chr2 = i < len ? input.charCodeAt(i++) : 0;
      chr3 = i < len ? input.charCodeAt(i++) : 0;
    } else {
      chr1 = input[i++];
      chr2 = i < len ? input[i++] : 0;
      chr3 = i < len ? input[i++] : 0;
    }
    enc1 = chr1 >> 2;
    enc2 = (chr1 & 3) << 4 | chr2 >> 4;
    enc3 = remainingBytes > 1 ? (chr2 & 15) << 2 | chr3 >> 6 : 64;
    enc4 = remainingBytes > 2 ? chr3 & 63 : 64;
    output.push(_keyStr.charAt(enc1) + _keyStr.charAt(enc2) + _keyStr.charAt(enc3) + _keyStr.charAt(enc4));
  }
  return output.join("");
};
var decode = function(input) {
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0, resultIndex = 0;
  var dataUrlPrefix = "data:";
  if (input.substr(0, dataUrlPrefix.length) === dataUrlPrefix) {
    throw new Error("Invalid base64 input, it looks like a data url.");
  }
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
  var totalLength = input.length * 3 / 4;
  if (input.charAt(input.length - 1) === _keyStr.charAt(64)) {
    totalLength--;
  }
  if (input.charAt(input.length - 2) === _keyStr.charAt(64)) {
    totalLength--;
  }
  if (totalLength % 1 !== 0) {
    throw new Error("Invalid base64 input, bad content length.");
  }
  var output;
  if (support.uint8array) {
    output = new Uint8Array(totalLength | 0);
  } else {
    output = new Array(totalLength | 0);
  }
  while (i < input.length) {
    enc1 = _keyStr.indexOf(input.charAt(i++));
    enc2 = _keyStr.indexOf(input.charAt(i++));
    enc3 = _keyStr.indexOf(input.charAt(i++));
    enc4 = _keyStr.indexOf(input.charAt(i++));
    chr1 = enc1 << 2 | enc2 >> 4;
    chr2 = (enc2 & 15) << 4 | enc3 >> 2;
    chr3 = (enc3 & 3) << 6 | enc4;
    output[resultIndex++] = chr1;
    if (enc3 !== 64) {
      output[resultIndex++] = chr2;
    }
    if (enc4 !== 64) {
      output[resultIndex++] = chr3;
    }
  }
  return output;
};
function string2binary(str) {
  var result = null;
  if (support.uint8array) {
    result = new Uint8Array(str.length);
  } else {
    result = new Array(str.length);
  }
  return stringToArrayLike(str, result);
}
var newBlob = function(part, type) {
  checkSupport("blob");
  return new Blob([part], {
    type
  });
};
function identity(input) {
  return input;
}
function stringToArrayLike(str, array) {
  for (var i = 0; i < str.length; ++i) {
    array[i] = str.charCodeAt(i) & 255;
  }
  return array;
}
function stringifyByChunk(array, type, chunk) {
  var result = [], k = 0, len = array.length;
  if (len <= chunk) {
    return String.fromCharCode.apply(null, array);
  }
  while (k < len) {
    if (type === "array") {
      result.push(String.fromCharCode.apply(null, array.slice(k, Math.min(k + chunk, len))));
    } else {
      result.push(String.fromCharCode.apply(null, array.subarray(k, Math.min(k + chunk, len))));
    }
    k += chunk;
  }
  return result.join("");
}
function stringifyByChar(array) {
  var resultStr = "";
  for (var i = 0; i < array.length; i++) {
    resultStr += String.fromCharCode(array[i]);
  }
  return resultStr;
}
var fromCharCodeSupportsTypedArrays = function() {
  var supported;
  try {
    supported = support.uint8array && String.fromCharCode.apply(null, new Uint8Array(1)).length === 1;
  } catch (e) {
    supported = false;
  }
  fromCharCodeSupportsTypedArrays = function() {
    return supported;
  };
  return supported;
};
function arrayLikeToString(array) {
  var chunk = 65536, type = getTypeOf(array), canUseApply = true;
  if (type === "uint8array") {
    canUseApply = fromCharCodeSupportsTypedArrays();
  }
  if (canUseApply) {
    while (chunk > 1) {
      try {
        return stringifyByChunk(array, type, chunk);
      } catch (e) {
        chunk = Math.floor(chunk / 2);
      }
    }
  }
  return stringifyByChar(array);
}
var applyFromCharCode = arrayLikeToString;
function arrayLikeToArrayLike(arrayFrom, arrayTo) {
  for (var i = 0; i < arrayFrom.length; i++) {
    arrayTo[i] = arrayFrom[i];
  }
  return arrayTo;
}
var transform = {
  // string to ?
  "string": {
    "string": identity,
    "array": function(input) {
      return stringToArrayLike(input, new Array(input.length));
    },
    "arraybuffer": function(input) {
      return transform["string"]["uint8array"](input).buffer;
    },
    "uint8array": function(input) {
      return stringToArrayLike(input, new Uint8Array(input.length));
    }
  },
  // array to ?
  "array": {
    "string": arrayLikeToString,
    "array": identity,
    "arraybuffer": function(input) {
      return new Uint8Array(input).buffer;
    },
    "uint8array": function(input) {
      return new Uint8Array(input);
    }
  },
  // arraybuffer to ?
  "arraybuffer": {
    "string": function(input) {
      return arrayLikeToString(new Uint8Array(input));
    },
    "array": function(input) {
      return arrayLikeToArrayLike(new Uint8Array(input), new Array(input.byteLength));
    },
    "arraybuffer": identity,
    "uint8array": function(input) {
      return new Uint8Array(input);
    }
  },
  // uint8array to ?
  "uint8array": {
    "string": arrayLikeToString,
    "array": function(input) {
      return arrayLikeToArrayLike(input, new Array(input.length));
    },
    "arraybuffer": function(input) {
      return input.buffer;
    },
    "uint8array": identity
  }
};
var transformTo = function(outputType, input) {
  if (!input) {
    input = "";
  }
  if (!outputType) {
    return input;
  }
  checkSupport(outputType);
  var inputType = getTypeOf(input);
  var result = transform[inputType][outputType](input);
  return result;
};
var resolve = function(path) {
  var parts = path.split("/");
  var result = [];
  for (var index = 0; index < parts.length; index++) {
    var part = parts[index];
    if (part === "." || part === "" && index !== 0 && index !== parts.length - 1) {
      continue;
    } else if (part === "..") {
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join("/");
};
var getTypeOf = function(input) {
  if (typeof input === "string") {
    return "string";
  }
  if (Object.prototype.toString.call(input) === "[object Array]") {
    return "array";
  }
  if (support.uint8array && input instanceof Uint8Array) {
    return "uint8array";
  }
  if (support.arraybuffer && input instanceof ArrayBuffer) {
    return "arraybuffer";
  }
};
var checkSupport = function(type) {
  var supported = support[type.toLowerCase()];
  if (!supported) {
    throw new Error(type + " is not supported by this platform");
  }
};
var MAX_VALUE_16BITS = 65535;
var MAX_VALUE_32BITS = -1;
var pretty = function(str) {
  var res = "", code, i;
  for (i = 0; i < (str || "").length; i++) {
    code = str.charCodeAt(i);
    res += "\\x" + (code < 16 ? "0" : "") + code.toString(16).toUpperCase();
  }
  return res;
};
var delay = function(callback, args, self2) {
  setTimeout(function() {
    callback.apply(self2 || null, args || []);
  }, 0);
};
var extend = function() {
  var arguments$1 = arguments;
  var result = {}, i, attr;
  for (i = 0; i < arguments.length; i++) {
    for (attr in arguments[i]) {
      if (Object.hasOwnProperty.call(arguments$1[i], attr) && typeof result[attr] === "undefined") {
        result[attr] = arguments$1[i][attr];
      }
    }
  }
  return result;
};
var prepareContent = function(name, inputData, isBinary, isOptimizedBinaryString, isBase64) {
  var promise = external.Promise.resolve(inputData).then(function(data) {
    var isBlob = support.blob && (data instanceof Blob || ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(data)) !== -1);
    if (isBlob && typeof FileReader !== "undefined") {
      return new external.Promise(function(resolve2, reject) {
        var reader = new FileReader();
        reader.onload = function(e) {
          resolve2(e.target.result);
        };
        reader.onerror = function(e) {
          reject(e.target.error);
        };
        reader.readAsArrayBuffer(data);
      });
    } else {
      return data;
    }
  });
  return promise.then(function(data) {
    var dataType = getTypeOf(data);
    if (!dataType) {
      return external.Promise.reject(
        new Error("Can't read the data of '" + name + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?")
      );
    }
    if (dataType === "arraybuffer") {
      data = transformTo("uint8array", data);
    } else if (dataType === "string") {
      if (isBase64) {
        data = decode(data);
      } else if (isBinary) {
        if (isOptimizedBinaryString !== true) {
          data = string2binary(data);
        }
      }
    }
    return data;
  });
};
var GenericWorker = function GenericWorker2(name) {
  this.name = name || "default";
  this.streamInfo = {};
  this.generatedError = null;
  this.extraStreamInfo = {};
  this.isPaused = true;
  this.isFinished = false;
  this.isLocked = false;
  this._listeners = {
    "data": [],
    "end": [],
    "error": []
  };
  this.previous = null;
};
GenericWorker.prototype.push = function push3(chunk) {
  this.emit("data", chunk);
};
GenericWorker.prototype.end = function end() {
  if (this.isFinished) {
    return false;
  }
  this.flush();
  try {
    this.emit("end");
    this.cleanUp();
    this.isFinished = true;
  } catch (e) {
    this.emit("error", e);
  }
  return true;
};
GenericWorker.prototype.error = function error(e) {
  if (this.isFinished) {
    return false;
  }
  if (this.isPaused) {
    this.generatedError = e;
  } else {
    this.isFinished = true;
    this.emit("error", e);
    if (this.previous) {
      this.previous.error(e);
    }
    this.cleanUp();
  }
  return true;
};
GenericWorker.prototype.on = function on(name, listener) {
  this._listeners[name].push(listener);
  return this;
};
GenericWorker.prototype.cleanUp = function cleanUp() {
  this.streamInfo = this.generatedError = this.extraStreamInfo = null;
  this._listeners = [];
};
GenericWorker.prototype.emit = function emit(name, arg) {
  if (this._listeners[name]) {
    for (var i = 0; i < this._listeners[name].length; i++) {
      this._listeners[name][i].call(this, arg);
    }
  }
};
GenericWorker.prototype.pipe = function pipe(next) {
  return next.registerPrevious(this);
};
GenericWorker.prototype.registerPrevious = function registerPrevious(previous) {
  if (this.isLocked) {
    throw new Error("The stream '" + this + "' has already been used.");
  }
  this.streamInfo = previous.streamInfo;
  this.mergeStreamInfo();
  this.previous = previous;
  var self2 = this;
  previous.on("data", function(chunk) {
    self2.processChunk(chunk);
  });
  previous.on("end", function() {
    self2.end();
  });
  previous.on("error", function(e) {
    self2.error(e);
  });
  return this;
};
GenericWorker.prototype.pause = function pause() {
  if (this.isPaused || this.isFinished) {
    return false;
  }
  this.isPaused = true;
  if (this.previous) {
    this.previous.pause();
  }
  return true;
};
GenericWorker.prototype.resume = function resume() {
  if (!this.isPaused || this.isFinished) {
    return false;
  }
  this.isPaused = false;
  var withError = false;
  if (this.generatedError) {
    this.error(this.generatedError);
    withError = true;
  }
  if (this.previous) {
    this.previous.resume();
  }
  return !withError;
};
GenericWorker.prototype.flush = function flush() {
};
GenericWorker.prototype.processChunk = function processChunk(chunk) {
  this.push(chunk);
};
GenericWorker.prototype.withStreamInfo = function withStreamInfo(key, value) {
  this.extraStreamInfo[key] = value;
  this.mergeStreamInfo();
  return this;
};
GenericWorker.prototype.mergeStreamInfo = function mergeStreamInfo() {
  for (var key in this.extraStreamInfo) {
    if (!this.extraStreamInfo.hasOwnProperty(key)) {
      continue;
    }
    this.streamInfo[key] = this.extraStreamInfo[key];
  }
};
GenericWorker.prototype.lock = function lock() {
  if (this.isLocked) {
    throw new Error("The stream '" + this + "' has already been used.");
  }
  this.isLocked = true;
  if (this.previous) {
    this.previous.lock();
  }
};
GenericWorker.prototype.toString = function toString2() {
  var me = "Worker " + this.name;
  if (this.previous) {
    return this.previous + " -> " + me;
  } else {
    return me;
  }
};
var utf8len2 = function(c) {
  var _utf8len = new Array(256);
  for (var i = 0; i < 256; i++) {
    _utf8len[i] = i >= 252 ? 6 : i >= 248 ? 5 : i >= 240 ? 4 : i >= 224 ? 3 : i >= 192 ? 2 : 1;
  }
  _utf8len[254] = _utf8len[254] = 1;
  utf8len2 = function(c2) {
    return _utf8len[c2];
  };
  return _utf8len[c];
};
var string2buf2 = function(str) {
  var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
  for (m_pos = 0; m_pos < str_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 64512) === 56320) {
        c = 65536 + (c - 55296 << 10) + (c2 - 56320);
        m_pos++;
      }
    }
    buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
  }
  if (support.uint8array) {
    buf = new Uint8Array(buf_len);
  } else {
    buf = new Array(buf_len);
  }
  for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
    c = str.charCodeAt(m_pos);
    if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
      c2 = str.charCodeAt(m_pos + 1);
      if ((c2 & 64512) === 56320) {
        c = 65536 + (c - 55296 << 10) + (c2 - 56320);
        m_pos++;
      }
    }
    if (c < 128) {
      buf[i++] = c;
    } else if (c < 2048) {
      buf[i++] = 192 | c >>> 6;
      buf[i++] = 128 | c & 63;
    } else if (c < 65536) {
      buf[i++] = 224 | c >>> 12;
      buf[i++] = 128 | c >>> 6 & 63;
      buf[i++] = 128 | c & 63;
    } else {
      buf[i++] = 240 | c >>> 18;
      buf[i++] = 128 | c >>> 12 & 63;
      buf[i++] = 128 | c >>> 6 & 63;
      buf[i++] = 128 | c & 63;
    }
  }
  return buf;
};
var utf8border2 = function(buf, max) {
  var pos;
  max = max || buf.length;
  if (max > buf.length) {
    max = buf.length;
  }
  pos = max - 1;
  while (pos >= 0 && (buf[pos] & 192) === 128) {
    pos--;
  }
  if (pos < 0) {
    return max;
  }
  if (pos === 0) {
    return max;
  }
  return pos + utf8len2(buf[pos]) > max ? pos : max;
};
var buf2string2 = function(buf) {
  var i, out, c, c_len;
  var len = buf.length;
  var utf16buf = new Array(len * 2);
  for (out = 0, i = 0; i < len; ) {
    c = buf[i++];
    if (c < 128) {
      utf16buf[out++] = c;
      continue;
    }
    c_len = utf8len2(c);
    if (c_len > 4) {
      utf16buf[out++] = 65533;
      i += c_len - 1;
      continue;
    }
    c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
    while (c_len > 1 && i < len) {
      c = c << 6 | buf[i++] & 63;
      c_len--;
    }
    if (c_len > 1) {
      utf16buf[out++] = 65533;
      continue;
    }
    if (c < 65536) {
      utf16buf[out++] = c;
    } else {
      c -= 65536;
      utf16buf[out++] = 55296 | c >> 10 & 1023;
      utf16buf[out++] = 56320 | c & 1023;
    }
  }
  if (utf16buf.length !== out) {
    if (utf16buf.subarray) {
      utf16buf = utf16buf.subarray(0, out);
    } else {
      utf16buf.length = out;
    }
  }
  return applyFromCharCode(utf16buf);
};
var utf8encode = function utf8encode2(str) {
  return string2buf2(str);
};
var utf8decode = function utf8decode2(buf) {
  buf = transformTo(support.uint8array ? "uint8array" : "array", buf);
  return buf2string2(buf);
};
var Utf8DecodeWorker = /* @__PURE__ */ (function(GenericWorker3) {
  function Utf8DecodeWorker2() {
    GenericWorker3.call(this, "utf-8 decode");
    this.leftOver = null;
  }
  Utf8DecodeWorker2.__proto__ = GenericWorker3;
  Utf8DecodeWorker2.prototype = Object.create(GenericWorker3.prototype);
  Utf8DecodeWorker2.prototype.constructor = Utf8DecodeWorker2;
  Utf8DecodeWorker2.prototype.processChunk = function processChunk2(chunk) {
    var data = transformTo(support.uint8array ? "uint8array" : "array", chunk.data);
    if (this.leftOver && this.leftOver.length) {
      if (support.uint8array) {
        var previousData = data;
        data = new Uint8Array(previousData.length + this.leftOver.length);
        data.set(this.leftOver, 0);
        data.set(previousData, this.leftOver.length);
      } else {
        data = this.leftOver.concat(data);
      }
      this.leftOver = null;
    }
    var nextBoundary = utf8border2(data);
    var usableData = data;
    if (nextBoundary !== data.length) {
      if (support.uint8array) {
        usableData = data.subarray(0, nextBoundary);
        this.leftOver = data.subarray(nextBoundary, data.length);
      } else {
        usableData = data.slice(0, nextBoundary);
        this.leftOver = data.slice(nextBoundary, data.length);
      }
    }
    this.push({
      data: utf8decode(usableData),
      meta: chunk.meta
    });
  };
  Utf8DecodeWorker2.prototype.flush = function flush2() {
    if (this.leftOver && this.leftOver.length) {
      this.push({
        data: utf8decode(this.leftOver),
        meta: {}
      });
      this.leftOver = null;
    }
  };
  return Utf8DecodeWorker2;
})(GenericWorker);
var Utf8EncodeWorker = /* @__PURE__ */ (function(GenericWorker3) {
  function Utf8EncodeWorker2() {
    GenericWorker3.call(this, "utf-8 encode");
  }
  Utf8EncodeWorker2.__proto__ = GenericWorker3;
  Utf8EncodeWorker2.prototype = Object.create(GenericWorker3.prototype);
  Utf8EncodeWorker2.prototype.constructor = Utf8EncodeWorker2;
  Utf8EncodeWorker2.prototype.processChunk = function processChunk2(chunk) {
    this.push({
      data: utf8encode(chunk.data),
      meta: chunk.meta
    });
  };
  return Utf8EncodeWorker2;
})(GenericWorker);
var ConvertWorker = /* @__PURE__ */ (function(GenericWorker3) {
  function ConvertWorker2(destType) {
    GenericWorker3.call(this, "ConvertWorker to " + destType);
    this.destType = destType;
  }
  ConvertWorker2.__proto__ = GenericWorker3;
  ConvertWorker2.prototype = Object.create(GenericWorker3.prototype);
  ConvertWorker2.prototype.constructor = ConvertWorker2;
  ConvertWorker2.prototype.processChunk = function processChunk2(chunk) {
    this.push({
      data: transformTo(this.destType, chunk.data),
      meta: chunk.meta
    });
  };
  return ConvertWorker2;
})(GenericWorker);
function transformZipOutput(type, content, mimeType) {
  switch (type) {
    case "blob":
      return newBlob(transformTo("arraybuffer", content), mimeType);
    case "base64":
      return encode(content);
    default:
      return transformTo(type, content);
  }
}
function concat(type, dataArray) {
  var i, index = 0, res = null, totalLength = 0;
  for (i = 0; i < dataArray.length; i++) {
    totalLength += dataArray[i].length;
  }
  switch (type) {
    case "string":
      return dataArray.join("");
    case "array":
      return Array.prototype.concat.apply([], dataArray);
    case "uint8array":
      res = new Uint8Array(totalLength);
      for (i = 0; i < dataArray.length; i++) {
        res.set(dataArray[i], index);
        index += dataArray[i].length;
      }
      return res;
    default:
      throw new Error("concat : unsupported type '" + type + "'");
  }
}
function accumulate(helper, updateCallback) {
  return new external.Promise(function(resolve2, reject) {
    var dataArray = [];
    var chunkType = helper._internalType, resultType = helper._outputType, mimeType = helper._mimeType;
    helper.on("data", function(data, meta) {
      dataArray.push(data);
      if (updateCallback) {
        updateCallback(meta);
      }
    }).on("error", function(err2) {
      dataArray = [];
      reject(err2);
    }).on("end", function() {
      try {
        var result = transformZipOutput(resultType, concat(chunkType, dataArray), mimeType);
        resolve2(result);
      } catch (e) {
        reject(e);
      }
      dataArray = [];
    }).resume();
  });
}
var StreamHelper = function StreamHelper2(worker, outputType, mimeType) {
  var internalType = outputType;
  switch (outputType) {
    case "blob":
    case "arraybuffer":
      internalType = "uint8array";
      break;
    case "base64":
      internalType = "string";
      break;
  }
  try {
    this._internalType = internalType;
    this._outputType = outputType;
    this._mimeType = mimeType;
    checkSupport(internalType);
    this._worker = worker.pipe(new ConvertWorker(internalType));
    worker.lock();
  } catch (e) {
    this._worker = new GenericWorker("error");
    this._worker.error(e);
  }
};
StreamHelper.prototype.accumulate = function accumulate$1(updateCb) {
  return accumulate(this, updateCb);
};
StreamHelper.prototype.on = function on2(evt, fn) {
  var self2 = this;
  if (evt === "data") {
    this._worker.on(evt, function(chunk) {
      fn.call(self2, chunk.data, chunk.meta);
    });
  } else {
    this._worker.on(evt, function() {
      delay(fn, arguments, self2);
    });
  }
  return this;
};
StreamHelper.prototype.resume = function resume2() {
  delay(this._worker.resume, [], this._worker);
  return this;
};
StreamHelper.prototype.pause = function pause2() {
  this._worker.pause();
  return this;
};
var base64 = false;
var binary = false;
var dir = false;
var createFolders = true;
var date = null;
var compression = null;
var compressionOptions = null;
var comment = null;
var unixPermissions = null;
var dosPermissions = null;
var defaults = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  base64,
  binary,
  comment,
  compression,
  compressionOptions,
  createFolders,
  date,
  dir,
  dosPermissions,
  unixPermissions
});
var DEFAULT_BLOCK_SIZE = 16 * 1024;
var DataWorker = /* @__PURE__ */ (function(GenericWorker3) {
  function DataWorker2(dataP) {
    GenericWorker3.call(this, "DataWorker");
    var self2 = this;
    this.dataIsReady = false;
    this.index = 0;
    this.max = 0;
    this.data = null;
    this.type = "";
    this._tickScheduled = false;
    dataP.then(function(data) {
      self2.dataIsReady = true;
      self2.data = data;
      self2.max = data && data.length || 0;
      self2.type = getTypeOf(data);
      if (!self2.isPaused) {
        self2._tickAndRepeat();
      }
    }, function(e) {
      self2.error(e);
    });
  }
  DataWorker2.__proto__ = GenericWorker3;
  DataWorker2.prototype = Object.create(GenericWorker3.prototype);
  DataWorker2.prototype.constructor = DataWorker2;
  DataWorker2.prototype.cleanUp = function cleanUp2() {
    GenericWorker3.prototype.cleanUp.call(this);
    this.data = null;
  };
  DataWorker2.prototype.resume = function resume3() {
    if (!GenericWorker3.prototype.resume.call(this)) {
      return false;
    }
    if (!this._tickScheduled && this.dataIsReady) {
      this._tickScheduled = true;
      delay(this._tickAndRepeat, [], this);
    }
    return true;
  };
  DataWorker2.prototype._tickAndRepeat = function _tickAndRepeat() {
    this._tickScheduled = false;
    if (this.isPaused || this.isFinished) {
      return;
    }
    this._tick();
    if (!this.isFinished) {
      delay(this._tickAndRepeat, [], this);
      this._tickScheduled = true;
    }
  };
  DataWorker2.prototype._tick = function _tick() {
    if (this.isPaused || this.isFinished) {
      return false;
    }
    var size = DEFAULT_BLOCK_SIZE;
    var data = null, nextIndex = Math.min(this.max, this.index + size);
    if (this.index >= this.max) {
      return this.end();
    } else {
      switch (this.type) {
        case "string":
          data = this.data.substring(this.index, nextIndex);
          break;
        case "uint8array":
          data = this.data.subarray(this.index, nextIndex);
          break;
        case "array":
          data = this.data.slice(this.index, nextIndex);
          break;
      }
      this.index = nextIndex;
      return this.push({
        data,
        meta: {
          percent: this.max ? this.index / this.max * 100 : 0
        }
      });
    }
  };
  return DataWorker2;
})(GenericWorker);
var DataLengthProbe = /* @__PURE__ */ (function(GenericWorker3) {
  function DataLengthProbe2(propName) {
    GenericWorker3.call(this, "DataLengthProbe for " + propName);
    this.propName = propName;
    this.withStreamInfo(propName, 0);
  }
  DataLengthProbe2.__proto__ = GenericWorker3;
  DataLengthProbe2.prototype = Object.create(GenericWorker3.prototype);
  DataLengthProbe2.prototype.constructor = DataLengthProbe2;
  DataLengthProbe2.prototype.processChunk = function processChunk2(chunk) {
    if (chunk) {
      var length = this.streamInfo[this.propName] || 0;
      this.streamInfo[this.propName] = length + chunk.data.length;
    }
    GenericWorker3.prototype.processChunk.call(this, chunk);
  };
  return DataLengthProbe2;
})(GenericWorker);
var makeTable2 = function() {
  var table = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    table[n] = c;
  }
  makeTable2 = function() {
    return table;
  };
  return table;
};
function crc322(crc, buf, len, pos) {
  var t = makeTable2();
  var end2 = pos + len;
  crc = crc ^ -1;
  for (var i = pos; i < end2; i++) {
    crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
  }
  return crc ^ -1;
}
function crc32str(crc, str, len, pos) {
  var t = makeTable2();
  var end2 = pos + len;
  crc = crc ^ -1;
  for (var i = pos; i < end2; i++) {
    crc = crc >>> 8 ^ t[(crc ^ str.charCodeAt(i)) & 255];
  }
  return crc ^ -1;
}
function crc32wrapper(input, crc) {
  if (typeof input === "undefined" || !input.length) {
    return 0;
  }
  var isArray = getTypeOf(input) !== "string";
  if (isArray) {
    return crc322(crc | 0, input, input.length, 0);
  } else {
    return crc32str(crc | 0, input, input.length, 0);
  }
}
var Crc32Probe = /* @__PURE__ */ (function(GenericWorker3) {
  function Crc32Probe2() {
    GenericWorker3.call(this, "Crc32Probe");
    this.withStreamInfo("crc32", 0);
  }
  Crc32Probe2.__proto__ = GenericWorker3;
  Crc32Probe2.prototype = Object.create(GenericWorker3.prototype);
  Crc32Probe2.prototype.constructor = Crc32Probe2;
  Crc32Probe2.prototype.processChunk = function processChunk2(chunk) {
    this.streamInfo.crc32 = crc32wrapper(chunk.data, this.streamInfo.crc32 || 0);
    this.push(chunk);
  };
  return Crc32Probe2;
})(GenericWorker);
var CompressedObject = function CompressedObject2(compressedSize, uncompressedSize, crc323, compression2, data) {
  this.compressedSize = compressedSize;
  this.uncompressedSize = uncompressedSize;
  this.crc32 = crc323;
  this.compression = compression2;
  this.compressedContent = data;
};
CompressedObject.prototype.getContentWorker = function getContentWorker() {
  var worker = new DataWorker(external.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new DataLengthProbe("data_length"));
  var that = this;
  worker.on("end", function() {
    if (this.streamInfo["data_length"] !== that.uncompressedSize) {
      throw new Error("Bug : uncompressed data size mismatch");
    }
  });
  return worker;
};
CompressedObject.prototype.getCompressedWorker = function getCompressedWorker() {
  return new DataWorker(external.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
};
CompressedObject.createWorkerFrom = function createWorkerFrom(uncompressedWorker, compression2, compressionOptions2) {
  return uncompressedWorker.pipe(new Crc32Probe()).pipe(new DataLengthProbe("uncompressedSize")).pipe(compression2.compressWorker(compressionOptions2)).pipe(new DataLengthProbe("compressedSize")).withStreamInfo("compression", compression2);
};
var ZipObject = function ZipObject2(name, data, options) {
  this.name = name;
  this.dir = options.dir;
  this.date = options.date;
  this.comment = options.comment;
  this.unixPermissions = options.unixPermissions;
  this.dosPermissions = options.dosPermissions;
  this._data = data;
  this._dataBinary = options.binary;
  this.options = {
    compression: options.compression,
    compressionOptions: options.compressionOptions
  };
};
ZipObject.prototype.internalStream = function internalStream(type) {
  var result = null, outputType = "string";
  try {
    if (!type) {
      throw new Error("No output type specified.");
    }
    outputType = type.toLowerCase();
    var askUnicodeString = outputType === "string" || outputType === "text";
    if (outputType === "binarystring" || outputType === "text") {
      outputType = "string";
    }
    result = this._decompressWorker();
    var isUnicodeString = !this._dataBinary;
    if (isUnicodeString && !askUnicodeString) {
      result = result.pipe(new Utf8EncodeWorker());
    }
    if (!isUnicodeString && askUnicodeString) {
      result = result.pipe(new Utf8DecodeWorker());
    }
  } catch (e) {
    result = new GenericWorker("error");
    result.error(e);
  }
  return new StreamHelper(result, outputType, "");
};
ZipObject.prototype.async = function async(type, onUpdate) {
  return this.internalStream(type).accumulate(onUpdate);
};
ZipObject.prototype._compressWorker = function _compressWorker(compression2, compressionOptions2) {
  if (this._data instanceof CompressedObject && this._data.compression.magic === compression2.magic) {
    return this._data.getCompressedWorker();
  } else {
    var result = this._decompressWorker();
    if (!this._dataBinary) {
      result = result.pipe(new Utf8EncodeWorker());
    }
    return CompressedObject.createWorkerFrom(result, compression2, compressionOptions2);
  }
};
ZipObject.prototype._decompressWorker = function _decompressWorker() {
  if (this._data instanceof CompressedObject) {
    return this._data.getContentWorker();
  } else if (this._data instanceof GenericWorker) {
    return this._data;
  } else {
    return new DataWorker(this._data);
  }
};
var arrayType = function() {
  var useTypedArray = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Uint32Array !== "undefined";
  var resolved = useTypedArray ? "uint8array" : "array";
  arrayType = function() {
    return resolved;
  };
};
var FlateWorker = /* @__PURE__ */ (function(GenericWorker3) {
  function FlateWorker2(action, options) {
    GenericWorker3.call(this, "FlateWorker/" + action);
    this._pako = null;
    this._pakoAction = action;
    this._pakoOptions = options;
    this.meta = {};
  }
  FlateWorker2.__proto__ = GenericWorker3;
  FlateWorker2.prototype = Object.create(GenericWorker3.prototype);
  FlateWorker2.prototype.constructor = FlateWorker2;
  FlateWorker2.prototype.processChunk = function processChunk2(chunk) {
    this.meta = chunk.meta;
    if (this._pako === null) {
      this._createPako();
    }
    this._pako.push(transformTo(arrayType(), chunk.data), false);
  };
  FlateWorker2.prototype.flush = function flush2() {
    GenericWorker3.prototype.flush.call(this);
    if (this._pako === null) {
      this._createPako();
    }
    this._pako.push([], true);
  };
  FlateWorker2.prototype.cleanUp = function cleanUp2() {
    GenericWorker3.prototype.cleanUp.call(this);
    this._pako = null;
  };
  FlateWorker2.prototype._createPako = function _createPako() {
    var this$1$1 = this;
    var params = {
      raw: true,
      level: this._pakoOptions.level || -1
      // default compression
    };
    this._pako = this._pakoAction === "Deflate" ? new Deflate(params) : new Inflate(params);
    this._pako.onData = function(data) {
      this$1$1.push({
        data,
        meta: this$1$1.meta
      });
    };
  };
  return FlateWorker2;
})(GenericWorker);
var DEFLATE = {
  magic: "\b\0",
  compressWorker: function(compressionOptions2) {
    return new FlateWorker("Deflate", compressionOptions2);
  },
  uncompressWorker: function() {
    return new FlateWorker("Inflate", {});
  }
};
var STORE = {
  magic: "\0\0",
  compressWorker: function() {
    return new GenericWorker("STORE compression");
  },
  uncompressWorker: function() {
    return new GenericWorker("STORE decompression");
  }
};
var compressions = {
  STORE,
  DEFLATE
};
var LOCAL_FILE_HEADER = "PK";
var CENTRAL_FILE_HEADER = "PK";
var CENTRAL_DIRECTORY_END = "PK";
var ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07";
var ZIP64_CENTRAL_DIRECTORY_END = "PK";
var DATA_DESCRIPTOR = "PK\x07\b";
var decToHex = function(dec, bytes) {
  var hex = "", i;
  for (i = 0; i < bytes; i++) {
    hex += String.fromCharCode(dec & 255);
    dec = dec >>> 8;
  }
  return hex;
};
var generateUnixExternalFileAttr = function(unixPermissions2, isDir) {
  var result = unixPermissions2;
  if (!unixPermissions2) {
    result = isDir ? 16893 : 33204;
  }
  return (result & 65535) << 16;
};
var generateDosExternalFileAttr = function(dosPermissions2, isDir) {
  return (dosPermissions2 || 0) & 63;
};
var generateZipParts = function(streamInfo, streamedContent, streamingEnded, offset, platform, encodeFileName) {
  var file2 = streamInfo["file"], compression2 = streamInfo["compression"], useCustomEncoding = encodeFileName !== utf8encode, encodedFileName = transformTo("string", encodeFileName(file2.name)), utfEncodedFileName = transformTo("string", utf8encode(file2.name)), comment2 = file2.comment, encodedComment = transformTo("string", encodeFileName(comment2)), utfEncodedComment = transformTo("string", utf8encode(comment2)), useUTF8ForFileName = utfEncodedFileName.length !== file2.name.length, useUTF8ForComment = utfEncodedComment.length !== comment2.length, dosTime, dosDate, extraFields = "", unicodePathExtraField = "", unicodeCommentExtraField = "", dir2 = file2.dir, date2 = file2.date;
  var dataInfo = {
    crc32: 0,
    compressedSize: 0,
    uncompressedSize: 0
  };
  if (!streamedContent || streamingEnded) {
    dataInfo.crc32 = streamInfo["crc32"];
    dataInfo.compressedSize = streamInfo["compressedSize"];
    dataInfo.uncompressedSize = streamInfo["uncompressedSize"];
  }
  var bitflag = 0;
  if (streamedContent) {
    bitflag |= 8;
  }
  if (!useCustomEncoding && (useUTF8ForFileName || useUTF8ForComment)) {
    bitflag |= 2048;
  }
  var extFileAttr = 0;
  var versionMadeBy = 0;
  if (dir2) {
    extFileAttr |= 16;
  }
  if (platform === "UNIX") {
    versionMadeBy = 798;
    extFileAttr |= generateUnixExternalFileAttr(file2.unixPermissions, dir2);
  } else {
    versionMadeBy = 20;
    extFileAttr |= generateDosExternalFileAttr(file2.dosPermissions);
  }
  dosTime = date2.getUTCHours();
  dosTime = dosTime << 6;
  dosTime = dosTime | date2.getUTCMinutes();
  dosTime = dosTime << 5;
  dosTime = dosTime | date2.getUTCSeconds() / 2;
  dosDate = date2.getUTCFullYear() - 1980;
  dosDate = dosDate << 4;
  dosDate = dosDate | date2.getUTCMonth() + 1;
  dosDate = dosDate << 5;
  dosDate = dosDate | date2.getUTCDate();
  if (useUTF8ForFileName) {
    unicodePathExtraField = // Version
    decToHex(1, 1) + // NameCRC32
    decToHex(crc32wrapper(encodedFileName), 4) + // UnicodeName
    utfEncodedFileName;
    extraFields += // Info-ZIP Unicode Path Extra Field
    "up" + // size
    decToHex(unicodePathExtraField.length, 2) + // content
    unicodePathExtraField;
  }
  if (useUTF8ForComment) {
    unicodeCommentExtraField = // Version
    decToHex(1, 1) + // CommentCRC32
    decToHex(crc32wrapper(encodedComment), 4) + // UnicodeName
    utfEncodedComment;
    extraFields += // Info-ZIP Unicode Path Extra Field
    "uc" + // size
    decToHex(unicodeCommentExtraField.length, 2) + // content
    unicodeCommentExtraField;
  }
  var header = "";
  header += "\n\0";
  header += decToHex(bitflag, 2);
  header += compression2.magic;
  header += decToHex(dosTime, 2);
  header += decToHex(dosDate, 2);
  header += decToHex(dataInfo.crc32, 4);
  header += decToHex(dataInfo.compressedSize, 4);
  header += decToHex(dataInfo.uncompressedSize, 4);
  header += decToHex(encodedFileName.length, 2);
  header += decToHex(extraFields.length, 2);
  var fileRecord = LOCAL_FILE_HEADER + header + encodedFileName + extraFields;
  var dirRecord = CENTRAL_FILE_HEADER + // version made by (00: DOS)
  decToHex(versionMadeBy, 2) + // file header (common to file and central directory)
  header + // file comment length
  decToHex(encodedComment.length, 2) + // disk number start
  "\0\0\0\0" + // external file attributes
  decToHex(extFileAttr, 4) + // relative offset of local header
  decToHex(offset, 4) + // file name
  encodedFileName + // extra field
  extraFields + // file comment
  encodedComment;
  return {
    fileRecord,
    dirRecord
  };
};
var generateCentralDirectoryEnd = function(entriesCount, centralDirLength, localDirLength, comment2, encodeFileName) {
  var dirEnd = "";
  var encodedComment = transformTo("string", encodeFileName(comment2));
  dirEnd = CENTRAL_DIRECTORY_END + // number of this disk
  "\0\0\0\0" + // total number of entries in the central directory on this disk
  decToHex(entriesCount, 2) + // total number of entries in the central directory
  decToHex(entriesCount, 2) + // size of the central directory   4 bytes
  decToHex(centralDirLength, 4) + // offset of start of central directory with respect to the starting disk number
  decToHex(localDirLength, 4) + // .ZIP file comment length
  decToHex(encodedComment.length, 2) + // .ZIP file comment
  encodedComment;
  return dirEnd;
};
var generateDataDescriptors = function(streamInfo) {
  var descriptor = "";
  descriptor = DATA_DESCRIPTOR + // crc-32                          4 bytes
  decToHex(streamInfo["crc32"], 4) + // compressed size                 4 bytes
  decToHex(streamInfo["compressedSize"], 4) + // uncompressed size               4 bytes
  decToHex(streamInfo["uncompressedSize"], 4);
  return descriptor;
};
var ZipFileWorker = /* @__PURE__ */ (function(GenericWorker3) {
  function ZipFileWorker2(streamFiles, comment2, platform, encodeFileName) {
    GenericWorker3.call(this, "ZipFileWorker");
    this.bytesWritten = 0;
    this.zipComment = comment2;
    this.zipPlatform = platform;
    this.encodeFileName = encodeFileName;
    this.streamFiles = streamFiles;
    this.accumulate = false;
    this.contentBuffer = [];
    this.dirRecords = [];
    this.currentSourceOffset = 0;
    this.entriesCount = 0;
    this.currentFile = null;
    this._sources = [];
  }
  ZipFileWorker2.__proto__ = GenericWorker3;
  ZipFileWorker2.prototype = Object.create(GenericWorker3.prototype);
  ZipFileWorker2.prototype.constructor = ZipFileWorker2;
  ZipFileWorker2.prototype.push = function push4(chunk) {
    var currentFilePercent = chunk.meta.percent || 0;
    var entriesCount = this.entriesCount;
    var remainingFiles = this._sources.length;
    if (this.accumulate) {
      this.contentBuffer.push(chunk);
    } else {
      this.bytesWritten += chunk.data.length;
      GenericWorker3.prototype.push.call(this, {
        data: chunk.data,
        meta: {
          currentFile: this.currentFile,
          percent: entriesCount ? (currentFilePercent + 100 * (entriesCount - remainingFiles - 1)) / entriesCount : 100
        }
      });
    }
  };
  ZipFileWorker2.prototype.openedSource = function openedSource(streamInfo) {
    this.currentSourceOffset = this.bytesWritten;
    this.currentFile = streamInfo["file"].name;
    var streamedContent = this.streamFiles && !streamInfo["file"].dir;
    if (streamedContent) {
      var record = generateZipParts(streamInfo, streamedContent, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
      this.push({
        data: record.fileRecord,
        meta: { percent: 0 }
      });
    } else {
      this.accumulate = true;
    }
  };
  ZipFileWorker2.prototype.closedSource = function closedSource(streamInfo) {
    this.accumulate = false;
    var streamedContent = this.streamFiles && !streamInfo["file"].dir;
    var record = generateZipParts(streamInfo, streamedContent, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
    this.dirRecords.push(record.dirRecord);
    if (streamedContent) {
      this.push({
        data: generateDataDescriptors(streamInfo),
        meta: { percent: 100 }
      });
    } else {
      this.push({
        data: record.fileRecord,
        meta: { percent: 0 }
      });
      while (this.contentBuffer.length) {
        this.push(this.contentBuffer.shift());
      }
    }
    this.currentFile = null;
  };
  ZipFileWorker2.prototype.flush = function flush2() {
    var localDirLength = this.bytesWritten;
    for (var i = 0; i < this.dirRecords.length; i++) {
      this.push({
        data: this.dirRecords[i],
        meta: { percent: 100 }
      });
    }
    var centralDirLength = this.bytesWritten - localDirLength;
    var dirEnd = generateCentralDirectoryEnd(this.dirRecords.length, centralDirLength, localDirLength, this.zipComment, this.encodeFileName);
    this.push({
      data: dirEnd,
      meta: { percent: 100 }
    });
  };
  ZipFileWorker2.prototype.prepareNextSource = function prepareNextSource() {
    this.previous = this._sources.shift();
    this.openedSource(this.previous.streamInfo);
    if (this.isPaused) {
      this.previous.pause();
    } else {
      this.previous.resume();
    }
  };
  ZipFileWorker2.prototype.registerPrevious = function registerPrevious2(previous) {
    this._sources.push(previous);
    var self2 = this;
    previous.on("data", function(chunk) {
      self2.processChunk(chunk);
    });
    previous.on("end", function() {
      self2.closedSource(self2.previous.streamInfo);
      if (self2._sources.length) {
        self2.prepareNextSource();
      } else {
        self2.end();
      }
    });
    previous.on("error", function(e) {
      self2.error(e);
    });
    return this;
  };
  ZipFileWorker2.prototype.resume = function resume3() {
    if (!GenericWorker3.prototype.resume.call(this)) {
      return false;
    }
    if (!this.previous && this._sources.length) {
      this.prepareNextSource();
      return true;
    }
    if (!this.previous && !this._sources.length && !this.generatedError) {
      this.end();
      return true;
    }
  };
  ZipFileWorker2.prototype.error = function error2(e) {
    var sources = this._sources;
    if (!GenericWorker3.prototype.error.call(this, e)) {
      return false;
    }
    for (var i = 0; i < sources.length; i++) {
      try {
        sources[i].error(e);
      } catch (e$1) {
      }
    }
    return true;
  };
  ZipFileWorker2.prototype.lock = function lock2() {
    GenericWorker3.prototype.lock.call(this);
    var sources = this._sources;
    for (var i = 0; i < sources.length; i++) {
      sources[i].lock();
    }
  };
  return ZipFileWorker2;
})(GenericWorker);
var getCompression = function(fileCompression, zipCompression) {
  var compressionName = fileCompression || zipCompression;
  var compression2 = compressions[compressionName];
  if (!compression2) {
    throw new Error(compressionName + " is not a valid compression method !");
  }
  return compression2;
};
var generateWorker = function(zip, options, comment2) {
  var zipFileWorker = new ZipFileWorker(options.streamFiles, comment2, options.platform, options.encodeFileName);
  var entriesCount = 0;
  try {
    zip.forEach(function(relativePath, file2) {
      entriesCount++;
      var compression2 = getCompression(file2.options.compression, options.compression);
      var compressionOptions2 = file2.options.compressionOptions || options.compressionOptions || {};
      var dir2 = file2.dir, date2 = file2.date;
      file2._compressWorker(compression2, compressionOptions2).withStreamInfo("file", {
        name: relativePath,
        dir: dir2,
        date: date2,
        comment: file2.comment || "",
        unixPermissions: file2.unixPermissions,
        dosPermissions: file2.dosPermissions
      }).pipe(zipFileWorker);
    });
    zipFileWorker.entriesCount = entriesCount;
  } catch (e) {
    zipFileWorker.error(e);
  }
  return zipFileWorker;
};
var DataReader = function DataReader2(data) {
  this.data = data;
  this.length = data.length;
  this.index = 0;
  this.zero = 0;
};
DataReader.prototype.checkOffset = function checkOffset(offset) {
  this.checkIndex(this.index + offset);
};
DataReader.prototype.checkIndex = function checkIndex(newIndex) {
  if (this.length < this.zero + newIndex || newIndex < 0) {
    throw new Error("End of data reached (data length = " + this.length + ", asked index = " + newIndex + "). Corrupted zip ?");
  }
};
DataReader.prototype.setIndex = function setIndex(newIndex) {
  this.checkIndex(newIndex);
  this.index = newIndex;
};
DataReader.prototype.skip = function skip(n) {
  this.setIndex(this.index + n);
};
DataReader.prototype.byteAt = function byteAt(i) {
};
DataReader.prototype.readInt = function readInt(size) {
  var result = 0, i;
  this.checkOffset(size);
  for (i = this.index + size - 1; i >= this.index; i--) {
    result = (result << 8) + this.byteAt(i);
  }
  this.index += size;
  return result;
};
DataReader.prototype.readString = function readString(size) {
  return transformTo("string", this.readData(size));
};
DataReader.prototype.readData = function readData(size) {
};
DataReader.prototype.lastIndexOfSignature = function lastIndexOfSignature(sig) {
};
DataReader.prototype.readAndCheckSignature = function readAndCheckSignature(sig) {
};
DataReader.prototype.readDate = function readDate() {
  var dostime = this.readInt(4);
  return new Date(Date.UTC(
    (dostime >> 25 & 127) + 1980,
    // year
    (dostime >> 21 & 15) - 1,
    // month
    dostime >> 16 & 31,
    // day
    dostime >> 11 & 31,
    // hour
    dostime >> 5 & 63,
    // minute
    (dostime & 31) << 1
  ));
};
var ArrayReader = /* @__PURE__ */ (function(DataReader3) {
  function ArrayReader2(data) {
    DataReader3.call(this, data);
    for (var i = 0; i < this.data.length; i++) {
      data[i] = data[i] & 255;
    }
  }
  ArrayReader2.__proto__ = DataReader3;
  ArrayReader2.prototype = Object.create(DataReader3.prototype);
  ArrayReader2.prototype.constructor = ArrayReader2;
  ArrayReader2.prototype.byteAt = function byteAt2(i) {
    return this.data[this.zero + i];
  };
  ArrayReader2.prototype.lastIndexOfSignature = function lastIndexOfSignature2(sig) {
    var sig0 = sig.charCodeAt(0), sig1 = sig.charCodeAt(1), sig2 = sig.charCodeAt(2), sig3 = sig.charCodeAt(3);
    for (var i = this.length - 4; i >= 0; --i) {
      if (this.data[i] === sig0 && this.data[i + 1] === sig1 && this.data[i + 2] === sig2 && this.data[i + 3] === sig3) {
        return i - this.zero;
      }
    }
    return -1;
  };
  ArrayReader2.prototype.readAndCheckSignature = function readAndCheckSignature2(sig) {
    var sig0 = sig.charCodeAt(0), sig1 = sig.charCodeAt(1), sig2 = sig.charCodeAt(2), sig3 = sig.charCodeAt(3), data = this.readData(4);
    return sig0 === data[0] && sig1 === data[1] && sig2 === data[2] && sig3 === data[3];
  };
  ArrayReader2.prototype.readData = function readData2(size) {
    this.checkOffset(size);
    if (size === 0) {
      return [];
    }
    var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
    this.index += size;
    return result;
  };
  return ArrayReader2;
})(DataReader);
var StringReader = /* @__PURE__ */ (function(DataReader3) {
  function StringReader2(data) {
    DataReader3.call(this, data);
  }
  StringReader2.__proto__ = DataReader3;
  StringReader2.prototype = Object.create(DataReader3.prototype);
  StringReader2.prototype.constructor = StringReader2;
  StringReader2.prototype.byteAt = function byteAt2(i) {
    return this.data.charCodeAt(this.zero + i);
  };
  StringReader2.prototype.lastIndexOfSignature = function lastIndexOfSignature2(sig) {
    return this.data.lastIndexOf(sig) - this.zero;
  };
  StringReader2.prototype.readAndCheckSignature = function readAndCheckSignature2(sig) {
    var data = this.readData(4);
    return sig === data;
  };
  StringReader2.prototype.readData = function readData2(size) {
    this.checkOffset(size);
    var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
    this.index += size;
    return result;
  };
  return StringReader2;
})(DataReader);
var Uint8ArrayReader = /* @__PURE__ */ (function(ArrayReader2) {
  function Uint8ArrayReader2(data) {
    ArrayReader2.call(this, data);
  }
  Uint8ArrayReader2.__proto__ = ArrayReader2;
  Uint8ArrayReader2.prototype = Object.create(ArrayReader2.prototype);
  Uint8ArrayReader2.prototype.constructor = Uint8ArrayReader2;
  Uint8ArrayReader2.prototype.readData = function readData2(size) {
    this.checkOffset(size);
    if (size === 0) {
      return new Uint8Array(0);
    }
    var result = this.data.subarray(this.zero + this.index, this.zero + this.index + size);
    this.index += size;
    return result;
  };
  return Uint8ArrayReader2;
})(ArrayReader);
function readerFor(data) {
  var type = getTypeOf(data);
  checkSupport(type);
  if (type === "string" && !support.uint8array) {
    return new StringReader(data);
  }
  if (support.uint8array) {
    return new Uint8ArrayReader(transformTo("uint8array", data));
  }
  return new ArrayReader(transformTo("array", data));
}
var MADE_BY_DOS = 0;
var MADE_BY_UNIX = 3;
var findCompression = function(compressionMethod) {
  for (var method in compressions) {
    if (!compressions.hasOwnProperty(method)) {
      continue;
    }
    if (compressions[method].magic === compressionMethod) {
      return compressions[method];
    }
  }
  return null;
};
var ZipEntry = function ZipEntry2(options, loadOptions) {
  this.options = options;
  this.loadOptions = loadOptions;
};
ZipEntry.prototype.isEncrypted = function isEncrypted() {
  return (this.bitFlag & 1) === 1;
};
ZipEntry.prototype.useUTF8 = function useUTF8() {
  return (this.bitFlag & 2048) === 2048;
};
ZipEntry.prototype.readLocalPart = function readLocalPart(reader) {
  var compression2, localExtraFieldsLength;
  reader.skip(22);
  this.fileNameLength = reader.readInt(2);
  localExtraFieldsLength = reader.readInt(2);
  this.fileName = reader.readData(this.fileNameLength);
  reader.skip(localExtraFieldsLength);
  if (this.compressedSize === -1 || this.uncompressedSize === -1) {
    throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
  }
  compression2 = findCompression(this.compressionMethod);
  if (compression2 === null) {
    throw new Error("Corrupted zip : compression " + pretty(this.compressionMethod) + " unknown (inner file : " + transformTo("string", this.fileName) + ")");
  }
  this.decompressed = new CompressedObject(this.compressedSize, this.uncompressedSize, this.crc32, compression2, reader.readData(this.compressedSize));
};
ZipEntry.prototype.readCentralPart = function readCentralPart(reader) {
  this.versionMadeBy = reader.readInt(2);
  reader.skip(2);
  this.bitFlag = reader.readInt(2);
  this.compressionMethod = reader.readString(2);
  this.date = reader.readDate();
  this.crc32 = reader.readInt(4);
  this.compressedSize = reader.readInt(4);
  this.uncompressedSize = reader.readInt(4);
  var fileNameLength = reader.readInt(2);
  this.extraFieldsLength = reader.readInt(2);
  this.fileCommentLength = reader.readInt(2);
  this.diskNumberStart = reader.readInt(2);
  this.internalFileAttributes = reader.readInt(2);
  this.externalFileAttributes = reader.readInt(4);
  this.localHeaderOffset = reader.readInt(4);
  if (this.isEncrypted()) {
    throw new Error("Encrypted zip are not supported");
  }
  reader.skip(fileNameLength);
  this.readExtraFields(reader);
  this.parseZIP64ExtraField(reader);
  this.fileComment = reader.readData(this.fileCommentLength);
};
ZipEntry.prototype.processAttributes = function processAttributes() {
  this.unixPermissions = null;
  this.dosPermissions = null;
  var madeBy = this.versionMadeBy >> 8;
  this.dir = this.externalFileAttributes & 16 ? true : false;
  if (madeBy === MADE_BY_DOS) {
    this.dosPermissions = this.externalFileAttributes & 63;
  }
  if (madeBy === MADE_BY_UNIX) {
    this.unixPermissions = this.externalFileAttributes >> 16 & 65535;
  }
  if (!this.dir && this.fileNameStr.slice(-1) === "/") {
    this.dir = true;
  }
};
ZipEntry.prototype.parseZIP64ExtraField = function parseZIP64ExtraField(reader) {
  if (!this.extraFields[1]) {
    return;
  }
  var extraReader = readerFor(this.extraFields[1].value);
  if (this.uncompressedSize === MAX_VALUE_32BITS) {
    this.uncompressedSize = extraReader.readInt(8);
  }
  if (this.compressedSize === MAX_VALUE_32BITS) {
    this.compressedSize = extraReader.readInt(8);
  }
  if (this.localHeaderOffset === MAX_VALUE_32BITS) {
    this.localHeaderOffset = extraReader.readInt(8);
  }
  if (this.diskNumberStart === MAX_VALUE_32BITS) {
    this.diskNumberStart = extraReader.readInt(4);
  }
};
ZipEntry.prototype.readExtraFields = function readExtraFields(reader) {
  var end2 = reader.index + this.extraFieldsLength, extraFieldId, extraFieldLength, extraFieldValue;
  if (!this.extraFields) {
    this.extraFields = {};
  }
  while (reader.index < end2) {
    extraFieldId = reader.readInt(2);
    extraFieldLength = reader.readInt(2);
    extraFieldValue = reader.readData(extraFieldLength);
    this.extraFields[extraFieldId] = {
      id: extraFieldId,
      length: extraFieldLength,
      value: extraFieldValue
    };
  }
};
ZipEntry.prototype.handleUTF8 = function handleUTF8() {
  var decodeParamType = support.uint8array ? "uint8array" : "array";
  if (this.useUTF8()) {
    this.fileNameStr = utf8decode(this.fileName);
    this.fileCommentStr = utf8decode(this.fileComment);
  } else {
    var upath = this.findExtraFieldUnicodePath();
    if (upath !== null) {
      this.fileNameStr = upath;
    } else {
      var fileNameByteArray = transformTo(decodeParamType, this.fileName);
      this.fileNameStr = this.loadOptions.decodeFileName(fileNameByteArray);
    }
    var ucomment = this.findExtraFieldUnicodeComment();
    if (ucomment !== null) {
      this.fileCommentStr = ucomment;
    } else {
      var commentByteArray = transformTo(decodeParamType, this.fileComment);
      this.fileCommentStr = this.loadOptions.decodeFileName(commentByteArray);
    }
  }
};
ZipEntry.prototype.findExtraFieldUnicodePath = function findExtraFieldUnicodePath() {
  var upathField = this.extraFields[28789];
  if (upathField) {
    var extraReader = readerFor(upathField.value);
    if (extraReader.readInt(1) !== 1) {
      return null;
    }
    if (crc32wrapper(this.fileName) !== extraReader.readInt(4)) {
      return null;
    }
    return utf8decode(extraReader.readData(upathField.length - 5));
  }
  return null;
};
ZipEntry.prototype.findExtraFieldUnicodeComment = function findExtraFieldUnicodeComment() {
  var ucommentField = this.extraFields[25461];
  if (ucommentField) {
    var extraReader = readerFor(ucommentField.value);
    if (extraReader.readInt(1) !== 1) {
      return null;
    }
    if (crc32wrapper(this.fileComment) !== extraReader.readInt(4)) {
      return null;
    }
    return utf8decode(extraReader.readData(ucommentField.length - 5));
  }
  return null;
};
var ZipEntries = function ZipEntries2(loadOptions) {
  this.files = [];
  this.loadOptions = loadOptions;
};
ZipEntries.prototype.checkSignature = function checkSignature(expectedSignature) {
  if (!this.reader.readAndCheckSignature(expectedSignature)) {
    this.reader.index -= 4;
    var signature = this.reader.readString(4);
    throw new Error("Corrupted zip or bug: unexpected signature (" + pretty(signature) + ", expected " + pretty(expectedSignature) + ")");
  }
};
ZipEntries.prototype.isSignature = function isSignature(askedIndex, expectedSignature) {
  var currentIndex = this.reader.index;
  this.reader.setIndex(askedIndex);
  var signature = this.reader.readString(4);
  var result = signature === expectedSignature;
  this.reader.setIndex(currentIndex);
  return result;
};
ZipEntries.prototype.readBlockEndOfCentral = function readBlockEndOfCentral() {
  this.diskNumber = this.reader.readInt(2);
  this.diskWithCentralDirStart = this.reader.readInt(2);
  this.centralDirRecordsOnThisDisk = this.reader.readInt(2);
  this.centralDirRecords = this.reader.readInt(2);
  this.centralDirSize = this.reader.readInt(4);
  this.centralDirOffset = this.reader.readInt(4);
  this.zipCommentLength = this.reader.readInt(2);
  var zipComment = this.reader.readData(this.zipCommentLength);
  var decodeParamType = support.uint8array ? "uint8array" : "array";
  var decodeContent = transformTo(decodeParamType, zipComment);
  this.zipComment = this.loadOptions.decodeFileName(decodeContent);
};
ZipEntries.prototype.readBlockZip64EndOfCentral = function readBlockZip64EndOfCentral() {
  this.zip64EndOfCentralSize = this.reader.readInt(8);
  this.reader.skip(4);
  this.diskNumber = this.reader.readInt(4);
  this.diskWithCentralDirStart = this.reader.readInt(4);
  this.centralDirRecordsOnThisDisk = this.reader.readInt(8);
  this.centralDirRecords = this.reader.readInt(8);
  this.centralDirSize = this.reader.readInt(8);
  this.centralDirOffset = this.reader.readInt(8);
  this.zip64ExtensibleData = {};
  var extraDataSize = this.zip64EndOfCentralSize - 44, index = 0, extraFieldId, extraFieldLength, extraFieldValue;
  while (index < extraDataSize) {
    extraFieldId = this.reader.readInt(2);
    extraFieldLength = this.reader.readInt(4);
    extraFieldValue = this.reader.readData(extraFieldLength);
    this.zip64ExtensibleData[extraFieldId] = {
      id: extraFieldId,
      length: extraFieldLength,
      value: extraFieldValue
    };
  }
};
ZipEntries.prototype.readBlockZip64EndOfCentralLocator = function readBlockZip64EndOfCentralLocator() {
  this.diskWithZip64CentralDirStart = this.reader.readInt(4);
  this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8);
  this.disksCount = this.reader.readInt(4);
  if (this.disksCount > 1) {
    throw new Error("Multi-volumes zip are not supported");
  }
};
ZipEntries.prototype.readLocalFiles = function readLocalFiles() {
  var i, file2;
  for (i = 0; i < this.files.length; i++) {
    file2 = this.files[i];
    this.reader.setIndex(file2.localHeaderOffset);
    this.checkSignature(LOCAL_FILE_HEADER);
    file2.readLocalPart(this.reader);
    file2.handleUTF8();
    file2.processAttributes();
  }
};
ZipEntries.prototype.readCentralDir = function readCentralDir() {
  var file2;
  this.reader.setIndex(this.centralDirOffset);
  while (this.reader.readAndCheckSignature(CENTRAL_FILE_HEADER)) {
    file2 = new ZipEntry({
      zip64: this.zip64
    }, this.loadOptions);
    file2.readCentralPart(this.reader);
    this.files.push(file2);
  }
  if (this.centralDirRecords !== this.files.length) {
    if (this.centralDirRecords !== 0 && this.files.length === 0) {
      throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
    }
  }
};
ZipEntries.prototype.readEndOfCentral = function readEndOfCentral() {
  var offset = this.reader.lastIndexOfSignature(CENTRAL_DIRECTORY_END);
  if (offset < 0) {
    var isGarbage = !this.isSignature(0, LOCAL_FILE_HEADER);
    if (isGarbage) {
      throw new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");
    } else {
      throw new Error("Corrupted zip: can't find end of central directory");
    }
  }
  this.reader.setIndex(offset);
  var endOfCentralDirOffset = offset;
  this.checkSignature(CENTRAL_DIRECTORY_END);
  this.readBlockEndOfCentral();
  if (this.diskNumber === MAX_VALUE_16BITS || this.diskWithCentralDirStart === MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === MAX_VALUE_16BITS || this.centralDirRecords === MAX_VALUE_16BITS || this.centralDirSize === MAX_VALUE_32BITS || this.centralDirOffset === MAX_VALUE_32BITS) {
    this.zip64 = true;
    offset = this.reader.lastIndexOfSignature(ZIP64_CENTRAL_DIRECTORY_LOCATOR);
    if (offset < 0) {
      throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
    }
    this.reader.setIndex(offset);
    this.checkSignature(ZIP64_CENTRAL_DIRECTORY_LOCATOR);
    this.readBlockZip64EndOfCentralLocator();
    if (!this.isSignature(this.relativeOffsetEndOfZip64CentralDir, ZIP64_CENTRAL_DIRECTORY_END)) {
      this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(ZIP64_CENTRAL_DIRECTORY_END);
      if (this.relativeOffsetEndOfZip64CentralDir < 0) {
        throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
      }
    }
    this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir);
    this.checkSignature(ZIP64_CENTRAL_DIRECTORY_END);
    this.readBlockZip64EndOfCentral();
  }
  var expectedEndOfCentralDirOffset = this.centralDirOffset + this.centralDirSize;
  if (this.zip64) {
    expectedEndOfCentralDirOffset += 20;
    expectedEndOfCentralDirOffset += 12 + this.zip64EndOfCentralSize;
  }
  var extraBytes = endOfCentralDirOffset - expectedEndOfCentralDirOffset;
  if (extraBytes > 0) {
    if (this.isSignature(endOfCentralDirOffset, CENTRAL_FILE_HEADER)) ;
    else {
      this.reader.zero = extraBytes;
    }
  } else if (extraBytes < 0) {
    throw new Error("Corrupted zip: missing " + Math.abs(extraBytes) + " bytes.");
  }
};
ZipEntries.prototype.prepareReader = function prepareReader(data) {
  this.reader = readerFor(data);
};
ZipEntries.prototype.load = function load(data) {
  this.prepareReader(data);
  this.readEndOfCentral();
  this.readCentralDir();
  this.readLocalFiles();
};
function checkEntryCRC32(zipEntry) {
  return new external.Promise(function(resolve2, reject) {
    var worker = zipEntry.decompressed.getContentWorker().pipe(new Crc32Probe());
    worker.on("error", function(e) {
      reject(e);
    }).on("end", function() {
      if (worker.streamInfo.crc32 !== zipEntry.decompressed.crc32) {
        reject(new Error("Corrupted zip : CRC32 mismatch"));
      } else {
        resolve2();
      }
    }).resume();
  });
}
function load2(data, options) {
  var zip = this;
  options = extend(options || {}, {
    base64: false,
    checkCRC32: false,
    optimizedBinaryString: false,
    createFolders: false,
    decodeFileName: utf8decode
  });
  return prepareContent("the loaded zip file", data, true, options.optimizedBinaryString, options.base64).then(function(data2) {
    var zipEntries = new ZipEntries(options);
    zipEntries.load(data2);
    return zipEntries;
  }).then(function checkCRC32(zipEntries) {
    var promises = [external.Promise.resolve(zipEntries)];
    var files = zipEntries.files;
    if (options.checkCRC32) {
      for (var i = 0; i < files.length; i++) {
        promises.push(checkEntryCRC32(files[i]));
      }
    }
    return external.Promise.all(promises);
  }).then(function addFiles(results) {
    var zipEntries = results.shift();
    var files = zipEntries.files;
    for (var i = 0; i < files.length; i++) {
      var input = files[i];
      var unsafeName = input.fileNameStr;
      var safeName = resolve(input.fileNameStr);
      zip.file(safeName, input.decompressed, {
        binary: true,
        optimizedBinaryString: true,
        date: input.date,
        dir: input.dir,
        comment: input.fileCommentStr.length ? input.fileCommentStr : null,
        unixPermissions: input.unixPermissions,
        dosPermissions: input.dosPermissions,
        createFolders: options.createFolders
      });
      if (!input.dir) {
        zip.file(safeName).unsafeOriginalName = unsafeName;
      }
    }
    if (zipEntries.zipComment.length) {
      zip.comment = zipEntries.zipComment;
    }
    return zip;
  });
}
var fileAdd = function(name, data, originalOptions) {
  var dataType = getTypeOf(data), parent;
  var o = extend(originalOptions || {}, defaults);
  o.date = o.date || /* @__PURE__ */ new Date();
  if (o.compression !== null) {
    o.compression = o.compression.toUpperCase();
  }
  if (typeof o.unixPermissions === "string") {
    o.unixPermissions = parseInt(o.unixPermissions, 8);
  }
  if (o.unixPermissions && o.unixPermissions & 16384) {
    o.dir = true;
  }
  if (o.dosPermissions && o.dosPermissions & 16) {
    o.dir = true;
  }
  if (o.dir) {
    name = forceTrailingSlash(name);
  }
  if (o.createFolders && (parent = parentFolder(name))) {
    folderAdd.call(this, parent, true);
  }
  var isUnicodeString = dataType === "string" && o.binary === false && o.base64 === false;
  if (!originalOptions || typeof originalOptions.binary === "undefined") {
    o.binary = !isUnicodeString;
  }
  var isCompressedEmpty = data instanceof CompressedObject && data.uncompressedSize === 0;
  if (isCompressedEmpty || o.dir || !data || data.length === 0) {
    o.base64 = false;
    o.binary = true;
    data = "";
    o.compression = "STORE";
    dataType = "string";
  }
  var zipObjectContent = null;
  if (data instanceof CompressedObject || data instanceof GenericWorker) {
    zipObjectContent = data;
  } else {
    zipObjectContent = prepareContent(name, data, o.binary, o.optimizedBinaryString, o.base64);
  }
  var object = new ZipObject(name, zipObjectContent, o);
  this.files[name] = object;
};
var parentFolder = function(path) {
  if (path.slice(-1) === "/") {
    path = path.substring(0, path.length - 1);
  }
  var lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.substring(0, lastSlash) : "";
};
var forceTrailingSlash = function(path) {
  if (path.slice(-1) !== "/") {
    path += "/";
  }
  return path;
};
var folderAdd = function(name, createFolders$1) {
  createFolders$1 = typeof createFolders$1 !== "undefined" ? createFolders$1 : createFolders;
  name = forceTrailingSlash(name);
  if (!this.files[name]) {
    fileAdd.call(this, name, null, {
      dir: true,
      createFolders: createFolders$1
    });
  }
  return this.files[name];
};
function isRegExp(object) {
  return Object.prototype.toString.call(object) === "[object RegExp]";
}
var JSZip = function JSZip2() {
  if (arguments.length) {
    throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
  }
  this.files = /* @__PURE__ */ Object.create(null);
  this.comment = null;
  this.root = "";
  this.clone = function() {
    var newObj = new JSZip2();
    for (var i in this) {
      if (typeof this[i] !== "function") {
        newObj[i] = this[i];
      }
    }
    return newObj;
  };
};
var staticAccessors = { support: { configurable: true }, defaults: { configurable: true }, version: { configurable: true }, external: { configurable: true } };
JSZip.prototype.load = function load3() {
  throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
};
JSZip.prototype.forEach = function forEach(cb) {
  var filename, relativePath, file2;
  for (filename in this.files) {
    file2 = this.files[filename];
    relativePath = filename.slice(this.root.length, filename.length);
    if (relativePath && filename.slice(0, this.root.length) === this.root) {
      cb(relativePath, file2);
    }
  }
};
JSZip.prototype.filter = function filter(search) {
  var result = [];
  this.forEach(function(relativePath, entry) {
    if (search(relativePath, entry)) {
      result.push(entry);
    }
  });
  return result;
};
JSZip.prototype.file = function file(name, data, o) {
  if (arguments.length === 1) {
    if (isRegExp(name)) {
      var regexp = name;
      return this.filter(function(relativePath, file2) {
        return !file2.dir && regexp.test(relativePath);
      });
    } else {
      var obj = this.files[this.root + name];
      if (obj && !obj.dir) {
        return obj;
      } else {
        return null;
      }
    }
  } else {
    name = this.root + name;
    fileAdd.call(this, name, data, o);
  }
  return this;
};
JSZip.prototype.folder = function folder(arg) {
  if (!arg) {
    return this;
  }
  if (isRegExp(arg)) {
    return this.filter(function(relativePath, file2) {
      return file2.dir && arg.test(relativePath);
    });
  }
  var name = this.root + arg;
  var newFolder = folderAdd.call(this, name);
  var ret = this.clone();
  ret.root = newFolder.name;
  return ret;
};
JSZip.prototype.remove = function remove(name) {
  name = this.root + name;
  var file2 = this.files[name];
  if (!file2) {
    if (name.slice(-1) !== "/") {
      name += "/";
    }
    file2 = this.files[name];
  }
  if (file2 && !file2.dir) {
    delete this.files[name];
  } else {
    var kids = this.filter(function(relativePath, file3) {
      return file3.name.slice(0, name.length) === name;
    });
    for (var i = 0; i < kids.length; i++) {
      delete this.files[kids[i].name];
    }
  }
  return this;
};
JSZip.prototype.generate = function generate(options) {
  throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
};
JSZip.prototype.generateInternalStream = function generateInternalStream(options) {
  var worker, opts = {};
  try {
    opts = extend(options || {}, {
      streamFiles: false,
      compression: "STORE",
      compressionOptions: null,
      type: "",
      platform: "DOS",
      comment: null,
      mimeType: "application/zip",
      encodeFileName: utf8encode
    });
    opts.type = opts.type.toLowerCase();
    opts.compression = opts.compression.toUpperCase();
    if (opts.type === "binarystring") {
      opts.type = "string";
    }
    if (!opts.type) {
      throw new Error("No output type specified.");
    }
    checkSupport(opts.type);
    if (opts.platform === "darwin" || opts.platform === "freebsd" || opts.platform === "linux" || opts.platform === "sunos") {
      opts.platform = "UNIX";
    }
    if (opts.platform === "win32") {
      opts.platform = "DOS";
    }
    var comment2 = opts.comment || this.comment || "";
    worker = generateWorker(this, opts, comment2);
  } catch (e) {
    worker = new GenericWorker("error");
    worker.error(e);
  }
  return new StreamHelper(worker, opts.type || "string", opts.mimeType);
};
JSZip.prototype.generateAsync = function generateAsync(options, onUpdate) {
  return this.generateInternalStream(options).accumulate(onUpdate);
};
JSZip.prototype.loadAsync = function loadAsync(data, options) {
  return load2.apply(this, [data, options]);
};
JSZip.loadAsync = function loadAsync2(content, options) {
  return new JSZip().loadAsync(content, options);
};
staticAccessors.support.get = function() {
  return support;
};
staticAccessors.defaults.get = function() {
  return defaults;
};
staticAccessors.version.get = function() {
  return "3.2.2-esm";
};
staticAccessors.external.get = function() {
  return external;
};
Object.defineProperties(JSZip, staticAccessors);

// ../../../mdzip-core-js/dist/mdz-core.js
var PRODUCER_SPEC_VERSION = "1.1.0";
var CORE_LIBRARY_VERSION = "1.4.0";
var CORE_LIBRARY_URL = "https://github.com/mdzip-project/mdzip-core-js";
var MDZ_IMAGE_MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon"
};
var MdzArchiveCore = class _MdzArchiveCore {
  zip;
  rawBytes;
  /**
   * Public image MIME map for consumers.
   */
  static IMAGE_MIME_TYPES = MDZ_IMAGE_MIME_TYPES;
  static SUPPORTED_MDZ_MAJOR = 1;
  static SUPPORTED_MODES = ["document", "project"];
  static SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  static MARKDOWN_IMAGE_REF_RE = /!\[[^\]]*\]\(([^)\n]+)\)/g;
  static HTML_IMG_SRC_RE = /<img\b[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>/gi;
  static entriesCache = /* @__PURE__ */ new WeakMap();
  static manifestCache = /* @__PURE__ */ new WeakMap();
  entryByteSizes;
  /**
   * Creates an archive wrapper around a previously loaded ZIP object.
   *
   * @param zip - Loaded zip-like structure containing archive entries.
   * @param rawBytes - Original archive bytes, kept to lazily derive per-entry
   *   uncompressed sizes on first {@link listEntries} call instead of eagerly
   *   rescanning the central directory on every `open()`.
   */
  constructor(zip, rawBytes) {
    this.zip = zip;
    this.rawBytes = rawBytes;
  }
  /**
   * Opens archive binary data and returns a core archive instance.
   *
   * @param input - Raw archive bytes.
   * @param zipFactory - Optional custom zip loader.
   */
  static async open(input, zipFactory) {
    const factory = zipFactory ?? _MdzArchiveCore.getDefaultZipFactory();
    if (zipFactory) {
      return new _MdzArchiveCore(await factory.loadAsync(input));
    }
    const bytes = await _MdzArchiveCore.readArchiveInputBytes(input);
    const zip = await factory.loadAsync(bytes);
    return new _MdzArchiveCore(zip, bytes);
  }
  /**
   * Lazily derives per-entry uncompressed sizes from the raw archive bytes,
   * memoizing the result so the central-directory scan runs at most once.
   */
  getEntryByteSizes() {
    if (this.entryByteSizes) {
      return this.entryByteSizes;
    }
    const entryByteSizes = /* @__PURE__ */ new Map();
    if (this.rawBytes) {
      try {
        for (const entry of _MdzArchiveCore.parseRawZipEntries(this.rawBytes)) {
          entryByteSizes.set(entry.name.toLowerCase(), entry.uncompressedSize);
        }
      } catch (error2) {
        if (!(error2 instanceof Error) || !error2.message.startsWith("ERR_ZIP_UNSUPPORTED")) {
          throw error2;
        }
      }
    }
    this.entryByteSizes = entryByteSizes;
    return entryByteSizes;
  }
  /**
   * Convenience helper to open and validate an archive in one call.
   *
   * @param input - Raw archive bytes.
   * @param zipFactory - Optional custom zip loader.
   */
  static async validate(input, zipFactory) {
    const archive = await _MdzArchiveCore.open(input, zipFactory);
    return archive.validate();
  }
  /**
   * Adds or replaces an archive entry and returns a newly generated archive blob.
   *
   * Also validates entry-point integrity and refreshes manifest metadata when present.
   *
   * @param input - Existing archive bytes.
   * @param archiveEntryPath - Archive-relative destination path.
   * @param content - New entry content.
   */
  static async addFile(input, archiveEntryPath, content) {
    return _MdzArchiveCore.updateFiles(input, [{ path: archiveEntryPath, content }]);
  }
  /**
   * Removes an archive entry and returns a newly generated archive blob.
   *
   * Also validates entry-point integrity and refreshes manifest metadata when present.
   *
   * @param input - Existing archive bytes.
   * @param archiveEntryPath - Archive-relative path to remove.
   */
  static async removeFile(input, archiveEntryPath) {
    return _MdzArchiveCore.updateFiles(input, [], [archiveEntryPath]);
  }
  /**
   * Removes multiple archive entries in one mutation operation.
   *
   * @param input - Existing archive bytes.
   * @param archiveEntryPaths - Archive-relative paths to remove.
   */
  static async removeFiles(input, archiveEntryPaths) {
    return _MdzArchiveCore.updateFiles(input, [], archiveEntryPaths);
  }
  /**
   * Applies multiple entry writes and removals in one mutation, patching the
   * archive at the byte level.
   *
   * Unchanged entries are copied verbatim â€” their compressed data is never
   * decompressed or recompressed â€” so mutations cost milliseconds instead of
   * many seconds on a 100MB+ archive. Only new or replaced entries are
   * compressed. {@link addFile}, {@link removeFile}, and {@link removeFiles}
   * delegate here. Falls back to a full JSZip rebuild when the source archive
   * uses features the patcher does not support (ZIP64, encryption, non-UTF-8
   * names).
   *
   * Matches the semantics of the single-entry mutation helpers: paths are
   * validated, removals must exist, entry-point integrity is enforced, and the
   * manifest (existing or provided via `options.manifest`) is refreshed and
   * rewritten.
   *
   * @param input - Existing archive bytes.
   * @param writes - Entries to add or replace.
   * @param removals - Entry paths to remove.
   * @param options - Manifest override controls.
   */
  static async updateFiles(input, writes, removals = [], options) {
    const normalizedWrites = /* @__PURE__ */ new Map();
    for (const write of writes) {
      const path = MdzPackagerCore.normalizePath(write.path);
      const pathError = _MdzArchiveCore.validateArchivePath(path);
      if (pathError) {
        throw new Error(`ERR_PATH_INVALID: ${pathError}`);
      }
      normalizedWrites.set(path.toLowerCase(), { path, content: write.content });
    }
    const normalizedRemovals = /* @__PURE__ */ new Map();
    for (const removal of removals) {
      const path = MdzPackagerCore.normalizePath(removal);
      const pathError = _MdzArchiveCore.validateArchivePath(path);
      if (pathError) {
        throw new Error(`ERR_PATH_INVALID: ${pathError}`);
      }
      normalizedRemovals.delete(path.toLowerCase());
      normalizedRemovals.set(path.toLowerCase(), path);
    }
    for (const lower of normalizedRemovals.keys()) {
      normalizedWrites.delete(lower);
    }
    const sourceBytes = await _MdzArchiveCore.readArchiveInputBytes(input);
    const archive = await _MdzArchiveCore.open(sourceBytes);
    const existingPaths = archive.listPaths();
    const existingLower = new Set(existingPaths.map((p) => p.toLowerCase()));
    for (const [lower, path] of normalizedRemovals) {
      if (!existingLower.has(lower)) {
        throw new Error(`ERR_NOT_FOUND: Entry "${path.toLowerCase()}" was not found in archive.`);
      }
    }
    const manifestWrite = normalizedWrites.get("manifest.json");
    let manifestObject = null;
    if (manifestWrite) {
      manifestObject = _MdzArchiveCore.stampManifestObject(await _MdzArchiveCore.parseManifestObjectContent(manifestWrite.content, true), true);
    } else if (options?.manifest) {
      manifestObject = _MdzArchiveCore.stampManifestObject(options.manifest, false);
    } else if ((normalizedWrites.size > 0 || normalizedRemovals.size > 0) && !normalizedRemovals.has("manifest.json") && existingLower.has("manifest.json")) {
      const existing = await archive.readManifest();
      if (existing) {
        manifestObject = _MdzArchiveCore.stampManifestObject(existing, false);
      }
    }
    if (manifestObject) {
      _MdzArchiveCore.validateManifest(manifestObject);
      normalizedWrites.set("manifest.json", {
        path: "manifest.json",
        content: _MdzArchiveCore.normaliseLf(JSON.stringify(manifestObject, null, 2))
      });
    }
    const nextPaths = [
      ...existingPaths.filter((p) => !normalizedRemovals.has(p.toLowerCase()) && !normalizedWrites.has(p.toLowerCase())),
      ...[...normalizedWrites.values()].map((w) => w.path)
    ];
    _MdzArchiveCore.ensureCreatableEntryPoint(nextPaths, manifestObject);
    let patchedBytes;
    try {
      patchedBytes = await _MdzArchiveCore.patchArchiveBytes(sourceBytes, normalizedWrites, normalizedRemovals);
    } catch (error2) {
      if (!(error2 instanceof Error) || !error2.message.startsWith("ERR_ZIP_UNSUPPORTED")) {
        throw error2;
      }
      const zip = await _MdzArchiveCore.loadZip(sourceBytes);
      for (const path of normalizedRemovals.values()) {
        _MdzArchiveCore.removeEntryIgnoreCase(zip, path);
      }
      for (const write of normalizedWrites.values()) {
        _MdzArchiveCore.removeEntryIgnoreCase(zip, write.path);
        await _MdzArchiveCore.writeZipEntry(zip, write.path, write.content);
      }
      return _MdzArchiveCore.finalizeMutation(zip);
    }
    const blob2 = new Blob([patchedBytes], { type: "application/zip" });
    const patched = await _MdzArchiveCore.open(patchedBytes);
    const manifest = await patched.readManifest();
    const resolvedEntryPoint = await patched.resolveEntryPoint().catch(() => null);
    return {
      blob: blob2,
      manifest,
      resolvedEntryPoint,
      archivePaths: patched.listPaths()
    };
  }
  static async readArchiveInputBytes(input) {
    if (input instanceof Uint8Array)
      return input;
    if (input instanceof ArrayBuffer)
      return new Uint8Array(input);
    return new Uint8Array(await input.arrayBuffer());
  }
  /**
   * Rewrites archive bytes by copying unchanged entries' raw compressed data
   * and appending freshly compressed data for written entries.
   *
   * Throws `ERR_ZIP_UNSUPPORTED` for archives the copier cannot handle
   * losslessly: ZIP64, encrypted entries, multi-disk archives, and non-UTF-8
   * entry names.
   */
  static async patchArchiveBytes(source, writes, removals) {
    const entries = _MdzArchiveCore.parseRawZipEntries(source);
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const output = [];
    for (const entry of entries) {
      const lower = entry.name.toLowerCase();
      if (removals.has(lower) || writes.has(lower)) {
        continue;
      }
      if (entry.localOffset + 30 > source.length || view.getUint32(entry.localOffset, true) !== 67324752) {
        throw new Error(`ERR_ZIP_UNSUPPORTED: malformed local header for "${entry.name}"`);
      }
      const localNameLen = view.getUint16(entry.localOffset + 26, true);
      const localExtraLen = view.getUint16(entry.localOffset + 28, true);
      const dataStart = entry.localOffset + 30 + localNameLen + localExtraLen;
      if (dataStart + entry.compressedSize > source.length) {
        throw new Error(`ERR_ZIP_UNSUPPORTED: entry data out of bounds for "${entry.name}"`);
      }
      output.push({
        nameBytes: entry.nameBytes,
        // Clear bit 3 (trailing data descriptor): sizes are written in the header instead.
        flags: entry.flags & ~8,
        method: entry.method,
        time: entry.time,
        date: entry.date,
        crc: entry.crc,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        versionMadeBy: entry.versionMadeBy,
        versionNeeded: entry.versionNeeded,
        intAttr: entry.intAttr,
        extAttr: entry.extAttr,
        data: source.subarray(dataStart, dataStart + entry.compressedSize),
        localOffset: 0
      });
    }
    const { time: dosTime, date: dosDate } = _MdzArchiveCore.toDosDateTime(/* @__PURE__ */ new Date());
    for (const write of writes.values()) {
      let bytes;
      if (_MdzArchiveCore.isTextFile(write.path)) {
        const text = await _MdzArchiveCore.readMutationInputAsText(write.content);
        bytes = new TextEncoder().encode(_MdzArchiveCore.normaliseLf(text));
      } else {
        const binary2 = await _MdzArchiveCore.readMutationInputAsBinary(write.content);
        bytes = binary2 instanceof Uint8Array ? binary2 : new Uint8Array(binary2);
      }
      let method = 0;
      let data = bytes;
      if (!_MdzArchiveCore.isStoredAssetPath(write.path)) {
        const deflated = await _MdzArchiveCore.deflateRawBytes(bytes);
        if (deflated && deflated.length < bytes.length) {
          method = 8;
          data = deflated;
        }
      }
      output.push({
        nameBytes: new TextEncoder().encode(write.path),
        flags: 2048,
        // UTF-8 entry name
        method,
        time: dosTime,
        date: dosDate,
        crc: _MdzArchiveCore.crc32(bytes),
        compressedSize: data.length,
        uncompressedSize: bytes.length,
        versionMadeBy: 20,
        versionNeeded: 20,
        intAttr: 0,
        extAttr: 0,
        data,
        localOffset: 0
      });
    }
    let localSize = 0;
    let centralSize = 0;
    for (const entry of output) {
      localSize += 30 + entry.nameBytes.length + entry.data.length;
      centralSize += 46 + entry.nameBytes.length;
    }
    const out = new Uint8Array(localSize + centralSize + 22);
    const outView = new DataView(out.buffer);
    let cursor = 0;
    for (const entry of output) {
      entry.localOffset = cursor;
      outView.setUint32(cursor, 67324752, true);
      outView.setUint16(cursor + 4, entry.versionNeeded, true);
      outView.setUint16(cursor + 6, entry.flags, true);
      outView.setUint16(cursor + 8, entry.method, true);
      outView.setUint16(cursor + 10, entry.time, true);
      outView.setUint16(cursor + 12, entry.date, true);
      outView.setUint32(cursor + 14, entry.crc, true);
      outView.setUint32(cursor + 18, entry.compressedSize, true);
      outView.setUint32(cursor + 22, entry.uncompressedSize, true);
      outView.setUint16(cursor + 26, entry.nameBytes.length, true);
      outView.setUint16(cursor + 28, 0, true);
      out.set(entry.nameBytes, cursor + 30);
      out.set(entry.data, cursor + 30 + entry.nameBytes.length);
      cursor += 30 + entry.nameBytes.length + entry.data.length;
    }
    const centralOffset = cursor;
    for (const entry of output) {
      outView.setUint32(cursor, 33639248, true);
      outView.setUint16(cursor + 4, entry.versionMadeBy, true);
      outView.setUint16(cursor + 6, entry.versionNeeded, true);
      outView.setUint16(cursor + 8, entry.flags, true);
      outView.setUint16(cursor + 10, entry.method, true);
      outView.setUint16(cursor + 12, entry.time, true);
      outView.setUint16(cursor + 14, entry.date, true);
      outView.setUint32(cursor + 16, entry.crc, true);
      outView.setUint32(cursor + 20, entry.compressedSize, true);
      outView.setUint32(cursor + 24, entry.uncompressedSize, true);
      outView.setUint16(cursor + 28, entry.nameBytes.length, true);
      outView.setUint16(cursor + 30, 0, true);
      outView.setUint16(cursor + 32, 0, true);
      outView.setUint16(cursor + 34, 0, true);
      outView.setUint16(cursor + 36, entry.intAttr, true);
      outView.setUint32(cursor + 38, entry.extAttr, true);
      outView.setUint32(cursor + 42, entry.localOffset, true);
      out.set(entry.nameBytes, cursor + 46);
      cursor += 46 + entry.nameBytes.length;
    }
    outView.setUint32(cursor, 101010256, true);
    outView.setUint16(cursor + 4, 0, true);
    outView.setUint16(cursor + 6, 0, true);
    outView.setUint16(cursor + 8, output.length, true);
    outView.setUint16(cursor + 10, output.length, true);
    outView.setUint32(cursor + 12, centralSize, true);
    outView.setUint32(cursor + 16, centralOffset, true);
    outView.setUint16(cursor + 20, 0, true);
    return out;
  }
  static parseRawZipEntries(source) {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    let eocd = -1;
    const scanEnd = Math.max(0, source.length - 22 - 65535);
    for (let i = source.length - 22; i >= scanEnd; i--) {
      if (source[i] === 80 && source[i + 1] === 75 && source[i + 2] === 5 && source[i + 3] === 6) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error("ERR_ZIP_UNSUPPORTED: end of central directory not found");
    }
    if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) {
      throw new Error("ERR_ZIP_UNSUPPORTED: multi-disk archives are not supported");
    }
    const totalEntries = view.getUint16(eocd + 10, true);
    const centralSize = view.getUint32(eocd + 12, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    if (totalEntries === 65535 || centralSize === 4294967295 || centralOffset === 4294967295) {
      throw new Error("ERR_ZIP_UNSUPPORTED: ZIP64 archives are not supported");
    }
    const entries = [];
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let pos = centralOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (pos + 46 > source.length || view.getUint32(pos, true) !== 33639248) {
        throw new Error("ERR_ZIP_UNSUPPORTED: malformed central directory");
      }
      const flags = view.getUint16(pos + 8, true);
      if ((flags & 1) !== 0) {
        throw new Error("ERR_ZIP_UNSUPPORTED: encrypted entries are not supported");
      }
      const compressedSize = view.getUint32(pos + 20, true);
      const uncompressedSize = view.getUint32(pos + 24, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localOffset = view.getUint32(pos + 42, true);
      if (compressedSize === 4294967295 || uncompressedSize === 4294967295 || localOffset === 4294967295) {
        throw new Error("ERR_ZIP_UNSUPPORTED: ZIP64 archives are not supported");
      }
      const nameBytes = source.slice(pos + 46, pos + 46 + nameLen);
      if ((flags & 2048) === 0 && nameBytes.some((byte) => byte > 127)) {
        throw new Error("ERR_ZIP_UNSUPPORTED: non-UTF-8 entry names are not supported");
      }
      entries.push({
        name: _MdzArchiveCore.normalizePath(decoder.decode(nameBytes)),
        nameBytes,
        flags,
        method: view.getUint16(pos + 10, true),
        time: view.getUint16(pos + 12, true),
        date: view.getUint16(pos + 14, true),
        crc: view.getUint32(pos + 16, true),
        compressedSize,
        uncompressedSize,
        versionMadeBy: view.getUint16(pos + 4, true),
        versionNeeded: view.getUint16(pos + 6, true),
        intAttr: view.getUint16(pos + 36, true),
        extAttr: view.getUint32(pos + 38, true),
        localOffset
      });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }
  static isStoredAssetPath(path) {
    return /\.(png|jpg|jpeg|gif|webp|bmp|ico|webm|mp4|mp3|wav|ogg)$/i.test(path);
  }
  static async deflateRawBytes(bytes) {
    if (typeof CompressionStream === "undefined") {
      return null;
    }
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      return null;
    }
  }
  static crc32Table = null;
  static crc32(bytes) {
    if (!_MdzArchiveCore.crc32Table) {
      const table2 = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        table2[i] = c >>> 0;
      }
      _MdzArchiveCore.crc32Table = table2;
    }
    const table = _MdzArchiveCore.crc32Table;
    let crc = 4294967295;
    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
    }
    return (crc ^ 4294967295) >>> 0;
  }
  static toDosDateTime(date2) {
    const year = Math.max(1980, date2.getFullYear());
    return {
      time: date2.getHours() << 11 | date2.getMinutes() << 5 | date2.getSeconds() >> 1,
      date: year - 1980 << 9 | date2.getMonth() + 1 << 5 | date2.getDate()
    };
  }
  /**
   * Finds orphaned image assets in an archive.
   *
   * @param input - Existing archive bytes.
   * @param options - Scan options.
   */
  static async findOrphanedAssets(input, options) {
    const archive = await _MdzArchiveCore.open(input);
    return archive.findOrphanedAssets(options);
  }
  /**
   * Opens archive binary data and returns an app-friendly normalized workspace model.
   *
   * @param input - Raw archive bytes.
   * @param options - Workspace open controls.
   * @param zipFactory - Optional custom zip loader.
   */
  static async openWorkspace(input, options, zipFactory) {
    const archive = await _MdzArchiveCore.open(input, zipFactory);
    return archive.openWorkspace(options);
  }
  static getDefaultZipFactory() {
    return {
      async loadAsync(data) {
        const zip = await new JSZip().loadAsync(data);
        return zip;
      }
    };
  }
  static async loadZip(input) {
    const zip = await new JSZip().loadAsync(input);
    return zip;
  }
  /**
   * Normalizes path separators and strips leading slashes.
   *
   * @param path - Any input path.
   */
  static normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }
  /**
   * Returns true if the provided path looks like a Markdown document path.
   *
   * @param path - Archive-relative path.
   */
  static isMarkdownFile(path) {
    return /\.(md|markdown)$/i.test(path);
  }
  /**
   * Infers a MIME type from an archive path.
   *
   * @param path - Archive-relative path.
   * @param fallbackMime - MIME type used when extension is unknown.
   */
  static inferMimeType(path, fallbackMime = "application/octet-stream") {
    const ext = _MdzArchiveCore.getPathExtension(path);
    const known = {
      ...MDZ_IMAGE_MIME_TYPES,
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      otf: "font/otf",
      json: "application/json",
      csv: "text/csv",
      txt: "text/plain",
      css: "text/css",
      html: "text/html",
      htm: "text/html",
      xml: "application/xml",
      pdf: "application/pdf"
    };
    return known[ext] ?? fallbackMime;
  }
  /**
   * Classifies an asset using path extension and MIME type.
   *
   * @param path - Archive-relative path.
   * @param mimeType - Optional known MIME type.
   */
  static classifyAssetKind(path, mimeType = _MdzArchiveCore.inferMimeType(path)) {
    if (mimeType.startsWith("image/"))
      return "image";
    if (mimeType.startsWith("audio/"))
      return "audio";
    if (mimeType.startsWith("video/"))
      return "video";
    if (mimeType.startsWith("font/"))
      return "font";
    if (/^(application\/json|text\/csv|text\/plain|text\/css|text\/html|application\/xml|text\/xml)$/.test(mimeType))
      return "data";
    return "other";
  }
  /**
   * Returns true when common browser surfaces can preview this asset.
   *
   * @param path - Archive-relative path.
   * @param mimeType - Optional known MIME type.
   */
  static isPreviewableAsset(path, mimeType = _MdzArchiveCore.inferMimeType(path)) {
    return mimeType.startsWith("image/") || /^(application\/json|text\/csv|text\/plain|text\/css|text\/html|application\/xml|text\/xml)$/.test(mimeType);
  }
  /**
   * Converts validation details into a compact status.
   *
   * @param result - Validation result.
   */
  static getValidationStatus(result) {
    if (result.errors.length > 0 || !result.isValid)
      return "error";
    if (result.warnings.length > 0)
      return "warning";
    return "valid";
  }
  /**
   * Returns a case-insensitive, normalized archive path sort.
   *
   * @param paths - Archive-relative paths.
   */
  static sortArchivePaths(paths) {
    return paths.map(_MdzArchiveCore.normalizePath).sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
  }
  /**
   * Returns the archive-relative directory name for a path.
   *
   * @param path - Archive-relative path.
   */
  static dirname(path) {
    const normalized = _MdzArchiveCore.normalizePath(path).replace(/\/+$/, "");
    const slash = normalized.lastIndexOf("/");
    return slash >= 0 ? normalized.slice(0, slash) : "";
  }
  /**
   * Returns the final path segment for an archive-relative path.
   *
   * @param path - Archive-relative path.
   */
  static basename(path) {
    const normalized = _MdzArchiveCore.normalizePath(path).replace(/\/+$/, "");
    const slash = normalized.lastIndexOf("/");
    return slash >= 0 ? normalized.slice(slash + 1) : normalized;
  }
  /**
   * Builds a generic inferred folder tree from archive-relative paths.
   *
   * @param paths - Archive-relative paths.
   */
  static buildPathTree(paths) {
    const roots = [];
    const ensureNode = (siblings, name, path, isDirectory) => {
      let node = siblings.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.isDirectory === isDirectory);
      if (!node) {
        node = { name, path, isDirectory, children: [] };
        siblings.push(node);
      }
      return node;
    };
    for (const archivePath of _MdzArchiveCore.sortArchivePaths(paths)) {
      const parts = archivePath.split("/").filter(Boolean);
      let siblings = roots;
      let currentPath = "";
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i] ?? "";
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isDirectory = i < parts.length - 1;
        const node = ensureNode(siblings, part, currentPath, isDirectory);
        siblings = node.children;
      }
    }
    const sortNodes = (nodes) => {
      nodes.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory)
          return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
      });
      for (const node of nodes)
        sortNodes(node.children);
    };
    sortNodes(roots);
    return roots;
  }
  /**
   * Validates archive path constraints.
   *
   * @param path - Archive-relative path.
   * @returns `null` when valid, otherwise a short reason string.
   */
  static validateArchivePath(path) {
    const raw = String(path || "");
    if (!raw)
      return "empty path";
    if (raw.startsWith("/"))
      return "leading slash";
    if (raw.includes("\\"))
      return "reserved character";
    const normalized = raw;
    if (normalized.split("/").includes(".."))
      return "path traversal";
    for (const c of normalized) {
      const code = c.charCodeAt(0);
      if (c === "\0" || code >= 1 && code <= 31 || code === 127)
        return "control char";
    }
    if (/[\\:*?"<>|]/.test(normalized))
      return "reserved character";
    return null;
  }
  static dirOf(filePath) {
    const i = filePath.lastIndexOf("/");
    return i >= 0 ? filePath.slice(0, i + 1) : "";
  }
  /**
   * Resolves a relative Markdown link target against an archive base path.
   *
   * Query/hash fragments are stripped and traversal beyond archive root is rejected.
   *
   * @param base - Referencing file path.
   * @param relative - Relative target path from markdown/link source.
   */
  static resolvePath(base, relative) {
    let target = String(relative || "").trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1).trim();
    }
    const q = target.indexOf("?");
    if (q >= 0)
      target = target.slice(0, q);
    const h = target.indexOf("#");
    if (h >= 0)
      target = target.slice(0, h);
    try {
      target = decodeURI(target);
    } catch {
    }
    target = target.replace(/\\/g, "/");
    if (target.startsWith("/"))
      throw new Error("Path must be relative");
    const parts = (_MdzArchiveCore.dirOf(base) + target).split("/");
    const out = [];
    for (const part of parts) {
      if (part === "..") {
        if (out.length === 0)
          throw new Error("Path escapes archive root");
        out.pop();
        continue;
      }
      if (part === ".")
        continue;
      out.push(part);
    }
    return out.join("/");
  }
  /**
   * Finds an archive entry by path (case-insensitive fallback).
   *
   * @param path - Archive-relative path.
   */
  findEntry(path) {
    const normalized = _MdzArchiveCore.normalizePath(path);
    if (this.zip.files[normalized])
      return this.zip.files[normalized];
    if (!_MdzArchiveCore.entriesCache.has(this.zip)) {
      _MdzArchiveCore.entriesCache.set(this.zip, Object.fromEntries(Object.entries(this.zip.files).map(([k, v]) => [_MdzArchiveCore.normalizePath(k).toLowerCase(), v])));
    }
    return _MdzArchiveCore.entriesCache.get(this.zip)?.[normalized.toLowerCase()] ?? null;
  }
  /**
   * Lists archive paths.
   *
   * @param options - Listing controls.
   */
  listPaths(options) {
    return _MdzArchiveCore.getArchivePaths(this.zip, options);
  }
  /**
   * Lists archive entries with basic type metadata.
   *
   * @param options - Listing controls.
   */
  listEntries(options) {
    const entries = _MdzArchiveCore.getArchiveEntries(this.zip, options);
    const entryByteSizes = this.getEntryByteSizes();
    return entries.map((entry) => ({
      path: entry.path,
      byteSize: entryByteSizes.get(entry.path.toLowerCase()),
      isMarkdown: !entry.isDirectory && _MdzArchiveCore.isMarkdownFile(entry.path),
      isImage: !entry.isDirectory && _MdzArchiveCore.isImagePath(entry.path),
      isDirectory: entry.isDirectory
    }));
  }
  /**
   * Returns true if an entry path exists (file or directory).
   *
   * @param path - Archive-relative path.
   */
  hasEntry(path) {
    return this.findEntryWithDirectoryFallback(path) != null;
  }
  /**
   * Reads UTF-8 text content from an entry.
   *
   * @param path - Archive-relative file path.
   */
  async readText(path) {
    const entry = this.getFileEntryOrThrow(path);
    return String(await entry.async("text"));
  }
  /**
   * Reads raw bytes from an entry.
   *
   * @param path - Archive-relative file path.
   */
  async readBytes(path) {
    const entry = this.getFileEntryOrThrow(path);
    const out = await entry.async("arraybuffer");
    return new Uint8Array(out);
  }
  /**
   * Reads entry content as raw base64 (no data URI prefix).
   *
   * @param path - Archive-relative file path.
   */
  async readBase64(path) {
    const entry = this.getFileEntryOrThrow(path);
    return String(await entry.async("base64"));
  }
  /**
   * Reads entry content and returns a data URI string.
   *
   * @param path - Archive-relative file path.
   * @param fallbackMime - Optional fallback MIME when extension is unknown.
   */
  async readDataUri(path, fallbackMime) {
    const normalizedPath = _MdzArchiveCore.normalizePath(path);
    const base642 = await this.readBase64(normalizedPath);
    const ext = _MdzArchiveCore.getPathExtension(normalizedPath);
    const mime = MDZ_IMAGE_MIME_TYPES[ext] ?? (fallbackMime?.trim() || "application/octet-stream");
    return `data:${mime};base64,${base642}`;
  }
  /**
   * Finds orphaned image assets from markdown references.
   *
   * @param options - Scan options.
   */
  async findOrphanedAssets(options) {
    const allEntries = this.listEntries();
    const assetPaths = allEntries.filter((entry) => entry.isImage).map((entry) => entry.path).sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
    const assetPathSet = new Set(assetPaths.map((p) => p.toLowerCase()));
    const scanMode = options?.scanMode ?? "entrypoint";
    const scannedMarkdownPaths = scanMode === "all-markdown" ? allEntries.filter((entry) => entry.isMarkdown).map((entry) => entry.path) : [options?.entryPoint ? _MdzArchiveCore.normalizePath(options.entryPoint) : await this.resolveEntryPoint()];
    const referencedAssets = /* @__PURE__ */ new Set();
    const unresolvedReferences = [];
    for (const markdownPath of scannedMarkdownPaths) {
      const markdown = await this.readText(markdownPath);
      const refs = _MdzArchiveCore.extractImageReferences(markdown);
      for (const ref of refs) {
        if (_MdzArchiveCore.hasUriScheme(ref)) {
          unresolvedReferences.push({ sourcePath: markdownPath, reference: ref, reason: "unsupported-scheme" });
          continue;
        }
        let resolved;
        try {
          resolved = _MdzArchiveCore.normalizePath(_MdzArchiveCore.resolvePath(markdownPath, ref));
        } catch {
          unresolvedReferences.push({ sourcePath: markdownPath, reference: ref, reason: "invalid-path" });
          continue;
        }
        const entry = this.findEntryWithDirectoryFallback(resolved);
        if (!entry || entry.dir) {
          unresolvedReferences.push({ sourcePath: markdownPath, reference: ref, reason: "not-found" });
          continue;
        }
        if (!_MdzArchiveCore.isImagePath(resolved) || !assetPathSet.has(resolved.toLowerCase())) {
          unresolvedReferences.push({ sourcePath: markdownPath, reference: ref, reason: "not-asset" });
          continue;
        }
        referencedAssets.add(_MdzArchiveCore.resolveAssetPathCase(assetPaths, resolved));
      }
    }
    const manifest = await this.readManifest();
    if (manifest?.cover) {
      const cover = _MdzArchiveCore.normalizePath(manifest.cover);
      if (assetPathSet.has(cover.toLowerCase())) {
        referencedAssets.add(_MdzArchiveCore.resolveAssetPathCase(assetPaths, cover));
      }
    }
    const referencedAssetPaths = Array.from(referencedAssets).sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
    const referencedSet = new Set(referencedAssetPaths.map((p) => p.toLowerCase()));
    const orphanedAssetPaths = assetPaths.filter((p) => !referencedSet.has(p.toLowerCase()));
    return {
      scannedMarkdownPaths,
      assetPaths,
      referencedAssetPaths,
      orphanedAssetPaths,
      unresolvedReferences
    };
  }
  /**
   * Returns a normalized app/editor workspace model for this archive.
   *
   * @param options - Workspace open controls.
   */
  async openWorkspace(options) {
    const validation = await this.validate();
    const manifest = await this.readManifest().catch(() => null);
    const mode = await this.resolveMode().catch(() => "document");
    const entryPoint = await this.resolveEntryPoint().catch(() => null);
    const entries = this.listEntries();
    const includeLazyReaders = options?.includeLazyAssetReaders !== false;
    const includeLazyDocReaders = options?.includeLazyDocumentReaders === true;
    const documents = [];
    for (const entry of entries.filter((item) => item.isMarkdown)) {
      const isEntryPt = !!entryPoint && entry.path.toLowerCase() === entryPoint.toLowerCase();
      const useLazy = includeLazyDocReaders && !isEntryPt;
      const doc = {
        path: entry.path,
        title: _MdzArchiveCore.getDocumentTitle(entry.path, manifest),
        text: useLazy ? "" : await this.readText(entry.path),
        isEntryPoint: isEntryPt
      };
      if (useLazy) {
        doc.readText = () => this.readText(entry.path);
        doc.isLazy = true;
      }
      documents.push(doc);
    }
    const assets = [];
    for (const entry of entries.filter((item) => !item.isMarkdown && !item.isDirectory && item.path.toLowerCase() !== "manifest.json")) {
      const mimeType = _MdzArchiveCore.inferMimeType(entry.path);
      const asset = {
        path: entry.path,
        fileName: _MdzArchiveCore.basename(entry.path),
        byteSize: entry.byteSize ?? (await this.readBytes(entry.path)).byteLength,
        mimeType,
        kind: _MdzArchiveCore.classifyAssetKind(entry.path, mimeType),
        isPreviewable: _MdzArchiveCore.isPreviewableAsset(entry.path, mimeType)
      };
      if (includeLazyReaders) {
        asset.readBytes = () => this.readBytes(entry.path);
        asset.readDataUri = () => this.readDataUri(entry.path, mimeType);
      }
      assets.push(asset);
    }
    const workspace = {
      title: manifest?.title ?? null,
      mode,
      manifest,
      entryPoint,
      documents,
      assets,
      validation
    };
    if (options?.includeOrphanedAssetAnalysis) {
      workspace.orphanedAssets = await this.findOrphanedAssets({ scanMode: options.orphanedAssetScanMode });
    }
    return workspace;
  }
  static validateManifest(manifest) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("ERR_MANIFEST_INVALID: manifest.json must be a JSON object.");
    }
    const candidate = manifest;
    const validateMetadataNode = (value, path) => {
      if (value == null)
        return;
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`ERR_MANIFEST_INVALID: manifest.json "${path}" must be an object when provided.`);
      }
      const node = value;
      for (const key of ["name", "version", "url"]) {
        const v = node[key];
        if (v != null && typeof v !== "string") {
          throw new Error(`ERR_MANIFEST_INVALID: manifest.json "${path}.${key}" must be a string when provided.`);
        }
      }
    };
    const validateByNode = (value, path) => {
      if (value == null)
        return;
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`ERR_MANIFEST_INVALID: manifest.json "${path}" must be an object when provided.`);
      }
      const node = value;
      for (const key of ["name", "email", "url"]) {
        const v = node[key];
        if (v != null && typeof v !== "string") {
          throw new Error(`ERR_MANIFEST_INVALID: manifest.json "${path}.${key}" must be a string when provided.`);
        }
      }
    };
    const validateTimestamp = (value, path) => {
      if (value == null)
        return;
      if (typeof value === "string")
        return;
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`ERR_MANIFEST_INVALID: manifest.json "${path}" must be a string or object when provided.`);
      }
      const node = value;
      if (typeof node.when !== "string" || node.when.trim() === "") {
        throw new Error(`ERR_MANIFEST_INVALID: manifest.json "${path}.when" must be a non-empty string when "${path}" is an object.`);
      }
      validateByNode(node.by, `${path}.by`);
    };
    if (candidate.title != null && (typeof candidate.title !== "string" || candidate.title.trim() === "")) {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "title" must be a non-empty string when provided.');
    }
    if (candidate.mode != null) {
      if (typeof candidate.mode !== "string") {
        throw new Error('ERR_MANIFEST_INVALID: manifest.json "mode" must be a string when provided.');
      }
      if (!_MdzArchiveCore.SUPPORTED_MODES.includes(candidate.mode)) {
        throw new Error(`ERR_MODE_UNSUPPORTED: manifest.json mode "${candidate.mode}" is not supported.`);
      }
    }
    if (candidate.description != null && typeof candidate.description !== "string") {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "description" must be a string when provided.');
    }
    if (candidate.version != null && typeof candidate.version !== "string") {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "version" must be a string when provided.');
    }
    if (candidate.language != null && typeof candidate.language !== "string") {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "language" must be a string when provided.');
    }
    if (candidate.license != null && typeof candidate.license !== "string") {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "license" must be a string when provided.');
    }
    if (candidate.keywords != null) {
      if (!Array.isArray(candidate.keywords) || candidate.keywords.some((k) => typeof k !== "string")) {
        throw new Error('ERR_MANIFEST_INVALID: manifest.json "keywords" must be an array of strings when provided.');
      }
    }
    if (candidate.cover != null && typeof candidate.cover !== "string") {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "cover" must be a string when provided.');
    }
    if (candidate.entryPoint != null && typeof candidate.entryPoint !== "string") {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "entryPoint" must be a string when provided.');
    }
    if (candidate.entryPoint != null && _MdzArchiveCore.validateArchivePath(candidate.entryPoint) != null) {
      throw new Error('ERR_MANIFEST_INVALID: manifest.json "entryPoint" must be a valid archive-relative path.');
    }
    if (candidate.spec != null) {
      if (typeof candidate.spec !== "object" || Array.isArray(candidate.spec)) {
        throw new Error('ERR_MANIFEST_INVALID: manifest.json "spec" must be an object when provided.');
      }
      const spec = candidate.spec;
      if (spec.name != null && typeof spec.name !== "string") {
        throw new Error('ERR_MANIFEST_INVALID: manifest.json "spec.name" must be a string when provided.');
      }
      if (spec.version != null) {
        if (typeof spec.version !== "string" || !_MdzArchiveCore.SEMVER_RE.test(spec.version)) {
          throw new Error('ERR_MANIFEST_INVALID: manifest.json "spec.version" must be a valid semver string when provided.');
        }
        const specMajor = Number.parseInt(spec.version.split(".")[0] ?? "0", 10);
        if (specMajor > _MdzArchiveCore.SUPPORTED_MDZ_MAJOR) {
          throw new Error(`ERR_VERSION_UNSUPPORTED: manifest.json spec.version ${spec.version} is not supported; this viewer supports major ${_MdzArchiveCore.SUPPORTED_MDZ_MAJOR}.x only.`);
        }
      }
    }
    if (candidate.mdz != null) {
      if (typeof candidate.mdz !== "string" || !_MdzArchiveCore.SEMVER_RE.test(candidate.mdz)) {
        throw new Error('ERR_MANIFEST_INVALID: manifest.json "mdz" must be a valid semver string when provided.');
      }
      const major = Number.parseInt(candidate.mdz.split(".")[0] ?? "0", 10);
      if (major > _MdzArchiveCore.SUPPORTED_MDZ_MAJOR) {
        throw new Error(`ERR_VERSION_UNSUPPORTED: manifest.json targets mdz ${candidate.mdz}, but this viewer supports major ${_MdzArchiveCore.SUPPORTED_MDZ_MAJOR}.x only.`);
      }
    }
    if (candidate.producer != null) {
      if (typeof candidate.producer !== "object" || Array.isArray(candidate.producer)) {
        throw new Error('ERR_MANIFEST_INVALID: manifest.json "producer" must be an object when provided.');
      }
      const producer = candidate.producer;
      validateMetadataNode(producer.application, "producer.application");
      validateMetadataNode(producer.core, "producer.core");
    }
    if (candidate.author != null) {
      validateByNode(candidate.author, "author");
    }
    validateTimestamp(candidate.created, "created");
    validateTimestamp(candidate.modified, "modified");
  }
  /**
   * Parses and validates `manifest.json` if present.
   *
   * Missing or invalid cover references are normalized away in returned data.
   */
  async readManifest() {
    if (_MdzArchiveCore.manifestCache.has(this.zip)) {
      return _MdzArchiveCore.manifestCache.get(this.zip) ?? null;
    }
    const entry = this.zip.files["manifest.json"];
    if (!entry) {
      _MdzArchiveCore.manifestCache.set(this.zip, null);
      return null;
    }
    const raw = await entry.async("text");
    let manifest;
    try {
      manifest = JSON.parse(String(raw));
    } catch {
      throw new Error("ERR_MANIFEST_INVALID: manifest.json is not valid JSON");
    }
    _MdzArchiveCore.validateManifest(manifest);
    const normalized = { ...manifest };
    if (normalized.cover) {
      const coverPath = _MdzArchiveCore.normalizePath(normalized.cover);
      const coverPathError = _MdzArchiveCore.validateArchivePath(coverPath);
      const coverEntry = Object.entries(this.zip.files).find(([p]) => _MdzArchiveCore.normalizePath(p).toLowerCase() === coverPath.toLowerCase())?.[1];
      const coverExistsAsFile = !!coverEntry && !coverEntry.dir;
      if (coverPathError || !coverExistsAsFile) {
        delete normalized.cover;
      }
    }
    _MdzArchiveCore.manifestCache.set(this.zip, normalized);
    return normalized;
  }
  /**
   * Resolves archive interpretation mode using manifest data or the spec default.
   */
  async resolveMode() {
    const manifest = await this.readManifest();
    return manifest?.mode ?? "document";
  }
  /**
   * Validates archive conformance and returns errors/warnings.
   */
  async validate() {
    const errors = [];
    const warnings = [];
    const archivePaths = _MdzArchiveCore.getArchivePaths(this.zip);
    for (const path of archivePaths) {
      const pathError = _MdzArchiveCore.validateArchivePath(path);
      if (pathError)
        errors.push(`ERR_PATH_INVALID: ${pathError}`);
    }
    let manifest = null;
    let manifestReadFailed = false;
    const manifestEntry = this.findEntry("manifest.json");
    if (manifestEntry) {
      let rawManifest = null;
      try {
        const rawText = await manifestEntry.async("text");
        const parsed = JSON.parse(String(rawText));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          rawManifest = parsed;
        }
      } catch {
      }
      try {
        manifest = await this.readManifest();
      } catch (error2) {
        manifestReadFailed = true;
        errors.push(error2 instanceof Error ? error2.message : String(error2));
      }
      if (manifest) {
        const specVersion = manifest.spec?.version;
        if (!specVersion || specVersion.trim() === "") {
          warnings.push("manifest 'spec.version' is missing; version metadata is unavailable.");
        } else if (_MdzArchiveCore.SEMVER_RE.test(specVersion)) {
          const major = Number.parseInt(specVersion.split(".")[0] ?? "0", 10);
          if (major < _MdzArchiveCore.SUPPORTED_MDZ_MAJOR) {
            warnings.push(`manifest 'spec.version' major version ${major} is older than supported major ${_MdzArchiveCore.SUPPORTED_MDZ_MAJOR}.`);
          }
        }
        if (manifest.entryPoint && !archivePaths.some((p) => p.toLowerCase() === manifest.entryPoint.toLowerCase())) {
          errors.push(`ERR_ENTRYPOINT_MISSING: manifest 'entryPoint' references '${manifest.entryPoint}' which does not exist in the archive.`);
        }
        const coverCandidate = typeof rawManifest?.cover === "string" ? rawManifest.cover : manifest.cover;
        if (coverCandidate) {
          const cover = _MdzArchiveCore.normalizePath(coverCandidate);
          const coverEntry = this.findEntry(cover);
          if (!coverEntry || coverEntry.dir) {
            warnings.push(`manifest 'cover' references '${coverCandidate}' which does not exist in the archive.`);
          }
        }
      }
    } else {
      warnings.push("No manifest.json present. Version metadata is unavailable.");
    }
    if (!manifestReadFailed) {
      try {
        await this.resolveEntryPoint();
      } catch (error2) {
        errors.push(error2 instanceof Error ? error2.message : String(error2));
      }
    }
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  /**
   * Resolves the primary markdown entry point for rendering.
   *
   * @throws When no unambiguous entry point can be determined.
   */
  async resolveEntryPoint() {
    const manifest = await this.readManifest();
    const archivePaths = _MdzArchiveCore.getArchivePaths(this.zip);
    if (manifest?.entryPoint && !archivePaths.some((p) => p.toLowerCase() === manifest.entryPoint.toLowerCase())) {
      throw new Error(`ERR_ENTRYPOINT_MISSING: manifest.json references "${manifest.entryPoint}" which is not in the archive`);
    }
    const resolved = MdzPackagerCore.resolveEntryPoint(archivePaths, manifest);
    if (resolved)
      return resolved;
    const rootMd = archivePaths.filter((p) => !p.includes("/") && _MdzArchiveCore.isMarkdownFile(p));
    if (rootMd.length > 1) {
      throw new Error("ERR_ENTRYPOINT_UNRESOLVED: Multiple Markdown files at the archive root and no manifest.json entryPoint. Add an index.md or manifest.json entryPoint.");
    }
    throw new Error("ERR_ENTRYPOINT_UNRESOLVED: No Markdown file found at the archive root.");
  }
  static getArchivePaths(zip, options) {
    return _MdzArchiveCore.getArchiveEntries(zip, options).map((entry) => entry.path);
  }
  static getArchiveEntries(zip, options) {
    const includeDirectories = options?.includeDirectories === true;
    const normalize = options?.normalize !== false;
    const sort = options?.sort !== false;
    const entries = Object.entries(zip.files).filter(([, entry]) => includeDirectories || !entry?.dir).map(([path, entry]) => ({
      path: normalize ? _MdzArchiveCore.normalizePath(path) : path,
      isDirectory: !!entry?.dir
    }));
    if (sort) {
      entries.sort((a, b) => a.path.localeCompare(b.path, void 0, { sensitivity: "base" }));
    }
    return entries;
  }
  findEntryWithDirectoryFallback(path) {
    const normalized = _MdzArchiveCore.normalizePath(path);
    const direct = this.findEntry(normalized);
    if (direct)
      return direct;
    if (normalized.endsWith("/")) {
      return this.findEntry(normalized.slice(0, -1));
    }
    return this.findEntry(`${normalized}/`);
  }
  getFileEntryOrThrow(path) {
    const normalized = _MdzArchiveCore.normalizePath(path);
    const entry = this.findEntryWithDirectoryFallback(normalized);
    if (!entry) {
      throw new Error(`ERR_NOT_FOUND: Entry "${normalized}" was not found in archive.`);
    }
    if (entry.dir) {
      throw new Error(`ERR_IS_DIRECTORY: Entry "${normalized}" is a directory.`);
    }
    return entry;
  }
  static getPathExtension(path) {
    const slash = path.lastIndexOf("/");
    const dot = path.lastIndexOf(".");
    if (dot <= slash)
      return "";
    return path.slice(dot + 1).toLowerCase();
  }
  static isImagePath(path) {
    return _MdzArchiveCore.getPathExtension(path) in MDZ_IMAGE_MIME_TYPES;
  }
  static getDocumentTitle(path, manifest) {
    const mapped = manifest?.files?.find((file2) => file2.path.toLowerCase() === path.toLowerCase());
    if (mapped?.title?.trim())
      return mapped.title.trim();
    const fileName = _MdzArchiveCore.basename(path).replace(/\.[^/.]+$/, "");
    const title = fileName.replace(/[_-]+/g, " ").trim();
    return title || path;
  }
  static extractImageReferences(markdown) {
    const refs = [];
    const mdRe = new RegExp(_MdzArchiveCore.MARKDOWN_IMAGE_REF_RE.source, "g");
    let match;
    while ((match = mdRe.exec(markdown)) != null) {
      const raw = match[1]?.trim();
      if (!raw)
        continue;
      refs.push(_MdzArchiveCore.cleanMarkdownLinkTarget(raw));
    }
    const htmlRe = new RegExp(_MdzArchiveCore.HTML_IMG_SRC_RE.source, "gi");
    while ((match = htmlRe.exec(markdown)) != null) {
      const raw = (match[1] ?? match[2] ?? match[3])?.trim();
      if (!raw)
        continue;
      refs.push(raw);
    }
    return refs;
  }
  static cleanMarkdownLinkTarget(raw) {
    let target = raw.trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1).trim();
    }
    const quotedTitleIndex = target.search(/\s+"/);
    if (quotedTitleIndex > 0) {
      target = target.slice(0, quotedTitleIndex).trim();
    } else {
      const singleQuotedTitleIndex = target.search(/\s+'/);
      if (singleQuotedTitleIndex > 0) {
        target = target.slice(0, singleQuotedTitleIndex).trim();
      }
    }
    return target;
  }
  static hasUriScheme(value) {
    return /^[A-Za-z][A-Za-z\d+\-.]*:/.test(value);
  }
  static resolveAssetPathCase(assetPaths, resolvedPath) {
    const lower = resolvedPath.toLowerCase();
    const exact = assetPaths.find((p) => p.toLowerCase() === lower);
    return exact ?? resolvedPath;
  }
  static removeEntryIgnoreCase(zip, targetPath) {
    const targetLower = targetPath.toLowerCase();
    for (const path of Object.keys(zip.files)) {
      if (_MdzArchiveCore.normalizePath(path).toLowerCase() === targetLower) {
        zip.remove(path);
      }
    }
  }
  static isTextFile(path) {
    return /\.(md|markdown|json|txt|css|html|htm|xml|svg|yaml|yml|toml)$/i.test(path);
  }
  static normaliseLf(content) {
    return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  static async readExistingManifestObject(zip, requireValid) {
    const manifestEntry = Object.entries(zip.files).find(([p, entry]) => _MdzArchiveCore.normalizePath(p).toLowerCase() === "manifest.json" && !entry.dir)?.[1];
    if (!manifestEntry)
      return null;
    const raw = await manifestEntry.async("text");
    try {
      const parsed = JSON.parse(String(raw));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        if (requireValid)
          throw new Error("ERR_MANIFEST_INVALID: Existing manifest.json is invalid: expected a JSON object.");
        return null;
      }
      return parsed;
    } catch (error2) {
      if (requireValid) {
        if (error2 instanceof Error && /expected a JSON object/.test(error2.message))
          throw error2;
        throw new Error("ERR_MANIFEST_INVALID: Existing manifest.json is invalid JSON.");
      }
      return null;
    }
  }
  static async parseManifestObjectContent(content, requireValid) {
    const raw = await _MdzArchiveCore.readMutationInputAsText(content);
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        if (requireValid)
          throw new Error("ERR_MANIFEST_INVALID: Replacement manifest.json is invalid: expected a JSON object.");
        return {};
      }
      return parsed;
    } catch (error2) {
      if (requireValid) {
        if (error2 instanceof Error && /expected a JSON object/.test(error2.message))
          throw error2;
        throw new Error("ERR_MANIFEST_INVALID: Replacement manifest.json is invalid JSON.");
      }
      return {};
    }
  }
  static ensureManifestSpecObject(manifest) {
    let spec = manifest.spec;
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      spec = {};
      manifest.spec = spec;
    }
    const specObj = spec;
    if (typeof specObj.name !== "string" || !specObj.name.trim()) {
      specObj.name = "mdzip-spec";
    }
    if (typeof specObj.version !== "string" || !specObj.version.trim()) {
      specObj.version = PRODUCER_SPEC_VERSION;
    }
  }
  static stampManifestObject(manifest, setCreatedIfMissing) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const next = { ...manifest };
    _MdzArchiveCore.ensureManifestSpecObject(next);
    if (setCreatedIfMissing && next.created == null) {
      next.created = now;
    }
    const modified = next.modified;
    if (modified && typeof modified === "object" && !Array.isArray(modified)) {
      next.modified = { ...modified, when: now };
    } else {
      next.modified = now;
    }
    return next;
  }
  static ensureCreatableEntryPoint(archivePaths, manifest) {
    if (manifest?.entryPoint && !archivePaths.some((p) => p.toLowerCase() === manifest.entryPoint.toLowerCase())) {
      throw new Error(`ERR_ENTRYPOINT_MISSING: manifest 'entryPoint' references '${manifest.entryPoint}' which does not exist in the archive.`);
    }
    const resolved = MdzPackagerCore.resolveEntryPoint(archivePaths, manifest);
    if (!resolved) {
      throw new Error("ERR_ENTRYPOINT_UNRESOLVED: No unambiguous entry point could be determined. Add index.md at the archive root, keep exactly one root Markdown file, or set manifest.entryPoint.");
    }
  }
  static async readMutationInputAsText(content) {
    if (typeof content === "string")
      return content;
    if (content instanceof Blob)
      return content.text();
    return new TextDecoder().decode(content);
  }
  static async readMutationInputAsBinary(content) {
    if (typeof content === "string")
      return new TextEncoder().encode(content);
    if (content instanceof Blob)
      return content.arrayBuffer();
    if (content instanceof Uint8Array)
      return content;
    return content;
  }
  static async writeZipEntry(zip, path, content) {
    if (_MdzArchiveCore.isTextFile(path)) {
      const text = await _MdzArchiveCore.readMutationInputAsText(content);
      zip.file(path, _MdzArchiveCore.normaliseLf(text));
      return;
    }
    const binary2 = await _MdzArchiveCore.readMutationInputAsBinary(content);
    zip.file(path, binary2);
  }
  static async finalizeMutation(zip) {
    const bytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const blob2 = new Blob([buffer], { type: "application/zip" });
    const archive = await _MdzArchiveCore.open(buffer);
    const manifest = await archive.readManifest();
    const resolvedEntryPoint = await archive.resolveEntryPoint().catch(() => null);
    return {
      blob: blob2,
      manifest,
      resolvedEntryPoint,
      archivePaths: _MdzArchiveCore.getArchivePaths(zip)
    };
  }
};
var MdzPackagerCore = class _MdzPackagerCore {
  /**
   * Default include globs for markdown and common image assets.
   */
  static DEFAULT_FILTERS = [
    "**/*.md",
    "**/*.markdown",
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.gif",
    "**/*.webp",
    "**/*.svg",
    "**/*.avif"
  ];
  /**
   * Normalizes input file paths for archive packaging.
   *
   * @param path - Source file path.
   */
  static normalizePath(path) {
    return MdzArchiveCore.normalizePath(path).replace(/^\.\//, "");
  }
  /**
   * Validates archive path constraints.
   *
   * @param path - Archive-relative path.
   */
  static validateArchivePath(path) {
    return MdzArchiveCore.validateArchivePath(path);
  }
  /**
   * Sanitizes one archive path segment by replacing forbidden characters.
   *
   * @param segment - Single path segment.
   */
  static sanitisePathSegment(segment) {
    let out = "";
    for (const c of segment) {
      const code = c.charCodeAt(0);
      if (/[\\:*?"<>|]/.test(c) || c === "\0" || code >= 1 && code <= 31 || code === 127)
        out += "_";
      else
        out += c;
    }
    out = out.trim();
    if (!out)
      return "_";
    if (out === "." || out === "..")
      return out.replace(/\./g, "_");
    return out;
  }
  /**
   * Sanitizes a full archive path by normalizing each path segment.
   *
   * @param path - Candidate archive path.
   */
  static sanitiseArchivePath(path) {
    return _MdzPackagerCore.normalizePath(path).split("/").filter(Boolean).map(_MdzPackagerCore.sanitisePathSegment).join("/");
  }
  /**
   * Ensures archive path uniqueness by appending `-2`, `-3`, etc when needed.
   *
   * @param candidate - Desired archive path.
   * @param usedPaths - Case-insensitive set of already-used paths.
   */
  static makeUniqueArchivePath(candidate, usedPaths) {
    if (!usedPaths.has(candidate.toLowerCase())) {
      usedPaths.add(candidate.toLowerCase());
      return candidate;
    }
    const slash = candidate.lastIndexOf("/");
    const dir2 = slash >= 0 ? candidate.slice(0, slash + 1) : "";
    const name = slash >= 0 ? candidate.slice(slash + 1) : candidate;
    const dot = name.lastIndexOf(".");
    const base = dot >= 0 ? name.slice(0, dot) : name;
    const ext = dot >= 0 ? name.slice(dot) : "";
    let n = 2;
    while (true) {
      const next = `${dir2}${base}-${n}${ext}`;
      if (!usedPaths.has(next.toLowerCase())) {
        usedPaths.add(next.toLowerCase());
        return next;
      }
      n += 1;
    }
  }
  /**
   * Tests whether a path matches a glob pattern supporting `*`, `?`, and `**`.
   *
   * @param path - Archive-relative path.
   * @param pattern - Glob pattern.
   */
  static globMatch(path, pattern) {
    const pathParts = path.split("/").filter(Boolean);
    const patternParts = pattern.replace(/\\/g, "/").split("/").filter(Boolean);
    const segmentMatch = (segment, pat) => {
      let si = 0;
      let pi = 0;
      let star = -1;
      let match = 0;
      while (si < segment.length) {
        const patChar = pat.charAt(pi);
        const segChar = segment.charAt(si);
        if (pi < pat.length && (patChar === "?" || patChar.toLowerCase() === segChar.toLowerCase())) {
          si += 1;
          pi += 1;
        } else if (pi < pat.length && patChar === "*") {
          star = pi;
          pi += 1;
          match = si;
        } else if (star !== -1) {
          pi = star + 1;
          match += 1;
          si = match;
        } else {
          return false;
        }
      }
      while (pi < pat.length && pat[pi] === "*")
        pi += 1;
      return pi === pat.length;
    };
    const matchParts = (pi, gi) => {
      if (gi === patternParts.length)
        return pi === pathParts.length;
      const part = patternParts[gi];
      if (part == null)
        return false;
      if (part === "**") {
        if (gi === patternParts.length - 1)
          return true;
        for (let skip2 = pi; skip2 <= pathParts.length; skip2 += 1) {
          if (matchParts(skip2, gi + 1))
            return true;
        }
        return false;
      }
      if (pi >= pathParts.length)
        return false;
      const pathPart = pathParts[pi];
      if (pathPart == null)
        return false;
      return segmentMatch(pathPart, part) && matchParts(pi + 1, gi + 1);
    };
    return matchParts(0, 0);
  }
  /**
   * Returns true if a path matches at least one filter pattern.
   *
   * @param path - Archive-relative path.
   * @param filters - Glob filter list.
   */
  static matchesAnyFilter(path, filters) {
    return filters.some((pattern) => _MdzPackagerCore.globMatch(path, pattern));
  }
  /**
   * Builds a generated manifest from packaging options, or `null` when none is needed.
   *
   * @param rootName - Root/source label for fallback title.
   * @param options - Packaging options.
   */
  static buildManifestFromOptions(rootName, options) {
    const hasManifestOption = options.mapFiles || !!options.title || !!options.mode || !!options.entryPoint || !!options.language || !!options.author || !!options.description || !!options.docVersion;
    if (!hasManifestOption)
      return null;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      spec: {
        name: "mdzip-spec",
        version: PRODUCER_SPEC_VERSION
      },
      producer: {
        core: {
          name: "mdzip-core-js",
          version: CORE_LIBRARY_VERSION,
          url: CORE_LIBRARY_URL
        }
      },
      title: options.title || rootName,
      mode: options.mode || void 0,
      entryPoint: options.entryPoint || null,
      language: options.language || "en",
      author: options.author ? { name: options.author } : void 0,
      authors: options.author ? [{ name: options.author }] : null,
      description: options.description || null,
      version: options.docVersion || null,
      created: now,
      modified: now
    };
  }
  /**
   * Resolves entry point using manifest override, `index.md`, or single-root-markdown fallback.
   *
   * @param archivePaths - Archive file paths.
   * @param manifest - Optional manifest with `entryPoint`.
   */
  static resolveEntryPoint(archivePaths, manifest) {
    if (manifest?.entryPoint && archivePaths.some((p) => p.toLowerCase() === manifest.entryPoint.toLowerCase())) {
      return manifest.entryPoint;
    }
    if (archivePaths.some((p) => p.toLowerCase() === "index.md"))
      return "index.md";
    const rootMarkdown = archivePaths.filter((p) => !p.includes("/") && MdzArchiveCore.isMarkdownFile(p));
    return rootMarkdown.length === 1 ? rootMarkdown[0] ?? null : null;
  }
  /**
   * Generates a simple index markdown page for archives without a clear entry point.
   *
   * @param markdownPaths - Markdown files to list.
   * @param title - Optional heading title.
   */
  static buildGeneratedIndex(markdownPaths, title) {
    const pageTitle = title && title.trim() ? title.trim() : "Index";
    const lines = [`# ${pageTitle}`, ""];
    if (!markdownPaths.length) {
      lines.push("No Markdown files were found.");
      return lines.join("\n");
    }
    const sorted = markdownPaths.slice().sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
    for (const p of sorted) {
      const fileName = p.split("/").pop() || p;
      const encoded = p.split("/").map(encodeURIComponent).join("/");
      lines.push(`- [${fileName}](<${encoded}>)`);
    }
    lines.push("", "---", "", "Generated by `mdz-core`", "", "More info: [markdownzip.org](https://markdownzip.org)");
    return lines.join("\n");
  }
  /**
   * Creates a canonical MDZip manifest from app-safe metadata.
   *
   * @param metadata - Editable manifest fields.
   */
  static createManifest(metadata) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const author = typeof metadata?.author === "string" ? { name: metadata.author } : metadata?.author ?? void 0;
    return {
      spec: {
        name: "mdzip-spec",
        version: PRODUCER_SPEC_VERSION
      },
      producer: {
        core: {
          name: "mdzip-core-js",
          version: CORE_LIBRARY_VERSION,
          url: CORE_LIBRARY_URL
        }
      },
      title: metadata?.title ?? void 0,
      mode: metadata?.mode ?? void 0,
      entryPoint: metadata?.entryPoint ?? null,
      language: metadata?.language ?? "en",
      author,
      authors: author ? [author] : null,
      description: metadata?.description ?? null,
      version: metadata?.version ?? null,
      license: metadata?.license ?? void 0,
      keywords: metadata?.keywords ?? void 0,
      cover: metadata?.cover ?? void 0,
      created: now,
      modified: now
    };
  }
  /**
   * Updates a manifest while preserving spec-managed fields unless explicitly changed elsewhere.
   *
   * @param manifest - Existing manifest, or `null` to create one.
   * @param updates - Editable metadata updates.
   * @param options - Timestamp controls.
   */
  static updateManifest(manifest, updates, options) {
    const next = manifest ? { ...manifest } : _MdzPackagerCore.createManifest(updates);
    _MdzPackagerCore.ensureCanonicalManifest(next, options);
    if (updates) {
      if ("title" in updates)
        next.title = updates.title ?? void 0;
      if ("author" in updates) {
        const author = typeof updates.author === "string" ? { name: updates.author } : updates.author ?? void 0;
        next.author = author;
        next.authors = author ? [author] : null;
      }
      if ("description" in updates)
        next.description = updates.description ?? null;
      if ("keywords" in updates)
        next.keywords = updates.keywords ?? void 0;
      if ("language" in updates)
        next.language = updates.language ?? null;
      if ("license" in updates)
        next.license = updates.license ?? void 0;
      if ("version" in updates)
        next.version = updates.version ?? null;
      if ("cover" in updates)
        next.cover = updates.cover ?? void 0;
      if ("mode" in updates)
        next.mode = updates.mode ?? void 0;
      if ("entryPoint" in updates)
        next.entryPoint = updates.entryPoint ?? null;
    }
    _MdzPackagerCore.ensureCanonicalManifest(next, options);
    return next;
  }
  /**
   * Splits a manifest into spec-managed fields and ordinary editable metadata.
   *
   * @param manifest - Manifest to split.
   */
  static splitManifestMetadata(manifest) {
    return {
      reserved: {
        spec: manifest.spec,
        producer: manifest.producer,
        created: manifest.created,
        modified: manifest.modified,
        entryPoint: manifest.entryPoint,
        mode: manifest.mode,
        files: manifest.files
      },
      editable: {
        title: manifest.title ?? null,
        author: manifest.author ?? null,
        description: manifest.description ?? null,
        keywords: manifest.keywords ?? null,
        language: manifest.language ?? null,
        license: manifest.license ?? null,
        version: manifest.version ?? null,
        cover: manifest.cover ?? null
      }
    };
  }
  /**
   * Creates a workspace asset from a browser `File`/`Blob` or raw bytes.
   *
   * @param source - Asset source.
   * @param targetPath - Optional archive path override.
   */
  static async createWorkspaceAssetFromFile(source, targetPath) {
    const isFile = typeof File !== "undefined" && source instanceof File;
    const isBlob = typeof Blob !== "undefined" && source instanceof Blob;
    const path = _MdzPackagerCore.normalizePath(targetPath || (isFile ? source.name : "asset.bin"));
    const pathError = _MdzPackagerCore.validateArchivePath(path);
    if (pathError)
      throw new Error(`ERR_PATH_INVALID: ${pathError}`);
    const bytes = await _MdzPackagerCore.readBinarySource(source);
    const mimeType = isBlob && source.type ? source.type : MdzArchiveCore.inferMimeType(path);
    return {
      path,
      fileName: MdzArchiveCore.basename(path),
      byteSize: bytes.byteLength,
      mimeType,
      kind: MdzArchiveCore.classifyAssetKind(path, mimeType),
      isPreviewable: MdzArchiveCore.isPreviewableAsset(path, mimeType),
      bytes
    };
  }
  /**
   * Exports a workspace asset as a browser-safe `Blob`.
   *
   * @param asset - Workspace asset.
   */
  static async exportWorkspaceAsset(asset) {
    const bytes = await _MdzPackagerCore.readWorkspaceAssetBytes(asset);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Blob([buffer], { type: asset.mimeType || MdzArchiveCore.inferMimeType(asset.path) });
  }
  /**
   * Builds an `.mdz` archive from a normalized workspace.
   *
   * Documents opened lazily (`includeLazyDocumentReaders`) are resolved via
   * their `readText()` reader before packing, so unopened documents keep their
   * content. Throws `ERR_LAZY_TEXT_UNAVAILABLE` when a lazy document has empty
   * `text` and no `readText` reader (e.g. the closure was dropped by a
   * serialization boundary), instead of silently writing an empty file.
   *
   * @param workspace - Workspace model.
   * @param options - Build controls and metadata overrides.
   * @param zipWriterFactory - Optional custom zip writer.
   */
  static async buildWorkspace(workspace, options, zipWriterFactory) {
    const entryPoint = options?.entryPoint ?? workspace.entryPoint ?? workspace.documents.find((doc) => doc.isEntryPoint)?.path ?? workspace.documents[0]?.path ?? null;
    const mode = options?.mode ?? workspace.mode;
    const title = options?.title ?? workspace.title ?? workspace.manifest?.title ?? null;
    const manifest = _MdzPackagerCore.updateManifest(workspace.manifest, {
      ...options?.metadata ?? {},
      title,
      mode,
      entryPoint
    });
    const files = [
      ...await Promise.all(workspace.documents.map(async (document) => {
        let text = document.text;
        if (!text && document.readText) {
          text = await document.readText();
        } else if (!text && document.isLazy) {
          throw new Error(`ERR_LAZY_TEXT_UNAVAILABLE: document "${document.path}" was opened lazily but has no readText() reader (likely dropped by serialization); building would write an empty file`);
        }
        return { path: document.path, text };
      })),
      ...await Promise.all(workspace.assets.map(async (asset) => ({
        path: asset.path,
        data: await _MdzPackagerCore.readWorkspaceAssetBytes(asset)
      }))),
      {
        path: "manifest.json",
        text: JSON.stringify(manifest, null, 2)
      }
    ];
    return _MdzPackagerCore.buildArchive(files, options?.rootName || title || "MDZip Workspace", {
      createIndex: false,
      mapFiles: false,
      filters: ["**/*", "*"]
    }, zipWriterFactory);
  }
  static normalizeLf(content) {
    return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  static isTextFile(path) {
    return /\.(md|markdown|json|txt|css|html|htm|xml|svg|yaml|yml|toml)$/i.test(path);
  }
  static isImagePath(path) {
    return /\.(png|jpg|jpeg|gif|webp|bmp|ico|webm|mp4|mp3|wav|ogg)$/i.test(path);
  }
  static async readProvidedManifest(selected) {
    const manifestItem = selected.find((item) => item.archivePath.toLowerCase() === "manifest.json");
    if (!manifestItem)
      return null;
    const raw = manifestItem.file ? await manifestItem.file.text() : manifestItem.text ?? "";
    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch {
      throw new Error("ERR_MANIFEST_INVALID: manifest.json is not valid JSON");
    }
    MdzArchiveCore.validateManifest(manifest);
    return manifest;
  }
  static ensureCanonicalManifest(manifest, options) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    manifest.spec = {
      ...manifest.spec ?? {},
      name: manifest.spec?.name || "mdzip-spec",
      version: manifest.spec?.version || PRODUCER_SPEC_VERSION
    };
    manifest.producer = {
      ...manifest.producer ?? {},
      core: {
        ...manifest.producer?.core ?? {},
        name: manifest.producer?.core?.name || "mdzip-core-js",
        version: manifest.producer?.core?.version || CORE_LIBRARY_VERSION,
        url: manifest.producer?.core?.url || CORE_LIBRARY_URL
      }
    };
    if (options?.setCreatedIfMissing !== false && manifest.created == null) {
      manifest.created = now;
    }
    if (options?.refreshModified !== false) {
      const modified = manifest.modified;
      if (modified && typeof modified === "object" && !Array.isArray(modified)) {
        manifest.modified = { ...modified, when: now };
      } else {
        manifest.modified = now;
      }
    }
  }
  static async readBinarySource(source) {
    if (source instanceof Uint8Array)
      return source;
    if (source instanceof ArrayBuffer)
      return new Uint8Array(source);
    if (typeof source.arrayBuffer === "function")
      return new Uint8Array(await source.arrayBuffer());
    throw new Error("ERR_ASSET_BYTES_INVALID: Asset source is not readable as bytes.");
  }
  static async readWorkspaceAssetBytes(asset) {
    if (asset.bytes)
      return _MdzPackagerCore.readBinarySource(asset.bytes);
    if (asset.readBytes)
      return asset.readBytes();
    throw new Error(`ERR_ASSET_BYTES_MISSING: Asset "${asset.path}" has no bytes or readBytes() source.`);
  }
  /**
   * Builds an `.mdz` archive from input files and packaging options.
   *
   * @param files - Source file candidates.
   * @param rootName - Root/source label for generated metadata.
   * @param options - Packaging options.
   * @param zipWriterFactory - Optional custom zip writer.
   */
  static async buildArchive(files, rootName, options, zipWriterFactory) {
    const cleanInput = files.map((f) => ({ path: _MdzPackagerCore.normalizePath(f.path), file: f.file, data: f.data, text: f.text })).filter((f) => f.path && !f.path.endsWith("/"));
    if (!cleanInput.length) {
      throw new Error("ERR_PACK_NO_INPUT: No files found to package.");
    }
    let manifest = _MdzPackagerCore.buildManifestFromOptions(rootName, options);
    const skipMap = /* @__PURE__ */ new Map();
    const usedPaths = /* @__PURE__ */ new Set();
    const selected = [];
    const manifestFiles = [];
    let invalidPathCount = 0;
    let sanitizedPathCount = 0;
    const addSkip = (reason) => {
      skipMap.set(reason, (skipMap.get(reason) || 0) + 1);
    };
    for (const item of cleanInput) {
      const originalPath = item.path;
      let archivePath = originalPath;
      if (!_MdzPackagerCore.matchesAnyFilter(originalPath, options.filters)) {
        addSkip("excluded by filter");
        continue;
      }
      if (manifest && archivePath.toLowerCase() === "manifest.json") {
        addSkip("manifest.json replaced by generated manifest");
        continue;
      }
      const pathError = _MdzPackagerCore.validateArchivePath(archivePath);
      if (pathError) {
        invalidPathCount += 1;
        if (!options.mapFiles) {
          addSkip("invalid path for MDZ rules");
          continue;
        }
        archivePath = _MdzPackagerCore.makeUniqueArchivePath(_MdzPackagerCore.sanitiseArchivePath(archivePath), usedPaths);
        sanitizedPathCount += 1;
      } else {
        archivePath = _MdzPackagerCore.makeUniqueArchivePath(archivePath, usedPaths);
      }
      const selectedItem = { archivePath, originalPath };
      if (item.file)
        selectedItem.file = item.file;
      if (item.data)
        selectedItem.data = item.data;
      if (item.text != null)
        selectedItem.text = item.text;
      selected.push(selectedItem);
      if (options.mapFiles && manifest && MdzArchiveCore.isMarkdownFile(archivePath)) {
        const base = originalPath.split("/").pop()?.replace(/\.[^/.]+$/, "") || originalPath;
        manifestFiles.push({ path: archivePath, originalPath, title: base.replace(/[_-]+/g, " ").trim() || originalPath });
      }
    }
    if (!manifest) {
      manifest = await _MdzPackagerCore.readProvidedManifest(selected);
    }
    let archivePaths = selected.map((f) => f.archivePath);
    let resolvedEntryPoint = _MdzPackagerCore.resolveEntryPoint(archivePaths, manifest);
    const warningMessages = [];
    const markdownPaths = archivePaths.filter(MdzArchiveCore.isMarkdownFile);
    if (!manifest?.mode && markdownPaths.length > 1) {
      warningMessages.push('Archive contains multiple Markdown files and no explicit manifest.mode; consumers will default to document mode. If these files are intended as separate documents, set mode: "project".');
    }
    if (options.createIndex && !resolvedEntryPoint) {
      if (manifest?.entryPoint) {
        throw new Error(`ERR_PACK_ENTRYPOINT_MISSING: Manifest entry-point "${manifest.entryPoint}" does not exist.`);
      }
      const sortedMarkdownPaths = markdownPaths.slice().sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
      const generated = _MdzPackagerCore.buildGeneratedIndex(sortedMarkdownPaths, options.title || rootName);
      selected.push({ archivePath: "index.md", originalPath: "[generated]", text: generated });
      archivePaths = selected.map((f) => f.archivePath);
      resolvedEntryPoint = "index.md";
      if (manifest)
        manifest.entryPoint = "index.md";
    }
    if (manifest?.entryPoint && !archivePaths.some((p) => p.toLowerCase() === manifest.entryPoint.toLowerCase())) {
      throw new Error(`ERR_PACK_ENTRYPOINT_MISSING: Manifest entry-point "${manifest.entryPoint}" does not exist in archive.`);
    }
    if (options.mapFiles && manifest) {
      manifest.files = manifestFiles;
    }
    const factory = zipWriterFactory ?? _MdzPackagerCore.getDefaultZipWriterFactory();
    const zip = factory.create();
    for (const item of selected) {
      const isImage = _MdzPackagerCore.isImagePath(item.archivePath);
      if (item.file) {
        if (_MdzPackagerCore.isTextFile(item.archivePath)) {
          const text = await item.file.text();
          zip.file(item.archivePath, _MdzPackagerCore.normalizeLf(text));
        } else {
          const buffer = await item.file.arrayBuffer();
          zip.file(item.archivePath, buffer, isImage ? { compression: "STORE" } : void 0);
        }
      } else if (item.data) {
        if (_MdzPackagerCore.isTextFile(item.archivePath)) {
          const bytes = await _MdzPackagerCore.readBinarySource(item.data);
          const text = new TextDecoder().decode(bytes);
          zip.file(item.archivePath, _MdzPackagerCore.normalizeLf(text));
        } else {
          const bytes = await _MdzPackagerCore.readBinarySource(item.data);
          zip.file(item.archivePath, bytes, isImage ? { compression: "STORE" } : void 0);
        }
      } else {
        const content = item.text || "";
        if (_MdzPackagerCore.isTextFile(item.archivePath)) {
          zip.file(item.archivePath, _MdzPackagerCore.normalizeLf(content));
        } else {
          zip.file(item.archivePath, content, isImage ? { compression: "STORE" } : void 0);
        }
      }
    }
    if (manifest) {
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    }
    const blob2 = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 } }, options.onProgress ? (metadata) => {
      const progress = { percent: metadata.percent };
      if (metadata.currentFile)
        progress.currentFile = metadata.currentFile;
      options.onProgress?.(progress);
    } : void 0);
    return {
      blob: blob2,
      manifest,
      resolvedEntryPoint,
      archivePaths,
      selected,
      warnings: {
        invalidPathCount,
        sanitizedPathCount,
        skippedByReason: Object.fromEntries(skipMap.entries()),
        messages: warningMessages,
        unresolvedEntry: !resolvedEntryPoint
      }
    };
  }
  static getDefaultZipWriterFactory() {
    return {
      create() {
        return new JSZip();
      }
    };
  }
};

// src/mdz-archive.worker.ts
var ctx = self;
var core;
function stripLazyReaders(workspace) {
  return {
    ...workspace,
    documents: workspace.documents.map((doc) => {
      if (!doc.readText) return doc;
      const { readText: _readText, ...rest } = doc;
      return rest;
    }),
    assets: workspace.assets.map((asset) => {
      if (!asset.readBytes && !asset.readDataUri) return asset;
      const { readBytes: _readBytes, readDataUri: _readDataUri, ...rest } = asset;
      return rest;
    })
  };
}
function respond(id, result) {
  ctx.postMessage({ id, ok: true, result });
}
function respondBytes(id, bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  ctx.postMessage({ id, ok: true, result: buffer }, [buffer]);
}
function respondError(id, error2) {
  const err2 = error2 instanceof Error ? error2 : new Error(String(error2));
  ctx.postMessage({ id, ok: false, error: { name: err2.name, message: err2.message } });
}
ctx.onmessage = (event) => {
  const request = event.data;
  void handle(request).catch((error2) => respondError(request.id, error2));
};
async function handle(request) {
  switch (request.type) {
    case "open": {
      core = await MdzArchiveCore.open(new Uint8Array(request.bytes));
      const workspace = await core.openWorkspace(request.options);
      respond(request.id, stripLazyReaders(workspace));
      return;
    }
    case "readText": {
      if (!core) throw new Error("ERR_ARCHIVE_WORKER_NOT_OPEN: no archive has been opened in this worker.");
      respond(request.id, await core.readText(request.path));
      return;
    }
    case "readBytes": {
      if (!core) throw new Error("ERR_ARCHIVE_WORKER_NOT_OPEN: no archive has been opened in this worker.");
      respondBytes(request.id, await core.readBytes(request.path));
      return;
    }
    case "dispose": {
      core = void 0;
      respond(request.id, void 0);
      return;
    }
  }
}
