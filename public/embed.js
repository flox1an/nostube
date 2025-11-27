/* Nostube Embed Player v0.1.0 | https://nostube.com */
;(() => {
  var kr = Object.defineProperty
  var Ps = (t, e, n) =>
    e in t ? kr(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (t[e] = n)
  var $s = (t, e) => {
    for (var n in e) kr(t, n, { get: e[n], enumerable: !0 })
  }
  var Xe = (t, e, n) => Ps(t, typeof e != 'symbol' ? e + '' : e, n)
  function Cr() {
    let t = new URLSearchParams(window.location.search)
    return {
      videoId: t.get('v') || '',
      autoplay: t.get('autoplay') === '1',
      muted: t.get('muted') === '1',
      loop: t.get('loop') === '1',
      startTime: parseInt(t.get('t') || '0', 10),
      controls: t.get('controls') !== '0',
      showTitle: t.get('title') !== '0',
      showBranding: t.get('branding') !== '0',
      preferredQuality: t.get('quality') || 'auto',
      customRelays: t.get('relays')
        ? t
            .get('relays')
            .split(',')
            .map(e => e.trim())
        : [],
      accentColor: t.get('color') || '8b5cf6',
    }
  }
  function Ir(t) {
    return t.videoId
      ? !t.videoId.startsWith('nevent1') &&
        !t.videoId.startsWith('naddr1') &&
        !t.videoId.startsWith('note1')
        ? {
            valid: !1,
            error: 'Invalid video ID format. Must be nevent1..., naddr1..., or note1...',
          }
        : { valid: !0 }
      : { valid: !1, error: 'Missing required parameter: v (video ID)' }
  }
  function _r(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function fn(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Ur(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(_r(t.outputLen), _r(t.blockLen))
  }
  function Qe(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Nr(t, e) {
    fn(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var bt = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Rr = t => t instanceof Uint8Array
  var xt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    le = (t, e) => (t << (32 - e)) | (t >>> e),
    Hs = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Hs) throw new Error('Non little-endian hardware is not supported')
  function Ms(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function lt(t) {
    if ((typeof t == 'string' && (t = Ms(t)), !Rr(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function Or(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!Rr(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var et = class {
      clone() {
        return this._cloneInto()
      }
    },
    yf = {}.toString
  function Pr(t) {
    let e = r => t().update(lt(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function vt(t = 32) {
    if (bt && typeof bt.getRandomValues == 'function') return bt.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function qs(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var Et = class extends et {
    constructor(e, n, r, o) {
      ;(super(),
        (this.blockLen = e),
        (this.outputLen = n),
        (this.padOffset = r),
        (this.isLE = o),
        (this.finished = !1),
        (this.length = 0),
        (this.pos = 0),
        (this.destroyed = !1),
        (this.buffer = new Uint8Array(e)),
        (this.view = xt(this.buffer)))
    }
    update(e) {
      Qe(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = lt(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = xt(e)
          for (; o <= s - i; i += o) this.process(c, i)
          continue
        }
        ;(r.set(e.subarray(i, i + a), this.pos),
          (this.pos += a),
          (i += a),
          this.pos === o && (this.process(n, 0), (this.pos = 0)))
      }
      return ((this.length += e.length), this.roundClean(), this)
    }
    digestInto(e) {
      ;(Qe(this), Nr(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let u = i; u < o; u++) n[u] = 0
      ;(qs(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = xt(e),
        c = this.outputLen
      if (c % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = c / 4,
        f = this.get()
      if (l > f.length) throw new Error('_sha2: outputLen bigger than state')
      for (let u = 0; u < l; u++) a.setUint32(4 * u, f[u], s)
    }
    digest() {
      let { buffer: e, outputLen: n } = this
      this.digestInto(e)
      let r = e.slice(0, n)
      return (this.destroy(), r)
    }
    _cloneInto(e) {
      ;(e || (e = new this.constructor()), e.set(...this.get()))
      let { blockLen: n, buffer: r, length: o, finished: s, destroyed: i, pos: a } = this
      return (
        (e.length = o),
        (e.pos = a),
        (e.finished = s),
        (e.destroyed = i),
        o % n && e.buffer.set(r),
        e
      )
    }
  }
  var Vs = (t, e, n) => (t & e) ^ (~t & n),
    Ws = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    Ds = new Uint32Array([
      1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
      3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
      3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
      2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
      666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
      2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
      430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
      1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479,
      3329325298,
    ]),
    Ce = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Ie = new Uint32Array(64),
    un = class extends Et {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = Ce[0] | 0),
          (this.B = Ce[1] | 0),
          (this.C = Ce[2] | 0),
          (this.D = Ce[3] | 0),
          (this.E = Ce[4] | 0),
          (this.F = Ce[5] | 0),
          (this.G = Ce[6] | 0),
          (this.H = Ce[7] | 0))
      }
      get() {
        let { A: e, B: n, C: r, D: o, E: s, F: i, G: a, H: c } = this
        return [e, n, r, o, s, i, a, c]
      }
      set(e, n, r, o, s, i, a, c) {
        ;((this.A = e | 0),
          (this.B = n | 0),
          (this.C = r | 0),
          (this.D = o | 0),
          (this.E = s | 0),
          (this.F = i | 0),
          (this.G = a | 0),
          (this.H = c | 0))
      }
      process(e, n) {
        for (let u = 0; u < 16; u++, n += 4) Ie[u] = e.getUint32(n, !1)
        for (let u = 16; u < 64; u++) {
          let p = Ie[u - 15],
            y = Ie[u - 2],
            g = le(p, 7) ^ le(p, 18) ^ (p >>> 3),
            d = le(y, 17) ^ le(y, 19) ^ (y >>> 10)
          Ie[u] = (d + Ie[u - 7] + g + Ie[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let p = le(a, 6) ^ le(a, 11) ^ le(a, 25),
            y = (f + p + Vs(a, c, l) + Ds[u] + Ie[u]) | 0,
            d = ((le(r, 2) ^ le(r, 13) ^ le(r, 22)) + Ws(r, o, s)) | 0
          ;((f = l),
            (l = c),
            (c = a),
            (a = (i + y) | 0),
            (i = s),
            (s = o),
            (o = r),
            (r = (y + d) | 0))
        }
        ;((r = (r + this.A) | 0),
          (o = (o + this.B) | 0),
          (s = (s + this.C) | 0),
          (i = (i + this.D) | 0),
          (a = (a + this.E) | 0),
          (c = (c + this.F) | 0),
          (l = (l + this.G) | 0),
          (f = (f + this.H) | 0),
          this.set(r, o, s, i, a, c, l, f))
      }
      roundClean() {
        Ie.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    }
  var At = Pr(() => new un())
  var gn = {}
  $s(gn, {
    bitGet: () => Fs,
    bitLen: () => Js,
    bitMask: () => ft,
    bitSet: () => Ys,
    bytesToHex: () => De,
    bytesToNumberBE: () => J,
    bytesToNumberLE: () => Bt,
    concatBytes: () => ve,
    createHmacDrbg: () => pn,
    ensureBytes: () => j,
    equalBytes: () => Zs,
    hexToBytes: () => ze,
    hexToNumber: () => hn,
    numberToBytesBE: () => fe,
    numberToBytesLE: () => Lt,
    numberToHexUnpadded: () => Mr,
    numberToVarBytesBE: () => Ks,
    utf8ToBytes: () => Gs,
    validateObject: () => _e,
  })
  var Hr = BigInt(0),
    Tt = BigInt(1),
    zs = BigInt(2),
    St = t => t instanceof Uint8Array,
    js = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function De(t) {
    if (!St(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += js[t[n]]
    return e
  }
  function Mr(t) {
    let e = t.toString(16)
    return e.length & 1 ? `0${e}` : e
  }
  function hn(t) {
    if (typeof t != 'string') throw new Error('hex string expected, got ' + typeof t)
    return BigInt(t === '' ? '0' : `0x${t}`)
  }
  function ze(t) {
    if (typeof t != 'string') throw new Error('hex string expected, got ' + typeof t)
    let e = t.length
    if (e % 2) throw new Error('padded hex string expected, got unpadded hex of length ' + e)
    let n = new Uint8Array(e / 2)
    for (let r = 0; r < n.length; r++) {
      let o = r * 2,
        s = t.slice(o, o + 2),
        i = Number.parseInt(s, 16)
      if (Number.isNaN(i) || i < 0) throw new Error('Invalid byte sequence')
      n[r] = i
    }
    return n
  }
  function J(t) {
    return hn(De(t))
  }
  function Bt(t) {
    if (!St(t)) throw new Error('Uint8Array expected')
    return hn(De(Uint8Array.from(t).reverse()))
  }
  function fe(t, e) {
    return ze(t.toString(16).padStart(e * 2, '0'))
  }
  function Lt(t, e) {
    return fe(t, e).reverse()
  }
  function Ks(t) {
    return ze(Mr(t))
  }
  function j(t, e, n) {
    let r
    if (typeof e == 'string')
      try {
        r = ze(e)
      } catch (s) {
        throw new Error(`${t} must be valid hex string, got "${e}". Cause: ${s}`)
      }
    else if (St(e)) r = Uint8Array.from(e)
    else throw new Error(`${t} must be hex string or Uint8Array`)
    let o = r.length
    if (typeof n == 'number' && o !== n) throw new Error(`${t} expected ${n} bytes, got ${o}`)
    return r
  }
  function ve(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!St(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  function Zs(t, e) {
    if (t.length !== e.length) return !1
    for (let n = 0; n < t.length; n++) if (t[n] !== e[n]) return !1
    return !0
  }
  function Gs(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Js(t) {
    let e
    for (e = 0; t > Hr; t >>= Tt, e += 1);
    return e
  }
  function Fs(t, e) {
    return (t >> BigInt(e)) & Tt
  }
  var Ys = (t, e, n) => t | ((n ? Tt : Hr) << BigInt(e)),
    ft = t => (zs << BigInt(t - 1)) - Tt,
    dn = t => new Uint8Array(t),
    $r = t => Uint8Array.from(t)
  function pn(t, e, n) {
    if (typeof t != 'number' || t < 2) throw new Error('hashLen must be a number')
    if (typeof e != 'number' || e < 2) throw new Error('qByteLen must be a number')
    if (typeof n != 'function') throw new Error('hmacFn must be a function')
    let r = dn(t),
      o = dn(t),
      s = 0,
      i = () => {
        ;(r.fill(1), o.fill(0), (s = 0))
      },
      a = (...u) => n(o, r, ...u),
      c = (u = dn()) => {
        ;((o = a($r([0]), u)), (r = a()), u.length !== 0 && ((o = a($r([1]), u)), (r = a())))
      },
      l = () => {
        if (s++ >= 1e3) throw new Error('drbg: tried 1000 values')
        let u = 0,
          p = []
        for (; u < e; ) {
          r = a()
          let y = r.slice()
          ;(p.push(y), (u += r.length))
        }
        return ve(...p)
      }
    return (u, p) => {
      ;(i(), c(u))
      let y
      for (; !(y = p(l())); ) c()
      return (i(), y)
    }
  }
  var Xs = {
    bigint: t => typeof t == 'bigint',
    function: t => typeof t == 'function',
    boolean: t => typeof t == 'boolean',
    string: t => typeof t == 'string',
    stringOrUint8Array: t => typeof t == 'string' || t instanceof Uint8Array,
    isSafeInteger: t => Number.isSafeInteger(t),
    array: t => Array.isArray(t),
    field: (t, e) => e.Fp.isValid(t),
    hash: t => typeof t == 'function' && Number.isSafeInteger(t.outputLen),
  }
  function _e(t, e, n = {}) {
    let r = (o, s, i) => {
      let a = Xs[s]
      if (typeof a != 'function') throw new Error(`Invalid validator "${s}", expected function`)
      let c = t[o]
      if (!(i && c === void 0) && !a(c, t))
        throw new Error(`Invalid param ${String(o)}=${c} (${typeof c}), expected ${s}`)
    }
    for (let [o, s] of Object.entries(e)) r(o, s, !1)
    for (let [o, s] of Object.entries(n)) r(o, s, !0)
    return t
  }
  var Z = BigInt(0),
    D = BigInt(1),
    je = BigInt(2),
    Qs = BigInt(3),
    yn = BigInt(4),
    qr = BigInt(5),
    Vr = BigInt(8),
    ei = BigInt(9),
    ti = BigInt(16)
  function K(t, e) {
    let n = t % e
    return n >= Z ? n : e + n
  }
  function ni(t, e, n) {
    if (n <= Z || e < Z) throw new Error('Expected power/modulo > 0')
    if (n === D) return Z
    let r = D
    for (; e > Z; ) (e & D && (r = (r * t) % n), (t = (t * t) % n), (e >>= D))
    return r
  }
  function ne(t, e, n) {
    let r = t
    for (; e-- > Z; ) ((r *= r), (r %= n))
    return r
  }
  function kt(t, e) {
    if (t === Z || e <= Z)
      throw new Error(`invert: expected positive integers, got n=${t} mod=${e}`)
    let n = K(t, e),
      r = e,
      o = Z,
      s = D,
      i = D,
      a = Z
    for (; n !== Z; ) {
      let l = r / n,
        f = r % n,
        u = o - i * l,
        p = s - a * l
      ;((r = n), (n = f), (o = i), (s = a), (i = u), (a = p))
    }
    if (r !== D) throw new Error('invert: does not exist')
    return K(o, e)
  }
  function ri(t) {
    let e = (t - D) / je,
      n,
      r,
      o
    for (n = t - D, r = 0; n % je === Z; n /= je, r++);
    for (o = je; o < t && ni(o, e, t) !== t - D; o++);
    if (r === 1) {
      let i = (t + D) / yn
      return function (c, l) {
        let f = c.pow(l, i)
        if (!c.eql(c.sqr(f), l)) throw new Error('Cannot find square root')
        return f
      }
    }
    let s = (n + D) / je
    return function (a, c) {
      if (a.pow(c, e) === a.neg(a.ONE)) throw new Error('Cannot find square root')
      let l = r,
        f = a.pow(a.mul(a.ONE, o), n),
        u = a.pow(c, s),
        p = a.pow(c, n)
      for (; !a.eql(p, a.ONE); ) {
        if (a.eql(p, a.ZERO)) return a.ZERO
        let y = 1
        for (let d = a.sqr(p); y < l && !a.eql(d, a.ONE); y++) d = a.sqr(d)
        let g = a.pow(f, D << BigInt(l - y - 1))
        ;((f = a.sqr(g)), (u = a.mul(u, g)), (p = a.mul(p, f)), (l = y))
      }
      return u
    }
  }
  function oi(t) {
    if (t % yn === Qs) {
      let e = (t + D) / yn
      return function (r, o) {
        let s = r.pow(o, e)
        if (!r.eql(r.sqr(s), o)) throw new Error('Cannot find square root')
        return s
      }
    }
    if (t % Vr === qr) {
      let e = (t - qr) / Vr
      return function (r, o) {
        let s = r.mul(o, je),
          i = r.pow(s, e),
          a = r.mul(o, i),
          c = r.mul(r.mul(a, je), i),
          l = r.mul(a, r.sub(c, r.ONE))
        if (!r.eql(r.sqr(l), o)) throw new Error('Cannot find square root')
        return l
      }
    }
    return (t % ti, ri(t))
  }
  var si = [
    'create',
    'isValid',
    'is0',
    'neg',
    'inv',
    'sqrt',
    'sqr',
    'eql',
    'add',
    'sub',
    'mul',
    'pow',
    'div',
    'addN',
    'subN',
    'mulN',
    'sqrN',
  ]
  function wn(t) {
    let e = { ORDER: 'bigint', MASK: 'bigint', BYTES: 'isSafeInteger', BITS: 'isSafeInteger' },
      n = si.reduce((r, o) => ((r[o] = 'function'), r), e)
    return _e(t, n)
  }
  function ii(t, e, n) {
    if (n < Z) throw new Error('Expected power > 0')
    if (n === Z) return t.ONE
    if (n === D) return e
    let r = t.ONE,
      o = e
    for (; n > Z; ) (n & D && (r = t.mul(r, o)), (o = t.sqr(o)), (n >>= D))
    return r
  }
  function ai(t, e) {
    let n = new Array(e.length),
      r = e.reduce((s, i, a) => (t.is0(i) ? s : ((n[a] = s), t.mul(s, i))), t.ONE),
      o = t.inv(r)
    return (
      e.reduceRight((s, i, a) => (t.is0(i) ? s : ((n[a] = t.mul(s, n[a])), t.mul(s, i))), o),
      n
    )
  }
  function mn(t, e) {
    let n = e !== void 0 ? e : t.toString(2).length,
      r = Math.ceil(n / 8)
    return { nBitLength: n, nByteLength: r }
  }
  function Wr(t, e, n = !1, r = {}) {
    if (t <= Z) throw new Error(`Expected Field ORDER > 0, got ${t}`)
    let { nBitLength: o, nByteLength: s } = mn(t, e)
    if (s > 2048) throw new Error('Field lengths over 2048 bytes are not supported')
    let i = oi(t),
      a = Object.freeze({
        ORDER: t,
        BITS: o,
        BYTES: s,
        MASK: ft(o),
        ZERO: Z,
        ONE: D,
        create: c => K(c, t),
        isValid: c => {
          if (typeof c != 'bigint')
            throw new Error(`Invalid field element: expected bigint, got ${typeof c}`)
          return Z <= c && c < t
        },
        is0: c => c === Z,
        isOdd: c => (c & D) === D,
        neg: c => K(-c, t),
        eql: (c, l) => c === l,
        sqr: c => K(c * c, t),
        add: (c, l) => K(c + l, t),
        sub: (c, l) => K(c - l, t),
        mul: (c, l) => K(c * l, t),
        pow: (c, l) => ii(a, c, l),
        div: (c, l) => K(c * kt(l, t), t),
        sqrN: c => c * c,
        addN: (c, l) => c + l,
        subN: (c, l) => c - l,
        mulN: (c, l) => c * l,
        inv: c => kt(c, t),
        sqrt: r.sqrt || (c => i(a, c)),
        invertBatch: c => ai(a, c),
        cmov: (c, l, f) => (f ? l : c),
        toBytes: c => (n ? Lt(c, s) : fe(c, s)),
        fromBytes: c => {
          if (c.length !== s) throw new Error(`Fp.fromBytes: expected ${s}, got ${c.length}`)
          return n ? Bt(c) : J(c)
        },
      })
    return Object.freeze(a)
  }
  function Dr(t) {
    if (typeof t != 'bigint') throw new Error('field order must be bigint')
    let e = t.toString(2).length
    return Math.ceil(e / 8)
  }
  function bn(t) {
    let e = Dr(t)
    return e + Math.ceil(e / 2)
  }
  function zr(t, e, n = !1) {
    let r = t.length,
      o = Dr(e),
      s = bn(e)
    if (r < 16 || r < s || r > 1024) throw new Error(`expected ${s}-1024 bytes of input, got ${r}`)
    let i = n ? J(t) : Bt(t),
      a = K(i, e - D) + D
    return n ? Lt(a, o) : fe(a, o)
  }
  var li = BigInt(0),
    xn = BigInt(1)
  function jr(t, e) {
    let n = (o, s) => {
        let i = s.negate()
        return o ? i : s
      },
      r = o => {
        let s = Math.ceil(e / o) + 1,
          i = 2 ** (o - 1)
        return { windows: s, windowSize: i }
      }
    return {
      constTimeNegate: n,
      unsafeLadder(o, s) {
        let i = t.ZERO,
          a = o
        for (; s > li; ) (s & xn && (i = i.add(a)), (a = a.double()), (s >>= xn))
        return i
      },
      precomputeWindow(o, s) {
        let { windows: i, windowSize: a } = r(s),
          c = [],
          l = o,
          f = l
        for (let u = 0; u < i; u++) {
          ;((f = l), c.push(f))
          for (let p = 1; p < a; p++) ((f = f.add(l)), c.push(f))
          l = f.double()
        }
        return c
      },
      wNAF(o, s, i) {
        let { windows: a, windowSize: c } = r(o),
          l = t.ZERO,
          f = t.BASE,
          u = BigInt(2 ** o - 1),
          p = 2 ** o,
          y = BigInt(o)
        for (let g = 0; g < a; g++) {
          let d = g * c,
            h = Number(i & u)
          ;((i >>= y), h > c && ((h -= p), (i += xn)))
          let w = d,
            m = d + Math.abs(h) - 1,
            x = g % 2 !== 0,
            A = h < 0
          h === 0 ? (f = f.add(n(x, s[w]))) : (l = l.add(n(A, s[m])))
        }
        return { p: l, f }
      },
      wNAFCached(o, s, i, a) {
        let c = o._WINDOW_SIZE || 1,
          l = s.get(o)
        return (
          l || ((l = this.precomputeWindow(o, c)), c !== 1 && s.set(o, a(l))),
          this.wNAF(c, l, i)
        )
      },
    }
  }
  function vn(t) {
    return (
      wn(t.Fp),
      _e(
        t,
        { n: 'bigint', h: 'bigint', Gx: 'field', Gy: 'field' },
        { nBitLength: 'isSafeInteger', nByteLength: 'isSafeInteger' }
      ),
      Object.freeze({ ...mn(t.n, t.nBitLength), ...t, p: t.Fp.ORDER })
    )
  }
  function fi(t) {
    let e = vn(t)
    _e(
      e,
      { a: 'field', b: 'field' },
      {
        allowedPrivateKeyLengths: 'array',
        wrapPrivateKey: 'boolean',
        isTorsionFree: 'function',
        clearCofactor: 'function',
        allowInfinityPoint: 'boolean',
        fromBytes: 'function',
        toBytes: 'function',
      }
    )
    let { endo: n, Fp: r, a: o } = e
    if (n) {
      if (!r.eql(o, r.ZERO))
        throw new Error('Endomorphism can only be defined for Koblitz curves that have a=0')
      if (typeof n != 'object' || typeof n.beta != 'bigint' || typeof n.splitScalar != 'function')
        throw new Error('Expected endomorphism with beta: bigint and splitScalar: function')
    }
    return Object.freeze({ ...e })
  }
  var { bytesToNumberBE: ui, hexToBytes: di } = gn,
    Ke = {
      Err: class extends Error {
        constructor(e = '') {
          super(e)
        }
      },
      _parseInt(t) {
        let { Err: e } = Ke
        if (t.length < 2 || t[0] !== 2) throw new e('Invalid signature integer tag')
        let n = t[1],
          r = t.subarray(2, n + 2)
        if (!n || r.length !== n) throw new e('Invalid signature integer: wrong length')
        if (r[0] & 128) throw new e('Invalid signature integer: negative')
        if (r[0] === 0 && !(r[1] & 128))
          throw new e('Invalid signature integer: unnecessary leading zero')
        return { d: ui(r), l: t.subarray(n + 2) }
      },
      toSig(t) {
        let { Err: e } = Ke,
          n = typeof t == 'string' ? di(t) : t
        if (!(n instanceof Uint8Array)) throw new Error('ui8a expected')
        let r = n.length
        if (r < 2 || n[0] != 48) throw new e('Invalid signature tag')
        if (n[1] !== r - 2) throw new e('Invalid signature: incorrect length')
        let { d: o, l: s } = Ke._parseInt(n.subarray(2)),
          { d: i, l: a } = Ke._parseInt(s)
        if (a.length) throw new e('Invalid signature: left bytes after parsing')
        return { r: o, s: i }
      },
      hexFromSig(t) {
        let e = l => (Number.parseInt(l[0], 16) & 8 ? '00' + l : l),
          n = l => {
            let f = l.toString(16)
            return f.length & 1 ? `0${f}` : f
          },
          r = e(n(t.s)),
          o = e(n(t.r)),
          s = r.length / 2,
          i = o.length / 2,
          a = n(s),
          c = n(i)
        return `30${n(i + s + 4)}02${c}${o}02${a}${r}`
      },
    },
    Ee = BigInt(0),
    se = BigInt(1),
    _f = BigInt(2),
    Kr = BigInt(3),
    Uf = BigInt(4)
  function hi(t) {
    let e = fi(t),
      { Fp: n } = e,
      r =
        e.toBytes ||
        ((g, d, h) => {
          let w = d.toAffine()
          return ve(Uint8Array.from([4]), n.toBytes(w.x), n.toBytes(w.y))
        }),
      o =
        e.fromBytes ||
        (g => {
          let d = g.subarray(1),
            h = n.fromBytes(d.subarray(0, n.BYTES)),
            w = n.fromBytes(d.subarray(n.BYTES, 2 * n.BYTES))
          return { x: h, y: w }
        })
    function s(g) {
      let { a: d, b: h } = e,
        w = n.sqr(g),
        m = n.mul(w, g)
      return n.add(n.add(m, n.mul(g, d)), h)
    }
    if (!n.eql(n.sqr(e.Gy), s(e.Gx))) throw new Error('bad generator point: equation left != right')
    function i(g) {
      return typeof g == 'bigint' && Ee < g && g < e.n
    }
    function a(g) {
      if (!i(g)) throw new Error('Expected valid bigint: 0 < bigint < curve.n')
    }
    function c(g) {
      let { allowedPrivateKeyLengths: d, nByteLength: h, wrapPrivateKey: w, n: m } = e
      if (d && typeof g != 'bigint') {
        if ((g instanceof Uint8Array && (g = De(g)), typeof g != 'string' || !d.includes(g.length)))
          throw new Error('Invalid key')
        g = g.padStart(h * 2, '0')
      }
      let x
      try {
        x = typeof g == 'bigint' ? g : J(j('private key', g, h))
      } catch {
        throw new Error(`private key must be ${h} bytes, hex or bigint, not ${typeof g}`)
      }
      return (w && (x = K(x, m)), a(x), x)
    }
    let l = new Map()
    function f(g) {
      if (!(g instanceof u)) throw new Error('ProjectivePoint expected')
    }
    class u {
      constructor(d, h, w) {
        if (((this.px = d), (this.py = h), (this.pz = w), d == null || !n.isValid(d)))
          throw new Error('x required')
        if (h == null || !n.isValid(h)) throw new Error('y required')
        if (w == null || !n.isValid(w)) throw new Error('z required')
      }
      static fromAffine(d) {
        let { x: h, y: w } = d || {}
        if (!d || !n.isValid(h) || !n.isValid(w)) throw new Error('invalid affine point')
        if (d instanceof u) throw new Error('projective point not allowed')
        let m = x => n.eql(x, n.ZERO)
        return m(h) && m(w) ? u.ZERO : new u(h, w, n.ONE)
      }
      get x() {
        return this.toAffine().x
      }
      get y() {
        return this.toAffine().y
      }
      static normalizeZ(d) {
        let h = n.invertBatch(d.map(w => w.pz))
        return d.map((w, m) => w.toAffine(h[m])).map(u.fromAffine)
      }
      static fromHex(d) {
        let h = u.fromAffine(o(j('pointHex', d)))
        return (h.assertValidity(), h)
      }
      static fromPrivateKey(d) {
        return u.BASE.multiply(c(d))
      }
      _setWindowSize(d) {
        ;((this._WINDOW_SIZE = d), l.delete(this))
      }
      assertValidity() {
        if (this.is0()) {
          if (e.allowInfinityPoint && !n.is0(this.py)) return
          throw new Error('bad point: ZERO')
        }
        let { x: d, y: h } = this.toAffine()
        if (!n.isValid(d) || !n.isValid(h)) throw new Error('bad point: x or y not FE')
        let w = n.sqr(h),
          m = s(d)
        if (!n.eql(w, m)) throw new Error('bad point: equation left != right')
        if (!this.isTorsionFree()) throw new Error('bad point: not in prime-order subgroup')
      }
      hasEvenY() {
        let { y: d } = this.toAffine()
        if (n.isOdd) return !n.isOdd(d)
        throw new Error("Field doesn't support isOdd")
      }
      equals(d) {
        f(d)
        let { px: h, py: w, pz: m } = this,
          { px: x, py: A, pz: S } = d,
          T = n.eql(n.mul(h, S), n.mul(x, m)),
          B = n.eql(n.mul(w, S), n.mul(A, m))
        return T && B
      }
      negate() {
        return new u(this.px, n.neg(this.py), this.pz)
      }
      double() {
        let { a: d, b: h } = e,
          w = n.mul(h, Kr),
          { px: m, py: x, pz: A } = this,
          S = n.ZERO,
          T = n.ZERO,
          B = n.ZERO,
          k = n.mul(m, m),
          N = n.mul(x, x),
          _ = n.mul(A, A),
          I = n.mul(m, x)
        return (
          (I = n.add(I, I)),
          (B = n.mul(m, A)),
          (B = n.add(B, B)),
          (S = n.mul(d, B)),
          (T = n.mul(w, _)),
          (T = n.add(S, T)),
          (S = n.sub(N, T)),
          (T = n.add(N, T)),
          (T = n.mul(S, T)),
          (S = n.mul(I, S)),
          (B = n.mul(w, B)),
          (_ = n.mul(d, _)),
          (I = n.sub(k, _)),
          (I = n.mul(d, I)),
          (I = n.add(I, B)),
          (B = n.add(k, k)),
          (k = n.add(B, k)),
          (k = n.add(k, _)),
          (k = n.mul(k, I)),
          (T = n.add(T, k)),
          (_ = n.mul(x, A)),
          (_ = n.add(_, _)),
          (k = n.mul(_, I)),
          (S = n.sub(S, k)),
          (B = n.mul(_, N)),
          (B = n.add(B, B)),
          (B = n.add(B, B)),
          new u(S, T, B)
        )
      }
      add(d) {
        f(d)
        let { px: h, py: w, pz: m } = this,
          { px: x, py: A, pz: S } = d,
          T = n.ZERO,
          B = n.ZERO,
          k = n.ZERO,
          N = e.a,
          _ = n.mul(e.b, Kr),
          I = n.mul(h, x),
          $ = n.mul(w, A),
          H = n.mul(m, S),
          V = n.add(h, w),
          b = n.add(x, A)
        ;((V = n.mul(V, b)), (b = n.add(I, $)), (V = n.sub(V, b)), (b = n.add(h, m)))
        let v = n.add(x, S)
        return (
          (b = n.mul(b, v)),
          (v = n.add(I, H)),
          (b = n.sub(b, v)),
          (v = n.add(w, m)),
          (T = n.add(A, S)),
          (v = n.mul(v, T)),
          (T = n.add($, H)),
          (v = n.sub(v, T)),
          (k = n.mul(N, b)),
          (T = n.mul(_, H)),
          (k = n.add(T, k)),
          (T = n.sub($, k)),
          (k = n.add($, k)),
          (B = n.mul(T, k)),
          ($ = n.add(I, I)),
          ($ = n.add($, I)),
          (H = n.mul(N, H)),
          (b = n.mul(_, b)),
          ($ = n.add($, H)),
          (H = n.sub(I, H)),
          (H = n.mul(N, H)),
          (b = n.add(b, H)),
          (I = n.mul($, b)),
          (B = n.add(B, I)),
          (I = n.mul(v, b)),
          (T = n.mul(V, T)),
          (T = n.sub(T, I)),
          (I = n.mul(V, $)),
          (k = n.mul(v, k)),
          (k = n.add(k, I)),
          new u(T, B, k)
        )
      }
      subtract(d) {
        return this.add(d.negate())
      }
      is0() {
        return this.equals(u.ZERO)
      }
      wNAF(d) {
        return y.wNAFCached(this, l, d, h => {
          let w = n.invertBatch(h.map(m => m.pz))
          return h.map((m, x) => m.toAffine(w[x])).map(u.fromAffine)
        })
      }
      multiplyUnsafe(d) {
        let h = u.ZERO
        if (d === Ee) return h
        if ((a(d), d === se)) return this
        let { endo: w } = e
        if (!w) return y.unsafeLadder(this, d)
        let { k1neg: m, k1: x, k2neg: A, k2: S } = w.splitScalar(d),
          T = h,
          B = h,
          k = this
        for (; x > Ee || S > Ee; )
          (x & se && (T = T.add(k)),
            S & se && (B = B.add(k)),
            (k = k.double()),
            (x >>= se),
            (S >>= se))
        return (
          m && (T = T.negate()),
          A && (B = B.negate()),
          (B = new u(n.mul(B.px, w.beta), B.py, B.pz)),
          T.add(B)
        )
      }
      multiply(d) {
        a(d)
        let h = d,
          w,
          m,
          { endo: x } = e
        if (x) {
          let { k1neg: A, k1: S, k2neg: T, k2: B } = x.splitScalar(h),
            { p: k, f: N } = this.wNAF(S),
            { p: _, f: I } = this.wNAF(B)
          ;((k = y.constTimeNegate(A, k)),
            (_ = y.constTimeNegate(T, _)),
            (_ = new u(n.mul(_.px, x.beta), _.py, _.pz)),
            (w = k.add(_)),
            (m = N.add(I)))
        } else {
          let { p: A, f: S } = this.wNAF(h)
          ;((w = A), (m = S))
        }
        return u.normalizeZ([w, m])[0]
      }
      multiplyAndAddUnsafe(d, h, w) {
        let m = u.BASE,
          x = (S, T) =>
            T === Ee || T === se || !S.equals(m) ? S.multiplyUnsafe(T) : S.multiply(T),
          A = x(this, h).add(x(d, w))
        return A.is0() ? void 0 : A
      }
      toAffine(d) {
        let { px: h, py: w, pz: m } = this,
          x = this.is0()
        d == null && (d = x ? n.ONE : n.inv(m))
        let A = n.mul(h, d),
          S = n.mul(w, d),
          T = n.mul(m, d)
        if (x) return { x: n.ZERO, y: n.ZERO }
        if (!n.eql(T, n.ONE)) throw new Error('invZ was invalid')
        return { x: A, y: S }
      }
      isTorsionFree() {
        let { h: d, isTorsionFree: h } = e
        if (d === se) return !0
        if (h) return h(u, this)
        throw new Error('isTorsionFree() has not been declared for the elliptic curve')
      }
      clearCofactor() {
        let { h: d, clearCofactor: h } = e
        return d === se ? this : h ? h(u, this) : this.multiplyUnsafe(e.h)
      }
      toRawBytes(d = !0) {
        return (this.assertValidity(), r(u, this, d))
      }
      toHex(d = !0) {
        return De(this.toRawBytes(d))
      }
    }
    ;((u.BASE = new u(e.Gx, e.Gy, n.ONE)), (u.ZERO = new u(n.ZERO, n.ONE, n.ZERO)))
    let p = e.nBitLength,
      y = jr(u, e.endo ? Math.ceil(p / 2) : p)
    return {
      CURVE: e,
      ProjectivePoint: u,
      normPrivateKeyToScalar: c,
      weierstrassEquation: s,
      isWithinCurveOrder: i,
    }
  }
  function pi(t) {
    let e = vn(t)
    return (
      _e(
        e,
        { hash: 'hash', hmac: 'function', randomBytes: 'function' },
        { bits2int: 'function', bits2int_modN: 'function', lowS: 'boolean' }
      ),
      Object.freeze({ lowS: !0, ...e })
    )
  }
  function Zr(t) {
    let e = pi(t),
      { Fp: n, n: r } = e,
      o = n.BYTES + 1,
      s = 2 * n.BYTES + 1
    function i(b) {
      return Ee < b && b < n.ORDER
    }
    function a(b) {
      return K(b, r)
    }
    function c(b) {
      return kt(b, r)
    }
    let {
        ProjectivePoint: l,
        normPrivateKeyToScalar: f,
        weierstrassEquation: u,
        isWithinCurveOrder: p,
      } = hi({
        ...e,
        toBytes(b, v, C) {
          let U = v.toAffine(),
            E = n.toBytes(U.x),
            R = ve
          return C
            ? R(Uint8Array.from([v.hasEvenY() ? 2 : 3]), E)
            : R(Uint8Array.from([4]), E, n.toBytes(U.y))
        },
        fromBytes(b) {
          let v = b.length,
            C = b[0],
            U = b.subarray(1)
          if (v === o && (C === 2 || C === 3)) {
            let E = J(U)
            if (!i(E)) throw new Error('Point is not on curve')
            let R = u(E),
              q = n.sqrt(R),
              M = (q & se) === se
            return (((C & 1) === 1) !== M && (q = n.neg(q)), { x: E, y: q })
          } else if (v === s && C === 4) {
            let E = n.fromBytes(U.subarray(0, n.BYTES)),
              R = n.fromBytes(U.subarray(n.BYTES, 2 * n.BYTES))
            return { x: E, y: R }
          } else
            throw new Error(
              `Point of length ${v} was invalid. Expected ${o} compressed bytes or ${s} uncompressed bytes`
            )
        },
      }),
      y = b => De(fe(b, e.nByteLength))
    function g(b) {
      let v = r >> se
      return b > v
    }
    function d(b) {
      return g(b) ? a(-b) : b
    }
    let h = (b, v, C) => J(b.slice(v, C))
    class w {
      constructor(v, C, U) {
        ;((this.r = v), (this.s = C), (this.recovery = U), this.assertValidity())
      }
      static fromCompact(v) {
        let C = e.nByteLength
        return ((v = j('compactSignature', v, C * 2)), new w(h(v, 0, C), h(v, C, 2 * C)))
      }
      static fromDER(v) {
        let { r: C, s: U } = Ke.toSig(j('DER', v))
        return new w(C, U)
      }
      assertValidity() {
        if (!p(this.r)) throw new Error('r must be 0 < r < CURVE.n')
        if (!p(this.s)) throw new Error('s must be 0 < s < CURVE.n')
      }
      addRecoveryBit(v) {
        return new w(this.r, this.s, v)
      }
      recoverPublicKey(v) {
        let { r: C, s: U, recovery: E } = this,
          R = B(j('msgHash', v))
        if (E == null || ![0, 1, 2, 3].includes(E)) throw new Error('recovery id invalid')
        let q = E === 2 || E === 3 ? C + e.n : C
        if (q >= n.ORDER) throw new Error('recovery id 2 or 3 invalid')
        let M = (E & 1) === 0 ? '02' : '03',
          G = l.fromHex(M + y(q)),
          Y = c(q),
          te = a(-R * Y),
          oe = a(U * Y),
          X = l.BASE.multiplyAndAddUnsafe(G, te, oe)
        if (!X) throw new Error('point at infinify')
        return (X.assertValidity(), X)
      }
      hasHighS() {
        return g(this.s)
      }
      normalizeS() {
        return this.hasHighS() ? new w(this.r, a(-this.s), this.recovery) : this
      }
      toDERRawBytes() {
        return ze(this.toDERHex())
      }
      toDERHex() {
        return Ke.hexFromSig({ r: this.r, s: this.s })
      }
      toCompactRawBytes() {
        return ze(this.toCompactHex())
      }
      toCompactHex() {
        return y(this.r) + y(this.s)
      }
    }
    let m = {
      isValidPrivateKey(b) {
        try {
          return (f(b), !0)
        } catch {
          return !1
        }
      },
      normPrivateKeyToScalar: f,
      randomPrivateKey: () => {
        let b = bn(e.n)
        return zr(e.randomBytes(b), e.n)
      },
      precompute(b = 8, v = l.BASE) {
        return (v._setWindowSize(b), v.multiply(BigInt(3)), v)
      },
    }
    function x(b, v = !0) {
      return l.fromPrivateKey(b).toRawBytes(v)
    }
    function A(b) {
      let v = b instanceof Uint8Array,
        C = typeof b == 'string',
        U = (v || C) && b.length
      return v ? U === o || U === s : C ? U === 2 * o || U === 2 * s : b instanceof l
    }
    function S(b, v, C = !0) {
      if (A(b)) throw new Error('first arg must be private key')
      if (!A(v)) throw new Error('second arg must be public key')
      return l.fromHex(v).multiply(f(b)).toRawBytes(C)
    }
    let T =
        e.bits2int ||
        function (b) {
          let v = J(b),
            C = b.length * 8 - e.nBitLength
          return C > 0 ? v >> BigInt(C) : v
        },
      B =
        e.bits2int_modN ||
        function (b) {
          return a(T(b))
        },
      k = ft(e.nBitLength)
    function N(b) {
      if (typeof b != 'bigint') throw new Error('bigint expected')
      if (!(Ee <= b && b < k)) throw new Error(`bigint expected < 2^${e.nBitLength}`)
      return fe(b, e.nByteLength)
    }
    function _(b, v, C = I) {
      if (['recovered', 'canonical'].some(ee => ee in C))
        throw new Error('sign() legacy options not supported')
      let { hash: U, randomBytes: E } = e,
        { lowS: R, prehash: q, extraEntropy: M } = C
      ;(R == null && (R = !0), (b = j('msgHash', b)), q && (b = j('prehashed msgHash', U(b))))
      let G = B(b),
        Y = f(v),
        te = [N(Y), N(G)]
      if (M != null) {
        let ee = M === !0 ? E(n.BYTES) : M
        te.push(j('extraEntropy', ee))
      }
      let oe = ve(...te),
        X = G
      function he(ee) {
        let Fe = T(ee)
        if (!p(Fe)) return
        let Sr = c(Fe),
          pe = l.BASE.multiply(Fe).toAffine(),
          Ye = a(pe.x)
        if (Ye === Ee) return
        let mt = a(Sr * a(X + Ye * Y))
        if (mt === Ee) return
        let Br = (pe.x === Ye ? 0 : 2) | Number(pe.y & se),
          Lr = mt
        return (R && g(mt) && ((Lr = d(mt)), (Br ^= 1)), new w(Ye, Lr, Br))
      }
      return { seed: oe, k2sig: he }
    }
    let I = { lowS: e.lowS, prehash: !1 },
      $ = { lowS: e.lowS, prehash: !1 }
    function H(b, v, C = I) {
      let { seed: U, k2sig: E } = _(b, v, C),
        R = e
      return pn(R.hash.outputLen, R.nByteLength, R.hmac)(U, E)
    }
    l.BASE._setWindowSize(8)
    function V(b, v, C, U = $) {
      let E = b
      if (((v = j('msgHash', v)), (C = j('publicKey', C)), 'strict' in U))
        throw new Error('options.strict was renamed to lowS')
      let { lowS: R, prehash: q } = U,
        M,
        G
      try {
        if (typeof E == 'string' || E instanceof Uint8Array)
          try {
            M = w.fromDER(E)
          } catch (pe) {
            if (!(pe instanceof Ke.Err)) throw pe
            M = w.fromCompact(E)
          }
        else if (typeof E == 'object' && typeof E.r == 'bigint' && typeof E.s == 'bigint') {
          let { r: pe, s: Ye } = E
          M = new w(pe, Ye)
        } else throw new Error('PARSE')
        G = l.fromHex(C)
      } catch (pe) {
        if (pe.message === 'PARSE')
          throw new Error('signature must be Signature instance, Uint8Array or hex string')
        return !1
      }
      if (R && M.hasHighS()) return !1
      q && (v = e.hash(v))
      let { r: Y, s: te } = M,
        oe = B(v),
        X = c(te),
        he = a(oe * X),
        ee = a(Y * X),
        Fe = l.BASE.multiplyAndAddUnsafe(G, he, ee)?.toAffine()
      return Fe ? a(Fe.x) === Y : !1
    }
    return {
      CURVE: e,
      getPublicKey: x,
      getSharedSecret: S,
      sign: H,
      verify: V,
      ProjectivePoint: l,
      Signature: w,
      utils: m,
    }
  }
  var Ct = class extends et {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), Ur(e))
        let r = lt(n)
        if (((this.iHash = e.create()), typeof this.iHash.update != 'function'))
          throw new Error('Expected instance of class which extends utils.Hash')
        ;((this.blockLen = this.iHash.blockLen), (this.outputLen = this.iHash.outputLen))
        let o = this.blockLen,
          s = new Uint8Array(o)
        s.set(r.length > o ? e.create().update(r).digest() : r)
        for (let i = 0; i < s.length; i++) s[i] ^= 54
        ;(this.iHash.update(s), (this.oHash = e.create()))
        for (let i = 0; i < s.length; i++) s[i] ^= 106
        ;(this.oHash.update(s), s.fill(0))
      }
      update(e) {
        return (Qe(this), this.iHash.update(e), this)
      }
      digestInto(e) {
        ;(Qe(this),
          fn(e, this.outputLen),
          (this.finished = !0),
          this.iHash.digestInto(e),
          this.oHash.update(e),
          this.oHash.digestInto(e),
          this.destroy())
      }
      digest() {
        let e = new Uint8Array(this.oHash.outputLen)
        return (this.digestInto(e), e)
      }
      _cloneInto(e) {
        e || (e = Object.create(Object.getPrototypeOf(this), {}))
        let { oHash: n, iHash: r, finished: o, destroyed: s, blockLen: i, outputLen: a } = this
        return (
          (e = e),
          (e.finished = o),
          (e.destroyed = s),
          (e.blockLen = i),
          (e.outputLen = a),
          (e.oHash = n._cloneInto(e.oHash)),
          (e.iHash = r._cloneInto(e.iHash)),
          e
        )
      }
      destroy() {
        ;((this.destroyed = !0), this.oHash.destroy(), this.iHash.destroy())
      }
    },
    En = (t, e, n) => new Ct(t, e).update(n).digest()
  En.create = (t, e) => new Ct(t, e)
  function gi(t) {
    return { hash: t, hmac: (e, ...n) => En(t, e, Or(...n)), randomBytes: vt }
  }
  function Gr(t, e) {
    let n = r => Zr({ ...t, ...gi(r) })
    return Object.freeze({ ...n(e), create: n })
  }
  var Nt = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
    It = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
    Yr = BigInt(1),
    _t = BigInt(2),
    Jr = (t, e) => (t + e / _t) / e
  function Xr(t) {
    let e = Nt,
      n = BigInt(3),
      r = BigInt(6),
      o = BigInt(11),
      s = BigInt(22),
      i = BigInt(23),
      a = BigInt(44),
      c = BigInt(88),
      l = (t * t * t) % e,
      f = (l * l * t) % e,
      u = (ne(f, n, e) * f) % e,
      p = (ne(u, n, e) * f) % e,
      y = (ne(p, _t, e) * l) % e,
      g = (ne(y, o, e) * y) % e,
      d = (ne(g, s, e) * g) % e,
      h = (ne(d, a, e) * d) % e,
      w = (ne(h, c, e) * h) % e,
      m = (ne(w, a, e) * d) % e,
      x = (ne(m, n, e) * f) % e,
      A = (ne(x, i, e) * g) % e,
      S = (ne(A, r, e) * l) % e,
      T = ne(S, _t, e)
    if (!Tn.eql(Tn.sqr(T), t)) throw new Error('Cannot find square root')
    return T
  }
  var Tn = Wr(Nt, void 0, void 0, { sqrt: Xr }),
    Ue = Gr(
      {
        a: BigInt(0),
        b: BigInt(7),
        Fp: Tn,
        n: It,
        Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
        Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
        h: BigInt(1),
        lowS: !0,
        endo: {
          beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
          splitScalar: t => {
            let e = It,
              n = BigInt('0x3086d221a7d46bcde86c90e49284eb15'),
              r = -Yr * BigInt('0xe4437ed6010e88286f547fa90abfe4c3'),
              o = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'),
              s = n,
              i = BigInt('0x100000000000000000000000000000000'),
              a = Jr(s * t, e),
              c = Jr(-r * t, e),
              l = K(t - a * n - c * o, e),
              f = K(-a * r - c * s, e),
              u = l > i,
              p = f > i
            if ((u && (l = e - l), p && (f = e - f), l > i || f > i))
              throw new Error('splitScalar: Endomorphism failed, k=' + t)
            return { k1neg: u, k1: l, k2neg: p, k2: f }
          },
        },
      },
      At
    ),
    Rt = BigInt(0),
    Qr = t => typeof t == 'bigint' && Rt < t && t < Nt,
    yi = t => typeof t == 'bigint' && Rt < t && t < It,
    Fr = {}
  function Ut(t, ...e) {
    let n = Fr[t]
    if (n === void 0) {
      let r = At(Uint8Array.from(t, o => o.charCodeAt(0)))
      ;((n = ve(r, r)), (Fr[t] = n))
    }
    return At(ve(n, ...e))
  }
  var Ln = t => t.toRawBytes(!0).slice(1),
    Sn = t => fe(t, 32),
    An = t => K(t, Nt),
    ut = t => K(t, It),
    kn = Ue.ProjectivePoint,
    wi = (t, e, n) => kn.BASE.multiplyAndAddUnsafe(t, e, n)
  function Bn(t) {
    let e = Ue.utils.normPrivateKeyToScalar(t),
      n = kn.fromPrivateKey(e)
    return { scalar: n.hasEvenY() ? e : ut(-e), bytes: Ln(n) }
  }
  function eo(t) {
    if (!Qr(t)) throw new Error('bad x: need 0 < x < p')
    let e = An(t * t),
      n = An(e * t + BigInt(7)),
      r = Xr(n)
    r % _t !== Rt && (r = An(-r))
    let o = new kn(t, r, Yr)
    return (o.assertValidity(), o)
  }
  function to(...t) {
    return ut(J(Ut('BIP0340/challenge', ...t)))
  }
  function mi(t) {
    return Bn(t).bytes
  }
  function bi(t, e, n = vt(32)) {
    let r = j('message', t),
      { bytes: o, scalar: s } = Bn(e),
      i = j('auxRand', n, 32),
      a = Sn(s ^ J(Ut('BIP0340/aux', i))),
      c = Ut('BIP0340/nonce', a, o, r),
      l = ut(J(c))
    if (l === Rt) throw new Error('sign failed: k is zero')
    let { bytes: f, scalar: u } = Bn(l),
      p = to(f, o, r),
      y = new Uint8Array(64)
    if ((y.set(f, 0), y.set(Sn(ut(u + p * s)), 32), !no(y, r, o)))
      throw new Error('sign: Invalid signature produced')
    return y
  }
  function no(t, e, n) {
    let r = j('signature', t, 64),
      o = j('message', e),
      s = j('publicKey', n, 32)
    try {
      let i = eo(J(s)),
        a = J(r.subarray(0, 32))
      if (!Qr(a)) return !1
      let c = J(r.subarray(32, 64))
      if (!yi(c)) return !1
      let l = to(Sn(a), Ln(i), o),
        f = wi(i, c, ut(-l))
      return !(!f || !f.hasEvenY() || f.toAffine().x !== a)
    } catch {
      return !1
    }
  }
  var tt = {
    getPublicKey: mi,
    sign: bi,
    verify: no,
    utils: {
      randomPrivateKey: Ue.utils.randomPrivateKey,
      lift_x: eo,
      pointToBytes: Ln,
      numberToBytesBE: fe,
      bytesToNumberBE: J,
      taggedHash: Ut,
      mod: K,
    },
  }
  var Ot = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Cn = t => t instanceof Uint8Array
  var Pt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    ue = (t, e) => (t << (32 - e)) | (t >>> e),
    xi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!xi) throw new Error('Non little-endian hardware is not supported')
  var vi = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function z(t) {
    if (!Cn(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += vi[t[n]]
    return e
  }
  function Ae(t) {
    if (typeof t != 'string') throw new Error('hex string expected, got ' + typeof t)
    let e = t.length
    if (e % 2) throw new Error('padded hex string expected, got unpadded hex of length ' + e)
    let n = new Uint8Array(e / 2)
    for (let r = 0; r < n.length; r++) {
      let o = r * 2,
        s = t.slice(o, o + 2),
        i = Number.parseInt(s, 16)
      if (Number.isNaN(i) || i < 0) throw new Error('Invalid byte sequence')
      n[r] = i
    }
    return n
  }
  function Ei(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Ne(t) {
    if ((typeof t == 'string' && (t = Ei(t)), !Cn(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function rt(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!Cn(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var nt = class {
    clone() {
      return this._cloneInto()
    }
  }
  function In(t) {
    let e = r => t().update(Ne(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function $t(t = 32) {
    if (Ot && typeof Ot.getRandomValues == 'function') return Ot.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function _n(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function Ai(t) {
    if (typeof t != 'boolean') throw new Error(`Expected boolean, not ${t}`)
  }
  function ro(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Ti(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(_n(t.outputLen), _n(t.blockLen))
  }
  function Si(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Bi(t, e) {
    ro(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Li = { number: _n, bool: Ai, bytes: ro, hash: Ti, exists: Si, output: Bi },
    re = Li
  function ki(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var Ht = class extends nt {
    constructor(e, n, r, o) {
      ;(super(),
        (this.blockLen = e),
        (this.outputLen = n),
        (this.padOffset = r),
        (this.isLE = o),
        (this.finished = !1),
        (this.length = 0),
        (this.pos = 0),
        (this.destroyed = !1),
        (this.buffer = new Uint8Array(e)),
        (this.view = Pt(this.buffer)))
    }
    update(e) {
      re.exists(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = Ne(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = Pt(e)
          for (; o <= s - i; i += o) this.process(c, i)
          continue
        }
        ;(r.set(e.subarray(i, i + a), this.pos),
          (this.pos += a),
          (i += a),
          this.pos === o && (this.process(n, 0), (this.pos = 0)))
      }
      return ((this.length += e.length), this.roundClean(), this)
    }
    digestInto(e) {
      ;(re.exists(this), re.output(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let u = i; u < o; u++) n[u] = 0
      ;(ki(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = Pt(e),
        c = this.outputLen
      if (c % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = c / 4,
        f = this.get()
      if (l > f.length) throw new Error('_sha2: outputLen bigger than state')
      for (let u = 0; u < l; u++) a.setUint32(4 * u, f[u], s)
    }
    digest() {
      let { buffer: e, outputLen: n } = this
      this.digestInto(e)
      let r = e.slice(0, n)
      return (this.destroy(), r)
    }
    _cloneInto(e) {
      ;(e || (e = new this.constructor()), e.set(...this.get()))
      let { blockLen: n, buffer: r, length: o, finished: s, destroyed: i, pos: a } = this
      return (
        (e.length = o),
        (e.pos = a),
        (e.finished = s),
        (e.destroyed = i),
        o % n && e.buffer.set(r),
        e
      )
    }
  }
  var Ci = (t, e, n) => (t & e) ^ (~t & n),
    Ii = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    _i = new Uint32Array([
      1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
      3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
      3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
      2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
      666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
      2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
      430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
      1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479,
      3329325298,
    ]),
    Re = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Oe = new Uint32Array(64),
    Mt = class extends Ht {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = Re[0] | 0),
          (this.B = Re[1] | 0),
          (this.C = Re[2] | 0),
          (this.D = Re[3] | 0),
          (this.E = Re[4] | 0),
          (this.F = Re[5] | 0),
          (this.G = Re[6] | 0),
          (this.H = Re[7] | 0))
      }
      get() {
        let { A: e, B: n, C: r, D: o, E: s, F: i, G: a, H: c } = this
        return [e, n, r, o, s, i, a, c]
      }
      set(e, n, r, o, s, i, a, c) {
        ;((this.A = e | 0),
          (this.B = n | 0),
          (this.C = r | 0),
          (this.D = o | 0),
          (this.E = s | 0),
          (this.F = i | 0),
          (this.G = a | 0),
          (this.H = c | 0))
      }
      process(e, n) {
        for (let u = 0; u < 16; u++, n += 4) Oe[u] = e.getUint32(n, !1)
        for (let u = 16; u < 64; u++) {
          let p = Oe[u - 15],
            y = Oe[u - 2],
            g = ue(p, 7) ^ ue(p, 18) ^ (p >>> 3),
            d = ue(y, 17) ^ ue(y, 19) ^ (y >>> 10)
          Oe[u] = (d + Oe[u - 7] + g + Oe[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let p = ue(a, 6) ^ ue(a, 11) ^ ue(a, 25),
            y = (f + p + Ci(a, c, l) + _i[u] + Oe[u]) | 0,
            d = ((ue(r, 2) ^ ue(r, 13) ^ ue(r, 22)) + Ii(r, o, s)) | 0
          ;((f = l),
            (l = c),
            (c = a),
            (a = (i + y) | 0),
            (i = s),
            (s = o),
            (o = r),
            (r = (y + d) | 0))
        }
        ;((r = (r + this.A) | 0),
          (o = (o + this.B) | 0),
          (s = (s + this.C) | 0),
          (i = (i + this.D) | 0),
          (a = (a + this.E) | 0),
          (c = (c + this.F) | 0),
          (l = (l + this.G) | 0),
          (f = (f + this.H) | 0),
          this.set(r, o, s, i, a, c, l, f))
      }
      roundClean() {
        Oe.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    },
    Un = class extends Mt {
      constructor() {
        ;(super(),
          (this.A = -1056596264),
          (this.B = 914150663),
          (this.C = 812702999),
          (this.D = -150054599),
          (this.E = -4191439),
          (this.F = 1750603025),
          (this.G = 1694076839),
          (this.H = -1090891868),
          (this.outputLen = 28))
      }
    },
    ge = In(() => new Mt()),
    nu = In(() => new Un())
  function ot(t) {
    if (!Number.isSafeInteger(t)) throw new Error(`Wrong integer: ${t}`)
  }
  function Te(...t) {
    let e = (o, s) => i => o(s(i)),
      n = Array.from(t)
        .reverse()
        .reduce((o, s) => (o ? e(o, s.encode) : s.encode), void 0),
      r = t.reduce((o, s) => (o ? e(o, s.decode) : s.decode), void 0)
    return { encode: n, decode: r }
  }
  function Se(t) {
    return {
      encode: e => {
        if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
          throw new Error('alphabet.encode input should be an array of numbers')
        return e.map(n => {
          if ((ot(n), n < 0 || n >= t.length))
            throw new Error(`Digit index outside alphabet: ${n} (alphabet: ${t.length})`)
          return t[n]
        })
      },
      decode: e => {
        if (!Array.isArray(e) || (e.length && typeof e[0] != 'string'))
          throw new Error('alphabet.decode input should be array of strings')
        return e.map(n => {
          if (typeof n != 'string') throw new Error(`alphabet.decode: not string element=${n}`)
          let r = t.indexOf(n)
          if (r === -1) throw new Error(`Unknown letter: "${n}". Allowed: ${t}`)
          return r
        })
      },
    }
  }
  function Be(t = '') {
    if (typeof t != 'string') throw new Error('join separator should be string')
    return {
      encode: e => {
        if (!Array.isArray(e) || (e.length && typeof e[0] != 'string'))
          throw new Error('join.encode input should be array of strings')
        for (let n of e)
          if (typeof n != 'string') throw new Error(`join.encode: non-string input=${n}`)
        return e.join(t)
      },
      decode: e => {
        if (typeof e != 'string') throw new Error('join.decode input should be string')
        return e.split(t)
      },
    }
  }
  function Vt(t, e = '=') {
    if ((ot(t), typeof e != 'string')) throw new Error('padding chr should be string')
    return {
      encode(n) {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'string'))
          throw new Error('padding.encode input should be array of strings')
        for (let r of n)
          if (typeof r != 'string') throw new Error(`padding.encode: non-string input=${r}`)
        for (; (n.length * t) % 8; ) n.push(e)
        return n
      },
      decode(n) {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'string'))
          throw new Error('padding.encode input should be array of strings')
        for (let o of n)
          if (typeof o != 'string') throw new Error(`padding.decode: non-string input=${o}`)
        let r = n.length
        if ((r * t) % 8)
          throw new Error('Invalid padding: string should have whole number of bytes')
        for (; r > 0 && n[r - 1] === e; r--)
          if (!(((r - 1) * t) % 8)) throw new Error('Invalid padding: string has too much padding')
        return n.slice(0, r)
      },
    }
  }
  function lo(t) {
    if (typeof t != 'function') throw new Error('normalize fn should be function')
    return { encode: e => e, decode: e => t(e) }
  }
  function oo(t, e, n) {
    if (e < 2) throw new Error(`convertRadix: wrong from=${e}, base cannot be less than 2`)
    if (n < 2) throw new Error(`convertRadix: wrong to=${n}, base cannot be less than 2`)
    if (!Array.isArray(t)) throw new Error('convertRadix: data should be array')
    if (!t.length) return []
    let r = 0,
      o = [],
      s = Array.from(t)
    for (
      s.forEach(i => {
        if ((ot(i), i < 0 || i >= e)) throw new Error(`Wrong integer: ${i}`)
      });
      ;

    ) {
      let i = 0,
        a = !0
      for (let c = r; c < s.length; c++) {
        let l = s[c],
          f = e * i + l
        if (!Number.isSafeInteger(f) || (e * i) / e !== i || f - l !== e * i)
          throw new Error('convertRadix: carry overflow')
        if (
          ((i = f % n),
          (s[c] = Math.floor(f / n)),
          !Number.isSafeInteger(s[c]) || s[c] * n + i !== f)
        )
          throw new Error('convertRadix: carry overflow')
        if (a) s[c] ? (a = !1) : (r = c)
        else continue
      }
      if ((o.push(i), a)) break
    }
    for (let i = 0; i < t.length - 1 && t[i] === 0; i++) o.push(0)
    return o.reverse()
  }
  var fo = (t, e) => (e ? fo(e, t % e) : t),
    qt = (t, e) => t + (e - fo(t, e))
  function Nn(t, e, n, r) {
    if (!Array.isArray(t)) throw new Error('convertRadix2: data should be array')
    if (e <= 0 || e > 32) throw new Error(`convertRadix2: wrong from=${e}`)
    if (n <= 0 || n > 32) throw new Error(`convertRadix2: wrong to=${n}`)
    if (qt(e, n) > 32)
      throw new Error(`convertRadix2: carry overflow from=${e} to=${n} carryBits=${qt(e, n)}`)
    let o = 0,
      s = 0,
      i = 2 ** n - 1,
      a = []
    for (let c of t) {
      if ((ot(c), c >= 2 ** e)) throw new Error(`convertRadix2: invalid data word=${c} from=${e}`)
      if (((o = (o << e) | c), s + e > 32))
        throw new Error(`convertRadix2: carry overflow pos=${s} from=${e}`)
      for (s += e; s >= n; s -= n) a.push(((o >> (s - n)) & i) >>> 0)
      o &= 2 ** s - 1
    }
    if (((o = (o << (n - s)) & i), !r && s >= e)) throw new Error('Excess padding')
    if (!r && o) throw new Error(`Non-zero padding: ${o}`)
    return (r && s > 0 && a.push(o >>> 0), a)
  }
  function Ui(t) {
    return (
      ot(t),
      {
        encode: e => {
          if (!(e instanceof Uint8Array)) throw new Error('radix.encode input should be Uint8Array')
          return oo(Array.from(e), 2 ** 8, t)
        },
        decode: e => {
          if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
            throw new Error('radix.decode input should be array of strings')
          return Uint8Array.from(oo(e, t, 2 ** 8))
        },
      }
    )
  }
  function Pe(t, e = !1) {
    if ((ot(t), t <= 0 || t > 32)) throw new Error('radix2: bits should be in (0..32]')
    if (qt(8, t) > 32 || qt(t, 8) > 32) throw new Error('radix2: carry overflow')
    return {
      encode: n => {
        if (!(n instanceof Uint8Array)) throw new Error('radix2.encode input should be Uint8Array')
        return Nn(Array.from(n), 8, t, !e)
      },
      decode: n => {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'number'))
          throw new Error('radix2.decode input should be array of strings')
        return Uint8Array.from(Nn(n, t, 8, e))
      },
    }
  }
  function so(t) {
    if (typeof t != 'function') throw new Error('unsafeWrapper fn should be function')
    return function (...e) {
      try {
        return t.apply(null, e)
      } catch {}
    }
  }
  var Ni = Te(Pe(4), Se('0123456789ABCDEF'), Be('')),
    Ri = Te(Pe(5), Se('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), Vt(5), Be('')),
    ou = Te(Pe(5), Se('0123456789ABCDEFGHIJKLMNOPQRSTUV'), Vt(5), Be('')),
    su = Te(
      Pe(5),
      Se('0123456789ABCDEFGHJKMNPQRSTVWXYZ'),
      Be(''),
      lo(t => t.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1'))
    ),
    ie = Te(
      Pe(6),
      Se('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'),
      Vt(6),
      Be('')
    ),
    Oi = Te(
      Pe(6),
      Se('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'),
      Vt(6),
      Be('')
    ),
    Pn = t => Te(Ui(58), Se(t), Be('')),
    Rn = Pn('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'),
    iu = Pn('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'),
    au = Pn('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'),
    io = [0, 2, 3, 5, 6, 7, 9, 10, 11],
    Pi = {
      encode(t) {
        let e = ''
        for (let n = 0; n < t.length; n += 8) {
          let r = t.subarray(n, n + 8)
          e += Rn.encode(r).padStart(io[r.length], '1')
        }
        return e
      },
      decode(t) {
        let e = []
        for (let n = 0; n < t.length; n += 11) {
          let r = t.slice(n, n + 11),
            o = io.indexOf(r.length),
            s = Rn.decode(r)
          for (let i = 0; i < s.length - o; i++)
            if (s[i] !== 0) throw new Error('base58xmr: wrong padding')
          e = e.concat(Array.from(s.slice(s.length - o)))
        }
        return Uint8Array.from(e)
      },
    }
  var On = Te(Se('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), Be('')),
    ao = [996825010, 642813549, 513874426, 1027748829, 705979059]
  function dt(t) {
    let e = t >> 25,
      n = (t & 33554431) << 5
    for (let r = 0; r < ao.length; r++) ((e >> r) & 1) === 1 && (n ^= ao[r])
    return n
  }
  function co(t, e, n = 1) {
    let r = t.length,
      o = 1
    for (let s = 0; s < r; s++) {
      let i = t.charCodeAt(s)
      if (i < 33 || i > 126) throw new Error(`Invalid prefix (${t})`)
      o = dt(o) ^ (i >> 5)
    }
    o = dt(o)
    for (let s = 0; s < r; s++) o = dt(o) ^ (t.charCodeAt(s) & 31)
    for (let s of e) o = dt(o) ^ s
    for (let s = 0; s < 6; s++) o = dt(o)
    return ((o ^= n), On.encode(Nn([o % 2 ** 30], 30, 5, !1)))
  }
  function uo(t) {
    let e = t === 'bech32' ? 1 : 734539939,
      n = Pe(5),
      r = n.decode,
      o = n.encode,
      s = so(r)
    function i(f, u, p = 90) {
      if (typeof f != 'string')
        throw new Error(`bech32.encode prefix should be string, not ${typeof f}`)
      if (!Array.isArray(u) || (u.length && typeof u[0] != 'number'))
        throw new Error(`bech32.encode words should be array of numbers, not ${typeof u}`)
      let y = f.length + 7 + u.length
      if (p !== !1 && y > p) throw new TypeError(`Length ${y} exceeds limit ${p}`)
      return ((f = f.toLowerCase()), `${f}1${On.encode(u)}${co(f, u, e)}`)
    }
    function a(f, u = 90) {
      if (typeof f != 'string')
        throw new Error(`bech32.decode input should be string, not ${typeof f}`)
      if (f.length < 8 || (u !== !1 && f.length > u))
        throw new TypeError(`Wrong string length: ${f.length} (${f}). Expected (8..${u})`)
      let p = f.toLowerCase()
      if (f !== p && f !== f.toUpperCase()) throw new Error('String must be lowercase or uppercase')
      f = p
      let y = f.lastIndexOf('1')
      if (y === 0 || y === -1)
        throw new Error('Letter "1" must be present between prefix and data only')
      let g = f.slice(0, y),
        d = f.slice(y + 1)
      if (d.length < 6) throw new Error('Data must be at least 6 characters long')
      let h = On.decode(d).slice(0, -6),
        w = co(g, h, e)
      if (!d.endsWith(w)) throw new Error(`Invalid checksum in ${f}: expected "${w}"`)
      return { prefix: g, words: h }
    }
    let c = so(a)
    function l(f) {
      let { prefix: u, words: p } = a(f, !1)
      return { prefix: u, words: p, bytes: r(p) }
    }
    return {
      encode: i,
      decode: a,
      decodeToBytes: l,
      decodeUnsafe: c,
      fromWords: r,
      fromWordsUnsafe: s,
      toWords: o,
    }
  }
  var $e = uo('bech32'),
    cu = uo('bech32m'),
    $i = { encode: t => new TextDecoder().decode(t), decode: t => new TextEncoder().encode(t) },
    Hi = Te(
      Pe(4),
      Se('0123456789abcdef'),
      Be(''),
      lo(t => {
        if (typeof t != 'string' || t.length % 2)
          throw new TypeError(
            `hex.decode: expected string, got ${typeof t} with length ${t.length}`
          )
        return t.toLowerCase()
      })
    ),
    Mi = {
      utf8: $i,
      hex: Hi,
      base16: Ni,
      base32: Ri,
      base64: ie,
      base64url: Oi,
      base58: Rn,
      base58xmr: Pi,
    },
    lu = `Invalid encoding type. Available types: ${Object.keys(Mi).join(', ')}`
  function Wt(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`positive integer expected, not ${t}`)
  }
  function $n(t) {
    if (typeof t != 'boolean') throw new Error(`boolean expected, not ${t}`)
  }
  function Hn(t) {
    return (
      t instanceof Uint8Array ||
      (t != null && typeof t == 'object' && t.constructor.name === 'Uint8Array')
    )
  }
  function O(t, ...e) {
    if (!Hn(t)) throw new Error('Uint8Array expected')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Uint8Array expected of length ${e}, not of length=${t.length}`)
  }
  function He(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function ht(t, e) {
    O(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Dt = t => new Uint8Array(t.buffer, t.byteOffset, t.byteLength)
  var P = t => new Uint32Array(t.buffer, t.byteOffset, Math.floor(t.byteLength / 4)),
    Me = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    qi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!qi) throw new Error('Non little-endian hardware is not supported')
  function Vi(t) {
    if (typeof t != 'string') throw new Error(`string expected, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function ye(t) {
    if (typeof t == 'string') t = Vi(t)
    else if (Hn(t)) t = t.slice()
    else throw new Error(`Uint8Array expected, got ${typeof t}`)
    return t
  }
  function ho(t, e) {
    if (e == null || typeof e != 'object') throw new Error('options must be defined')
    return Object.assign(t, e)
  }
  function Ze(t, e) {
    if (t.length !== e.length) return !1
    let n = 0
    for (let r = 0; r < t.length; r++) n |= t[r] ^ e[r]
    return n === 0
  }
  var we = (t, e) => (Object.assign(e, t), e)
  function Ge(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var Le = 16,
    qn = new Uint8Array(16),
    me = P(qn),
    Wi = 225,
    Di = (t, e, n, r) => {
      let o = r & 1
      return {
        s3: (n << 31) | (r >>> 1),
        s2: (e << 31) | (n >>> 1),
        s1: (t << 31) | (e >>> 1),
        s0: (t >>> 1) ^ ((Wi << 24) & -(o & 1)),
      }
    },
    ae = t =>
      (((t >>> 0) & 255) << 24) |
      (((t >>> 8) & 255) << 16) |
      (((t >>> 16) & 255) << 8) |
      ((t >>> 24) & 255) |
      0
  function zi(t) {
    t.reverse()
    let e = t[15] & 1,
      n = 0
    for (let r = 0; r < t.length; r++) {
      let o = t[r]
      ;((t[r] = (o >>> 1) | n), (n = (o & 1) << 7))
    }
    return ((t[0] ^= -e & 225), t)
  }
  var ji = t => (t > 64 * 1024 ? 8 : t > 1024 ? 4 : 2),
    zt = class {
      constructor(e, n) {
        ;((this.blockLen = Le),
          (this.outputLen = Le),
          (this.s0 = 0),
          (this.s1 = 0),
          (this.s2 = 0),
          (this.s3 = 0),
          (this.finished = !1),
          (e = ye(e)),
          O(e, 16))
        let r = Me(e),
          o = r.getUint32(0, !1),
          s = r.getUint32(4, !1),
          i = r.getUint32(8, !1),
          a = r.getUint32(12, !1),
          c = []
        for (let g = 0; g < 128; g++)
          (c.push({ s0: ae(o), s1: ae(s), s2: ae(i), s3: ae(a) }),
            ({ s0: o, s1: s, s2: i, s3: a } = Di(o, s, i, a)))
        let l = ji(n || 1024)
        if (![1, 2, 4, 8].includes(l))
          throw new Error(`ghash: wrong window size=${l}, should be 2, 4 or 8`)
        this.W = l
        let u = 128 / l,
          p = (this.windowSize = 2 ** l),
          y = []
        for (let g = 0; g < u; g++)
          for (let d = 0; d < p; d++) {
            let h = 0,
              w = 0,
              m = 0,
              x = 0
            for (let A = 0; A < l; A++) {
              if (!((d >>> (l - A - 1)) & 1)) continue
              let { s0: T, s1: B, s2: k, s3: N } = c[l * g + A]
              ;((h ^= T), (w ^= B), (m ^= k), (x ^= N))
            }
            y.push({ s0: h, s1: w, s2: m, s3: x })
          }
        this.t = y
      }
      _updateBlock(e, n, r, o) {
        ;((e ^= this.s0), (n ^= this.s1), (r ^= this.s2), (o ^= this.s3))
        let { W: s, t: i, windowSize: a } = this,
          c = 0,
          l = 0,
          f = 0,
          u = 0,
          p = (1 << s) - 1,
          y = 0
        for (let g of [e, n, r, o])
          for (let d = 0; d < 4; d++) {
            let h = (g >>> (8 * d)) & 255
            for (let w = 8 / s - 1; w >= 0; w--) {
              let m = (h >>> (s * w)) & p,
                { s0: x, s1: A, s2: S, s3: T } = i[y * a + m]
              ;((c ^= x), (l ^= A), (f ^= S), (u ^= T), (y += 1))
            }
          }
        ;((this.s0 = c), (this.s1 = l), (this.s2 = f), (this.s3 = u))
      }
      update(e) {
        ;((e = ye(e)), He(this))
        let n = P(e),
          r = Math.floor(e.length / Le),
          o = e.length % Le
        for (let s = 0; s < r; s++)
          this._updateBlock(n[s * 4 + 0], n[s * 4 + 1], n[s * 4 + 2], n[s * 4 + 3])
        return (
          o &&
            (qn.set(e.subarray(r * Le)), this._updateBlock(me[0], me[1], me[2], me[3]), me.fill(0)),
          this
        )
      }
      destroy() {
        let { t: e } = this
        for (let n of e) ((n.s0 = 0), (n.s1 = 0), (n.s2 = 0), (n.s3 = 0))
      }
      digestInto(e) {
        ;(He(this), ht(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e)
      }
      digest() {
        let e = new Uint8Array(Le)
        return (this.digestInto(e), this.destroy(), e)
      }
    },
    Mn = class extends zt {
      constructor(e, n) {
        e = ye(e)
        let r = zi(e.slice())
        ;(super(r, n), r.fill(0))
      }
      update(e) {
        ;((e = ye(e)), He(this))
        let n = P(e),
          r = e.length % Le,
          o = Math.floor(e.length / Le)
        for (let s = 0; s < o; s++)
          this._updateBlock(ae(n[s * 4 + 3]), ae(n[s * 4 + 2]), ae(n[s * 4 + 1]), ae(n[s * 4 + 0]))
        return (
          r &&
            (qn.set(e.subarray(o * Le)),
            this._updateBlock(ae(me[3]), ae(me[2]), ae(me[1]), ae(me[0])),
            me.fill(0)),
          this
        )
      }
      digestInto(e) {
        ;(He(this), ht(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e.reverse())
      }
    }
  function po(t) {
    let e = (r, o) => t(o, r.length).update(ye(r)).digest(),
      n = t(new Uint8Array(16), 0)
    return (
      (e.outputLen = n.outputLen),
      (e.blockLen = n.blockLen),
      (e.create = (r, o) => t(r, o)),
      e
    )
  }
  var Vn = po((t, e) => new zt(t, e)),
    go = po((t, e) => new Mn(t, e))
  var Q = 16,
    zn = 4,
    jt = new Uint8Array(Q),
    Ki = 283
  function jn(t) {
    return (t << 1) ^ (Ki & -(t >> 7))
  }
  function st(t, e) {
    let n = 0
    for (; e > 0; e >>= 1) ((n ^= t & -(e & 1)), (t = jn(t)))
    return n
  }
  var Dn = (() => {
      let t = new Uint8Array(256)
      for (let n = 0, r = 1; n < 256; n++, r ^= jn(r)) t[n] = r
      let e = new Uint8Array(256)
      e[0] = 99
      for (let n = 0; n < 255; n++) {
        let r = t[255 - n]
        ;((r |= r << 8), (e[t[n]] = (r ^ (r >> 4) ^ (r >> 5) ^ (r >> 6) ^ (r >> 7) ^ 99) & 255))
      }
      return e
    })(),
    Zi = Dn.map((t, e) => Dn.indexOf(e)),
    Gi = t => (t << 24) | (t >>> 8),
    Wn = t => (t << 8) | (t >>> 24)
  function yo(t, e) {
    if (t.length !== 256) throw new Error('Wrong sbox length')
    let n = new Uint32Array(256).map((l, f) => e(t[f])),
      r = n.map(Wn),
      o = r.map(Wn),
      s = o.map(Wn),
      i = new Uint32Array(256 * 256),
      a = new Uint32Array(256 * 256),
      c = new Uint16Array(256 * 256)
    for (let l = 0; l < 256; l++)
      for (let f = 0; f < 256; f++) {
        let u = l * 256 + f
        ;((i[u] = n[l] ^ r[f]), (a[u] = o[l] ^ s[f]), (c[u] = (t[l] << 8) | t[f]))
      }
    return { sbox: t, sbox2: c, T0: n, T1: r, T2: o, T3: s, T01: i, T23: a }
  }
  var Kn = yo(Dn, t => (st(t, 3) << 24) | (t << 16) | (t << 8) | st(t, 2)),
    wo = yo(Zi, t => (st(t, 11) << 24) | (st(t, 13) << 16) | (st(t, 9) << 8) | st(t, 14)),
    Ji = (() => {
      let t = new Uint8Array(16)
      for (let e = 0, n = 1; e < 16; e++, n = jn(n)) t[e] = n
      return t
    })()
  function Ve(t) {
    O(t)
    let e = t.length
    if (![16, 24, 32].includes(e))
      throw new Error(`aes: wrong key size: should be 16, 24 or 32, got: ${e}`)
    let { sbox2: n } = Kn,
      r = P(t),
      o = r.length,
      s = a => be(n, a, a, a, a),
      i = new Uint32Array(e + 28)
    i.set(r)
    for (let a = o; a < i.length; a++) {
      let c = i[a - 1]
      ;(a % o === 0 ? (c = s(Gi(c)) ^ Ji[a / o - 1]) : o > 6 && a % o === 4 && (c = s(c)),
        (i[a] = i[a - o] ^ c))
    }
    return i
  }
  function mo(t) {
    let e = Ve(t),
      n = e.slice(),
      r = e.length,
      { sbox2: o } = Kn,
      { T0: s, T1: i, T2: a, T3: c } = wo
    for (let l = 0; l < r; l += 4) for (let f = 0; f < 4; f++) n[l + f] = e[r - l - 4 + f]
    e.fill(0)
    for (let l = 4; l < r - 4; l++) {
      let f = n[l],
        u = be(o, f, f, f, f)
      n[l] = s[u & 255] ^ i[(u >>> 8) & 255] ^ a[(u >>> 16) & 255] ^ c[u >>> 24]
    }
    return n
  }
  function qe(t, e, n, r, o, s) {
    return t[((n << 8) & 65280) | ((r >>> 8) & 255)] ^ e[((o >>> 8) & 65280) | ((s >>> 24) & 255)]
  }
  function be(t, e, n, r, o) {
    return t[(e & 255) | (n & 65280)] | (t[((r >>> 16) & 255) | ((o >>> 16) & 65280)] << 16)
  }
  function ce(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = Kn,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let g = 0; g < l; g++) {
      let d = t[c++] ^ qe(i, a, e, n, r, o),
        h = t[c++] ^ qe(i, a, n, r, o, e),
        w = t[c++] ^ qe(i, a, r, o, e, n),
        m = t[c++] ^ qe(i, a, o, e, n, r)
      ;((e = d), (n = h), (r = w), (o = m))
    }
    let f = t[c++] ^ be(s, e, n, r, o),
      u = t[c++] ^ be(s, n, r, o, e),
      p = t[c++] ^ be(s, r, o, e, n),
      y = t[c++] ^ be(s, o, e, n, r)
    return { s0: f, s1: u, s2: p, s3: y }
  }
  function bo(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = wo,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let g = 0; g < l; g++) {
      let d = t[c++] ^ qe(i, a, e, o, r, n),
        h = t[c++] ^ qe(i, a, n, e, o, r),
        w = t[c++] ^ qe(i, a, r, n, e, o),
        m = t[c++] ^ qe(i, a, o, r, n, e)
      ;((e = d), (n = h), (r = w), (o = m))
    }
    let f = t[c++] ^ be(s, e, o, r, n),
      u = t[c++] ^ be(s, n, e, o, r),
      p = t[c++] ^ be(s, r, n, e, o),
      y = t[c++] ^ be(s, o, r, n, e)
    return { s0: f, s1: u, s2: p, s3: y }
  }
  function it(t, e) {
    if (!e) return new Uint8Array(t)
    if ((O(e), e.length < t))
      throw new Error(`aes: wrong destination length, expected at least ${t}, got: ${e.length}`)
    return e
  }
  function Fi(t, e, n, r) {
    ;(O(e, Q), O(n))
    let o = n.length
    r = it(o, r)
    let s = e,
      i = P(s),
      { s0: a, s1: c, s2: l, s3: f } = ce(t, i[0], i[1], i[2], i[3]),
      u = P(n),
      p = P(r)
    for (let g = 0; g + 4 <= u.length; g += 4) {
      ;((p[g + 0] = u[g + 0] ^ a),
        (p[g + 1] = u[g + 1] ^ c),
        (p[g + 2] = u[g + 2] ^ l),
        (p[g + 3] = u[g + 3] ^ f))
      let d = 1
      for (let h = s.length - 1; h >= 0; h--)
        ((d = (d + (s[h] & 255)) | 0), (s[h] = d & 255), (d >>>= 8))
      ;({ s0: a, s1: c, s2: l, s3: f } = ce(t, i[0], i[1], i[2], i[3]))
    }
    let y = Q * Math.floor(u.length / zn)
    if (y < o) {
      let g = new Uint32Array([a, c, l, f]),
        d = Dt(g)
      for (let h = y, w = 0; h < o; h++, w++) r[h] = n[h] ^ d[w]
    }
    return r
  }
  function pt(t, e, n, r, o) {
    ;(O(n, Q), O(r), (o = it(r.length, o)))
    let s = n,
      i = P(s),
      a = Me(s),
      c = P(r),
      l = P(o),
      f = e ? 0 : 12,
      u = r.length,
      p = a.getUint32(f, e),
      { s0: y, s1: g, s2: d, s3: h } = ce(t, i[0], i[1], i[2], i[3])
    for (let m = 0; m + 4 <= c.length; m += 4)
      ((l[m + 0] = c[m + 0] ^ y),
        (l[m + 1] = c[m + 1] ^ g),
        (l[m + 2] = c[m + 2] ^ d),
        (l[m + 3] = c[m + 3] ^ h),
        (p = (p + 1) >>> 0),
        a.setUint32(f, p, e),
        ({ s0: y, s1: g, s2: d, s3: h } = ce(t, i[0], i[1], i[2], i[3])))
    let w = Q * Math.floor(c.length / zn)
    if (w < u) {
      let m = new Uint32Array([y, g, d, h]),
        x = Dt(m)
      for (let A = w, S = 0; A < u; A++, S++) o[A] = r[A] ^ x[S]
    }
    return o
  }
  var xu = we({ blockSize: 16, nonceLength: 16 }, function (e, n) {
    ;(O(e), O(n, Q))
    function r(o, s) {
      let i = Ve(e),
        a = n.slice(),
        c = Fi(i, a, o, s)
      return (i.fill(0), a.fill(0), c)
    }
    return { encrypt: (o, s) => r(o, s), decrypt: (o, s) => r(o, s) }
  })
  function xo(t) {
    if ((O(t), t.length % Q !== 0))
      throw new Error(`aes/(cbc-ecb).decrypt ciphertext should consist of blocks with size ${Q}`)
  }
  function vo(t, e, n) {
    let r = t.length,
      o = r % Q
    if (!e && o !== 0) throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding')
    let s = P(t)
    if (e) {
      let c = Q - o
      ;(c || (c = Q), (r = r + c))
    }
    let i = it(r, n),
      a = P(i)
    return { b: s, o: a, out: i }
  }
  function Eo(t, e) {
    if (!e) return t
    let n = t.length
    if (!n) throw new Error('aes/pcks5: empty ciphertext not allowed')
    let r = t[n - 1]
    if (r <= 0 || r > 16) throw new Error(`aes/pcks5: wrong padding byte: ${r}`)
    let o = t.subarray(0, -r)
    for (let s = 0; s < r; s++) if (t[n - s - 1] !== r) throw new Error('aes/pcks5: wrong padding')
    return o
  }
  function Ao(t) {
    let e = new Uint8Array(16),
      n = P(e)
    e.set(t)
    let r = Q - t.length
    for (let o = Q - r; o < Q; o++) e[o] = r
    return n
  }
  var vu = we({ blockSize: 16 }, function (e, n = {}) {
      O(e)
      let r = !n.disablePadding
      return {
        encrypt: (o, s) => {
          O(o)
          let { b: i, o: a, out: c } = vo(o, r, s),
            l = Ve(e),
            f = 0
          for (; f + 4 <= i.length; ) {
            let { s0: u, s1: p, s2: y, s3: g } = ce(l, i[f + 0], i[f + 1], i[f + 2], i[f + 3])
            ;((a[f++] = u), (a[f++] = p), (a[f++] = y), (a[f++] = g))
          }
          if (r) {
            let u = Ao(o.subarray(f * 4)),
              { s0: p, s1: y, s2: g, s3: d } = ce(l, u[0], u[1], u[2], u[3])
            ;((a[f++] = p), (a[f++] = y), (a[f++] = g), (a[f++] = d))
          }
          return (l.fill(0), c)
        },
        decrypt: (o, s) => {
          xo(o)
          let i = mo(e),
            a = it(o.length, s),
            c = P(o),
            l = P(a)
          for (let f = 0; f + 4 <= c.length; ) {
            let { s0: u, s1: p, s2: y, s3: g } = bo(i, c[f + 0], c[f + 1], c[f + 2], c[f + 3])
            ;((l[f++] = u), (l[f++] = p), (l[f++] = y), (l[f++] = g))
          }
          return (i.fill(0), Eo(a, r))
        },
      }
    }),
    Zn = we({ blockSize: 16, nonceLength: 16 }, function (e, n, r = {}) {
      ;(O(e), O(n, 16))
      let o = !r.disablePadding
      return {
        encrypt: (s, i) => {
          let a = Ve(e),
            { b: c, o: l, out: f } = vo(s, o, i),
            u = P(n),
            p = u[0],
            y = u[1],
            g = u[2],
            d = u[3],
            h = 0
          for (; h + 4 <= c.length; )
            ((p ^= c[h + 0]),
              (y ^= c[h + 1]),
              (g ^= c[h + 2]),
              (d ^= c[h + 3]),
              ({ s0: p, s1: y, s2: g, s3: d } = ce(a, p, y, g, d)),
              (l[h++] = p),
              (l[h++] = y),
              (l[h++] = g),
              (l[h++] = d))
          if (o) {
            let w = Ao(s.subarray(h * 4))
            ;((p ^= w[0]),
              (y ^= w[1]),
              (g ^= w[2]),
              (d ^= w[3]),
              ({ s0: p, s1: y, s2: g, s3: d } = ce(a, p, y, g, d)),
              (l[h++] = p),
              (l[h++] = y),
              (l[h++] = g),
              (l[h++] = d))
          }
          return (a.fill(0), f)
        },
        decrypt: (s, i) => {
          xo(s)
          let a = mo(e),
            c = P(n),
            l = it(s.length, i),
            f = P(s),
            u = P(l),
            p = c[0],
            y = c[1],
            g = c[2],
            d = c[3]
          for (let h = 0; h + 4 <= f.length; ) {
            let w = p,
              m = y,
              x = g,
              A = d
            ;((p = f[h + 0]), (y = f[h + 1]), (g = f[h + 2]), (d = f[h + 3]))
            let { s0: S, s1: T, s2: B, s3: k } = bo(a, p, y, g, d)
            ;((u[h++] = S ^ w), (u[h++] = T ^ m), (u[h++] = B ^ x), (u[h++] = k ^ A))
          }
          return (a.fill(0), Eo(l, o))
        },
      }
    }),
    Eu = we({ blockSize: 16, nonceLength: 16 }, function (e, n) {
      ;(O(e), O(n, 16))
      function r(o, s, i) {
        let a = Ve(e),
          c = o.length
        i = it(c, i)
        let l = P(o),
          f = P(i),
          u = s ? f : l,
          p = P(n),
          y = p[0],
          g = p[1],
          d = p[2],
          h = p[3]
        for (let m = 0; m + 4 <= l.length; ) {
          let { s0: x, s1: A, s2: S, s3: T } = ce(a, y, g, d, h)
          ;((f[m + 0] = l[m + 0] ^ x),
            (f[m + 1] = l[m + 1] ^ A),
            (f[m + 2] = l[m + 2] ^ S),
            (f[m + 3] = l[m + 3] ^ T),
            (y = u[m++]),
            (g = u[m++]),
            (d = u[m++]),
            (h = u[m++]))
        }
        let w = Q * Math.floor(l.length / zn)
        if (w < c) {
          ;({ s0: y, s1: g, s2: d, s3: h } = ce(a, y, g, d, h))
          let m = Dt(new Uint32Array([y, g, d, h]))
          for (let x = w, A = 0; x < c; x++, A++) i[x] = o[x] ^ m[A]
          m.fill(0)
        }
        return (a.fill(0), i)
      }
      return { encrypt: (o, s) => r(o, !0, s), decrypt: (o, s) => r(o, !1, s) }
    })
  function To(t, e, n, r, o) {
    let s = t.create(n, r.length + (o?.length || 0))
    ;(o && s.update(o), s.update(r))
    let i = new Uint8Array(16),
      a = Me(i)
    return (
      o && Ge(a, 0, BigInt(o.length * 8), e),
      Ge(a, 8, BigInt(r.length * 8), e),
      s.update(i),
      s.digest()
    )
  }
  var Au = we({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      if ((O(n), n.length === 0)) throw new Error('aes/gcm: empty nonce')
      let o = 16
      function s(a, c, l) {
        let f = To(Vn, !1, a, l, r)
        for (let u = 0; u < c.length; u++) f[u] ^= c[u]
        return f
      }
      function i() {
        let a = Ve(e),
          c = jt.slice(),
          l = jt.slice()
        if ((pt(a, !1, l, l, c), n.length === 12)) l.set(n)
        else {
          let u = jt.slice(),
            p = Me(u)
          ;(Ge(p, 8, BigInt(n.length * 8), !1), Vn.create(c).update(n).update(u).digestInto(l))
        }
        let f = pt(a, !1, l, jt)
        return { xk: a, authKey: c, counter: l, tagMask: f }
      }
      return {
        encrypt: a => {
          O(a)
          let { xk: c, authKey: l, counter: f, tagMask: u } = i(),
            p = new Uint8Array(a.length + o)
          pt(c, !1, f, a, p)
          let y = s(l, u, p.subarray(0, p.length - o))
          return (p.set(y, a.length), c.fill(0), p)
        },
        decrypt: a => {
          if ((O(a), a.length < o)) throw new Error(`aes/gcm: ciphertext less than tagLen (${o})`)
          let { xk: c, authKey: l, counter: f, tagMask: u } = i(),
            p = a.subarray(0, -o),
            y = a.subarray(-o),
            g = s(l, u, p)
          if (!Ze(g, y)) throw new Error('aes/gcm: invalid ghash tag')
          let d = pt(c, !1, f, p)
          return (l.fill(0), u.fill(0), c.fill(0), d)
        },
      }
    }),
    Kt = (t, e, n) => r => {
      if (!Number.isSafeInteger(r) || e > r || r > n)
        throw new Error(`${t}: invalid value=${r}, must be [${e}..${n}]`)
    },
    Tu = we({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      let s = Kt('AAD', 0, 68719476736),
        i = Kt('plaintext', 0, 2 ** 36),
        a = Kt('nonce', 12, 12),
        c = Kt('ciphertext', 16, 2 ** 36 + 16)
      ;(O(n), a(n.length), r && (O(r), s(r.length)))
      function l() {
        let p = e.length
        if (p !== 16 && p !== 24 && p !== 32)
          throw new Error(`key length must be 16, 24 or 32 bytes, got: ${p} bytes`)
        let y = Ve(e),
          g = new Uint8Array(p),
          d = new Uint8Array(16),
          h = P(n),
          w = 0,
          m = h[0],
          x = h[1],
          A = h[2],
          S = 0
        for (let T of [d, g].map(P)) {
          let B = P(T)
          for (let k = 0; k < B.length; k += 2) {
            let { s0: N, s1: _ } = ce(y, w, m, x, A)
            ;((B[k + 0] = N), (B[k + 1] = _), (w = ++S))
          }
        }
        return (y.fill(0), { authKey: d, encKey: Ve(g) })
      }
      function f(p, y, g) {
        let d = To(go, !0, y, g, r)
        for (let S = 0; S < 12; S++) d[S] ^= n[S]
        d[15] &= 127
        let h = P(d),
          w = h[0],
          m = h[1],
          x = h[2],
          A = h[3]
        return (
          ({ s0: w, s1: m, s2: x, s3: A } = ce(p, w, m, x, A)),
          (h[0] = w),
          (h[1] = m),
          (h[2] = x),
          (h[3] = A),
          d
        )
      }
      function u(p, y, g) {
        let d = y.slice()
        return ((d[15] |= 128), pt(p, !0, d, g))
      }
      return {
        encrypt: p => {
          ;(O(p), i(p.length))
          let { encKey: y, authKey: g } = l(),
            d = f(y, g, p),
            h = new Uint8Array(p.length + 16)
          return (h.set(d, p.length), h.set(u(y, d, p)), y.fill(0), g.fill(0), h)
        },
        decrypt: p => {
          ;(O(p), c(p.length))
          let y = p.subarray(-16),
            { encKey: g, authKey: d } = l(),
            h = u(g, y, p.subarray(0, -16)),
            w = f(g, d, h)
          if ((g.fill(0), d.fill(0), !Ze(y, w))) throw new Error('invalid polyval tag')
          return h
        },
      }
    })
  var F = (t, e) => (t[e++] & 255) | ((t[e++] & 255) << 8),
    Gn = class {
      constructor(e) {
        ;((this.blockLen = 16),
          (this.outputLen = 16),
          (this.buffer = new Uint8Array(16)),
          (this.r = new Uint16Array(10)),
          (this.h = new Uint16Array(10)),
          (this.pad = new Uint16Array(8)),
          (this.pos = 0),
          (this.finished = !1),
          (e = ye(e)),
          O(e, 32))
        let n = F(e, 0),
          r = F(e, 2),
          o = F(e, 4),
          s = F(e, 6),
          i = F(e, 8),
          a = F(e, 10),
          c = F(e, 12),
          l = F(e, 14)
        ;((this.r[0] = n & 8191),
          (this.r[1] = ((n >>> 13) | (r << 3)) & 8191),
          (this.r[2] = ((r >>> 10) | (o << 6)) & 7939),
          (this.r[3] = ((o >>> 7) | (s << 9)) & 8191),
          (this.r[4] = ((s >>> 4) | (i << 12)) & 255),
          (this.r[5] = (i >>> 1) & 8190),
          (this.r[6] = ((i >>> 14) | (a << 2)) & 8191),
          (this.r[7] = ((a >>> 11) | (c << 5)) & 8065),
          (this.r[8] = ((c >>> 8) | (l << 8)) & 8191),
          (this.r[9] = (l >>> 5) & 127))
        for (let f = 0; f < 8; f++) this.pad[f] = F(e, 16 + 2 * f)
      }
      process(e, n, r = !1) {
        let o = r ? 0 : 2048,
          { h: s, r: i } = this,
          a = i[0],
          c = i[1],
          l = i[2],
          f = i[3],
          u = i[4],
          p = i[5],
          y = i[6],
          g = i[7],
          d = i[8],
          h = i[9],
          w = F(e, n + 0),
          m = F(e, n + 2),
          x = F(e, n + 4),
          A = F(e, n + 6),
          S = F(e, n + 8),
          T = F(e, n + 10),
          B = F(e, n + 12),
          k = F(e, n + 14),
          N = s[0] + (w & 8191),
          _ = s[1] + (((w >>> 13) | (m << 3)) & 8191),
          I = s[2] + (((m >>> 10) | (x << 6)) & 8191),
          $ = s[3] + (((x >>> 7) | (A << 9)) & 8191),
          H = s[4] + (((A >>> 4) | (S << 12)) & 8191),
          V = s[5] + ((S >>> 1) & 8191),
          b = s[6] + (((S >>> 14) | (T << 2)) & 8191),
          v = s[7] + (((T >>> 11) | (B << 5)) & 8191),
          C = s[8] + (((B >>> 8) | (k << 8)) & 8191),
          U = s[9] + ((k >>> 5) | o),
          E = 0,
          R = E + N * a + _ * (5 * h) + I * (5 * d) + $ * (5 * g) + H * (5 * y)
        ;((E = R >>> 13),
          (R &= 8191),
          (R += V * (5 * p) + b * (5 * u) + v * (5 * f) + C * (5 * l) + U * (5 * c)),
          (E += R >>> 13),
          (R &= 8191))
        let q = E + N * c + _ * a + I * (5 * h) + $ * (5 * d) + H * (5 * g)
        ;((E = q >>> 13),
          (q &= 8191),
          (q += V * (5 * y) + b * (5 * p) + v * (5 * u) + C * (5 * f) + U * (5 * l)),
          (E += q >>> 13),
          (q &= 8191))
        let M = E + N * l + _ * c + I * a + $ * (5 * h) + H * (5 * d)
        ;((E = M >>> 13),
          (M &= 8191),
          (M += V * (5 * g) + b * (5 * y) + v * (5 * p) + C * (5 * u) + U * (5 * f)),
          (E += M >>> 13),
          (M &= 8191))
        let G = E + N * f + _ * l + I * c + $ * a + H * (5 * h)
        ;((E = G >>> 13),
          (G &= 8191),
          (G += V * (5 * d) + b * (5 * g) + v * (5 * y) + C * (5 * p) + U * (5 * u)),
          (E += G >>> 13),
          (G &= 8191))
        let Y = E + N * u + _ * f + I * l + $ * c + H * a
        ;((E = Y >>> 13),
          (Y &= 8191),
          (Y += V * (5 * h) + b * (5 * d) + v * (5 * g) + C * (5 * y) + U * (5 * p)),
          (E += Y >>> 13),
          (Y &= 8191))
        let te = E + N * p + _ * u + I * f + $ * l + H * c
        ;((E = te >>> 13),
          (te &= 8191),
          (te += V * a + b * (5 * h) + v * (5 * d) + C * (5 * g) + U * (5 * y)),
          (E += te >>> 13),
          (te &= 8191))
        let oe = E + N * y + _ * p + I * u + $ * f + H * l
        ;((E = oe >>> 13),
          (oe &= 8191),
          (oe += V * c + b * a + v * (5 * h) + C * (5 * d) + U * (5 * g)),
          (E += oe >>> 13),
          (oe &= 8191))
        let X = E + N * g + _ * y + I * p + $ * u + H * f
        ;((E = X >>> 13),
          (X &= 8191),
          (X += V * l + b * c + v * a + C * (5 * h) + U * (5 * d)),
          (E += X >>> 13),
          (X &= 8191))
        let he = E + N * d + _ * g + I * y + $ * p + H * u
        ;((E = he >>> 13),
          (he &= 8191),
          (he += V * f + b * l + v * c + C * a + U * (5 * h)),
          (E += he >>> 13),
          (he &= 8191))
        let ee = E + N * h + _ * d + I * g + $ * y + H * p
        ;((E = ee >>> 13),
          (ee &= 8191),
          (ee += V * u + b * f + v * l + C * c + U * a),
          (E += ee >>> 13),
          (ee &= 8191),
          (E = ((E << 2) + E) | 0),
          (E = (E + R) | 0),
          (R = E & 8191),
          (E = E >>> 13),
          (q += E),
          (s[0] = R),
          (s[1] = q),
          (s[2] = M),
          (s[3] = G),
          (s[4] = Y),
          (s[5] = te),
          (s[6] = oe),
          (s[7] = X),
          (s[8] = he),
          (s[9] = ee))
      }
      finalize() {
        let { h: e, pad: n } = this,
          r = new Uint16Array(10),
          o = e[1] >>> 13
        e[1] &= 8191
        for (let a = 2; a < 10; a++) ((e[a] += o), (o = e[a] >>> 13), (e[a] &= 8191))
        ;((e[0] += o * 5),
          (o = e[0] >>> 13),
          (e[0] &= 8191),
          (e[1] += o),
          (o = e[1] >>> 13),
          (e[1] &= 8191),
          (e[2] += o),
          (r[0] = e[0] + 5),
          (o = r[0] >>> 13),
          (r[0] &= 8191))
        for (let a = 1; a < 10; a++) ((r[a] = e[a] + o), (o = r[a] >>> 13), (r[a] &= 8191))
        r[9] -= 8192
        let s = (o ^ 1) - 1
        for (let a = 0; a < 10; a++) r[a] &= s
        s = ~s
        for (let a = 0; a < 10; a++) e[a] = (e[a] & s) | r[a]
        ;((e[0] = (e[0] | (e[1] << 13)) & 65535),
          (e[1] = ((e[1] >>> 3) | (e[2] << 10)) & 65535),
          (e[2] = ((e[2] >>> 6) | (e[3] << 7)) & 65535),
          (e[3] = ((e[3] >>> 9) | (e[4] << 4)) & 65535),
          (e[4] = ((e[4] >>> 12) | (e[5] << 1) | (e[6] << 14)) & 65535),
          (e[5] = ((e[6] >>> 2) | (e[7] << 11)) & 65535),
          (e[6] = ((e[7] >>> 5) | (e[8] << 8)) & 65535),
          (e[7] = ((e[8] >>> 8) | (e[9] << 5)) & 65535))
        let i = e[0] + n[0]
        e[0] = i & 65535
        for (let a = 1; a < 8; a++)
          ((i = (((e[a] + n[a]) | 0) + (i >>> 16)) | 0), (e[a] = i & 65535))
      }
      update(e) {
        He(this)
        let { buffer: n, blockLen: r } = this
        e = ye(e)
        let o = e.length
        for (let s = 0; s < o; ) {
          let i = Math.min(r - this.pos, o - s)
          if (i === r) {
            for (; r <= o - s; s += r) this.process(e, s)
            continue
          }
          ;(n.set(e.subarray(s, s + i), this.pos),
            (this.pos += i),
            (s += i),
            this.pos === r && (this.process(n, 0, !1), (this.pos = 0)))
        }
        return this
      }
      destroy() {
        ;(this.h.fill(0), this.r.fill(0), this.buffer.fill(0), this.pad.fill(0))
      }
      digestInto(e) {
        ;(He(this), ht(e, this), (this.finished = !0))
        let { buffer: n, h: r } = this,
          { pos: o } = this
        if (o) {
          for (n[o++] = 1; o < 16; o++) n[o] = 0
          this.process(n, 0, !0)
        }
        this.finalize()
        let s = 0
        for (let i = 0; i < 8; i++) ((e[s++] = r[i] >>> 0), (e[s++] = r[i] >>> 8))
        return e
      }
      digest() {
        let { buffer: e, outputLen: n } = this
        this.digestInto(e)
        let r = e.slice(0, n)
        return (this.destroy(), r)
      }
    }
  function Yi(t) {
    let e = (r, o) => t(o).update(ye(r)).digest(),
      n = t(new Uint8Array(32))
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = r => t(r)), e)
  }
  var So = Yi(t => new Gn(t))
  var Lo = t => Uint8Array.from(t.split('').map(e => e.charCodeAt(0))),
    Xi = Lo('expand 16-byte k'),
    Qi = Lo('expand 32-byte k'),
    ea = P(Xi),
    ko = P(Qi),
    _u = ko.slice()
  function L(t, e) {
    return (t << e) | (t >>> (32 - e))
  }
  function Jn(t) {
    return t.byteOffset % 4 === 0
  }
  var Zt = 64,
    ta = 16,
    Co = 2 ** 32 - 1,
    Bo = new Uint32Array()
  function na(t, e, n, r, o, s, i, a) {
    let c = o.length,
      l = new Uint8Array(Zt),
      f = P(l),
      u = Jn(o) && Jn(s),
      p = u ? P(o) : Bo,
      y = u ? P(s) : Bo
    for (let g = 0; g < c; i++) {
      if ((t(e, n, r, f, i, a), i >= Co)) throw new Error('arx: counter overflow')
      let d = Math.min(Zt, c - g)
      if (u && d === Zt) {
        let h = g / 4
        if (g % 4 !== 0) throw new Error('arx: invalid block position')
        for (let w = 0, m; w < ta; w++) ((m = h + w), (y[m] = p[m] ^ f[w]))
        g += Zt
        continue
      }
      for (let h = 0, w; h < d; h++) ((w = g + h), (s[w] = o[w] ^ l[h]))
      g += d
    }
  }
  function Fn(t, e) {
    let {
      allowShortKeys: n,
      extendNonceFn: r,
      counterLength: o,
      counterRight: s,
      rounds: i,
    } = ho({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, e)
    if (typeof t != 'function') throw new Error('core must be a function')
    return (
      Wt(o),
      Wt(i),
      $n(s),
      $n(n),
      (a, c, l, f, u = 0) => {
        ;(O(a), O(c), O(l))
        let p = l.length
        if ((f || (f = new Uint8Array(p)), O(f), Wt(u), u < 0 || u >= Co))
          throw new Error('arx: counter overflow')
        if (f.length < p) throw new Error(`arx: output (${f.length}) is shorter than data (${p})`)
        let y = [],
          g = a.length,
          d,
          h
        if (g === 32) ((d = a.slice()), y.push(d), (h = ko))
        else if (g === 16 && n)
          ((d = new Uint8Array(32)), d.set(a), d.set(a, 16), (h = ea), y.push(d))
        else throw new Error(`arx: invalid 32-byte key, got length=${g}`)
        Jn(c) || ((c = c.slice()), y.push(c))
        let w = P(d)
        if (r) {
          if (c.length !== 24) throw new Error('arx: extended nonce must be 24 bytes')
          ;(r(h, w, P(c.subarray(0, 16)), w), (c = c.subarray(16)))
        }
        let m = 16 - o
        if (m !== c.length) throw new Error(`arx: nonce must be ${m} or 16 bytes`)
        if (m !== 12) {
          let A = new Uint8Array(12)
          ;(A.set(c, s ? 0 : 12 - c.length), (c = A), y.push(c))
        }
        let x = P(c)
        for (na(t, h, w, x, l, f, u, i); y.length > 0; ) y.pop().fill(0)
        return f
      }
    )
  }
  function Uo(t, e, n, r, o, s = 20) {
    let i = t[0],
      a = t[1],
      c = t[2],
      l = t[3],
      f = e[0],
      u = e[1],
      p = e[2],
      y = e[3],
      g = e[4],
      d = e[5],
      h = e[6],
      w = e[7],
      m = o,
      x = n[0],
      A = n[1],
      S = n[2],
      T = i,
      B = a,
      k = c,
      N = l,
      _ = f,
      I = u,
      $ = p,
      H = y,
      V = g,
      b = d,
      v = h,
      C = w,
      U = m,
      E = x,
      R = A,
      q = S
    for (let G = 0; G < s; G += 2)
      ((T = (T + _) | 0),
        (U = L(U ^ T, 16)),
        (V = (V + U) | 0),
        (_ = L(_ ^ V, 12)),
        (T = (T + _) | 0),
        (U = L(U ^ T, 8)),
        (V = (V + U) | 0),
        (_ = L(_ ^ V, 7)),
        (B = (B + I) | 0),
        (E = L(E ^ B, 16)),
        (b = (b + E) | 0),
        (I = L(I ^ b, 12)),
        (B = (B + I) | 0),
        (E = L(E ^ B, 8)),
        (b = (b + E) | 0),
        (I = L(I ^ b, 7)),
        (k = (k + $) | 0),
        (R = L(R ^ k, 16)),
        (v = (v + R) | 0),
        ($ = L($ ^ v, 12)),
        (k = (k + $) | 0),
        (R = L(R ^ k, 8)),
        (v = (v + R) | 0),
        ($ = L($ ^ v, 7)),
        (N = (N + H) | 0),
        (q = L(q ^ N, 16)),
        (C = (C + q) | 0),
        (H = L(H ^ C, 12)),
        (N = (N + H) | 0),
        (q = L(q ^ N, 8)),
        (C = (C + q) | 0),
        (H = L(H ^ C, 7)),
        (T = (T + I) | 0),
        (q = L(q ^ T, 16)),
        (v = (v + q) | 0),
        (I = L(I ^ v, 12)),
        (T = (T + I) | 0),
        (q = L(q ^ T, 8)),
        (v = (v + q) | 0),
        (I = L(I ^ v, 7)),
        (B = (B + $) | 0),
        (U = L(U ^ B, 16)),
        (C = (C + U) | 0),
        ($ = L($ ^ C, 12)),
        (B = (B + $) | 0),
        (U = L(U ^ B, 8)),
        (C = (C + U) | 0),
        ($ = L($ ^ C, 7)),
        (k = (k + H) | 0),
        (E = L(E ^ k, 16)),
        (V = (V + E) | 0),
        (H = L(H ^ V, 12)),
        (k = (k + H) | 0),
        (E = L(E ^ k, 8)),
        (V = (V + E) | 0),
        (H = L(H ^ V, 7)),
        (N = (N + _) | 0),
        (R = L(R ^ N, 16)),
        (b = (b + R) | 0),
        (_ = L(_ ^ b, 12)),
        (N = (N + _) | 0),
        (R = L(R ^ N, 8)),
        (b = (b + R) | 0),
        (_ = L(_ ^ b, 7)))
    let M = 0
    ;((r[M++] = (i + T) | 0),
      (r[M++] = (a + B) | 0),
      (r[M++] = (c + k) | 0),
      (r[M++] = (l + N) | 0),
      (r[M++] = (f + _) | 0),
      (r[M++] = (u + I) | 0),
      (r[M++] = (p + $) | 0),
      (r[M++] = (y + H) | 0),
      (r[M++] = (g + V) | 0),
      (r[M++] = (d + b) | 0),
      (r[M++] = (h + v) | 0),
      (r[M++] = (w + C) | 0),
      (r[M++] = (m + U) | 0),
      (r[M++] = (x + E) | 0),
      (r[M++] = (A + R) | 0),
      (r[M++] = (S + q) | 0))
  }
  function ra(t, e, n, r) {
    let o = t[0],
      s = t[1],
      i = t[2],
      a = t[3],
      c = e[0],
      l = e[1],
      f = e[2],
      u = e[3],
      p = e[4],
      y = e[5],
      g = e[6],
      d = e[7],
      h = n[0],
      w = n[1],
      m = n[2],
      x = n[3]
    for (let S = 0; S < 20; S += 2)
      ((o = (o + c) | 0),
        (h = L(h ^ o, 16)),
        (p = (p + h) | 0),
        (c = L(c ^ p, 12)),
        (o = (o + c) | 0),
        (h = L(h ^ o, 8)),
        (p = (p + h) | 0),
        (c = L(c ^ p, 7)),
        (s = (s + l) | 0),
        (w = L(w ^ s, 16)),
        (y = (y + w) | 0),
        (l = L(l ^ y, 12)),
        (s = (s + l) | 0),
        (w = L(w ^ s, 8)),
        (y = (y + w) | 0),
        (l = L(l ^ y, 7)),
        (i = (i + f) | 0),
        (m = L(m ^ i, 16)),
        (g = (g + m) | 0),
        (f = L(f ^ g, 12)),
        (i = (i + f) | 0),
        (m = L(m ^ i, 8)),
        (g = (g + m) | 0),
        (f = L(f ^ g, 7)),
        (a = (a + u) | 0),
        (x = L(x ^ a, 16)),
        (d = (d + x) | 0),
        (u = L(u ^ d, 12)),
        (a = (a + u) | 0),
        (x = L(x ^ a, 8)),
        (d = (d + x) | 0),
        (u = L(u ^ d, 7)),
        (o = (o + l) | 0),
        (x = L(x ^ o, 16)),
        (g = (g + x) | 0),
        (l = L(l ^ g, 12)),
        (o = (o + l) | 0),
        (x = L(x ^ o, 8)),
        (g = (g + x) | 0),
        (l = L(l ^ g, 7)),
        (s = (s + f) | 0),
        (h = L(h ^ s, 16)),
        (d = (d + h) | 0),
        (f = L(f ^ d, 12)),
        (s = (s + f) | 0),
        (h = L(h ^ s, 8)),
        (d = (d + h) | 0),
        (f = L(f ^ d, 7)),
        (i = (i + u) | 0),
        (w = L(w ^ i, 16)),
        (p = (p + w) | 0),
        (u = L(u ^ p, 12)),
        (i = (i + u) | 0),
        (w = L(w ^ i, 8)),
        (p = (p + w) | 0),
        (u = L(u ^ p, 7)),
        (a = (a + c) | 0),
        (m = L(m ^ a, 16)),
        (y = (y + m) | 0),
        (c = L(c ^ y, 12)),
        (a = (a + c) | 0),
        (m = L(m ^ a, 8)),
        (y = (y + m) | 0),
        (c = L(c ^ y, 7)))
    let A = 0
    ;((r[A++] = o),
      (r[A++] = s),
      (r[A++] = i),
      (r[A++] = a),
      (r[A++] = h),
      (r[A++] = w),
      (r[A++] = m),
      (r[A++] = x))
  }
  var Gt = Fn(Uo, { counterRight: !1, counterLength: 4, allowShortKeys: !1 }),
    oa = Fn(Uo, { counterRight: !1, counterLength: 8, extendNonceFn: ra, allowShortKeys: !1 })
  var sa = new Uint8Array(16),
    Io = (t, e) => {
      t.update(e)
      let n = e.length % 16
      n && t.update(sa.subarray(n))
    },
    ia = new Uint8Array(32)
  function _o(t, e, n, r, o) {
    let s = t(e, n, ia),
      i = So.create(s)
    ;(o && Io(i, o), Io(i, r))
    let a = new Uint8Array(16),
      c = Me(a)
    ;(Ge(c, 0, BigInt(o ? o.length : 0), !0), Ge(c, 8, BigInt(r.length), !0), i.update(a))
    let l = i.digest()
    return (s.fill(0), l)
  }
  var No = t => (e, n, r) => (
      O(e, 32),
      O(n),
      {
        encrypt: (s, i) => {
          let a = s.length,
            c = a + 16
          ;(i ? O(i, c) : (i = new Uint8Array(c)), t(e, n, s, i, 1))
          let l = _o(t, e, n, i.subarray(0, -16), r)
          return (i.set(l, a), i)
        },
        decrypt: (s, i) => {
          let a = s.length,
            c = a - 16
          if (a < 16) throw new Error('encrypted data must be at least 16 bytes')
          i ? O(i, c) : (i = new Uint8Array(c))
          let l = s.subarray(0, -16),
            f = s.subarray(-16),
            u = _o(t, e, n, l, r)
          if (!Ze(f, u)) throw new Error('invalid tag')
          return (t(e, n, l, i, 1), i)
        },
      }
    ),
    $u = we({ blockSize: 64, nonceLength: 12, tagLength: 16 }, No(Gt)),
    Hu = we({ blockSize: 64, nonceLength: 24, tagLength: 16 }, No(oa))
  var Jt = class extends nt {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), re.hash(e))
        let r = Ne(n)
        if (((this.iHash = e.create()), typeof this.iHash.update != 'function'))
          throw new Error('Expected instance of class which extends utils.Hash')
        ;((this.blockLen = this.iHash.blockLen), (this.outputLen = this.iHash.outputLen))
        let o = this.blockLen,
          s = new Uint8Array(o)
        s.set(r.length > o ? e.create().update(r).digest() : r)
        for (let i = 0; i < s.length; i++) s[i] ^= 54
        ;(this.iHash.update(s), (this.oHash = e.create()))
        for (let i = 0; i < s.length; i++) s[i] ^= 106
        ;(this.oHash.update(s), s.fill(0))
      }
      update(e) {
        return (re.exists(this), this.iHash.update(e), this)
      }
      digestInto(e) {
        ;(re.exists(this),
          re.bytes(e, this.outputLen),
          (this.finished = !0),
          this.iHash.digestInto(e),
          this.oHash.update(e),
          this.oHash.digestInto(e),
          this.destroy())
      }
      digest() {
        let e = new Uint8Array(this.oHash.outputLen)
        return (this.digestInto(e), e)
      }
      _cloneInto(e) {
        e || (e = Object.create(Object.getPrototypeOf(this), {}))
        let { oHash: n, iHash: r, finished: o, destroyed: s, blockLen: i, outputLen: a } = this
        return (
          (e = e),
          (e.finished = o),
          (e.destroyed = s),
          (e.blockLen = i),
          (e.outputLen = a),
          (e.oHash = n._cloneInto(e.oHash)),
          (e.iHash = r._cloneInto(e.iHash)),
          e
        )
      }
      destroy() {
        ;((this.destroyed = !0), this.oHash.destroy(), this.iHash.destroy())
      }
    },
    at = (t, e, n) => new Jt(t, e).update(n).digest()
  at.create = (t, e) => new Jt(t, e)
  function Oo(t, e, n) {
    return (re.hash(t), n === void 0 && (n = new Uint8Array(t.outputLen)), at(t, Ne(n), Ne(e)))
  }
  var Yn = new Uint8Array([0]),
    Ro = new Uint8Array()
  function Po(t, e, n, r = 32) {
    if ((re.hash(t), re.number(r), r > 255 * t.outputLen))
      throw new Error('Length should be <= 255*HashLen')
    let o = Math.ceil(r / t.outputLen)
    n === void 0 && (n = Ro)
    let s = new Uint8Array(o * t.outputLen),
      i = at.create(t, e),
      a = i._cloneInto(),
      c = new Uint8Array(i.outputLen)
    for (let l = 0; l < o; l++)
      ((Yn[0] = l + 1),
        a
          .update(l === 0 ? Ro : c)
          .update(n)
          .update(Yn)
          .digestInto(c),
        s.set(c, t.outputLen * l),
        i._cloneInto(a))
    return (i.destroy(), a.destroy(), c.fill(0), Yn.fill(0), s.slice(0, r))
  }
  var aa = Object.defineProperty,
    W = (t, e) => {
      for (var n in e) aa(t, n, { get: e[n], enumerable: !0 })
    },
    ct = Symbol('verified'),
    ca = t => t instanceof Object
  function Qn(t) {
    if (
      !ca(t) ||
      typeof t.kind != 'number' ||
      typeof t.content != 'string' ||
      typeof t.created_at != 'number' ||
      typeof t.pubkey != 'string' ||
      !t.pubkey.match(/^[a-f0-9]{64}$/) ||
      !Array.isArray(t.tags)
    )
      return !1
    for (let e = 0; e < t.tags.length; e++) {
      let n = t.tags[e]
      if (!Array.isArray(n)) return !1
      for (let r = 0; r < n.length; r++) if (typeof n[r] != 'string') return !1
    }
    return !0
  }
  var la = {}
  W(la, {
    Queue: () => ha,
    QueueNode: () => Mo,
    binarySearch: () => er,
    bytesToHex: () => z,
    hexToBytes: () => Ae,
    insertEventIntoAscendingList: () => da,
    insertEventIntoDescendingList: () => ua,
    normalizeURL: () => fa,
    utf8Decoder: () => ke,
    utf8Encoder: () => de,
  })
  var ke = new TextDecoder('utf-8'),
    de = new TextEncoder()
  function fa(t) {
    try {
      t.indexOf('://') === -1 && (t = 'wss://' + t)
      let e = new URL(t)
      return (
        (e.pathname = e.pathname.replace(/\/+/g, '/')),
        e.pathname.endsWith('/') && (e.pathname = e.pathname.slice(0, -1)),
        ((e.port === '80' && e.protocol === 'ws:') ||
          (e.port === '443' && e.protocol === 'wss:')) &&
          (e.port = ''),
        e.searchParams.sort(),
        (e.hash = ''),
        e.toString()
      )
    } catch {
      throw new Error(`Invalid URL: ${t}`)
    }
  }
  function ua(t, e) {
    let [n, r] = er(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : o.created_at - e.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function da(t, e) {
    let [n, r] = er(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : e.created_at - o.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function er(t, e) {
    let n = 0,
      r = t.length - 1
    for (; n <= r; ) {
      let o = Math.floor((n + r) / 2),
        s = e(t[o])
      if (s === 0) return [o, !0]
      s < 0 ? (r = o - 1) : (n = o + 1)
    }
    return [n, !1]
  }
  var Mo = class {
      constructor(t) {
        Xe(this, 'value')
        Xe(this, 'next', null)
        Xe(this, 'prev', null)
        this.value = t
      }
    },
    ha = class {
      constructor() {
        Xe(this, 'first')
        Xe(this, 'last')
        ;((this.first = null), (this.last = null))
      }
      enqueue(t) {
        let e = new Mo(t)
        return (
          this.last
            ? this.last === this.first
              ? ((this.last = e), (this.last.prev = this.first), (this.first.next = e))
              : ((e.prev = this.last), (this.last.next = e), (this.last = e))
            : ((this.first = e), (this.last = e)),
          !0
        )
      }
      dequeue() {
        if (!this.first) return null
        if (this.first === this.last) {
          let e = this.first
          return ((this.first = null), (this.last = null), e.value)
        }
        let t = this.first
        return ((this.first = t.next), this.first && (this.first.prev = null), t.value)
      }
    },
    pa = class {
      generateSecretKey() {
        return tt.utils.randomPrivateKey()
      }
      getPublicKey(t) {
        return z(tt.getPublicKey(t))
      }
      finalizeEvent(t, e) {
        let n = t
        return (
          (n.pubkey = z(tt.getPublicKey(e))),
          (n.id = Ft(n)),
          (n.sig = z(tt.sign(Ft(n), e))),
          (n[ct] = !0),
          n
        )
      }
      verifyEvent(t) {
        if (typeof t[ct] == 'boolean') return t[ct]
        let e = Ft(t)
        if (e !== t.id) return ((t[ct] = !1), !1)
        try {
          let n = tt.verify(t.sig, e, t.pubkey)
          return ((t[ct] = n), n)
        } catch {
          return ((t[ct] = !1), !1)
        }
      }
    }
  function ga(t) {
    if (!Qn(t)) throw new Error("can't serialize event with wrong or missing properties")
    return JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content])
  }
  function Ft(t) {
    let e = ge(de.encode(ga(t)))
    return z(e)
  }
  var Xt = new pa(),
    ya = Xt.generateSecretKey,
    tr = Xt.getPublicKey,
    xe = Xt.finalizeEvent,
    nr = Xt.verifyEvent,
    wa = {}
  W(wa, {
    Application: () => yc,
    BadgeAward: () => Sa,
    BadgeDefinition: () => lc,
    BlockedRelaysList: () => Za,
    BookmarkList: () => za,
    Bookmarksets: () => ic,
    Calendar: () => Ac,
    CalendarEventRSVP: () => Tc,
    ChannelCreation: () => jo,
    ChannelHideMessage: () => Go,
    ChannelMessage: () => Zo,
    ChannelMetadata: () => Ko,
    ChannelMuteUser: () => Jo,
    ClassifiedListing: () => bc,
    ClientAuth: () => Yo,
    CommunitiesList: () => ja,
    CommunityDefinition: () => Lc,
    CommunityPostApproval: () => Na,
    Contacts: () => Ea,
    CreateOrUpdateProduct: () => dc,
    CreateOrUpdateStall: () => uc,
    Curationsets: () => ac,
    Date: () => vc,
    DirectMessageRelaysList: () => Ya,
    DraftClassifiedListing: () => xc,
    DraftLong: () => pc,
    Emojisets: () => gc,
    EncryptedDirectMessage: () => Aa,
    EventDeletion: () => Ta,
    FileMetadata: () => La,
    FileServerPreference: () => Xa,
    Followsets: () => rc,
    GenericRepost: () => ar,
    Genericlists: () => oc,
    GiftWrap: () => Fo,
    HTTPAuth: () => cr,
    Handlerinformation: () => Bc,
    Handlerrecommendation: () => Sc,
    Highlights: () => qa,
    InterestsList: () => Ja,
    Interestsets: () => fc,
    JobFeedback: () => Pa,
    JobRequest: () => Ra,
    JobResult: () => Oa,
    Label: () => Ua,
    LightningPubRPC: () => ec,
    LiveChatMessage: () => ka,
    LiveEvent: () => wc,
    LongFormArticle: () => hc,
    Metadata: () => xa,
    Mutelist: () => Va,
    NWCWalletInfo: () => Qa,
    NWCWalletRequest: () => Xo,
    NWCWalletResponse: () => tc,
    NostrConnect: () => nc,
    OpenTimestamps: () => Ba,
    Pinlist: () => Wa,
    PrivateDirectMessage: () => zo,
    ProblemTracker: () => Ca,
    ProfileBadges: () => cc,
    PublicChatsList: () => Ka,
    Reaction: () => ir,
    RecommendRelay: () => va,
    RelayList: () => Da,
    Relaysets: () => sc,
    Report: () => Ia,
    Reporting: () => _a,
    Repost: () => sr,
    Seal: () => Do,
    SearchRelaysList: () => Ga,
    ShortTextNote: () => Wo,
    Time: () => Ec,
    UserEmojiList: () => Fa,
    UserStatuses: () => mc,
    Zap: () => Ma,
    ZapGoal: () => $a,
    ZapRequest: () => Ha,
    classifyKind: () => ma,
    isAddressableKind: () => or,
    isEphemeralKind: () => Vo,
    isKind: () => ba,
    isRegularKind: () => qo,
    isReplaceableKind: () => rr,
  })
  function qo(t) {
    return (1e3 <= t && t < 1e4) || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(t)
  }
  function rr(t) {
    return [0, 3].includes(t) || (1e4 <= t && t < 2e4)
  }
  function Vo(t) {
    return 2e4 <= t && t < 3e4
  }
  function or(t) {
    return 3e4 <= t && t < 4e4
  }
  function ma(t) {
    return qo(t)
      ? 'regular'
      : rr(t)
        ? 'replaceable'
        : Vo(t)
          ? 'ephemeral'
          : or(t)
            ? 'parameterized'
            : 'unknown'
  }
  function ba(t, e) {
    let n = e instanceof Array ? e : [e]
    return (Qn(t) && n.includes(t.kind)) || !1
  }
  var xa = 0,
    Wo = 1,
    va = 2,
    Ea = 3,
    Aa = 4,
    Ta = 5,
    sr = 6,
    ir = 7,
    Sa = 8,
    Do = 13,
    zo = 14,
    ar = 16,
    jo = 40,
    Ko = 41,
    Zo = 42,
    Go = 43,
    Jo = 44,
    Ba = 1040,
    Fo = 1059,
    La = 1063,
    ka = 1311,
    Ca = 1971,
    Ia = 1984,
    _a = 1984,
    Ua = 1985,
    Na = 4550,
    Ra = 5999,
    Oa = 6999,
    Pa = 7e3,
    $a = 9041,
    Ha = 9734,
    Ma = 9735,
    qa = 9802,
    Va = 1e4,
    Wa = 10001,
    Da = 10002,
    za = 10003,
    ja = 10004,
    Ka = 10005,
    Za = 10006,
    Ga = 10007,
    Ja = 10015,
    Fa = 10030,
    Ya = 10050,
    Xa = 10096,
    Qa = 13194,
    ec = 21e3,
    Yo = 22242,
    Xo = 23194,
    tc = 23195,
    nc = 24133,
    cr = 27235,
    rc = 3e4,
    oc = 30001,
    sc = 30002,
    ic = 30003,
    ac = 30004,
    cc = 30008,
    lc = 30009,
    fc = 30015,
    uc = 30017,
    dc = 30018,
    hc = 30023,
    pc = 30024,
    gc = 30030,
    yc = 30078,
    wc = 30311,
    mc = 30315,
    bc = 30402,
    xc = 30403,
    vc = 31922,
    Ec = 31923,
    Ac = 31924,
    Tc = 31925,
    Sc = 31989,
    Bc = 31990,
    Lc = 34550
  var kc = {}
  W(kc, {
    getHex64: () => lr,
    getInt: () => Qo,
    getSubscriptionId: () => Cc,
    matchEventId: () => Ic,
    matchEventKind: () => Uc,
    matchEventPubkey: () => _c,
  })
  function lr(t, e) {
    let n = e.length + 3,
      r = t.indexOf(`"${e}":`) + n,
      o = t.slice(r).indexOf('"') + r + 1
    return t.slice(o, o + 64)
  }
  function Qo(t, e) {
    let n = e.length,
      r = t.indexOf(`"${e}":`) + n + 3,
      o = t.slice(r),
      s = Math.min(o.indexOf(','), o.indexOf('}'))
    return parseInt(o.slice(0, s), 10)
  }
  function Cc(t) {
    let e = t.slice(0, 22).indexOf('"EVENT"')
    if (e === -1) return null
    let n = t.slice(e + 7 + 1).indexOf('"')
    if (n === -1) return null
    let r = e + 7 + 1 + n,
      o = t.slice(r + 1, 80).indexOf('"')
    if (o === -1) return null
    let s = r + 1 + o
    return t.slice(r + 1, s)
  }
  function Ic(t, e) {
    return e === lr(t, 'id')
  }
  function _c(t, e) {
    return e === lr(t, 'pubkey')
  }
  function Uc(t, e) {
    return e === Qo(t, 'kind')
  }
  var Nc = {}
  W(Nc, { makeAuthEvent: () => Rc })
  function Rc(t, e) {
    return {
      kind: Yo,
      created_at: Math.floor(Date.now() / 1e3),
      tags: [
        ['relay', t],
        ['challenge', e],
      ],
      content: '',
    }
  }
  var Oc
  try {
    Oc = WebSocket
  } catch {}
  var Pc
  try {
    Pc = WebSocket
  } catch {}
  var fr = {}
  W(fr, {
    BECH32_REGEX: () => es,
    Bech32MaxSize: () => ur,
    NostrTypeGuard: () => $c,
    decode: () => Qt,
    decodeNostrURI: () => Mc,
    encodeBytes: () => tn,
    naddrEncode: () => jc,
    neventEncode: () => zc,
    noteEncode: () => Wc,
    nprofileEncode: () => Dc,
    npubEncode: () => Vc,
    nsecEncode: () => qc,
  })
  var $c = {
      isNProfile: t => /^nprofile1[a-z\d]+$/.test(t || ''),
      isNEvent: t => /^nevent1[a-z\d]+$/.test(t || ''),
      isNAddr: t => /^naddr1[a-z\d]+$/.test(t || ''),
      isNSec: t => /^nsec1[a-z\d]{58}$/.test(t || ''),
      isNPub: t => /^npub1[a-z\d]{58}$/.test(t || ''),
      isNote: t => /^note1[a-z\d]+$/.test(t || ''),
      isNcryptsec: t => /^ncryptsec1[a-z\d]+$/.test(t || ''),
    },
    ur = 5e3,
    es = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/
  function Hc(t) {
    let e = new Uint8Array(4)
    return (
      (e[0] = (t >> 24) & 255),
      (e[1] = (t >> 16) & 255),
      (e[2] = (t >> 8) & 255),
      (e[3] = t & 255),
      e
    )
  }
  function Mc(t) {
    try {
      return (t.startsWith('nostr:') && (t = t.substring(6)), Qt(t))
    } catch {
      return { type: 'invalid', data: null }
    }
  }
  function Qt(t) {
    let { prefix: e, words: n } = $e.decode(t, ur),
      r = new Uint8Array($e.fromWords(n))
    switch (e) {
      case 'nprofile': {
        let o = Xn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        return {
          type: 'nprofile',
          data: { pubkey: z(o[0][0]), relays: o[1] ? o[1].map(s => ke.decode(s)) : [] },
        }
      }
      case 'nevent': {
        let o = Xn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nevent')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        if (o[2] && o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (o[3] && o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'nevent',
          data: {
            id: z(o[0][0]),
            relays: o[1] ? o[1].map(s => ke.decode(s)) : [],
            author: o[2]?.[0] ? z(o[2][0]) : void 0,
            kind: o[3]?.[0] ? parseInt(z(o[3][0]), 16) : void 0,
          },
        }
      }
      case 'naddr': {
        let o = Xn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for naddr')
        if (!o[2]?.[0]) throw new Error('missing TLV 2 for naddr')
        if (o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (!o[3]?.[0]) throw new Error('missing TLV 3 for naddr')
        if (o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'naddr',
          data: {
            identifier: ke.decode(o[0][0]),
            pubkey: z(o[2][0]),
            kind: parseInt(z(o[3][0]), 16),
            relays: o[1] ? o[1].map(s => ke.decode(s)) : [],
          },
        }
      }
      case 'nsec':
        return { type: e, data: r }
      case 'npub':
      case 'note':
        return { type: e, data: z(r) }
      default:
        throw new Error(`unknown prefix ${e}`)
    }
  }
  function Xn(t) {
    let e = {},
      n = t
    for (; n.length > 0; ) {
      let r = n[0],
        o = n[1],
        s = n.slice(2, 2 + o)
      if (((n = n.slice(2 + o)), s.length < o))
        throw new Error(`not enough data to read on TLV ${r}`)
      ;((e[r] = e[r] || []), e[r].push(s))
    }
    return e
  }
  function qc(t) {
    return tn('nsec', t)
  }
  function Vc(t) {
    return tn('npub', Ae(t))
  }
  function Wc(t) {
    return tn('note', Ae(t))
  }
  function en(t, e) {
    let n = $e.toWords(e)
    return $e.encode(t, n, ur)
  }
  function tn(t, e) {
    return en(t, e)
  }
  function Dc(t) {
    let e = dr({ 0: [Ae(t.pubkey)], 1: (t.relays || []).map(n => de.encode(n)) })
    return en('nprofile', e)
  }
  function zc(t) {
    let e
    t.kind !== void 0 && (e = Hc(t.kind))
    let n = dr({
      0: [Ae(t.id)],
      1: (t.relays || []).map(r => de.encode(r)),
      2: t.author ? [Ae(t.author)] : [],
      3: e ? [new Uint8Array(e)] : [],
    })
    return en('nevent', n)
  }
  function jc(t) {
    let e = new ArrayBuffer(4)
    new DataView(e).setUint32(0, t.kind, !1)
    let n = dr({
      0: [de.encode(t.identifier)],
      1: (t.relays || []).map(r => de.encode(r)),
      2: [Ae(t.pubkey)],
      3: [new Uint8Array(e)],
    })
    return en('naddr', n)
  }
  function dr(t) {
    let e = []
    return (
      Object.entries(t)
        .reverse()
        .forEach(([n, r]) => {
          r.forEach(o => {
            let s = new Uint8Array(o.length + 2)
            ;(s.set([parseInt(n)], 0), s.set([o.length], 1), s.set(o, 2), e.push(s))
          })
        }),
      rt(...e)
    )
  }
  var Kc = {}
  W(Kc, { decrypt: () => Zc, encrypt: () => ts })
  function ts(t, e, n) {
    let r = t instanceof Uint8Array ? z(t) : t,
      o = Ue.getSharedSecret(r, '02' + e),
      s = ns(o),
      i = Uint8Array.from($t(16)),
      a = de.encode(n),
      c = Zn(s, i).encrypt(a),
      l = ie.encode(new Uint8Array(c)),
      f = ie.encode(new Uint8Array(i.buffer))
    return `${l}?iv=${f}`
  }
  function Zc(t, e, n) {
    let r = t instanceof Uint8Array ? z(t) : t,
      [o, s] = n.split('?iv='),
      i = Ue.getSharedSecret(r, '02' + e),
      a = ns(i),
      c = ie.decode(s),
      l = ie.decode(o),
      f = Zn(a, c).decrypt(l)
    return ke.decode(f)
  }
  function ns(t) {
    return t.slice(1, 33)
  }
  var Gc = {}
  W(Gc, {
    NIP05_REGEX: () => hr,
    isNip05: () => Jc,
    isValid: () => Xc,
    queryProfile: () => rs,
    searchDomain: () => Yc,
    useFetchImplementation: () => Fc,
  })
  var hr = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/,
    Jc = t => hr.test(t || ''),
    nn
  try {
    nn = fetch
  } catch {}
  function Fc(t) {
    nn = t
  }
  async function Yc(t, e = '') {
    try {
      let n = `https://${t}/.well-known/nostr.json?name=${e}`,
        r = await nn(n, { redirect: 'manual' })
      if (r.status !== 200) throw Error('Wrong response code')
      return (await r.json()).names
    } catch {
      return {}
    }
  }
  async function rs(t) {
    let e = t.match(hr)
    if (!e) return null
    let [, n = '_', r] = e
    try {
      let o = `https://${r}/.well-known/nostr.json?name=${n}`,
        s = await nn(o, { redirect: 'manual' })
      if (s.status !== 200) throw Error('Wrong response code')
      let i = await s.json(),
        a = i.names[n]
      return a ? { pubkey: a, relays: i.relays?.[a] } : null
    } catch {
      return null
    }
  }
  async function Xc(t, e) {
    let n = await rs(e)
    return n ? n.pubkey === t : !1
  }
  var Qc = {}
  W(Qc, { parse: () => el })
  function el(t) {
    let e = { reply: void 0, root: void 0, mentions: [], profiles: [], quotes: [] },
      n,
      r
    for (let o = t.tags.length - 1; o >= 0; o--) {
      let s = t.tags[o]
      if (s[0] === 'e' && s[1]) {
        let [i, a, c, l, f] = s,
          u = { id: a, relays: c ? [c] : [], author: f }
        if (l === 'root') {
          e.root = u
          continue
        }
        if (l === 'reply') {
          e.reply = u
          continue
        }
        if (l === 'mention') {
          e.mentions.push(u)
          continue
        }
        ;(n ? (r = u) : (n = u), e.mentions.push(u))
        continue
      }
      if (s[0] === 'q' && s[1]) {
        let [i, a, c] = s
        e.quotes.push({ id: a, relays: c ? [c] : [] })
      }
      if (s[0] === 'p' && s[1]) {
        e.profiles.push({ pubkey: s[1], relays: s[2] ? [s[2]] : [] })
        continue
      }
    }
    return (
      e.root || (e.root = r || n || e.reply),
      e.reply || (e.reply = n || e.root),
      [e.reply, e.root].forEach(o => {
        if (!o) return
        let s = e.mentions.indexOf(o)
        if ((s !== -1 && e.mentions.splice(s, 1), o.author)) {
          let i = e.profiles.find(a => a.pubkey === o.author)
          i &&
            i.relays &&
            (o.relays || (o.relays = []),
            i.relays.forEach(a => {
              o.relays?.indexOf(a) === -1 && o.relays.push(a)
            }),
            (i.relays = o.relays))
        }
      }),
      e.mentions.forEach(o => {
        if (o.author) {
          let s = e.profiles.find(i => i.pubkey === o.author)
          s &&
            s.relays &&
            (o.relays || (o.relays = []),
            s.relays.forEach(i => {
              o.relays.indexOf(i) === -1 && o.relays.push(i)
            }),
            (s.relays = o.relays))
        }
      }),
      e
    )
  }
  var tl = {}
  W(tl, { fetchRelayInformation: () => rl, useFetchImplementation: () => nl })
  var os
  try {
    os = fetch
  } catch {}
  function nl(t) {
    os = t
  }
  async function rl(t) {
    return await (
      await fetch(t.replace('ws://', 'http://').replace('wss://', 'https://'), {
        headers: { Accept: 'application/nostr+json' },
      })
    ).json()
  }
  var ol = {}
  W(ol, { fastEventHash: () => is, getPow: () => ss, minePow: () => sl })
  function ss(t) {
    let e = 0
    for (let n = 0; n < 64; n += 8) {
      let r = parseInt(t.substring(n, n + 8), 16)
      if (r === 0) e += 32
      else {
        e += Math.clz32(r)
        break
      }
    }
    return e
  }
  function sl(t, e) {
    let n = 0,
      r = t,
      o = ['nonce', n.toString(), e.toString()]
    for (r.tags.push(o); ; ) {
      let s = Math.floor(new Date().getTime() / 1e3)
      if (
        (s !== r.created_at && ((n = 0), (r.created_at = s)),
        (o[1] = (++n).toString()),
        (r.id = is(r)),
        ss(r.id) >= e)
      )
        break
    }
    return r
  }
  function is(t) {
    return z(ge(de.encode(JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content]))))
  }
  var il = {}
  W(il, {
    unwrapEvent: () => ml,
    unwrapManyEvents: () => bl,
    wrapEvent: () => bs,
    wrapManyEvents: () => wl,
  })
  var al = {}
  W(al, {
    createRumor: () => gs,
    createSeal: () => ys,
    createWrap: () => ws,
    unwrapEvent: () => mr,
    unwrapManyEvents: () => ms,
    wrapEvent: () => Yt,
    wrapManyEvents: () => gl,
  })
  var cl = {}
  W(cl, { decrypt: () => wr, encrypt: () => yr, getConversationKey: () => pr, v2: () => hl })
  var as = 1,
    cs = 65535
  function pr(t, e) {
    let n = Ue.getSharedSecret(t, '02' + e).subarray(1, 33)
    return Oo(ge, n, 'nip44-v2')
  }
  function ls(t, e) {
    let n = Po(ge, t, e, 76)
    return {
      chacha_key: n.subarray(0, 32),
      chacha_nonce: n.subarray(32, 44),
      hmac_key: n.subarray(44, 76),
    }
  }
  function gr(t) {
    if (!Number.isSafeInteger(t) || t < 1) throw new Error('expected positive integer')
    if (t <= 32) return 32
    let e = 1 << (Math.floor(Math.log2(t - 1)) + 1),
      n = e <= 256 ? 32 : e / 8
    return n * (Math.floor((t - 1) / n) + 1)
  }
  function ll(t) {
    if (!Number.isSafeInteger(t) || t < as || t > cs)
      throw new Error('invalid plaintext size: must be between 1 and 65535 bytes')
    let e = new Uint8Array(2)
    return (new DataView(e.buffer).setUint16(0, t, !1), e)
  }
  function fl(t) {
    let e = de.encode(t),
      n = e.length,
      r = ll(n),
      o = new Uint8Array(gr(n) - n)
    return rt(r, e, o)
  }
  function ul(t) {
    let e = new DataView(t.buffer).getUint16(0),
      n = t.subarray(2, 2 + e)
    if (e < as || e > cs || n.length !== e || t.length !== 2 + gr(e))
      throw new Error('invalid padding')
    return ke.decode(n)
  }
  function fs(t, e, n) {
    if (n.length !== 32) throw new Error('AAD associated data must be 32 bytes')
    let r = rt(n, e)
    return at(ge, t, r)
  }
  function dl(t) {
    if (typeof t != 'string') throw new Error('payload must be a valid string')
    let e = t.length
    if (e < 132 || e > 87472) throw new Error('invalid payload length: ' + e)
    if (t[0] === '#') throw new Error('unknown encryption version')
    let n
    try {
      n = ie.decode(t)
    } catch (s) {
      throw new Error('invalid base64: ' + s.message)
    }
    let r = n.length
    if (r < 99 || r > 65603) throw new Error('invalid data length: ' + r)
    let o = n[0]
    if (o !== 2) throw new Error('unknown encryption version ' + o)
    return { nonce: n.subarray(1, 33), ciphertext: n.subarray(33, -32), mac: n.subarray(-32) }
  }
  function yr(t, e, n = $t(32)) {
    let { chacha_key: r, chacha_nonce: o, hmac_key: s } = ls(e, n),
      i = fl(t),
      a = Gt(r, o, i),
      c = fs(s, a, n)
    return ie.encode(rt(new Uint8Array([2]), n, a, c))
  }
  function wr(t, e) {
    let { nonce: n, ciphertext: r, mac: o } = dl(t),
      { chacha_key: s, chacha_nonce: i, hmac_key: a } = ls(e, n),
      c = fs(a, r, n)
    if (!Ze(c, o)) throw new Error('invalid MAC')
    let l = Gt(s, i, r)
    return ul(l)
  }
  var hl = { utils: { getConversationKey: pr, calcPaddedLen: gr }, encrypt: yr, decrypt: wr },
    pl = 2880 * 60,
    us = () => Math.round(Date.now() / 1e3),
    ds = () => Math.round(us() - Math.random() * pl),
    hs = (t, e) => pr(t, e),
    ps = (t, e, n) => yr(JSON.stringify(t), hs(e, n)),
    $o = (t, e) => JSON.parse(wr(t.content, hs(e, t.pubkey)))
  function gs(t, e) {
    let n = { created_at: us(), content: '', tags: [], ...t, pubkey: tr(e) }
    return ((n.id = Ft(n)), n)
  }
  function ys(t, e, n) {
    return xe({ kind: Do, content: ps(t, e, n), created_at: ds(), tags: [] }, e)
  }
  function ws(t, e) {
    let n = ya()
    return xe({ kind: Fo, content: ps(t, n, e), created_at: ds(), tags: [['p', e]] }, n)
  }
  function Yt(t, e, n) {
    let r = gs(t, e),
      o = ys(r, e, n)
    return ws(o, n)
  }
  function gl(t, e, n) {
    if (!n || n.length === 0) throw new Error('At least one recipient is required.')
    let r = tr(e),
      o = [Yt(t, e, r)]
    return (
      n.forEach(s => {
        o.push(Yt(t, e, s))
      }),
      o
    )
  }
  function mr(t, e) {
    let n = $o(t, e)
    return $o(n, e)
  }
  function ms(t, e) {
    let n = []
    return (
      t.forEach(r => {
        n.push(mr(r, e))
      }),
      n.sort((r, o) => r.created_at - o.created_at),
      n
    )
  }
  function yl(t, e, n, r) {
    let o = { created_at: Math.ceil(Date.now() / 1e3), kind: zo, tags: [], content: e }
    return (
      (Array.isArray(t) ? t : [t]).forEach(({ publicKey: i, relayUrl: a }) => {
        o.tags.push(a ? ['p', i, a] : ['p', i])
      }),
      r && o.tags.push(['e', r.eventId, r.relayUrl || '', 'reply']),
      n && o.tags.push(['subject', n]),
      o
    )
  }
  function bs(t, e, n, r, o) {
    let s = yl(e, n, r, o)
    return Yt(s, t, e.publicKey)
  }
  function wl(t, e, n, r, o) {
    if (!e || e.length === 0) throw new Error('At least one recipient is required.')
    return [{ publicKey: tr(t) }, ...e].map(i => bs(t, i, n, r, o))
  }
  var ml = mr,
    bl = ms,
    xl = {}
  W(xl, {
    finishRepostEvent: () => vl,
    getRepostedEvent: () => El,
    getRepostedEventPointer: () => xs,
  })
  function vl(t, e, n, r) {
    let o,
      s = [...(t.tags ?? []), ['e', e.id, n], ['p', e.pubkey]]
    return (
      e.kind === Wo ? (o = sr) : ((o = ar), s.push(['k', String(e.kind)])),
      xe(
        {
          kind: o,
          tags: s,
          content: t.content === '' || e.tags?.find(i => i[0] === '-') ? '' : JSON.stringify(e),
          created_at: t.created_at,
        },
        r
      )
    )
  }
  function xs(t) {
    if (![sr, ar].includes(t.kind)) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (e !== void 0)
      return { id: e[1], relays: [e[2], n?.[2]].filter(r => typeof r == 'string'), author: n?.[1] }
  }
  function El(t, { skipVerification: e } = {}) {
    let n = xs(t)
    if (n === void 0 || t.content === '') return
    let r
    try {
      r = JSON.parse(t.content)
    } catch {
      return
    }
    if (r.id === n.id && !(!e && !nr(r))) return r
  }
  var Al = {}
  W(Al, { NOSTR_URI_REGEX: () => br, parse: () => Sl, test: () => Tl })
  var br = new RegExp(`nostr:(${es.source})`)
  function Tl(t) {
    return typeof t == 'string' && new RegExp(`^${br.source}$`).test(t)
  }
  function Sl(t) {
    let e = t.match(new RegExp(`^${br.source}$`))
    if (!e) throw new Error(`Invalid Nostr URI: ${t}`)
    return { uri: e[0], value: e[1], decoded: Qt(e[1]) }
  }
  var Bl = {}
  W(Bl, { finishReactionEvent: () => Ll, getReactedEventPointer: () => kl })
  function Ll(t, e, n) {
    let r = e.tags.filter(o => o.length >= 2 && (o[0] === 'e' || o[0] === 'p'))
    return xe(
      {
        ...t,
        kind: ir,
        tags: [...(t.tags ?? []), ...r, ['e', e.id], ['p', e.pubkey]],
        content: t.content ?? '+',
      },
      n
    )
  }
  function kl(t) {
    if (t.kind !== ir) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (!(e === void 0 || n === void 0))
      return { id: e[1], relays: [e[2], n[2]].filter(r => r !== void 0), author: n[1] }
  }
  var Cl = {}
  W(Cl, { parse: () => _l })
  var Il = /\W/m,
    Ho = /\W |\W$|$|,| /m
  function* _l(t) {
    let e = t.length,
      n = 0,
      r = 0
    for (; r < e; ) {
      let o = t.indexOf(':', r)
      if (o === -1) break
      if (t.substring(o - 5, o) === 'nostr') {
        let s = t.substring(o + 60).match(Il),
          i = s ? o + 60 + s.index : e
        try {
          let a,
            { data: c, type: l } = Qt(t.substring(o + 1, i))
          switch (l) {
            case 'npub':
              a = { pubkey: c }
              break
            case 'nsec':
            case 'note':
              r = i + 1
              continue
            default:
              a = c
          }
          ;(n !== o - 5 && (yield { type: 'text', text: t.substring(n, o - 5) }),
            yield { type: 'reference', pointer: a },
            (r = i),
            (n = r))
          continue
        } catch {
          r = o + 1
          continue
        }
      } else if (t.substring(o - 5, o) === 'https' || t.substring(o - 4, o) === 'http') {
        let s = t.substring(o + 4).match(Ho),
          i = s ? o + 4 + s.index : e,
          a = t[o - 1] === 's' ? 5 : 4
        try {
          let c = new URL(t.substring(o - a, i))
          if (c.hostname.indexOf('.') === -1) throw new Error('invalid url')
          if (
            (n !== o - a && (yield { type: 'text', text: t.substring(n, o - a) }),
            /\.(png|jpe?g|gif|webp)$/i.test(c.pathname))
          ) {
            ;(yield { type: 'image', url: c.toString() }, (r = i), (n = r))
            continue
          }
          if (/\.(mp4|avi|webm|mkv)$/i.test(c.pathname)) {
            ;(yield { type: 'video', url: c.toString() }, (r = i), (n = r))
            continue
          }
          if (/\.(mp3|aac|ogg|opus)$/i.test(c.pathname)) {
            ;(yield { type: 'audio', url: c.toString() }, (r = i), (n = r))
            continue
          }
          ;(yield { type: 'url', url: c.toString() }, (r = i), (n = r))
          continue
        } catch {
          r = i + 1
          continue
        }
      } else if (t.substring(o - 3, o) === 'wss' || t.substring(o - 2, o) === 'ws') {
        let s = t.substring(o + 4).match(Ho),
          i = s ? o + 4 + s.index : e,
          a = t[o - 1] === 's' ? 3 : 2
        try {
          let c = new URL(t.substring(o - a, i))
          if (c.hostname.indexOf('.') === -1) throw new Error('invalid ws url')
          ;(n !== o - a && (yield { type: 'text', text: t.substring(n, o - a) }),
            yield { type: 'relay', url: c.toString() },
            (r = i),
            (n = r))
          continue
        } catch {
          r = i + 1
          continue
        }
      } else {
        r = o + 1
        continue
      }
    }
    n !== e && (yield { type: 'text', text: t.substring(n) })
  }
  var Ul = {}
  W(Ul, {
    channelCreateEvent: () => Nl,
    channelHideMessageEvent: () => Pl,
    channelMessageEvent: () => Ol,
    channelMetadataEvent: () => Rl,
    channelMuteUserEvent: () => $l,
  })
  var Nl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe({ kind: jo, tags: [...(t.tags ?? [])], content: n, created_at: t.created_at }, e)
    },
    Rl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: Ko,
          tags: [['e', t.channel_create_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Ol = (t, e) => {
      let n = [['e', t.channel_create_event_id, t.relay_url, 'root']]
      return (
        t.reply_to_channel_message_event_id &&
          n.push(['e', t.reply_to_channel_message_event_id, t.relay_url, 'reply']),
        xe(
          {
            kind: Zo,
            tags: [...n, ...(t.tags ?? [])],
            content: t.content,
            created_at: t.created_at,
          },
          e
        )
      )
    },
    Pl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: Go,
          tags: [['e', t.channel_message_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    $l = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: Jo,
          tags: [['p', t.pubkey_to_mute], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Hl = {}
  W(Hl, {
    EMOJI_SHORTCODE_REGEX: () => vs,
    matchAll: () => Ml,
    regex: () => xr,
    replaceAll: () => ql,
  })
  var vs = /:(\w+):/,
    xr = () => new RegExp(`\\B${vs.source}\\B`, 'g')
  function* Ml(t) {
    let e = t.matchAll(xr())
    for (let n of e)
      try {
        let [r, o] = n
        yield { shortcode: r, name: o, start: n.index, end: n.index + r.length }
      } catch {}
  }
  function ql(t, e) {
    return t.replaceAll(xr(), (n, r) => e({ shortcode: n, name: r }))
  }
  var Vl = {}
  W(Vl, { useFetchImplementation: () => Wl, validateGithub: () => Dl })
  var vr
  try {
    vr = fetch
  } catch {}
  function Wl(t) {
    vr = t
  }
  async function Dl(t, e, n) {
    try {
      return (
        (await (await vr(`https://gist.github.com/${e}/${n}/raw`)).text()) ===
        `Verifying that I control the following Nostr public key: ${t}`
      )
    } catch {
      return !1
    }
  }
  var zl = {}
  W(zl, { makeNwcRequestEvent: () => Kl, parseConnectionString: () => jl })
  function jl(t) {
    let { host: e, pathname: n, searchParams: r } = new URL(t),
      o = n || e,
      s = r.get('relay'),
      i = r.get('secret')
    if (!o || !s || !i) throw new Error('invalid connection string')
    return { pubkey: o, relay: s, secret: i }
  }
  async function Kl(t, e, n) {
    let o = ts(e, t, JSON.stringify({ method: 'pay_invoice', params: { invoice: n } })),
      s = { kind: Xo, created_at: Math.round(Date.now() / 1e3), content: o, tags: [['p', t]] }
    return xe(s, e)
  }
  var Zl = {}
  W(Zl, { normalizeIdentifier: () => Gl })
  function Gl(t) {
    return (
      (t = t.trim().toLowerCase()),
      (t = t.normalize('NFKC')),
      Array.from(t)
        .map(e => (/\p{Letter}/u.test(e) || /\p{Number}/u.test(e) ? e : '-'))
        .join('')
    )
  }
  var Jl = {}
  W(Jl, {
    getSatoshisAmountFromBolt11: () => tf,
    getZapEndpoint: () => Yl,
    makeZapReceipt: () => ef,
    makeZapRequest: () => Xl,
    useFetchImplementation: () => Fl,
    validateZapRequest: () => Ql,
  })
  var Er
  try {
    Er = fetch
  } catch {}
  function Fl(t) {
    Er = t
  }
  async function Yl(t) {
    try {
      let e = '',
        { lud06: n, lud16: r } = JSON.parse(t.content)
      if (r) {
        let [i, a] = r.split('@')
        e = new URL(`/.well-known/lnurlp/${i}`, `https://${a}`).toString()
      } else if (n) {
        let { words: i } = $e.decode(n, 1e3),
          a = $e.fromWords(i)
        e = ke.decode(a)
      } else return null
      let s = await (await Er(e)).json()
      if (s.allowsNostr && s.nostrPubkey) return s.callback
    } catch {}
    return null
  }
  function Xl(t) {
    let e = {
      kind: 9734,
      created_at: Math.round(Date.now() / 1e3),
      content: t.comment || '',
      tags: [
        ['p', 'pubkey' in t ? t.pubkey : t.event.pubkey],
        ['amount', t.amount.toString()],
        ['relays', ...t.relays],
      ],
    }
    if ('event' in t) {
      if ((e.tags.push(['e', t.event.id]), rr(t.event.kind))) {
        let n = ['a', `${t.event.kind}:${t.event.pubkey}:`]
        e.tags.push(n)
      } else if (or(t.event.kind)) {
        let n = t.event.tags.find(([o, s]) => o === 'd' && s)
        if (!n) throw new Error('d tag not found or is empty')
        let r = ['a', `${t.event.kind}:${t.event.pubkey}:${n[1]}`]
        e.tags.push(r)
      }
      e.tags.push(['k', t.event.kind.toString()])
    }
    return e
  }
  function Ql(t) {
    let e
    try {
      e = JSON.parse(t)
    } catch {
      return 'Invalid zap request JSON.'
    }
    if (!Qn(e)) return 'Zap request is not a valid Nostr event.'
    if (!nr(e)) return 'Invalid signature on zap request.'
    let n = e.tags.find(([s, i]) => s === 'p' && i)
    if (!n) return "Zap request doesn't have a 'p' tag."
    if (!n[1].match(/^[a-f0-9]{64}$/)) return "Zap request 'p' tag is not valid hex."
    let r = e.tags.find(([s, i]) => s === 'e' && i)
    return r && !r[1].match(/^[a-f0-9]{64}$/)
      ? "Zap request 'e' tag is not valid hex."
      : e.tags.find(([s, i]) => s === 'relays' && i)
        ? null
        : "Zap request doesn't have a 'relays' tag."
  }
  function ef({ zapRequest: t, preimage: e, bolt11: n, paidAt: r }) {
    let o = JSON.parse(t),
      s = o.tags.filter(([a]) => a === 'e' || a === 'p' || a === 'a'),
      i = {
        kind: 9735,
        created_at: Math.round(r.getTime() / 1e3),
        content: '',
        tags: [...s, ['P', o.pubkey], ['bolt11', n], ['description', t]],
      }
    return (e && i.tags.push(['preimage', e]), i)
  }
  function tf(t) {
    if (t.length < 50) return 0
    t = t.substring(0, 50)
    let e = t.lastIndexOf('1')
    if (e === -1) return 0
    let n = t.substring(0, e)
    if (!n.startsWith('lnbc')) return 0
    let r = n.substring(4)
    if (r.length < 1) return 0
    let o = r[r.length - 1],
      s = o.charCodeAt(0) - 48,
      i = s >= 0 && s <= 9,
      a = r.length - 1
    if ((i && a++, a < 1)) return 0
    let c = parseInt(r.substring(0, a))
    switch (o) {
      case 'm':
        return c * 1e5
      case 'u':
        return c * 100
      case 'n':
        return c / 10
      case 'p':
        return c / 1e4
      default:
        return c * 1e8
    }
  }
  var nf = {}
  W(nf, {
    getToken: () => rf,
    hashPayload: () => Ar,
    unpackEventFromToken: () => As,
    validateEvent: () => Cs,
    validateEventKind: () => Ss,
    validateEventMethodTag: () => Ls,
    validateEventPayloadTag: () => ks,
    validateEventTimestamp: () => Ts,
    validateEventUrlTag: () => Bs,
    validateToken: () => of,
  })
  var Es = 'Nostr '
  async function rf(t, e, n, r = !1, o) {
    let s = {
      kind: cr,
      tags: [
        ['u', t],
        ['method', e],
      ],
      created_at: Math.round(new Date().getTime() / 1e3),
      content: '',
    }
    o && s.tags.push(['payload', Ar(o)])
    let i = await n(s)
    return (r ? Es : '') + ie.encode(de.encode(JSON.stringify(i)))
  }
  async function of(t, e, n) {
    let r = await As(t).catch(s => {
      throw s
    })
    return await Cs(r, e, n).catch(s => {
      throw s
    })
  }
  async function As(t) {
    if (!t) throw new Error('Missing token')
    t = t.replace(Es, '')
    let e = ke.decode(ie.decode(t))
    if (!e || e.length === 0 || !e.startsWith('{')) throw new Error('Invalid token')
    return JSON.parse(e)
  }
  function Ts(t) {
    return t.created_at ? Math.round(new Date().getTime() / 1e3) - t.created_at < 60 : !1
  }
  function Ss(t) {
    return t.kind === cr
  }
  function Bs(t, e) {
    let n = t.tags.find(r => r[0] === 'u')
    return n ? n.length > 0 && n[1] === e : !1
  }
  function Ls(t, e) {
    let n = t.tags.find(r => r[0] === 'method')
    return n ? n.length > 0 && n[1].toLowerCase() === e.toLowerCase() : !1
  }
  function Ar(t) {
    let e = ge(de.encode(JSON.stringify(t)))
    return z(e)
  }
  function ks(t, e) {
    let n = t.tags.find(o => o[0] === 'payload')
    if (!n) return !1
    let r = Ar(e)
    return n.length > 0 && n[1] === r
  }
  async function Cs(t, e, n, r) {
    if (!nr(t)) throw new Error('Invalid nostr event, signature invalid')
    if (!Ss(t)) throw new Error('Invalid nostr event, kind invalid')
    if (!Ts(t)) throw new Error('Invalid nostr event, created_at timestamp invalid')
    if (!Bs(t, e)) throw new Error('Invalid nostr event, url tag invalid')
    if (!Ls(t, n)) throw new Error('Invalid nostr event, method tag invalid')
    if (r && typeof r == 'object' && Object.keys(r).length > 0 && !ks(t, r))
      throw new Error('Invalid nostr event, payload tag does not match request body hash')
    return !0
  }
  function Is(t) {
    try {
      let e = fr.decode(t)
      return e.type === 'nevent'
        ? { type: 'event', data: { id: e.data.id, relays: e.data.relays || [] } }
        : e.type === 'note'
          ? { type: 'event', data: { id: e.data, relays: [] } }
          : e.type === 'naddr'
            ? {
                type: 'address',
                data: {
                  kind: e.data.kind,
                  pubkey: e.data.pubkey,
                  identifier: e.data.identifier,
                  relays: e.data.relays || [],
                },
              }
            : null
    } catch (e) {
      return (console.error('[Nostr Decoder] Failed to decode identifier:', e), null)
    }
  }
  function sf() {
    return ['wss://relay.divine.video', 'wss://relay.nostr.band', 'wss://relay.damus.io']
  }
  function _s(t = [], e = []) {
    let n = [...e, ...t, ...sf()]
    return [...new Set(n)]
  }
  var rn = 'nostube-embed-event-'
  var We = class t {
    static getCachedEvent(e) {
      try {
        let n = rn + e,
          r = localStorage.getItem(n)
        if (!r) return null
        let o = JSON.parse(r)
        return t.isCacheValid(o) ? o.event : (localStorage.removeItem(n), null)
      } catch (n) {
        return (console.error('[EventCache] Cache read error:', n), null)
      }
    }
    static setCachedEvent(e, n) {
      try {
        let r = rn + e,
          o = { event: n, fetchedAt: Date.now() }
        ;(localStorage.setItem(r, JSON.stringify(o)),
          console.log(`[EventCache] Cached event ${e.substring(0, 8)}...`))
      } catch (r) {
        console.error('[EventCache] Cache write error:', r)
      }
    }
    static isCacheValid(e) {
      return !e || !e.fetchedAt ? !1 : Date.now() - e.fetchedAt < 36e5
    }
    static getAddressableKey(e, n, r) {
      return `${e}:${n}:${r}`
    }
    static clearAll() {
      try {
        let e = []
        for (let n = 0; n < localStorage.length; n++) {
          let r = localStorage.key(n)
          r && r.startsWith(rn) && e.push(r)
        }
        ;(e.forEach(n => localStorage.removeItem(n)),
          console.log(`[EventCache] Cleared ${e.length} cached events`))
      } catch (e) {
        console.error('[EventCache] Clear all error:', e)
      }
    }
    static getStats() {
      try {
        let e = 0,
          n = 0,
          r = 0
        for (let o = 0; o < localStorage.length; o++) {
          let s = localStorage.key(o)
          if (s && s.startsWith(rn)) {
            e++
            let i = localStorage.getItem(s)
            if (i) {
              r += i.length
              try {
                let a = JSON.parse(i)
                t.isCacheValid(a) && n++
              } catch {}
            }
          }
        }
        return {
          totalCached: e,
          validCached: n,
          expiredCached: e - n,
          totalSizeBytes: r,
          totalSizeKB: Math.round(r / 1024),
        }
      } catch (e) {
        return (
          console.error('[EventCache] Stats error:', e),
          { totalCached: 0, validCached: 0, expiredCached: 0, totalSizeBytes: 0, totalSizeKB: 0 }
        )
      }
    }
  }
  var on = class {
    constructor(e) {
      ;((this.relays = e), (this.connections = new Map()), (this.subscriptions = new Map()))
    }
    async connectRelay(e) {
      return new Promise((n, r) => {
        let o = setTimeout(() => {
          r(new Error(`Connection timeout: ${e}`))
        }, 1e4)
        try {
          let s = new WebSocket(e)
          ;((s.onopen = () => {
            ;(clearTimeout(o),
              console.log(`[Nostr Client] Connected to ${e}`),
              this.connections.set(e, s),
              n(s))
          }),
            (s.onerror = i => {
              ;(clearTimeout(o), console.error(`[Nostr Client] Connection error ${e}:`, i), r(i))
            }),
            (s.onclose = () => {
              ;(console.log(`[Nostr Client] Disconnected from ${e}`), this.connections.delete(e))
            }))
        } catch (s) {
          ;(clearTimeout(o), r(s))
        }
      })
    }
    async fetchEvent(e) {
      let n
      if (e.type === 'event') n = e.data.id
      else if (e.type === 'address')
        n = We.getAddressableKey(e.data.kind, e.data.pubkey, e.data.identifier)
      else throw new Error('Invalid identifier type')
      let r = We.getCachedEvent(n)
      if (r) return (console.log(`[Nostr Client] Cache hit for event ${n.substring(0, 16)}...`), r)
      console.log(`[Nostr Client] Cache miss for event ${n.substring(0, 16)}...`)
      let o = `embed-${Date.now()}`,
        s
      ;(e.type === 'event'
        ? (s = { ids: [e.data.id] })
        : e.type === 'address' &&
          (s = { kinds: [e.data.kind], authors: [e.data.pubkey], '#d': [e.data.identifier] }),
        console.log('[Nostr Client] Fetching event with filter:', s))
      let i = this.relays.map(c =>
          this.connectRelay(c).catch(
            l => (console.warn(`[Nostr Client] Failed to connect to ${c}:`, l.message), null)
          )
        ),
        a = (await Promise.all(i)).filter(Boolean)
      if (a.length === 0) throw new Error('Failed to connect to any relay')
      return (
        console.log(`[Nostr Client] Connected to ${a.length}/${this.relays.length} relays`),
        new Promise((c, l) => {
          let f = !1,
            u = e.type === 'address',
            p = [],
            y = 0,
            g = a.length,
            d = setTimeout(() => {
              if (!f)
                if (((f = !0), this.closeSubscription(o), u && p.length > 0)) {
                  let h = p.reduce((w, m) => (m.created_at > w.created_at ? m : w))
                  ;(console.log(
                    `[Nostr Client] Returning newest addressable event (created_at: ${h.created_at})`
                  ),
                    We.setCachedEvent(n, h),
                    c(h))
                } else l(new Error('Event not found (timeout)'))
            }, 1e4)
          a.forEach(h => {
            let w = x => {
              try {
                let A = JSON.parse(x.data)
                if (A[0] === 'EVENT' && A[1] === o) {
                  let S = A[2]
                  u
                    ? (p.push(S),
                      console.log(
                        `[Nostr Client] Addressable event received (created_at: ${S.created_at}), total: ${p.length}`
                      ))
                    : f ||
                      ((f = !0),
                      clearTimeout(d),
                      console.log('[Nostr Client] Regular event received, returning immediately'),
                      this.closeSubscription(o),
                      We.setCachedEvent(n, S),
                      c(S))
                }
                if (
                  A[0] === 'EOSE' &&
                  A[1] === o &&
                  (y++, console.log(`[Nostr Client] EOSE received (${y}/${g})`), u && y === g && !f)
                )
                  if (((f = !0), clearTimeout(d), this.closeSubscription(o), p.length > 0)) {
                    let S = p.reduce((T, B) => (B.created_at > T.created_at ? B : T))
                    ;(console.log(
                      `[Nostr Client] All relays responded, returning newest event (created_at: ${S.created_at})`
                    ),
                      We.setCachedEvent(n, S),
                      c(S))
                  } else l(new Error('Addressable event not found on any relay'))
              } catch (A) {
                console.error('[Nostr Client] Failed to parse message:', A)
              }
            }
            ;(h.addEventListener('message', w),
              this.subscriptions.has(o) || this.subscriptions.set(o, []),
              this.subscriptions.get(o).push({ ws: h, handler: w }))
            let m = JSON.stringify(['REQ', o, s])
            ;(h.send(m), console.log('[Nostr Client] Sent REQ to relay:', m))
          })
        })
      )
    }
    closeSubscription(e) {
      let n = this.subscriptions.get(e)
      n &&
        (n.forEach(({ ws: r, handler: o }) => {
          try {
            ;(r.send(JSON.stringify(['CLOSE', e])), r.removeEventListener('message', o))
          } catch {}
        }),
        this.subscriptions.delete(e),
        console.log(`[Nostr Client] Closed subscription ${e}`))
    }
    closeAll() {
      ;(this.subscriptions.forEach((e, n) => {
        this.closeSubscription(n)
      }),
        this.connections.forEach((e, n) => {
          try {
            e.close()
          } catch {}
        }),
        this.connections.clear(),
        console.log('[Nostr Client] All connections closed'))
    }
  }
  function Us(t) {
    let e = t.tags.filter(n => n[0] === 'imeta')
    return e.length > 0 ? af(t, e) : cf(t)
  }
  function af(t, e) {
    let n = e.map(f => lf(f)).filter(Boolean),
      r = n.filter(f => f.mimeType?.startsWith('video/')),
      o = n.filter(f => f.mimeType?.startsWith('image/'))
    ;(e.forEach(f => {
      for (let u = 1; u < f.length; u++) {
        let p = f[u]
        if (p.startsWith('image ')) {
          let y = p.substring(6).trim()
          y && !o.some(g => g.url === y) && o.push({ url: y, fallbackUrls: [] })
        }
      }
    }),
      r.sort((f, u) => {
        let p = sn(f)
        return sn(u) - p
      }))
    let s =
        t.tags.find(f => f[0] === 'title')?.[1] ||
        t.tags.find(f => f[0] === 'alt')?.[1] ||
        t.content ||
        'Untitled Video',
      i = t.content || '',
      a = parseInt(t.tags.find(f => f[0] === 'duration')?.[1] || '0', 10),
      c = t.tags.find(f => f[0] === 'content-warning')?.[1],
      l = t.pubkey
    return {
      id: t.id,
      kind: t.kind,
      title: s,
      description: i,
      author: l,
      createdAt: t.created_at,
      duration: a,
      contentWarning: c,
      videoVariants: r,
      thumbnails: o,
    }
  }
  function cf(t) {
    let e = t.tags.find(u => u[0] === 'url')?.[1] || '',
      n = t.tags.find(u => u[0] === 'm')?.[1] || 'video/mp4',
      r = t.tags.find(u => u[0] === 'thumb')?.[1] || '',
      o = t.tags.find(u => u[0] === 'title')?.[1] || t.content || 'Untitled Video',
      s = t.tags.find(u => u[0] === 'description')?.[1] || t.content || '',
      i = parseInt(t.tags.find(u => u[0] === 'duration')?.[1] || '0', 10),
      a = t.tags.find(u => u[0] === 'content-warning')?.[1],
      c = t.tags.find(u => u[0] === 'dim')?.[1],
      l = e ? [{ url: e, mimeType: n, dimensions: c, fallbackUrls: [] }] : [],
      f = r ? [{ url: r, fallbackUrls: [] }] : []
    return {
      id: t.id,
      kind: t.kind,
      title: o,
      description: s,
      author: t.pubkey,
      createdAt: t.created_at,
      duration: i,
      contentWarning: a,
      videoVariants: l,
      thumbnails: f,
    }
  }
  function lf(t) {
    let e = {}
    for (let n = 1; n < t.length; n++) {
      let r = t[n],
        o = r.indexOf(' ')
      if (o === -1) continue
      let s = r.substring(0, o),
        i = r.substring(o + 1).trim()
      s === 'url'
        ? (e.url = i)
        : s === 'm'
          ? (e.mimeType = i)
          : s === 'dim'
            ? (e.dimensions = i)
            : s === 'size'
              ? (e.size = parseInt(i, 10))
              : s === 'x'
                ? (e.hash = i)
                : (s === 'fallback' || s === 'mirror') &&
                  (e.fallbackUrls || (e.fallbackUrls = []), e.fallbackUrls.push(i))
    }
    return e.url ? (e.fallbackUrls || (e.fallbackUrls = []), e) : null
  }
  function sn(t) {
    if (t.dimensions) {
      let e = t.dimensions.match(/x(\d+)/)
      if (e) return parseInt(e[1], 10)
    }
    return 0
  }
  function Ns(t, e = 'auto') {
    if (!t || t.length === 0) return null
    if (e === 'auto') return t[0]
    let n = parseInt(e, 10)
    if (isNaN(n)) return t[0]
    let r = t[0],
      o = Math.abs(sn(r) - n)
    for (let s of t) {
      let i = sn(s),
        a = Math.abs(i - n)
      a < o && ((r = s), (o = a))
    }
    return r
  }
  var gt = class {
    static buildVideoPlayer(e, n) {
      console.log('[PlayerUI] Building video player with params:', n)
      let r = this.createVideoElement(n)
      return (
        this.addVideoSources(r, e.videoVariants),
        this.setPoster(r, e.thumbnails),
        n.startTime > 0 && this.setStartTime(r, n.startTime),
        this.addErrorHandling(r),
        console.log('[PlayerUI] Video player built successfully'),
        r
      )
    }
    static createVideoElement(e) {
      let n = document.createElement('video')
      return (
        (n.className = 'nostube-video'),
        (n.preload = 'metadata'),
        e.autoplay && ((n.autoplay = !0), (n.muted = !0)),
        e.muted && (n.muted = !0),
        e.loop && (n.loop = !0),
        e.controls && (n.controls = !0),
        n.setAttribute('playsinline', ''),
        n.setAttribute('webkit-playsinline', ''),
        n
      )
    }
    static addVideoSources(e, n) {
      if (!n || n.length === 0) throw new Error('No video sources available')
      ;(console.log(`[PlayerUI] Adding ${n.length} video variants as sources`),
        n.forEach((o, s) => {
          let i = document.createElement('source')
          ;((i.src = o.url),
            o.mimeType && (i.type = o.mimeType),
            e.appendChild(i),
            console.log(`[PlayerUI] Added source ${s + 1}: ${o.url}`),
            o.fallbackUrls &&
              o.fallbackUrls.length > 0 &&
              o.fallbackUrls.forEach((a, c) => {
                let l = document.createElement('source')
                ;((l.src = a),
                  o.mimeType && (l.type = o.mimeType),
                  e.appendChild(l),
                  console.log(`[PlayerUI] Added fallback ${c + 1} for variant ${s + 1}: ${a}`))
              }))
        }))
      let r = document.createElement('p')
      ;((r.textContent = 'Your browser does not support the video tag.'),
        (r.style.color = '#999'),
        (r.style.textAlign = 'center'),
        (r.style.padding = '20px'),
        e.appendChild(r))
    }
    static setPoster(e, n) {
      if (!n || n.length === 0) {
        console.log('[PlayerUI] No thumbnail available')
        return
      }
      let r = n[0]
      r.url && ((e.poster = r.url), console.log('[PlayerUI] Set poster:', r.url))
    }
    static setStartTime(e, n) {
      console.log(`[PlayerUI] Setting start time: ${n}s`)
      let r = () => {
        ;(e.duration >= n
          ? ((e.currentTime = n), console.log(`[PlayerUI] Seeked to ${n}s`))
          : console.warn(`[PlayerUI] Start time ${n}s exceeds video duration ${e.duration}s`),
          e.removeEventListener('loadedmetadata', r))
      }
      e.readyState >= 1 ? r() : e.addEventListener('loadedmetadata', r)
    }
    static addErrorHandling(e) {
      ;(e.addEventListener('error', n => {
        let r = e.error,
          o = 'Video failed to load'
        if (r)
          switch (r.code) {
            case r.MEDIA_ERR_ABORTED:
              o = 'Video loading aborted'
              break
            case r.MEDIA_ERR_NETWORK:
              o = 'Network error while loading video'
              break
            case r.MEDIA_ERR_DECODE:
              o = 'Video decoding error'
              break
            case r.MEDIA_ERR_SRC_NOT_SUPPORTED:
              o = 'Video format not supported'
              break
          }
        console.error('[PlayerUI] Video error:', o, r)
      }),
        e.addEventListener('loadeddata', () => {
          console.log('[PlayerUI] Video loaded successfully')
        }),
        e.addEventListener('canplay', () => {
          console.log('[PlayerUI] Video ready to play')
        }))
    }
    static createPlayerContainer(e) {
      let n = document.createElement('div')
      return ((n.className = 'nostube-player-container'), n.appendChild(e), n)
    }
  }
  var an = class t {
    static getWarningMessage(e) {
      return e?.contentWarning
        ? e.contentWarning
        : (e?.event?.tags || []).find(o => o[0] === 'content-warning')?.[1] || null
    }
    static createOverlay(e, n) {
      let r = document.createElement('div')
      r.className = 'content-warning-overlay'
      let o = document.createElement('div')
      ;((o.className = 'content-warning-background'), n && (o.style.backgroundImage = `url(${n})`))
      let s = document.createElement('div')
      s.className = 'content-warning-dark-overlay'
      let i = document.createElement('div')
      i.className = 'content-warning-content'
      let a = document.createElement('div')
      ;((a.className = 'content-warning-icon'),
        a.setAttribute('aria-hidden', 'true'),
        (a.textContent = '\u26A0\uFE0F'))
      let c = document.createElement('h2')
      ;((c.className = 'content-warning-heading'), (c.textContent = 'Sensitive Content'))
      let l = document.createElement('p')
      ;((l.className = 'content-warning-message'),
        (l.textContent = e || 'This video may contain sensitive content'))
      let f = document.createElement('button')
      return (
        (f.className = 'content-warning-button'),
        (f.textContent = 'Click to reveal'),
        f.setAttribute('type', 'button'),
        f.setAttribute('aria-label', 'Reveal sensitive content'),
        i.appendChild(a),
        i.appendChild(c),
        i.appendChild(l),
        i.appendChild(f),
        r.appendChild(o),
        r.appendChild(s),
        r.appendChild(i),
        r
      )
    }
    static applyToPlayer(e, n, r) {
      let o = t.getWarningMessage(r)
      if (!o) return
      console.log('[ContentWarning] Applying content warning:', o)
      let s = n.poster || r.thumbnails?.[0]?.url || '',
        i = t.createOverlay(o, s)
      ;((n.controls = !1),
        n.pause(),
        i.addEventListener('click', () => {
          ;(console.log('[ContentWarning] Content revealed by user'), i.remove(), (n.controls = !0))
        }),
        i.addEventListener('keydown', a => {
          ;(a.key === 'Enter' || a.key === ' ') && (a.preventDefault(), i.click())
        }),
        i.setAttribute('tabindex', '0'),
        i.setAttribute('role', 'button'),
        i.setAttribute('aria-label', 'Sensitive content warning. Press Enter to reveal.'),
        e.appendChild(i),
        console.log('[ContentWarning] Overlay applied successfully'))
    }
  }
  var yt = class t {
    static createOverlay(e) {
      let n = document.createElement('div')
      ;((n.className = 'title-overlay'), n.setAttribute('aria-hidden', 'true'))
      let r = document.createElement('div')
      r.className = 'title-section'
      let o = document.createElement('h1')
      ;((o.className = 'video-title'),
        (o.textContent = t.truncateTitle(e.title || 'Untitled Video')),
        r.appendChild(o))
      let s = document.createElement('div')
      s.className = 'author-section'
      let i = document.createElement('img')
      ;((i.className = 'author-avatar'),
        (i.src = e.authorAvatar || t.getDefaultAvatar()),
        (i.alt = e.authorName || 'Author'),
        (i.onerror = () => {
          i.src = t.getDefaultAvatar()
        }))
      let a = document.createElement('p')
      return (
        (a.className = 'author-name'),
        (a.textContent = e.authorName || t.formatPubkey(e.author)),
        s.appendChild(i),
        s.appendChild(a),
        n.appendChild(r),
        n.appendChild(s),
        n
      )
    }
    static applyToPlayer(e, n, r, o) {
      if (!o.showTitle) {
        console.log('[TitleOverlay] Title overlay disabled via title=0 parameter')
        return
      }
      console.log('[TitleOverlay] Applying title overlay')
      let s = t.createOverlay(r)
      e.appendChild(s)
      let i = null,
        a = () => {
          ;(clearTimeout(i),
            (i = setTimeout(() => {
              n.paused || t.hide(s)
            }, 3e3)))
        }
      ;(e.addEventListener('mouseenter', () => {
        ;(clearTimeout(i), t.show(s))
      }),
        e.addEventListener('mouseleave', () => {
          n.paused || t.hide(s)
        }),
        n.addEventListener('pause', () => {
          ;(clearTimeout(i), t.show(s))
        }),
        n.addEventListener('play', () => {
          ;(clearTimeout(i), t.hide(s))
        }),
        a(),
        console.log('[TitleOverlay] Overlay applied successfully'))
    }
    static show(e) {
      e.classList.remove('hidden')
    }
    static hide(e) {
      e.classList.add('hidden')
    }
    static truncateTitle(e, n = 70) {
      return e ? (e.length <= n ? e : e.substring(0, n) + '...') : 'Untitled Video'
    }
    static formatPubkey(e) {
      return !e || e.length < 12
        ? 'Anonymous'
        : `${e.substring(0, 8)}...${e.substring(e.length - 4)}`
    }
    static getDefaultAvatar() {
      return (
        'data:image/svg+xml,' +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
        <rect width="32" height="32" fill="#6b7280"/>
        <circle cx="16" cy="12" r="5" fill="#fff"/>
        <path d="M 8 26 Q 8 20 16 20 Q 24 20 24 26 Z" fill="#fff"/>
      </svg>
    `)
      )
    }
    static updateProfile(e, n) {
      if (!e) {
        console.warn('[TitleOverlay] Cannot update profile: overlay not found')
        return
      }
      if (!n) {
        console.warn('[TitleOverlay] Cannot update profile: profile is null')
        return
      }
      console.log('[TitleOverlay] Updating profile:', n)
      let r = e.querySelector('.author-avatar')
      r && n.picture && ((r.src = n.picture), console.log('[TitleOverlay] Updated avatar'))
      let o = e.querySelector('.author-name')
      if (o) {
        let s = n.displayName || n.name
        s && ((o.textContent = s), console.log('[TitleOverlay] Updated author name to:', s))
      }
    }
  }
  var cn = class t {
    static generateVideoUrl(e) {
      return `https://nostu.be/video/${e}`
    }
    static createLogoSvg() {
      let e = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      ;(e.setAttribute('class', 'branding-logo'),
        e.setAttribute('viewBox', '0 0 72 72'),
        e.setAttribute('width', '32'),
        e.setAttribute('height', '32'))
      let n = document.createElementNS('http://www.w3.org/2000/svg', 'defs'),
        r = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
      ;(r.setAttribute('id', 'logo-gradient'),
        r.setAttribute('x1', '0%'),
        r.setAttribute('y1', '0%'),
        r.setAttribute('x2', '100%'),
        r.setAttribute('y2', '100%'))
      let o = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      ;(o.setAttribute('offset', '0%'),
        o.setAttribute('style', 'stop-color:#9e51ff;stop-opacity:1'))
      let s = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      ;(s.setAttribute('offset', '50%'),
        s.setAttribute('style', 'stop-color:#8e51ff;stop-opacity:1'))
      let i = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      ;(i.setAttribute('offset', '100%'),
        i.setAttribute('style', 'stop-color:#7524ff;stop-opacity:1'),
        r.appendChild(o),
        r.appendChild(s),
        r.appendChild(i),
        n.appendChild(r),
        e.appendChild(n))
      let a = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      ;(a.setAttribute('cx', '36'),
        a.setAttribute('cy', '36'),
        a.setAttribute('r', '36'),
        a.setAttribute('fill', 'url(#logo-gradient)'))
      let c = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      return (
        c.setAttribute('d', 'M 28 22 L 28 50 L 50 36 Z'),
        c.setAttribute('fill', '#ffffff'),
        e.appendChild(a),
        e.appendChild(c),
        e
      )
    }
    static createLink(e) {
      let n = document.createElement('a')
      ;((n.className = 'branding-link'),
        (n.href = t.generateVideoUrl(e)),
        (n.target = '_blank'),
        (n.rel = 'noopener noreferrer'),
        n.setAttribute('aria-label', 'Watch on Nostube'))
      let r = t.createLogoSvg()
      return (n.appendChild(r), n)
    }
    static show(e) {
      e.classList.remove('hidden')
    }
    static hide(e) {
      e.classList.add('hidden')
    }
    static applyToPlayer(e, n, r, o) {
      if (!o.showBranding) {
        console.log('[BrandingLink] Branding link disabled via branding=0 parameter')
        return
      }
      console.log('[BrandingLink] Applying branding link')
      let s = t.createLink(r)
      e.appendChild(s)
      let i = null,
        a = () => {
          ;(clearTimeout(i),
            (i = setTimeout(() => {
              n.paused || t.hide(s)
            }, 3e3)))
        }
      ;(e.addEventListener('mouseenter', () => {
        ;(clearTimeout(i), t.show(s))
      }),
        e.addEventListener('mouseleave', () => {
          n.paused || t.hide(s)
        }),
        n.addEventListener('pause', () => {
          ;(clearTimeout(i), t.show(s))
        }),
        n.addEventListener('play', () => {
          ;(clearTimeout(i), t.hide(s))
        }),
        a(),
        console.log('[BrandingLink] Branding link applied successfully'))
    }
  }
  var Rs = 'nostube-embed-profile-'
  var ln = class t {
    constructor(e) {
      this.client = e
    }
    async fetchProfile(e, n) {
      if (!e || !n || n.length === 0)
        return (console.warn('[ProfileFetcher] Invalid pubkey or relays'), null)
      let r = t.getCachedProfile(e)
      if (r) return (console.log(`[ProfileFetcher] Cache hit for ${e.substring(0, 8)}...`), r)
      console.log(`[ProfileFetcher] Cache miss, fetching from relays for ${e.substring(0, 8)}...`)
      try {
        let o = await this.fetchFromRelays(e, n)
        return o ? (t.setCachedProfile(e, o), o) : null
      } catch (o) {
        return (console.error('[ProfileFetcher] Fetch failed:', o.message), null)
      }
    }
    async fetchFromRelays(e, n) {
      let r = `profile-${Date.now()}`,
        o = { kinds: [0], authors: [e], limit: 1 }
      console.log('[ProfileFetcher] Fetching with filter:', o)
      let s = n.map(a =>
          this.client
            .connectRelay(a)
            .catch(
              c => (console.warn(`[ProfileFetcher] Failed to connect to ${a}:`, c.message), null)
            )
        ),
        i = (await Promise.all(s)).filter(Boolean)
      return i.length === 0
        ? (console.warn('[ProfileFetcher] Failed to connect to any relay'), null)
        : (console.log(`[ProfileFetcher] Connected to ${i.length}/${n.length} relays`),
          new Promise((a, c) => {
            let l = !1,
              f = null,
              u = 0,
              p = i.length,
              y = setTimeout(() => {
                if (!l)
                  if (((l = !0), this.client.closeSubscription(r), f)) {
                    let g = t.parseProfileMetadata(f)
                    ;(console.log('[ProfileFetcher] Timeout, returning latest profile'), a(g))
                  } else (console.warn('[ProfileFetcher] Timeout, no profile found'), a(null))
              }, 5e3)
            i.forEach(g => {
              let d = w => {
                try {
                  let m = JSON.parse(w.data)
                  if (m[0] === 'EVENT' && m[1] === r) {
                    let x = m[2]
                    ;(!f || x.created_at > f.created_at) &&
                      ((f = x),
                      console.log(
                        `[ProfileFetcher] Profile event received (created_at: ${x.created_at})`
                      ))
                  }
                  if (
                    m[0] === 'EOSE' &&
                    m[1] === r &&
                    (u++, console.log(`[ProfileFetcher] EOSE received (${u}/${p})`), u === p && !l)
                  )
                    if (((l = !0), clearTimeout(y), this.client.closeSubscription(r), f)) {
                      let x = t.parseProfileMetadata(f)
                      ;(console.log('[ProfileFetcher] All relays responded, returning profile'),
                        a(x))
                    } else (console.warn('[ProfileFetcher] No profile found on any relay'), a(null))
                } catch (m) {
                  console.error('[ProfileFetcher] Failed to parse message:', m)
                }
              }
              ;(g.addEventListener('message', d),
                this.client.subscriptions.has(r) || this.client.subscriptions.set(r, []),
                this.client.subscriptions.get(r).push({ ws: g, handler: d }))
              let h = JSON.stringify(['REQ', r, o])
              ;(g.send(h), console.log('[ProfileFetcher] Sent REQ to relay'))
            })
          }))
    }
    static parseProfileMetadata(e) {
      try {
        let n = JSON.parse(e.content)
        return {
          picture: n.picture || null,
          displayName: n.display_name || null,
          name: n.name || null,
          nip05: n.nip05 || null,
          about: n.about || null,
        }
      } catch (n) {
        return (
          console.error('[ProfileFetcher] Failed to parse profile JSON:', n),
          { picture: null, displayName: null, name: null, nip05: null, about: null }
        )
      }
    }
    static getCachedProfile(e) {
      try {
        let n = Rs + e,
          r = localStorage.getItem(n)
        if (!r) return null
        let o = JSON.parse(r)
        return t.isCacheValid(o) ? o.profile : (localStorage.removeItem(n), null)
      } catch (n) {
        return (console.error('[ProfileFetcher] Cache read error:', n), null)
      }
    }
    static setCachedProfile(e, n) {
      try {
        let r = Rs + e,
          o = { profile: n, fetchedAt: Date.now() }
        ;(localStorage.setItem(r, JSON.stringify(o)),
          console.log(`[ProfileFetcher] Cached profile for ${e.substring(0, 8)}...`))
      } catch (r) {
        console.error('[ProfileFetcher] Cache write error:', r)
      }
    }
    static isCacheValid(e) {
      return !e || !e.fetchedAt ? !1 : Date.now() - e.fetchedAt < 864e5
    }
  }
  var wt = null,
    Tr = null
  async function Os() {
    console.log('[Nostube Embed] Initializing player...')
    try {
      let t = Cr(),
        e = Ir(t)
      if (!e.valid) {
        Je(e.error)
        return
      }
      ff('Loading video...')
      let n = Is(t.videoId)
      if (!n) {
        Je('Failed to decode video identifier')
        return
      }
      let r = _s(n.data.relays, t.customRelays)
      ;((wt = new on(r)), (Tr = new ln(wt)))
      let o = null
      n.type === 'address' &&
        n.data.pubkey &&
        (console.log('[Nostube Embed] Starting parallel profile fetch (naddr)'),
        (o = Tr.fetchProfile(n.data.pubkey, r)))
      let s = await wt.fetchEvent(n),
        i = Us(s)
      ;(console.log('[Nostube Embed] Parsed video:', i),
        n.type === 'event' &&
          i.author &&
          (console.log('[Nostube Embed] Starting profile fetch (nevent)'),
          (o = Tr.fetchProfile(i.author, r))))
      let a = Ns(i.videoVariants, t.preferredQuality)
      if (!a) {
        Je('No video URLs found in event')
        return
      }
      console.log('[Nostube Embed] Selected variant:', a)
      try {
        let c = gt.buildVideoPlayer(i, t),
          l = gt.createPlayerContainer(c)
        an.applyToPlayer(l, c, i)
        let f = null
        ;(t.showTitle && (yt.applyToPlayer(l, c, i, t), (f = l.querySelector('.title-overlay'))),
          cn.applyToPlayer(l, c, t.videoId, t),
          (document.body.innerHTML = ''),
          document.body.appendChild(l),
          o &&
            f &&
            o
              .then(u => {
                u
                  ? (console.log('[Nostube Embed] Profile fetched, updating overlay'),
                    yt.updateProfile(f, u))
                  : console.log('[Nostube Embed] Profile fetch returned null, using fallback')
              })
              .catch(u => {
                console.warn('[Nostube Embed] Profile fetch error:', u.message)
              }),
          c.addEventListener(
            'canplay',
            () => {
              console.log('[Nostube Embed] Player ready')
            },
            { once: !0 }
          ))
      } catch (c) {
        ;(console.error('[Nostube Embed] Player error:', c),
          Je(`Failed to initialize player: ${c.message}`))
        return
      }
    } catch (t) {
      ;(console.error('[Nostube Embed] Error:', t),
        t.message.includes('timeout')
          ? Je('Connection failed. Unable to fetch video.')
          : t.message.includes('not found')
            ? Je('Video not found')
            : Je(t.message))
    }
  }
  function ff(t) {
    document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px; animation: spin 1s linear infinite;">
          \u23F3
        </div>
        <div style="font-size: 14px; color: #999;">${t}</div>
      </div>
    </div>
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `
  }
  function Je(t) {
    document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px;">\u26A0\uFE0F</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Error</div>
        <div style="font-size: 14px; color: #999;">${t}</div>
      </div>
    </div>
  `
  }
  window.addEventListener('beforeunload', () => {
    wt && wt.closeAll()
  })
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', Os) : Os()
})()
/*! Bundled license information:

@noble/hashes/esm/utils.js:
@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/utils.js:
@noble/curves/esm/abstract/modular.js:
@noble/curves/esm/abstract/curve.js:
@noble/curves/esm/abstract/weierstrass.js:
@noble/curves/esm/_shortw_utils.js:
@noble/curves/esm/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/base/lib/esm/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/ciphers/esm/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)
*/
