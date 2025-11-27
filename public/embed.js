/* Nostube Embed Player v0.1.0 | https://nostube.com */
;(() => {
  var Br = Object.defineProperty
  var Rs = (t, e, n) =>
    e in t ? Br(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (t[e] = n)
  var Os = (t, e) => {
    for (var n in e) Br(t, n, { get: e[n], enumerable: !0 })
  }
  var Ye = (t, e, n) => Rs(t, typeof e != 'symbol' ? e + '' : e, n)
  function Lr() {
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
  function kr(t) {
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
  function Ir(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function cn(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function _r(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(Ir(t.outputLen), Ir(t.blockLen))
  }
  function Qe(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Ur(t, e) {
    cn(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var mt = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Cr = t => t instanceof Uint8Array
  var bt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    le = (t, e) => (t << (32 - e)) | (t >>> e),
    Ps = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Ps) throw new Error('Non little-endian hardware is not supported')
  function $s(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function ct(t) {
    if ((typeof t == 'string' && (t = $s(t)), !Cr(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function Nr(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!Cr(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var Xe = class {
      clone() {
        return this._cloneInto()
      }
    },
    pf = {}.toString
  function Rr(t) {
    let e = r => t().update(ct(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function xt(t = 32) {
    if (mt && typeof mt.getRandomValues == 'function') return mt.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function Hs(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var vt = class extends Xe {
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
        (this.view = bt(this.buffer)))
    }
    update(e) {
      Qe(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = ct(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = bt(e)
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
      ;(Qe(this), Ur(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let u = i; u < o; u++) n[u] = 0
      ;(Hs(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = bt(e),
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
  var Ms = (t, e, n) => (t & e) ^ (~t & n),
    qs = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    Vs = new Uint32Array([
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
    Ie = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    _e = new Uint32Array(64),
    ln = class extends vt {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = Ie[0] | 0),
          (this.B = Ie[1] | 0),
          (this.C = Ie[2] | 0),
          (this.D = Ie[3] | 0),
          (this.E = Ie[4] | 0),
          (this.F = Ie[5] | 0),
          (this.G = Ie[6] | 0),
          (this.H = Ie[7] | 0))
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
        for (let u = 0; u < 16; u++, n += 4) _e[u] = e.getUint32(n, !1)
        for (let u = 16; u < 64; u++) {
          let g = _e[u - 15],
            y = _e[u - 2],
            p = le(g, 7) ^ le(g, 18) ^ (g >>> 3),
            d = le(y, 17) ^ le(y, 19) ^ (y >>> 10)
          _e[u] = (d + _e[u - 7] + p + _e[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let g = le(a, 6) ^ le(a, 11) ^ le(a, 25),
            y = (f + g + Ms(a, c, l) + Vs[u] + _e[u]) | 0,
            d = ((le(r, 2) ^ le(r, 13) ^ le(r, 22)) + qs(r, o, s)) | 0
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
        _e.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    }
  var Et = Rr(() => new ln())
  var hn = {}
  Os(hn, {
    bitGet: () => Gs,
    bitLen: () => Zs,
    bitMask: () => lt,
    bitSet: () => Js,
    bytesToHex: () => We,
    bytesToNumberBE: () => J,
    bytesToNumberLE: () => St,
    concatBytes: () => ve,
    createHmacDrbg: () => dn,
    ensureBytes: () => z,
    equalBytes: () => zs,
    hexToBytes: () => De,
    hexToNumber: () => un,
    numberToBytesBE: () => fe,
    numberToBytesLE: () => Bt,
    numberToHexUnpadded: () => $r,
    numberToVarBytesBE: () => js,
    utf8ToBytes: () => Ks,
    validateObject: () => Ue,
  })
  var Pr = BigInt(0),
    Tt = BigInt(1),
    Ws = BigInt(2),
    At = t => t instanceof Uint8Array,
    Ds = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function We(t) {
    if (!At(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += Ds[t[n]]
    return e
  }
  function $r(t) {
    let e = t.toString(16)
    return e.length & 1 ? `0${e}` : e
  }
  function un(t) {
    if (typeof t != 'string') throw new Error('hex string expected, got ' + typeof t)
    return BigInt(t === '' ? '0' : `0x${t}`)
  }
  function De(t) {
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
    return un(We(t))
  }
  function St(t) {
    if (!At(t)) throw new Error('Uint8Array expected')
    return un(We(Uint8Array.from(t).reverse()))
  }
  function fe(t, e) {
    return De(t.toString(16).padStart(e * 2, '0'))
  }
  function Bt(t, e) {
    return fe(t, e).reverse()
  }
  function js(t) {
    return De($r(t))
  }
  function z(t, e, n) {
    let r
    if (typeof e == 'string')
      try {
        r = De(e)
      } catch (s) {
        throw new Error(`${t} must be valid hex string, got "${e}". Cause: ${s}`)
      }
    else if (At(e)) r = Uint8Array.from(e)
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
        if (!At(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  function zs(t, e) {
    if (t.length !== e.length) return !1
    for (let n = 0; n < t.length; n++) if (t[n] !== e[n]) return !1
    return !0
  }
  function Ks(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Zs(t) {
    let e
    for (e = 0; t > Pr; t >>= Tt, e += 1);
    return e
  }
  function Gs(t, e) {
    return (t >> BigInt(e)) & Tt
  }
  var Js = (t, e, n) => t | ((n ? Tt : Pr) << BigInt(e)),
    lt = t => (Ws << BigInt(t - 1)) - Tt,
    fn = t => new Uint8Array(t),
    Or = t => Uint8Array.from(t)
  function dn(t, e, n) {
    if (typeof t != 'number' || t < 2) throw new Error('hashLen must be a number')
    if (typeof e != 'number' || e < 2) throw new Error('qByteLen must be a number')
    if (typeof n != 'function') throw new Error('hmacFn must be a function')
    let r = fn(t),
      o = fn(t),
      s = 0,
      i = () => {
        ;(r.fill(1), o.fill(0), (s = 0))
      },
      a = (...u) => n(o, r, ...u),
      c = (u = fn()) => {
        ;((o = a(Or([0]), u)), (r = a()), u.length !== 0 && ((o = a(Or([1]), u)), (r = a())))
      },
      l = () => {
        if (s++ >= 1e3) throw new Error('drbg: tried 1000 values')
        let u = 0,
          g = []
        for (; u < e; ) {
          r = a()
          let y = r.slice()
          ;(g.push(y), (u += r.length))
        }
        return ve(...g)
      }
    return (u, g) => {
      ;(i(), c(u))
      let y
      for (; !(y = g(l())); ) c()
      return (i(), y)
    }
  }
  var Fs = {
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
  function Ue(t, e, n = {}) {
    let r = (o, s, i) => {
      let a = Fs[s]
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
    Ys = BigInt(3),
    pn = BigInt(4),
    Hr = BigInt(5),
    Mr = BigInt(8),
    Qs = BigInt(9),
    Xs = BigInt(16)
  function K(t, e) {
    let n = t % e
    return n >= Z ? n : e + n
  }
  function ei(t, e, n) {
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
  function Lt(t, e) {
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
        g = s - a * l
      ;((r = n), (n = f), (o = i), (s = a), (i = u), (a = g))
    }
    if (r !== D) throw new Error('invert: does not exist')
    return K(o, e)
  }
  function ti(t) {
    let e = (t - D) / je,
      n,
      r,
      o
    for (n = t - D, r = 0; n % je === Z; n /= je, r++);
    for (o = je; o < t && ei(o, e, t) !== t - D; o++);
    if (r === 1) {
      let i = (t + D) / pn
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
        g = a.pow(c, n)
      for (; !a.eql(g, a.ONE); ) {
        if (a.eql(g, a.ZERO)) return a.ZERO
        let y = 1
        for (let d = a.sqr(g); y < l && !a.eql(d, a.ONE); y++) d = a.sqr(d)
        let p = a.pow(f, D << BigInt(l - y - 1))
        ;((f = a.sqr(p)), (u = a.mul(u, p)), (g = a.mul(g, f)), (l = y))
      }
      return u
    }
  }
  function ni(t) {
    if (t % pn === Ys) {
      let e = (t + D) / pn
      return function (r, o) {
        let s = r.pow(o, e)
        if (!r.eql(r.sqr(s), o)) throw new Error('Cannot find square root')
        return s
      }
    }
    if (t % Mr === Hr) {
      let e = (t - Hr) / Mr
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
    return (t % Xs, ti(t))
  }
  var ri = [
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
  function gn(t) {
    let e = { ORDER: 'bigint', MASK: 'bigint', BYTES: 'isSafeInteger', BITS: 'isSafeInteger' },
      n = ri.reduce((r, o) => ((r[o] = 'function'), r), e)
    return Ue(t, n)
  }
  function oi(t, e, n) {
    if (n < Z) throw new Error('Expected power > 0')
    if (n === Z) return t.ONE
    if (n === D) return e
    let r = t.ONE,
      o = e
    for (; n > Z; ) (n & D && (r = t.mul(r, o)), (o = t.sqr(o)), (n >>= D))
    return r
  }
  function si(t, e) {
    let n = new Array(e.length),
      r = e.reduce((s, i, a) => (t.is0(i) ? s : ((n[a] = s), t.mul(s, i))), t.ONE),
      o = t.inv(r)
    return (
      e.reduceRight((s, i, a) => (t.is0(i) ? s : ((n[a] = t.mul(s, n[a])), t.mul(s, i))), o),
      n
    )
  }
  function yn(t, e) {
    let n = e !== void 0 ? e : t.toString(2).length,
      r = Math.ceil(n / 8)
    return { nBitLength: n, nByteLength: r }
  }
  function qr(t, e, n = !1, r = {}) {
    if (t <= Z) throw new Error(`Expected Field ORDER > 0, got ${t}`)
    let { nBitLength: o, nByteLength: s } = yn(t, e)
    if (s > 2048) throw new Error('Field lengths over 2048 bytes are not supported')
    let i = ni(t),
      a = Object.freeze({
        ORDER: t,
        BITS: o,
        BYTES: s,
        MASK: lt(o),
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
        pow: (c, l) => oi(a, c, l),
        div: (c, l) => K(c * Lt(l, t), t),
        sqrN: c => c * c,
        addN: (c, l) => c + l,
        subN: (c, l) => c - l,
        mulN: (c, l) => c * l,
        inv: c => Lt(c, t),
        sqrt: r.sqrt || (c => i(a, c)),
        invertBatch: c => si(a, c),
        cmov: (c, l, f) => (f ? l : c),
        toBytes: c => (n ? Bt(c, s) : fe(c, s)),
        fromBytes: c => {
          if (c.length !== s) throw new Error(`Fp.fromBytes: expected ${s}, got ${c.length}`)
          return n ? St(c) : J(c)
        },
      })
    return Object.freeze(a)
  }
  function Vr(t) {
    if (typeof t != 'bigint') throw new Error('field order must be bigint')
    let e = t.toString(2).length
    return Math.ceil(e / 8)
  }
  function wn(t) {
    let e = Vr(t)
    return e + Math.ceil(e / 2)
  }
  function Wr(t, e, n = !1) {
    let r = t.length,
      o = Vr(e),
      s = wn(e)
    if (r < 16 || r < s || r > 1024) throw new Error(`expected ${s}-1024 bytes of input, got ${r}`)
    let i = n ? J(t) : St(t),
      a = K(i, e - D) + D
    return n ? Bt(a, o) : fe(a, o)
  }
  var ai = BigInt(0),
    mn = BigInt(1)
  function Dr(t, e) {
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
        for (; s > ai; ) (s & mn && (i = i.add(a)), (a = a.double()), (s >>= mn))
        return i
      },
      precomputeWindow(o, s) {
        let { windows: i, windowSize: a } = r(s),
          c = [],
          l = o,
          f = l
        for (let u = 0; u < i; u++) {
          ;((f = l), c.push(f))
          for (let g = 1; g < a; g++) ((f = f.add(l)), c.push(f))
          l = f.double()
        }
        return c
      },
      wNAF(o, s, i) {
        let { windows: a, windowSize: c } = r(o),
          l = t.ZERO,
          f = t.BASE,
          u = BigInt(2 ** o - 1),
          g = 2 ** o,
          y = BigInt(o)
        for (let p = 0; p < a; p++) {
          let d = p * c,
            h = Number(i & u)
          ;((i >>= y), h > c && ((h -= g), (i += mn)))
          let w = d,
            m = d + Math.abs(h) - 1,
            x = p % 2 !== 0,
            T = h < 0
          h === 0 ? (f = f.add(n(x, s[w]))) : (l = l.add(n(T, s[m])))
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
  function bn(t) {
    return (
      gn(t.Fp),
      Ue(
        t,
        { n: 'bigint', h: 'bigint', Gx: 'field', Gy: 'field' },
        { nBitLength: 'isSafeInteger', nByteLength: 'isSafeInteger' }
      ),
      Object.freeze({ ...yn(t.n, t.nBitLength), ...t, p: t.Fp.ORDER })
    )
  }
  function ci(t) {
    let e = bn(t)
    Ue(
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
  var { bytesToNumberBE: li, hexToBytes: fi } = hn,
    ze = {
      Err: class extends Error {
        constructor(e = '') {
          super(e)
        }
      },
      _parseInt(t) {
        let { Err: e } = ze
        if (t.length < 2 || t[0] !== 2) throw new e('Invalid signature integer tag')
        let n = t[1],
          r = t.subarray(2, n + 2)
        if (!n || r.length !== n) throw new e('Invalid signature integer: wrong length')
        if (r[0] & 128) throw new e('Invalid signature integer: negative')
        if (r[0] === 0 && !(r[1] & 128))
          throw new e('Invalid signature integer: unnecessary leading zero')
        return { d: li(r), l: t.subarray(n + 2) }
      },
      toSig(t) {
        let { Err: e } = ze,
          n = typeof t == 'string' ? fi(t) : t
        if (!(n instanceof Uint8Array)) throw new Error('ui8a expected')
        let r = n.length
        if (r < 2 || n[0] != 48) throw new e('Invalid signature tag')
        if (n[1] !== r - 2) throw new e('Invalid signature: incorrect length')
        let { d: o, l: s } = ze._parseInt(n.subarray(2)),
          { d: i, l: a } = ze._parseInt(s)
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
    If = BigInt(2),
    jr = BigInt(3),
    _f = BigInt(4)
  function ui(t) {
    let e = ci(t),
      { Fp: n } = e,
      r =
        e.toBytes ||
        ((p, d, h) => {
          let w = d.toAffine()
          return ve(Uint8Array.from([4]), n.toBytes(w.x), n.toBytes(w.y))
        }),
      o =
        e.fromBytes ||
        (p => {
          let d = p.subarray(1),
            h = n.fromBytes(d.subarray(0, n.BYTES)),
            w = n.fromBytes(d.subarray(n.BYTES, 2 * n.BYTES))
          return { x: h, y: w }
        })
    function s(p) {
      let { a: d, b: h } = e,
        w = n.sqr(p),
        m = n.mul(w, p)
      return n.add(n.add(m, n.mul(p, d)), h)
    }
    if (!n.eql(n.sqr(e.Gy), s(e.Gx))) throw new Error('bad generator point: equation left != right')
    function i(p) {
      return typeof p == 'bigint' && Ee < p && p < e.n
    }
    function a(p) {
      if (!i(p)) throw new Error('Expected valid bigint: 0 < bigint < curve.n')
    }
    function c(p) {
      let { allowedPrivateKeyLengths: d, nByteLength: h, wrapPrivateKey: w, n: m } = e
      if (d && typeof p != 'bigint') {
        if ((p instanceof Uint8Array && (p = We(p)), typeof p != 'string' || !d.includes(p.length)))
          throw new Error('Invalid key')
        p = p.padStart(h * 2, '0')
      }
      let x
      try {
        x = typeof p == 'bigint' ? p : J(z('private key', p, h))
      } catch {
        throw new Error(`private key must be ${h} bytes, hex or bigint, not ${typeof p}`)
      }
      return (w && (x = K(x, m)), a(x), x)
    }
    let l = new Map()
    function f(p) {
      if (!(p instanceof u)) throw new Error('ProjectivePoint expected')
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
        let h = u.fromAffine(o(z('pointHex', d)))
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
          { px: x, py: T, pz: L } = d,
          A = n.eql(n.mul(h, L), n.mul(x, m)),
          S = n.eql(n.mul(w, L), n.mul(T, m))
        return A && S
      }
      negate() {
        return new u(this.px, n.neg(this.py), this.pz)
      }
      double() {
        let { a: d, b: h } = e,
          w = n.mul(h, jr),
          { px: m, py: x, pz: T } = this,
          L = n.ZERO,
          A = n.ZERO,
          S = n.ZERO,
          k = n.mul(m, m),
          N = n.mul(x, x),
          U = n.mul(T, T),
          _ = n.mul(m, x)
        return (
          (_ = n.add(_, _)),
          (S = n.mul(m, T)),
          (S = n.add(S, S)),
          (L = n.mul(d, S)),
          (A = n.mul(w, U)),
          (A = n.add(L, A)),
          (L = n.sub(N, A)),
          (A = n.add(N, A)),
          (A = n.mul(L, A)),
          (L = n.mul(_, L)),
          (S = n.mul(w, S)),
          (U = n.mul(d, U)),
          (_ = n.sub(k, U)),
          (_ = n.mul(d, _)),
          (_ = n.add(_, S)),
          (S = n.add(k, k)),
          (k = n.add(S, k)),
          (k = n.add(k, U)),
          (k = n.mul(k, _)),
          (A = n.add(A, k)),
          (U = n.mul(x, T)),
          (U = n.add(U, U)),
          (k = n.mul(U, _)),
          (L = n.sub(L, k)),
          (S = n.mul(U, N)),
          (S = n.add(S, S)),
          (S = n.add(S, S)),
          new u(L, A, S)
        )
      }
      add(d) {
        f(d)
        let { px: h, py: w, pz: m } = this,
          { px: x, py: T, pz: L } = d,
          A = n.ZERO,
          S = n.ZERO,
          k = n.ZERO,
          N = e.a,
          U = n.mul(e.b, jr),
          _ = n.mul(h, x),
          $ = n.mul(w, T),
          H = n.mul(m, L),
          V = n.add(h, w),
          b = n.add(x, T)
        ;((V = n.mul(V, b)), (b = n.add(_, $)), (V = n.sub(V, b)), (b = n.add(h, m)))
        let v = n.add(x, L)
        return (
          (b = n.mul(b, v)),
          (v = n.add(_, H)),
          (b = n.sub(b, v)),
          (v = n.add(w, m)),
          (A = n.add(T, L)),
          (v = n.mul(v, A)),
          (A = n.add($, H)),
          (v = n.sub(v, A)),
          (k = n.mul(N, b)),
          (A = n.mul(U, H)),
          (k = n.add(A, k)),
          (A = n.sub($, k)),
          (k = n.add($, k)),
          (S = n.mul(A, k)),
          ($ = n.add(_, _)),
          ($ = n.add($, _)),
          (H = n.mul(N, H)),
          (b = n.mul(U, b)),
          ($ = n.add($, H)),
          (H = n.sub(_, H)),
          (H = n.mul(N, H)),
          (b = n.add(b, H)),
          (_ = n.mul($, b)),
          (S = n.add(S, _)),
          (_ = n.mul(v, b)),
          (A = n.mul(V, A)),
          (A = n.sub(A, _)),
          (_ = n.mul(V, $)),
          (k = n.mul(v, k)),
          (k = n.add(k, _)),
          new u(A, S, k)
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
        let { k1neg: m, k1: x, k2neg: T, k2: L } = w.splitScalar(d),
          A = h,
          S = h,
          k = this
        for (; x > Ee || L > Ee; )
          (x & se && (A = A.add(k)),
            L & se && (S = S.add(k)),
            (k = k.double()),
            (x >>= se),
            (L >>= se))
        return (
          m && (A = A.negate()),
          T && (S = S.negate()),
          (S = new u(n.mul(S.px, w.beta), S.py, S.pz)),
          A.add(S)
        )
      }
      multiply(d) {
        a(d)
        let h = d,
          w,
          m,
          { endo: x } = e
        if (x) {
          let { k1neg: T, k1: L, k2neg: A, k2: S } = x.splitScalar(h),
            { p: k, f: N } = this.wNAF(L),
            { p: U, f: _ } = this.wNAF(S)
          ;((k = y.constTimeNegate(T, k)),
            (U = y.constTimeNegate(A, U)),
            (U = new u(n.mul(U.px, x.beta), U.py, U.pz)),
            (w = k.add(U)),
            (m = N.add(_)))
        } else {
          let { p: T, f: L } = this.wNAF(h)
          ;((w = T), (m = L))
        }
        return u.normalizeZ([w, m])[0]
      }
      multiplyAndAddUnsafe(d, h, w) {
        let m = u.BASE,
          x = (L, A) =>
            A === Ee || A === se || !L.equals(m) ? L.multiplyUnsafe(A) : L.multiply(A),
          T = x(this, h).add(x(d, w))
        return T.is0() ? void 0 : T
      }
      toAffine(d) {
        let { px: h, py: w, pz: m } = this,
          x = this.is0()
        d == null && (d = x ? n.ONE : n.inv(m))
        let T = n.mul(h, d),
          L = n.mul(w, d),
          A = n.mul(m, d)
        if (x) return { x: n.ZERO, y: n.ZERO }
        if (!n.eql(A, n.ONE)) throw new Error('invZ was invalid')
        return { x: T, y: L }
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
        return We(this.toRawBytes(d))
      }
    }
    ;((u.BASE = new u(e.Gx, e.Gy, n.ONE)), (u.ZERO = new u(n.ZERO, n.ONE, n.ZERO)))
    let g = e.nBitLength,
      y = Dr(u, e.endo ? Math.ceil(g / 2) : g)
    return {
      CURVE: e,
      ProjectivePoint: u,
      normPrivateKeyToScalar: c,
      weierstrassEquation: s,
      isWithinCurveOrder: i,
    }
  }
  function di(t) {
    let e = bn(t)
    return (
      Ue(
        e,
        { hash: 'hash', hmac: 'function', randomBytes: 'function' },
        { bits2int: 'function', bits2int_modN: 'function', lowS: 'boolean' }
      ),
      Object.freeze({ lowS: !0, ...e })
    )
  }
  function zr(t) {
    let e = di(t),
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
      return Lt(b, r)
    }
    let {
        ProjectivePoint: l,
        normPrivateKeyToScalar: f,
        weierstrassEquation: u,
        isWithinCurveOrder: g,
      } = ui({
        ...e,
        toBytes(b, v, I) {
          let C = v.toAffine(),
            E = n.toBytes(C.x),
            R = ve
          return I
            ? R(Uint8Array.from([v.hasEvenY() ? 2 : 3]), E)
            : R(Uint8Array.from([4]), E, n.toBytes(C.y))
        },
        fromBytes(b) {
          let v = b.length,
            I = b[0],
            C = b.subarray(1)
          if (v === o && (I === 2 || I === 3)) {
            let E = J(C)
            if (!i(E)) throw new Error('Point is not on curve')
            let R = u(E),
              q = n.sqrt(R),
              M = (q & se) === se
            return (((I & 1) === 1) !== M && (q = n.neg(q)), { x: E, y: q })
          } else if (v === s && I === 4) {
            let E = n.fromBytes(C.subarray(0, n.BYTES)),
              R = n.fromBytes(C.subarray(n.BYTES, 2 * n.BYTES))
            return { x: E, y: R }
          } else
            throw new Error(
              `Point of length ${v} was invalid. Expected ${o} compressed bytes or ${s} uncompressed bytes`
            )
        },
      }),
      y = b => We(fe(b, e.nByteLength))
    function p(b) {
      let v = r >> se
      return b > v
    }
    function d(b) {
      return p(b) ? a(-b) : b
    }
    let h = (b, v, I) => J(b.slice(v, I))
    class w {
      constructor(v, I, C) {
        ;((this.r = v), (this.s = I), (this.recovery = C), this.assertValidity())
      }
      static fromCompact(v) {
        let I = e.nByteLength
        return ((v = z('compactSignature', v, I * 2)), new w(h(v, 0, I), h(v, I, 2 * I)))
      }
      static fromDER(v) {
        let { r: I, s: C } = ze.toSig(z('DER', v))
        return new w(I, C)
      }
      assertValidity() {
        if (!g(this.r)) throw new Error('r must be 0 < r < CURVE.n')
        if (!g(this.s)) throw new Error('s must be 0 < s < CURVE.n')
      }
      addRecoveryBit(v) {
        return new w(this.r, this.s, v)
      }
      recoverPublicKey(v) {
        let { r: I, s: C, recovery: E } = this,
          R = S(z('msgHash', v))
        if (E == null || ![0, 1, 2, 3].includes(E)) throw new Error('recovery id invalid')
        let q = E === 2 || E === 3 ? I + e.n : I
        if (q >= n.ORDER) throw new Error('recovery id 2 or 3 invalid')
        let M = (E & 1) === 0 ? '02' : '03',
          G = l.fromHex(M + y(q)),
          Y = c(q),
          te = a(-R * Y),
          oe = a(C * Y),
          Q = l.BASE.multiplyAndAddUnsafe(G, te, oe)
        if (!Q) throw new Error('point at infinify')
        return (Q.assertValidity(), Q)
      }
      hasHighS() {
        return p(this.s)
      }
      normalizeS() {
        return this.hasHighS() ? new w(this.r, a(-this.s), this.recovery) : this
      }
      toDERRawBytes() {
        return De(this.toDERHex())
      }
      toDERHex() {
        return ze.hexFromSig({ r: this.r, s: this.s })
      }
      toCompactRawBytes() {
        return De(this.toCompactHex())
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
        let b = wn(e.n)
        return Wr(e.randomBytes(b), e.n)
      },
      precompute(b = 8, v = l.BASE) {
        return (v._setWindowSize(b), v.multiply(BigInt(3)), v)
      },
    }
    function x(b, v = !0) {
      return l.fromPrivateKey(b).toRawBytes(v)
    }
    function T(b) {
      let v = b instanceof Uint8Array,
        I = typeof b == 'string',
        C = (v || I) && b.length
      return v ? C === o || C === s : I ? C === 2 * o || C === 2 * s : b instanceof l
    }
    function L(b, v, I = !0) {
      if (T(b)) throw new Error('first arg must be private key')
      if (!T(v)) throw new Error('second arg must be public key')
      return l.fromHex(v).multiply(f(b)).toRawBytes(I)
    }
    let A =
        e.bits2int ||
        function (b) {
          let v = J(b),
            I = b.length * 8 - e.nBitLength
          return I > 0 ? v >> BigInt(I) : v
        },
      S =
        e.bits2int_modN ||
        function (b) {
          return a(A(b))
        },
      k = lt(e.nBitLength)
    function N(b) {
      if (typeof b != 'bigint') throw new Error('bigint expected')
      if (!(Ee <= b && b < k)) throw new Error(`bigint expected < 2^${e.nBitLength}`)
      return fe(b, e.nByteLength)
    }
    function U(b, v, I = _) {
      if (['recovered', 'canonical'].some(ee => ee in I))
        throw new Error('sign() legacy options not supported')
      let { hash: C, randomBytes: E } = e,
        { lowS: R, prehash: q, extraEntropy: M } = I
      ;(R == null && (R = !0), (b = z('msgHash', b)), q && (b = z('prehashed msgHash', C(b))))
      let G = S(b),
        Y = f(v),
        te = [N(Y), N(G)]
      if (M != null) {
        let ee = M === !0 ? E(n.BYTES) : M
        te.push(z('extraEntropy', ee))
      }
      let oe = ve(...te),
        Q = G
      function he(ee) {
        let Je = A(ee)
        if (!g(Je)) return
        let Tr = c(Je),
          pe = l.BASE.multiply(Je).toAffine(),
          Fe = a(pe.x)
        if (Fe === Ee) return
        let wt = a(Tr * a(Q + Fe * Y))
        if (wt === Ee) return
        let Ar = (pe.x === Fe ? 0 : 2) | Number(pe.y & se),
          Sr = wt
        return (R && p(wt) && ((Sr = d(wt)), (Ar ^= 1)), new w(Fe, Sr, Ar))
      }
      return { seed: oe, k2sig: he }
    }
    let _ = { lowS: e.lowS, prehash: !1 },
      $ = { lowS: e.lowS, prehash: !1 }
    function H(b, v, I = _) {
      let { seed: C, k2sig: E } = U(b, v, I),
        R = e
      return dn(R.hash.outputLen, R.nByteLength, R.hmac)(C, E)
    }
    l.BASE._setWindowSize(8)
    function V(b, v, I, C = $) {
      let E = b
      if (((v = z('msgHash', v)), (I = z('publicKey', I)), 'strict' in C))
        throw new Error('options.strict was renamed to lowS')
      let { lowS: R, prehash: q } = C,
        M,
        G
      try {
        if (typeof E == 'string' || E instanceof Uint8Array)
          try {
            M = w.fromDER(E)
          } catch (pe) {
            if (!(pe instanceof ze.Err)) throw pe
            M = w.fromCompact(E)
          }
        else if (typeof E == 'object' && typeof E.r == 'bigint' && typeof E.s == 'bigint') {
          let { r: pe, s: Fe } = E
          M = new w(pe, Fe)
        } else throw new Error('PARSE')
        G = l.fromHex(I)
      } catch (pe) {
        if (pe.message === 'PARSE')
          throw new Error('signature must be Signature instance, Uint8Array or hex string')
        return !1
      }
      if (R && M.hasHighS()) return !1
      q && (v = e.hash(v))
      let { r: Y, s: te } = M,
        oe = S(v),
        Q = c(te),
        he = a(oe * Q),
        ee = a(Y * Q),
        Je = l.BASE.multiplyAndAddUnsafe(G, he, ee)?.toAffine()
      return Je ? a(Je.x) === Y : !1
    }
    return {
      CURVE: e,
      getPublicKey: x,
      getSharedSecret: L,
      sign: H,
      verify: V,
      ProjectivePoint: l,
      Signature: w,
      utils: m,
    }
  }
  var kt = class extends Xe {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), _r(e))
        let r = ct(n)
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
          cn(e, this.outputLen),
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
    xn = (t, e, n) => new kt(t, e).update(n).digest()
  xn.create = (t, e) => new kt(t, e)
  function hi(t) {
    return { hash: t, hmac: (e, ...n) => xn(t, e, Nr(...n)), randomBytes: xt }
  }
  function Kr(t, e) {
    let n = r => zr({ ...t, ...hi(r) })
    return Object.freeze({ ...n(e), create: n })
  }
  var Ct = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
    It = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
    Jr = BigInt(1),
    _t = BigInt(2),
    Zr = (t, e) => (t + e / _t) / e
  function Fr(t) {
    let e = Ct,
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
      g = (ne(u, n, e) * f) % e,
      y = (ne(g, _t, e) * l) % e,
      p = (ne(y, o, e) * y) % e,
      d = (ne(p, s, e) * p) % e,
      h = (ne(d, a, e) * d) % e,
      w = (ne(h, c, e) * h) % e,
      m = (ne(w, a, e) * d) % e,
      x = (ne(m, n, e) * f) % e,
      T = (ne(x, i, e) * p) % e,
      L = (ne(T, r, e) * l) % e,
      A = ne(L, _t, e)
    if (!En.eql(En.sqr(A), t)) throw new Error('Cannot find square root')
    return A
  }
  var En = qr(Ct, void 0, void 0, { sqrt: Fr }),
    Ce = Kr(
      {
        a: BigInt(0),
        b: BigInt(7),
        Fp: En,
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
              r = -Jr * BigInt('0xe4437ed6010e88286f547fa90abfe4c3'),
              o = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'),
              s = n,
              i = BigInt('0x100000000000000000000000000000000'),
              a = Zr(s * t, e),
              c = Zr(-r * t, e),
              l = K(t - a * n - c * o, e),
              f = K(-a * r - c * s, e),
              u = l > i,
              g = f > i
            if ((u && (l = e - l), g && (f = e - f), l > i || f > i))
              throw new Error('splitScalar: Endomorphism failed, k=' + t)
            return { k1neg: u, k1: l, k2neg: g, k2: f }
          },
        },
      },
      Et
    ),
    Nt = BigInt(0),
    Yr = t => typeof t == 'bigint' && Nt < t && t < Ct,
    pi = t => typeof t == 'bigint' && Nt < t && t < It,
    Gr = {}
  function Ut(t, ...e) {
    let n = Gr[t]
    if (n === void 0) {
      let r = Et(Uint8Array.from(t, o => o.charCodeAt(0)))
      ;((n = ve(r, r)), (Gr[t] = n))
    }
    return Et(ve(n, ...e))
  }
  var Sn = t => t.toRawBytes(!0).slice(1),
    Tn = t => fe(t, 32),
    vn = t => K(t, Ct),
    ft = t => K(t, It),
    Bn = Ce.ProjectivePoint,
    gi = (t, e, n) => Bn.BASE.multiplyAndAddUnsafe(t, e, n)
  function An(t) {
    let e = Ce.utils.normPrivateKeyToScalar(t),
      n = Bn.fromPrivateKey(e)
    return { scalar: n.hasEvenY() ? e : ft(-e), bytes: Sn(n) }
  }
  function Qr(t) {
    if (!Yr(t)) throw new Error('bad x: need 0 < x < p')
    let e = vn(t * t),
      n = vn(e * t + BigInt(7)),
      r = Fr(n)
    r % _t !== Nt && (r = vn(-r))
    let o = new Bn(t, r, Jr)
    return (o.assertValidity(), o)
  }
  function Xr(...t) {
    return ft(J(Ut('BIP0340/challenge', ...t)))
  }
  function yi(t) {
    return An(t).bytes
  }
  function wi(t, e, n = xt(32)) {
    let r = z('message', t),
      { bytes: o, scalar: s } = An(e),
      i = z('auxRand', n, 32),
      a = Tn(s ^ J(Ut('BIP0340/aux', i))),
      c = Ut('BIP0340/nonce', a, o, r),
      l = ft(J(c))
    if (l === Nt) throw new Error('sign failed: k is zero')
    let { bytes: f, scalar: u } = An(l),
      g = Xr(f, o, r),
      y = new Uint8Array(64)
    if ((y.set(f, 0), y.set(Tn(ft(u + g * s)), 32), !eo(y, r, o)))
      throw new Error('sign: Invalid signature produced')
    return y
  }
  function eo(t, e, n) {
    let r = z('signature', t, 64),
      o = z('message', e),
      s = z('publicKey', n, 32)
    try {
      let i = Qr(J(s)),
        a = J(r.subarray(0, 32))
      if (!Yr(a)) return !1
      let c = J(r.subarray(32, 64))
      if (!pi(c)) return !1
      let l = Xr(Tn(a), Sn(i), o),
        f = gi(i, c, ft(-l))
      return !(!f || !f.hasEvenY() || f.toAffine().x !== a)
    } catch {
      return !1
    }
  }
  var et = {
    getPublicKey: yi,
    sign: wi,
    verify: eo,
    utils: {
      randomPrivateKey: Ce.utils.randomPrivateKey,
      lift_x: Qr,
      pointToBytes: Sn,
      numberToBytesBE: fe,
      bytesToNumberBE: J,
      taggedHash: Ut,
      mod: K,
    },
  }
  var Rt = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Ln = t => t instanceof Uint8Array
  var Ot = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    ue = (t, e) => (t << (32 - e)) | (t >>> e),
    mi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!mi) throw new Error('Non little-endian hardware is not supported')
  var bi = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function j(t) {
    if (!Ln(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += bi[t[n]]
    return e
  }
  function Te(t) {
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
  function xi(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Ne(t) {
    if ((typeof t == 'string' && (t = xi(t)), !Ln(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function nt(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!Ln(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var tt = class {
    clone() {
      return this._cloneInto()
    }
  }
  function kn(t) {
    let e = r => t().update(Ne(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function Pt(t = 32) {
    if (Rt && typeof Rt.getRandomValues == 'function') return Rt.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function In(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function vi(t) {
    if (typeof t != 'boolean') throw new Error(`Expected boolean, not ${t}`)
  }
  function to(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Ei(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(In(t.outputLen), In(t.blockLen))
  }
  function Ti(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Ai(t, e) {
    to(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Si = { number: In, bool: vi, bytes: to, hash: Ei, exists: Ti, output: Ai },
    re = Si
  function Bi(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var $t = class extends tt {
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
        (this.view = Ot(this.buffer)))
    }
    update(e) {
      re.exists(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = Ne(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = Ot(e)
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
      ;(Bi(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = Ot(e),
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
  var Li = (t, e, n) => (t & e) ^ (~t & n),
    ki = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    Ii = new Uint32Array([
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
    Ht = class extends $t {
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
          let g = Oe[u - 15],
            y = Oe[u - 2],
            p = ue(g, 7) ^ ue(g, 18) ^ (g >>> 3),
            d = ue(y, 17) ^ ue(y, 19) ^ (y >>> 10)
          Oe[u] = (d + Oe[u - 7] + p + Oe[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let g = ue(a, 6) ^ ue(a, 11) ^ ue(a, 25),
            y = (f + g + Li(a, c, l) + Ii[u] + Oe[u]) | 0,
            d = ((ue(r, 2) ^ ue(r, 13) ^ ue(r, 22)) + ki(r, o, s)) | 0
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
    _n = class extends Ht {
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
    ge = kn(() => new Ht()),
    eu = kn(() => new _n())
  function rt(t) {
    if (!Number.isSafeInteger(t)) throw new Error(`Wrong integer: ${t}`)
  }
  function Ae(...t) {
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
          if ((rt(n), n < 0 || n >= t.length))
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
  function qt(t, e = '=') {
    if ((rt(t), typeof e != 'string')) throw new Error('padding chr should be string')
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
  function ao(t) {
    if (typeof t != 'function') throw new Error('normalize fn should be function')
    return { encode: e => e, decode: e => t(e) }
  }
  function no(t, e, n) {
    if (e < 2) throw new Error(`convertRadix: wrong from=${e}, base cannot be less than 2`)
    if (n < 2) throw new Error(`convertRadix: wrong to=${n}, base cannot be less than 2`)
    if (!Array.isArray(t)) throw new Error('convertRadix: data should be array')
    if (!t.length) return []
    let r = 0,
      o = [],
      s = Array.from(t)
    for (
      s.forEach(i => {
        if ((rt(i), i < 0 || i >= e)) throw new Error(`Wrong integer: ${i}`)
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
  var co = (t, e) => (e ? co(e, t % e) : t),
    Mt = (t, e) => t + (e - co(t, e))
  function Un(t, e, n, r) {
    if (!Array.isArray(t)) throw new Error('convertRadix2: data should be array')
    if (e <= 0 || e > 32) throw new Error(`convertRadix2: wrong from=${e}`)
    if (n <= 0 || n > 32) throw new Error(`convertRadix2: wrong to=${n}`)
    if (Mt(e, n) > 32)
      throw new Error(`convertRadix2: carry overflow from=${e} to=${n} carryBits=${Mt(e, n)}`)
    let o = 0,
      s = 0,
      i = 2 ** n - 1,
      a = []
    for (let c of t) {
      if ((rt(c), c >= 2 ** e)) throw new Error(`convertRadix2: invalid data word=${c} from=${e}`)
      if (((o = (o << e) | c), s + e > 32))
        throw new Error(`convertRadix2: carry overflow pos=${s} from=${e}`)
      for (s += e; s >= n; s -= n) a.push(((o >> (s - n)) & i) >>> 0)
      o &= 2 ** s - 1
    }
    if (((o = (o << (n - s)) & i), !r && s >= e)) throw new Error('Excess padding')
    if (!r && o) throw new Error(`Non-zero padding: ${o}`)
    return (r && s > 0 && a.push(o >>> 0), a)
  }
  function _i(t) {
    return (
      rt(t),
      {
        encode: e => {
          if (!(e instanceof Uint8Array)) throw new Error('radix.encode input should be Uint8Array')
          return no(Array.from(e), 2 ** 8, t)
        },
        decode: e => {
          if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
            throw new Error('radix.decode input should be array of strings')
          return Uint8Array.from(no(e, t, 2 ** 8))
        },
      }
    )
  }
  function Pe(t, e = !1) {
    if ((rt(t), t <= 0 || t > 32)) throw new Error('radix2: bits should be in (0..32]')
    if (Mt(8, t) > 32 || Mt(t, 8) > 32) throw new Error('radix2: carry overflow')
    return {
      encode: n => {
        if (!(n instanceof Uint8Array)) throw new Error('radix2.encode input should be Uint8Array')
        return Un(Array.from(n), 8, t, !e)
      },
      decode: n => {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'number'))
          throw new Error('radix2.decode input should be array of strings')
        return Uint8Array.from(Un(n, t, 8, e))
      },
    }
  }
  function ro(t) {
    if (typeof t != 'function') throw new Error('unsafeWrapper fn should be function')
    return function (...e) {
      try {
        return t.apply(null, e)
      } catch {}
    }
  }
  var Ui = Ae(Pe(4), Se('0123456789ABCDEF'), Be('')),
    Ci = Ae(Pe(5), Se('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), qt(5), Be('')),
    nu = Ae(Pe(5), Se('0123456789ABCDEFGHIJKLMNOPQRSTUV'), qt(5), Be('')),
    ru = Ae(
      Pe(5),
      Se('0123456789ABCDEFGHJKMNPQRSTVWXYZ'),
      Be(''),
      ao(t => t.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1'))
    ),
    ie = Ae(
      Pe(6),
      Se('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'),
      qt(6),
      Be('')
    ),
    Ni = Ae(
      Pe(6),
      Se('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'),
      qt(6),
      Be('')
    ),
    Rn = t => Ae(_i(58), Se(t), Be('')),
    Cn = Rn('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'),
    ou = Rn('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'),
    su = Rn('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'),
    oo = [0, 2, 3, 5, 6, 7, 9, 10, 11],
    Ri = {
      encode(t) {
        let e = ''
        for (let n = 0; n < t.length; n += 8) {
          let r = t.subarray(n, n + 8)
          e += Cn.encode(r).padStart(oo[r.length], '1')
        }
        return e
      },
      decode(t) {
        let e = []
        for (let n = 0; n < t.length; n += 11) {
          let r = t.slice(n, n + 11),
            o = oo.indexOf(r.length),
            s = Cn.decode(r)
          for (let i = 0; i < s.length - o; i++)
            if (s[i] !== 0) throw new Error('base58xmr: wrong padding')
          e = e.concat(Array.from(s.slice(s.length - o)))
        }
        return Uint8Array.from(e)
      },
    }
  var Nn = Ae(Se('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), Be('')),
    so = [996825010, 642813549, 513874426, 1027748829, 705979059]
  function ut(t) {
    let e = t >> 25,
      n = (t & 33554431) << 5
    for (let r = 0; r < so.length; r++) ((e >> r) & 1) === 1 && (n ^= so[r])
    return n
  }
  function io(t, e, n = 1) {
    let r = t.length,
      o = 1
    for (let s = 0; s < r; s++) {
      let i = t.charCodeAt(s)
      if (i < 33 || i > 126) throw new Error(`Invalid prefix (${t})`)
      o = ut(o) ^ (i >> 5)
    }
    o = ut(o)
    for (let s = 0; s < r; s++) o = ut(o) ^ (t.charCodeAt(s) & 31)
    for (let s of e) o = ut(o) ^ s
    for (let s = 0; s < 6; s++) o = ut(o)
    return ((o ^= n), Nn.encode(Un([o % 2 ** 30], 30, 5, !1)))
  }
  function lo(t) {
    let e = t === 'bech32' ? 1 : 734539939,
      n = Pe(5),
      r = n.decode,
      o = n.encode,
      s = ro(r)
    function i(f, u, g = 90) {
      if (typeof f != 'string')
        throw new Error(`bech32.encode prefix should be string, not ${typeof f}`)
      if (!Array.isArray(u) || (u.length && typeof u[0] != 'number'))
        throw new Error(`bech32.encode words should be array of numbers, not ${typeof u}`)
      let y = f.length + 7 + u.length
      if (g !== !1 && y > g) throw new TypeError(`Length ${y} exceeds limit ${g}`)
      return ((f = f.toLowerCase()), `${f}1${Nn.encode(u)}${io(f, u, e)}`)
    }
    function a(f, u = 90) {
      if (typeof f != 'string')
        throw new Error(`bech32.decode input should be string, not ${typeof f}`)
      if (f.length < 8 || (u !== !1 && f.length > u))
        throw new TypeError(`Wrong string length: ${f.length} (${f}). Expected (8..${u})`)
      let g = f.toLowerCase()
      if (f !== g && f !== f.toUpperCase()) throw new Error('String must be lowercase or uppercase')
      f = g
      let y = f.lastIndexOf('1')
      if (y === 0 || y === -1)
        throw new Error('Letter "1" must be present between prefix and data only')
      let p = f.slice(0, y),
        d = f.slice(y + 1)
      if (d.length < 6) throw new Error('Data must be at least 6 characters long')
      let h = Nn.decode(d).slice(0, -6),
        w = io(p, h, e)
      if (!d.endsWith(w)) throw new Error(`Invalid checksum in ${f}: expected "${w}"`)
      return { prefix: p, words: h }
    }
    let c = ro(a)
    function l(f) {
      let { prefix: u, words: g } = a(f, !1)
      return { prefix: u, words: g, bytes: r(g) }
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
  var $e = lo('bech32'),
    iu = lo('bech32m'),
    Oi = { encode: t => new TextDecoder().decode(t), decode: t => new TextEncoder().encode(t) },
    Pi = Ae(
      Pe(4),
      Se('0123456789abcdef'),
      Be(''),
      ao(t => {
        if (typeof t != 'string' || t.length % 2)
          throw new TypeError(
            `hex.decode: expected string, got ${typeof t} with length ${t.length}`
          )
        return t.toLowerCase()
      })
    ),
    $i = {
      utf8: Oi,
      hex: Pi,
      base16: Ui,
      base32: Ci,
      base64: ie,
      base64url: Ni,
      base58: Cn,
      base58xmr: Ri,
    },
    au = `Invalid encoding type. Available types: ${Object.keys($i).join(', ')}`
  function Vt(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`positive integer expected, not ${t}`)
  }
  function On(t) {
    if (typeof t != 'boolean') throw new Error(`boolean expected, not ${t}`)
  }
  function Pn(t) {
    return (
      t instanceof Uint8Array ||
      (t != null && typeof t == 'object' && t.constructor.name === 'Uint8Array')
    )
  }
  function O(t, ...e) {
    if (!Pn(t)) throw new Error('Uint8Array expected')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Uint8Array expected of length ${e}, not of length=${t.length}`)
  }
  function He(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function dt(t, e) {
    O(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Wt = t => new Uint8Array(t.buffer, t.byteOffset, t.byteLength)
  var P = t => new Uint32Array(t.buffer, t.byteOffset, Math.floor(t.byteLength / 4)),
    Me = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    Hi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Hi) throw new Error('Non little-endian hardware is not supported')
  function Mi(t) {
    if (typeof t != 'string') throw new Error(`string expected, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function ye(t) {
    if (typeof t == 'string') t = Mi(t)
    else if (Pn(t)) t = t.slice()
    else throw new Error(`Uint8Array expected, got ${typeof t}`)
    return t
  }
  function fo(t, e) {
    if (e == null || typeof e != 'object') throw new Error('options must be defined')
    return Object.assign(t, e)
  }
  function Ke(t, e) {
    if (t.length !== e.length) return !1
    let n = 0
    for (let r = 0; r < t.length; r++) n |= t[r] ^ e[r]
    return n === 0
  }
  var we = (t, e) => (Object.assign(e, t), e)
  function Ze(t, e, n, r) {
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
    Hn = new Uint8Array(16),
    me = P(Hn),
    qi = 225,
    Vi = (t, e, n, r) => {
      let o = r & 1
      return {
        s3: (n << 31) | (r >>> 1),
        s2: (e << 31) | (n >>> 1),
        s1: (t << 31) | (e >>> 1),
        s0: (t >>> 1) ^ ((qi << 24) & -(o & 1)),
      }
    },
    ae = t =>
      (((t >>> 0) & 255) << 24) |
      (((t >>> 8) & 255) << 16) |
      (((t >>> 16) & 255) << 8) |
      ((t >>> 24) & 255) |
      0
  function Wi(t) {
    t.reverse()
    let e = t[15] & 1,
      n = 0
    for (let r = 0; r < t.length; r++) {
      let o = t[r]
      ;((t[r] = (o >>> 1) | n), (n = (o & 1) << 7))
    }
    return ((t[0] ^= -e & 225), t)
  }
  var Di = t => (t > 64 * 1024 ? 8 : t > 1024 ? 4 : 2),
    Dt = class {
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
        for (let p = 0; p < 128; p++)
          (c.push({ s0: ae(o), s1: ae(s), s2: ae(i), s3: ae(a) }),
            ({ s0: o, s1: s, s2: i, s3: a } = Vi(o, s, i, a)))
        let l = Di(n || 1024)
        if (![1, 2, 4, 8].includes(l))
          throw new Error(`ghash: wrong window size=${l}, should be 2, 4 or 8`)
        this.W = l
        let u = 128 / l,
          g = (this.windowSize = 2 ** l),
          y = []
        for (let p = 0; p < u; p++)
          for (let d = 0; d < g; d++) {
            let h = 0,
              w = 0,
              m = 0,
              x = 0
            for (let T = 0; T < l; T++) {
              if (!((d >>> (l - T - 1)) & 1)) continue
              let { s0: A, s1: S, s2: k, s3: N } = c[l * p + T]
              ;((h ^= A), (w ^= S), (m ^= k), (x ^= N))
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
          g = (1 << s) - 1,
          y = 0
        for (let p of [e, n, r, o])
          for (let d = 0; d < 4; d++) {
            let h = (p >>> (8 * d)) & 255
            for (let w = 8 / s - 1; w >= 0; w--) {
              let m = (h >>> (s * w)) & g,
                { s0: x, s1: T, s2: L, s3: A } = i[y * a + m]
              ;((c ^= x), (l ^= T), (f ^= L), (u ^= A), (y += 1))
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
            (Hn.set(e.subarray(r * Le)), this._updateBlock(me[0], me[1], me[2], me[3]), me.fill(0)),
          this
        )
      }
      destroy() {
        let { t: e } = this
        for (let n of e) ((n.s0 = 0), (n.s1 = 0), (n.s2 = 0), (n.s3 = 0))
      }
      digestInto(e) {
        ;(He(this), dt(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e)
      }
      digest() {
        let e = new Uint8Array(Le)
        return (this.digestInto(e), this.destroy(), e)
      }
    },
    $n = class extends Dt {
      constructor(e, n) {
        e = ye(e)
        let r = Wi(e.slice())
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
            (Hn.set(e.subarray(o * Le)),
            this._updateBlock(ae(me[3]), ae(me[2]), ae(me[1]), ae(me[0])),
            me.fill(0)),
          this
        )
      }
      digestInto(e) {
        ;(He(this), dt(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e.reverse())
      }
    }
  function uo(t) {
    let e = (r, o) => t(o, r.length).update(ye(r)).digest(),
      n = t(new Uint8Array(16), 0)
    return (
      (e.outputLen = n.outputLen),
      (e.blockLen = n.blockLen),
      (e.create = (r, o) => t(r, o)),
      e
    )
  }
  var Mn = uo((t, e) => new Dt(t, e)),
    ho = uo((t, e) => new $n(t, e))
  var X = 16,
    Wn = 4,
    jt = new Uint8Array(X),
    ji = 283
  function Dn(t) {
    return (t << 1) ^ (ji & -(t >> 7))
  }
  function ot(t, e) {
    let n = 0
    for (; e > 0; e >>= 1) ((n ^= t & -(e & 1)), (t = Dn(t)))
    return n
  }
  var Vn = (() => {
      let t = new Uint8Array(256)
      for (let n = 0, r = 1; n < 256; n++, r ^= Dn(r)) t[n] = r
      let e = new Uint8Array(256)
      e[0] = 99
      for (let n = 0; n < 255; n++) {
        let r = t[255 - n]
        ;((r |= r << 8), (e[t[n]] = (r ^ (r >> 4) ^ (r >> 5) ^ (r >> 6) ^ (r >> 7) ^ 99) & 255))
      }
      return e
    })(),
    zi = Vn.map((t, e) => Vn.indexOf(e)),
    Ki = t => (t << 24) | (t >>> 8),
    qn = t => (t << 8) | (t >>> 24)
  function po(t, e) {
    if (t.length !== 256) throw new Error('Wrong sbox length')
    let n = new Uint32Array(256).map((l, f) => e(t[f])),
      r = n.map(qn),
      o = r.map(qn),
      s = o.map(qn),
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
  var jn = po(Vn, t => (ot(t, 3) << 24) | (t << 16) | (t << 8) | ot(t, 2)),
    go = po(zi, t => (ot(t, 11) << 24) | (ot(t, 13) << 16) | (ot(t, 9) << 8) | ot(t, 14)),
    Zi = (() => {
      let t = new Uint8Array(16)
      for (let e = 0, n = 1; e < 16; e++, n = Dn(n)) t[e] = n
      return t
    })()
  function Ve(t) {
    O(t)
    let e = t.length
    if (![16, 24, 32].includes(e))
      throw new Error(`aes: wrong key size: should be 16, 24 or 32, got: ${e}`)
    let { sbox2: n } = jn,
      r = P(t),
      o = r.length,
      s = a => be(n, a, a, a, a),
      i = new Uint32Array(e + 28)
    i.set(r)
    for (let a = o; a < i.length; a++) {
      let c = i[a - 1]
      ;(a % o === 0 ? (c = s(Ki(c)) ^ Zi[a / o - 1]) : o > 6 && a % o === 4 && (c = s(c)),
        (i[a] = i[a - o] ^ c))
    }
    return i
  }
  function yo(t) {
    let e = Ve(t),
      n = e.slice(),
      r = e.length,
      { sbox2: o } = jn,
      { T0: s, T1: i, T2: a, T3: c } = go
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
    let { sbox2: s, T01: i, T23: a } = jn,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let p = 0; p < l; p++) {
      let d = t[c++] ^ qe(i, a, e, n, r, o),
        h = t[c++] ^ qe(i, a, n, r, o, e),
        w = t[c++] ^ qe(i, a, r, o, e, n),
        m = t[c++] ^ qe(i, a, o, e, n, r)
      ;((e = d), (n = h), (r = w), (o = m))
    }
    let f = t[c++] ^ be(s, e, n, r, o),
      u = t[c++] ^ be(s, n, r, o, e),
      g = t[c++] ^ be(s, r, o, e, n),
      y = t[c++] ^ be(s, o, e, n, r)
    return { s0: f, s1: u, s2: g, s3: y }
  }
  function wo(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = go,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let p = 0; p < l; p++) {
      let d = t[c++] ^ qe(i, a, e, o, r, n),
        h = t[c++] ^ qe(i, a, n, e, o, r),
        w = t[c++] ^ qe(i, a, r, n, e, o),
        m = t[c++] ^ qe(i, a, o, r, n, e)
      ;((e = d), (n = h), (r = w), (o = m))
    }
    let f = t[c++] ^ be(s, e, o, r, n),
      u = t[c++] ^ be(s, n, e, o, r),
      g = t[c++] ^ be(s, r, n, e, o),
      y = t[c++] ^ be(s, o, r, n, e)
    return { s0: f, s1: u, s2: g, s3: y }
  }
  function st(t, e) {
    if (!e) return new Uint8Array(t)
    if ((O(e), e.length < t))
      throw new Error(`aes: wrong destination length, expected at least ${t}, got: ${e.length}`)
    return e
  }
  function Gi(t, e, n, r) {
    ;(O(e, X), O(n))
    let o = n.length
    r = st(o, r)
    let s = e,
      i = P(s),
      { s0: a, s1: c, s2: l, s3: f } = ce(t, i[0], i[1], i[2], i[3]),
      u = P(n),
      g = P(r)
    for (let p = 0; p + 4 <= u.length; p += 4) {
      ;((g[p + 0] = u[p + 0] ^ a),
        (g[p + 1] = u[p + 1] ^ c),
        (g[p + 2] = u[p + 2] ^ l),
        (g[p + 3] = u[p + 3] ^ f))
      let d = 1
      for (let h = s.length - 1; h >= 0; h--)
        ((d = (d + (s[h] & 255)) | 0), (s[h] = d & 255), (d >>>= 8))
      ;({ s0: a, s1: c, s2: l, s3: f } = ce(t, i[0], i[1], i[2], i[3]))
    }
    let y = X * Math.floor(u.length / Wn)
    if (y < o) {
      let p = new Uint32Array([a, c, l, f]),
        d = Wt(p)
      for (let h = y, w = 0; h < o; h++, w++) r[h] = n[h] ^ d[w]
    }
    return r
  }
  function ht(t, e, n, r, o) {
    ;(O(n, X), O(r), (o = st(r.length, o)))
    let s = n,
      i = P(s),
      a = Me(s),
      c = P(r),
      l = P(o),
      f = e ? 0 : 12,
      u = r.length,
      g = a.getUint32(f, e),
      { s0: y, s1: p, s2: d, s3: h } = ce(t, i[0], i[1], i[2], i[3])
    for (let m = 0; m + 4 <= c.length; m += 4)
      ((l[m + 0] = c[m + 0] ^ y),
        (l[m + 1] = c[m + 1] ^ p),
        (l[m + 2] = c[m + 2] ^ d),
        (l[m + 3] = c[m + 3] ^ h),
        (g = (g + 1) >>> 0),
        a.setUint32(f, g, e),
        ({ s0: y, s1: p, s2: d, s3: h } = ce(t, i[0], i[1], i[2], i[3])))
    let w = X * Math.floor(c.length / Wn)
    if (w < u) {
      let m = new Uint32Array([y, p, d, h]),
        x = Wt(m)
      for (let T = w, L = 0; T < u; T++, L++) o[T] = r[T] ^ x[L]
    }
    return o
  }
  var mu = we({ blockSize: 16, nonceLength: 16 }, function (e, n) {
    ;(O(e), O(n, X))
    function r(o, s) {
      let i = Ve(e),
        a = n.slice(),
        c = Gi(i, a, o, s)
      return (i.fill(0), a.fill(0), c)
    }
    return { encrypt: (o, s) => r(o, s), decrypt: (o, s) => r(o, s) }
  })
  function mo(t) {
    if ((O(t), t.length % X !== 0))
      throw new Error(`aes/(cbc-ecb).decrypt ciphertext should consist of blocks with size ${X}`)
  }
  function bo(t, e, n) {
    let r = t.length,
      o = r % X
    if (!e && o !== 0) throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding')
    let s = P(t)
    if (e) {
      let c = X - o
      ;(c || (c = X), (r = r + c))
    }
    let i = st(r, n),
      a = P(i)
    return { b: s, o: a, out: i }
  }
  function xo(t, e) {
    if (!e) return t
    let n = t.length
    if (!n) throw new Error('aes/pcks5: empty ciphertext not allowed')
    let r = t[n - 1]
    if (r <= 0 || r > 16) throw new Error(`aes/pcks5: wrong padding byte: ${r}`)
    let o = t.subarray(0, -r)
    for (let s = 0; s < r; s++) if (t[n - s - 1] !== r) throw new Error('aes/pcks5: wrong padding')
    return o
  }
  function vo(t) {
    let e = new Uint8Array(16),
      n = P(e)
    e.set(t)
    let r = X - t.length
    for (let o = X - r; o < X; o++) e[o] = r
    return n
  }
  var bu = we({ blockSize: 16 }, function (e, n = {}) {
      O(e)
      let r = !n.disablePadding
      return {
        encrypt: (o, s) => {
          O(o)
          let { b: i, o: a, out: c } = bo(o, r, s),
            l = Ve(e),
            f = 0
          for (; f + 4 <= i.length; ) {
            let { s0: u, s1: g, s2: y, s3: p } = ce(l, i[f + 0], i[f + 1], i[f + 2], i[f + 3])
            ;((a[f++] = u), (a[f++] = g), (a[f++] = y), (a[f++] = p))
          }
          if (r) {
            let u = vo(o.subarray(f * 4)),
              { s0: g, s1: y, s2: p, s3: d } = ce(l, u[0], u[1], u[2], u[3])
            ;((a[f++] = g), (a[f++] = y), (a[f++] = p), (a[f++] = d))
          }
          return (l.fill(0), c)
        },
        decrypt: (o, s) => {
          mo(o)
          let i = yo(e),
            a = st(o.length, s),
            c = P(o),
            l = P(a)
          for (let f = 0; f + 4 <= c.length; ) {
            let { s0: u, s1: g, s2: y, s3: p } = wo(i, c[f + 0], c[f + 1], c[f + 2], c[f + 3])
            ;((l[f++] = u), (l[f++] = g), (l[f++] = y), (l[f++] = p))
          }
          return (i.fill(0), xo(a, r))
        },
      }
    }),
    zn = we({ blockSize: 16, nonceLength: 16 }, function (e, n, r = {}) {
      ;(O(e), O(n, 16))
      let o = !r.disablePadding
      return {
        encrypt: (s, i) => {
          let a = Ve(e),
            { b: c, o: l, out: f } = bo(s, o, i),
            u = P(n),
            g = u[0],
            y = u[1],
            p = u[2],
            d = u[3],
            h = 0
          for (; h + 4 <= c.length; )
            ((g ^= c[h + 0]),
              (y ^= c[h + 1]),
              (p ^= c[h + 2]),
              (d ^= c[h + 3]),
              ({ s0: g, s1: y, s2: p, s3: d } = ce(a, g, y, p, d)),
              (l[h++] = g),
              (l[h++] = y),
              (l[h++] = p),
              (l[h++] = d))
          if (o) {
            let w = vo(s.subarray(h * 4))
            ;((g ^= w[0]),
              (y ^= w[1]),
              (p ^= w[2]),
              (d ^= w[3]),
              ({ s0: g, s1: y, s2: p, s3: d } = ce(a, g, y, p, d)),
              (l[h++] = g),
              (l[h++] = y),
              (l[h++] = p),
              (l[h++] = d))
          }
          return (a.fill(0), f)
        },
        decrypt: (s, i) => {
          mo(s)
          let a = yo(e),
            c = P(n),
            l = st(s.length, i),
            f = P(s),
            u = P(l),
            g = c[0],
            y = c[1],
            p = c[2],
            d = c[3]
          for (let h = 0; h + 4 <= f.length; ) {
            let w = g,
              m = y,
              x = p,
              T = d
            ;((g = f[h + 0]), (y = f[h + 1]), (p = f[h + 2]), (d = f[h + 3]))
            let { s0: L, s1: A, s2: S, s3: k } = wo(a, g, y, p, d)
            ;((u[h++] = L ^ w), (u[h++] = A ^ m), (u[h++] = S ^ x), (u[h++] = k ^ T))
          }
          return (a.fill(0), xo(l, o))
        },
      }
    }),
    xu = we({ blockSize: 16, nonceLength: 16 }, function (e, n) {
      ;(O(e), O(n, 16))
      function r(o, s, i) {
        let a = Ve(e),
          c = o.length
        i = st(c, i)
        let l = P(o),
          f = P(i),
          u = s ? f : l,
          g = P(n),
          y = g[0],
          p = g[1],
          d = g[2],
          h = g[3]
        for (let m = 0; m + 4 <= l.length; ) {
          let { s0: x, s1: T, s2: L, s3: A } = ce(a, y, p, d, h)
          ;((f[m + 0] = l[m + 0] ^ x),
            (f[m + 1] = l[m + 1] ^ T),
            (f[m + 2] = l[m + 2] ^ L),
            (f[m + 3] = l[m + 3] ^ A),
            (y = u[m++]),
            (p = u[m++]),
            (d = u[m++]),
            (h = u[m++]))
        }
        let w = X * Math.floor(l.length / Wn)
        if (w < c) {
          ;({ s0: y, s1: p, s2: d, s3: h } = ce(a, y, p, d, h))
          let m = Wt(new Uint32Array([y, p, d, h]))
          for (let x = w, T = 0; x < c; x++, T++) i[x] = o[x] ^ m[T]
          m.fill(0)
        }
        return (a.fill(0), i)
      }
      return { encrypt: (o, s) => r(o, !0, s), decrypt: (o, s) => r(o, !1, s) }
    })
  function Eo(t, e, n, r, o) {
    let s = t.create(n, r.length + (o?.length || 0))
    ;(o && s.update(o), s.update(r))
    let i = new Uint8Array(16),
      a = Me(i)
    return (
      o && Ze(a, 0, BigInt(o.length * 8), e),
      Ze(a, 8, BigInt(r.length * 8), e),
      s.update(i),
      s.digest()
    )
  }
  var vu = we({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      if ((O(n), n.length === 0)) throw new Error('aes/gcm: empty nonce')
      let o = 16
      function s(a, c, l) {
        let f = Eo(Mn, !1, a, l, r)
        for (let u = 0; u < c.length; u++) f[u] ^= c[u]
        return f
      }
      function i() {
        let a = Ve(e),
          c = jt.slice(),
          l = jt.slice()
        if ((ht(a, !1, l, l, c), n.length === 12)) l.set(n)
        else {
          let u = jt.slice(),
            g = Me(u)
          ;(Ze(g, 8, BigInt(n.length * 8), !1), Mn.create(c).update(n).update(u).digestInto(l))
        }
        let f = ht(a, !1, l, jt)
        return { xk: a, authKey: c, counter: l, tagMask: f }
      }
      return {
        encrypt: a => {
          O(a)
          let { xk: c, authKey: l, counter: f, tagMask: u } = i(),
            g = new Uint8Array(a.length + o)
          ht(c, !1, f, a, g)
          let y = s(l, u, g.subarray(0, g.length - o))
          return (g.set(y, a.length), c.fill(0), g)
        },
        decrypt: a => {
          if ((O(a), a.length < o)) throw new Error(`aes/gcm: ciphertext less than tagLen (${o})`)
          let { xk: c, authKey: l, counter: f, tagMask: u } = i(),
            g = a.subarray(0, -o),
            y = a.subarray(-o),
            p = s(l, u, g)
          if (!Ke(p, y)) throw new Error('aes/gcm: invalid ghash tag')
          let d = ht(c, !1, f, g)
          return (l.fill(0), u.fill(0), c.fill(0), d)
        },
      }
    }),
    zt = (t, e, n) => r => {
      if (!Number.isSafeInteger(r) || e > r || r > n)
        throw new Error(`${t}: invalid value=${r}, must be [${e}..${n}]`)
    },
    Eu = we({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      let s = zt('AAD', 0, 68719476736),
        i = zt('plaintext', 0, 2 ** 36),
        a = zt('nonce', 12, 12),
        c = zt('ciphertext', 16, 2 ** 36 + 16)
      ;(O(n), a(n.length), r && (O(r), s(r.length)))
      function l() {
        let g = e.length
        if (g !== 16 && g !== 24 && g !== 32)
          throw new Error(`key length must be 16, 24 or 32 bytes, got: ${g} bytes`)
        let y = Ve(e),
          p = new Uint8Array(g),
          d = new Uint8Array(16),
          h = P(n),
          w = 0,
          m = h[0],
          x = h[1],
          T = h[2],
          L = 0
        for (let A of [d, p].map(P)) {
          let S = P(A)
          for (let k = 0; k < S.length; k += 2) {
            let { s0: N, s1: U } = ce(y, w, m, x, T)
            ;((S[k + 0] = N), (S[k + 1] = U), (w = ++L))
          }
        }
        return (y.fill(0), { authKey: d, encKey: Ve(p) })
      }
      function f(g, y, p) {
        let d = Eo(ho, !0, y, p, r)
        for (let L = 0; L < 12; L++) d[L] ^= n[L]
        d[15] &= 127
        let h = P(d),
          w = h[0],
          m = h[1],
          x = h[2],
          T = h[3]
        return (
          ({ s0: w, s1: m, s2: x, s3: T } = ce(g, w, m, x, T)),
          (h[0] = w),
          (h[1] = m),
          (h[2] = x),
          (h[3] = T),
          d
        )
      }
      function u(g, y, p) {
        let d = y.slice()
        return ((d[15] |= 128), ht(g, !0, d, p))
      }
      return {
        encrypt: g => {
          ;(O(g), i(g.length))
          let { encKey: y, authKey: p } = l(),
            d = f(y, p, g),
            h = new Uint8Array(g.length + 16)
          return (h.set(d, g.length), h.set(u(y, d, g)), y.fill(0), p.fill(0), h)
        },
        decrypt: g => {
          ;(O(g), c(g.length))
          let y = g.subarray(-16),
            { encKey: p, authKey: d } = l(),
            h = u(p, y, g.subarray(0, -16)),
            w = f(p, d, h)
          if ((p.fill(0), d.fill(0), !Ke(y, w))) throw new Error('invalid polyval tag')
          return h
        },
      }
    })
  var F = (t, e) => (t[e++] & 255) | ((t[e++] & 255) << 8),
    Kn = class {
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
          g = i[5],
          y = i[6],
          p = i[7],
          d = i[8],
          h = i[9],
          w = F(e, n + 0),
          m = F(e, n + 2),
          x = F(e, n + 4),
          T = F(e, n + 6),
          L = F(e, n + 8),
          A = F(e, n + 10),
          S = F(e, n + 12),
          k = F(e, n + 14),
          N = s[0] + (w & 8191),
          U = s[1] + (((w >>> 13) | (m << 3)) & 8191),
          _ = s[2] + (((m >>> 10) | (x << 6)) & 8191),
          $ = s[3] + (((x >>> 7) | (T << 9)) & 8191),
          H = s[4] + (((T >>> 4) | (L << 12)) & 8191),
          V = s[5] + ((L >>> 1) & 8191),
          b = s[6] + (((L >>> 14) | (A << 2)) & 8191),
          v = s[7] + (((A >>> 11) | (S << 5)) & 8191),
          I = s[8] + (((S >>> 8) | (k << 8)) & 8191),
          C = s[9] + ((k >>> 5) | o),
          E = 0,
          R = E + N * a + U * (5 * h) + _ * (5 * d) + $ * (5 * p) + H * (5 * y)
        ;((E = R >>> 13),
          (R &= 8191),
          (R += V * (5 * g) + b * (5 * u) + v * (5 * f) + I * (5 * l) + C * (5 * c)),
          (E += R >>> 13),
          (R &= 8191))
        let q = E + N * c + U * a + _ * (5 * h) + $ * (5 * d) + H * (5 * p)
        ;((E = q >>> 13),
          (q &= 8191),
          (q += V * (5 * y) + b * (5 * g) + v * (5 * u) + I * (5 * f) + C * (5 * l)),
          (E += q >>> 13),
          (q &= 8191))
        let M = E + N * l + U * c + _ * a + $ * (5 * h) + H * (5 * d)
        ;((E = M >>> 13),
          (M &= 8191),
          (M += V * (5 * p) + b * (5 * y) + v * (5 * g) + I * (5 * u) + C * (5 * f)),
          (E += M >>> 13),
          (M &= 8191))
        let G = E + N * f + U * l + _ * c + $ * a + H * (5 * h)
        ;((E = G >>> 13),
          (G &= 8191),
          (G += V * (5 * d) + b * (5 * p) + v * (5 * y) + I * (5 * g) + C * (5 * u)),
          (E += G >>> 13),
          (G &= 8191))
        let Y = E + N * u + U * f + _ * l + $ * c + H * a
        ;((E = Y >>> 13),
          (Y &= 8191),
          (Y += V * (5 * h) + b * (5 * d) + v * (5 * p) + I * (5 * y) + C * (5 * g)),
          (E += Y >>> 13),
          (Y &= 8191))
        let te = E + N * g + U * u + _ * f + $ * l + H * c
        ;((E = te >>> 13),
          (te &= 8191),
          (te += V * a + b * (5 * h) + v * (5 * d) + I * (5 * p) + C * (5 * y)),
          (E += te >>> 13),
          (te &= 8191))
        let oe = E + N * y + U * g + _ * u + $ * f + H * l
        ;((E = oe >>> 13),
          (oe &= 8191),
          (oe += V * c + b * a + v * (5 * h) + I * (5 * d) + C * (5 * p)),
          (E += oe >>> 13),
          (oe &= 8191))
        let Q = E + N * p + U * y + _ * g + $ * u + H * f
        ;((E = Q >>> 13),
          (Q &= 8191),
          (Q += V * l + b * c + v * a + I * (5 * h) + C * (5 * d)),
          (E += Q >>> 13),
          (Q &= 8191))
        let he = E + N * d + U * p + _ * y + $ * g + H * u
        ;((E = he >>> 13),
          (he &= 8191),
          (he += V * f + b * l + v * c + I * a + C * (5 * h)),
          (E += he >>> 13),
          (he &= 8191))
        let ee = E + N * h + U * d + _ * p + $ * y + H * g
        ;((E = ee >>> 13),
          (ee &= 8191),
          (ee += V * u + b * f + v * l + I * c + C * a),
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
          (s[7] = Q),
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
        ;(He(this), dt(e, this), (this.finished = !0))
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
  function Ji(t) {
    let e = (r, o) => t(o).update(ye(r)).digest(),
      n = t(new Uint8Array(32))
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = r => t(r)), e)
  }
  var To = Ji(t => new Kn(t))
  var So = t => Uint8Array.from(t.split('').map(e => e.charCodeAt(0))),
    Fi = So('expand 16-byte k'),
    Yi = So('expand 32-byte k'),
    Qi = P(Fi),
    Bo = P(Yi),
    Iu = Bo.slice()
  function B(t, e) {
    return (t << e) | (t >>> (32 - e))
  }
  function Zn(t) {
    return t.byteOffset % 4 === 0
  }
  var Kt = 64,
    Xi = 16,
    Lo = 2 ** 32 - 1,
    Ao = new Uint32Array()
  function ea(t, e, n, r, o, s, i, a) {
    let c = o.length,
      l = new Uint8Array(Kt),
      f = P(l),
      u = Zn(o) && Zn(s),
      g = u ? P(o) : Ao,
      y = u ? P(s) : Ao
    for (let p = 0; p < c; i++) {
      if ((t(e, n, r, f, i, a), i >= Lo)) throw new Error('arx: counter overflow')
      let d = Math.min(Kt, c - p)
      if (u && d === Kt) {
        let h = p / 4
        if (p % 4 !== 0) throw new Error('arx: invalid block position')
        for (let w = 0, m; w < Xi; w++) ((m = h + w), (y[m] = g[m] ^ f[w]))
        p += Kt
        continue
      }
      for (let h = 0, w; h < d; h++) ((w = p + h), (s[w] = o[w] ^ l[h]))
      p += d
    }
  }
  function Gn(t, e) {
    let {
      allowShortKeys: n,
      extendNonceFn: r,
      counterLength: o,
      counterRight: s,
      rounds: i,
    } = fo({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, e)
    if (typeof t != 'function') throw new Error('core must be a function')
    return (
      Vt(o),
      Vt(i),
      On(s),
      On(n),
      (a, c, l, f, u = 0) => {
        ;(O(a), O(c), O(l))
        let g = l.length
        if ((f || (f = new Uint8Array(g)), O(f), Vt(u), u < 0 || u >= Lo))
          throw new Error('arx: counter overflow')
        if (f.length < g) throw new Error(`arx: output (${f.length}) is shorter than data (${g})`)
        let y = [],
          p = a.length,
          d,
          h
        if (p === 32) ((d = a.slice()), y.push(d), (h = Bo))
        else if (p === 16 && n)
          ((d = new Uint8Array(32)), d.set(a), d.set(a, 16), (h = Qi), y.push(d))
        else throw new Error(`arx: invalid 32-byte key, got length=${p}`)
        Zn(c) || ((c = c.slice()), y.push(c))
        let w = P(d)
        if (r) {
          if (c.length !== 24) throw new Error('arx: extended nonce must be 24 bytes')
          ;(r(h, w, P(c.subarray(0, 16)), w), (c = c.subarray(16)))
        }
        let m = 16 - o
        if (m !== c.length) throw new Error(`arx: nonce must be ${m} or 16 bytes`)
        if (m !== 12) {
          let T = new Uint8Array(12)
          ;(T.set(c, s ? 0 : 12 - c.length), (c = T), y.push(c))
        }
        let x = P(c)
        for (ea(t, h, w, x, l, f, u, i); y.length > 0; ) y.pop().fill(0)
        return f
      }
    )
  }
  function _o(t, e, n, r, o, s = 20) {
    let i = t[0],
      a = t[1],
      c = t[2],
      l = t[3],
      f = e[0],
      u = e[1],
      g = e[2],
      y = e[3],
      p = e[4],
      d = e[5],
      h = e[6],
      w = e[7],
      m = o,
      x = n[0],
      T = n[1],
      L = n[2],
      A = i,
      S = a,
      k = c,
      N = l,
      U = f,
      _ = u,
      $ = g,
      H = y,
      V = p,
      b = d,
      v = h,
      I = w,
      C = m,
      E = x,
      R = T,
      q = L
    for (let G = 0; G < s; G += 2)
      ((A = (A + U) | 0),
        (C = B(C ^ A, 16)),
        (V = (V + C) | 0),
        (U = B(U ^ V, 12)),
        (A = (A + U) | 0),
        (C = B(C ^ A, 8)),
        (V = (V + C) | 0),
        (U = B(U ^ V, 7)),
        (S = (S + _) | 0),
        (E = B(E ^ S, 16)),
        (b = (b + E) | 0),
        (_ = B(_ ^ b, 12)),
        (S = (S + _) | 0),
        (E = B(E ^ S, 8)),
        (b = (b + E) | 0),
        (_ = B(_ ^ b, 7)),
        (k = (k + $) | 0),
        (R = B(R ^ k, 16)),
        (v = (v + R) | 0),
        ($ = B($ ^ v, 12)),
        (k = (k + $) | 0),
        (R = B(R ^ k, 8)),
        (v = (v + R) | 0),
        ($ = B($ ^ v, 7)),
        (N = (N + H) | 0),
        (q = B(q ^ N, 16)),
        (I = (I + q) | 0),
        (H = B(H ^ I, 12)),
        (N = (N + H) | 0),
        (q = B(q ^ N, 8)),
        (I = (I + q) | 0),
        (H = B(H ^ I, 7)),
        (A = (A + _) | 0),
        (q = B(q ^ A, 16)),
        (v = (v + q) | 0),
        (_ = B(_ ^ v, 12)),
        (A = (A + _) | 0),
        (q = B(q ^ A, 8)),
        (v = (v + q) | 0),
        (_ = B(_ ^ v, 7)),
        (S = (S + $) | 0),
        (C = B(C ^ S, 16)),
        (I = (I + C) | 0),
        ($ = B($ ^ I, 12)),
        (S = (S + $) | 0),
        (C = B(C ^ S, 8)),
        (I = (I + C) | 0),
        ($ = B($ ^ I, 7)),
        (k = (k + H) | 0),
        (E = B(E ^ k, 16)),
        (V = (V + E) | 0),
        (H = B(H ^ V, 12)),
        (k = (k + H) | 0),
        (E = B(E ^ k, 8)),
        (V = (V + E) | 0),
        (H = B(H ^ V, 7)),
        (N = (N + U) | 0),
        (R = B(R ^ N, 16)),
        (b = (b + R) | 0),
        (U = B(U ^ b, 12)),
        (N = (N + U) | 0),
        (R = B(R ^ N, 8)),
        (b = (b + R) | 0),
        (U = B(U ^ b, 7)))
    let M = 0
    ;((r[M++] = (i + A) | 0),
      (r[M++] = (a + S) | 0),
      (r[M++] = (c + k) | 0),
      (r[M++] = (l + N) | 0),
      (r[M++] = (f + U) | 0),
      (r[M++] = (u + _) | 0),
      (r[M++] = (g + $) | 0),
      (r[M++] = (y + H) | 0),
      (r[M++] = (p + V) | 0),
      (r[M++] = (d + b) | 0),
      (r[M++] = (h + v) | 0),
      (r[M++] = (w + I) | 0),
      (r[M++] = (m + C) | 0),
      (r[M++] = (x + E) | 0),
      (r[M++] = (T + R) | 0),
      (r[M++] = (L + q) | 0))
  }
  function ta(t, e, n, r) {
    let o = t[0],
      s = t[1],
      i = t[2],
      a = t[3],
      c = e[0],
      l = e[1],
      f = e[2],
      u = e[3],
      g = e[4],
      y = e[5],
      p = e[6],
      d = e[7],
      h = n[0],
      w = n[1],
      m = n[2],
      x = n[3]
    for (let L = 0; L < 20; L += 2)
      ((o = (o + c) | 0),
        (h = B(h ^ o, 16)),
        (g = (g + h) | 0),
        (c = B(c ^ g, 12)),
        (o = (o + c) | 0),
        (h = B(h ^ o, 8)),
        (g = (g + h) | 0),
        (c = B(c ^ g, 7)),
        (s = (s + l) | 0),
        (w = B(w ^ s, 16)),
        (y = (y + w) | 0),
        (l = B(l ^ y, 12)),
        (s = (s + l) | 0),
        (w = B(w ^ s, 8)),
        (y = (y + w) | 0),
        (l = B(l ^ y, 7)),
        (i = (i + f) | 0),
        (m = B(m ^ i, 16)),
        (p = (p + m) | 0),
        (f = B(f ^ p, 12)),
        (i = (i + f) | 0),
        (m = B(m ^ i, 8)),
        (p = (p + m) | 0),
        (f = B(f ^ p, 7)),
        (a = (a + u) | 0),
        (x = B(x ^ a, 16)),
        (d = (d + x) | 0),
        (u = B(u ^ d, 12)),
        (a = (a + u) | 0),
        (x = B(x ^ a, 8)),
        (d = (d + x) | 0),
        (u = B(u ^ d, 7)),
        (o = (o + l) | 0),
        (x = B(x ^ o, 16)),
        (p = (p + x) | 0),
        (l = B(l ^ p, 12)),
        (o = (o + l) | 0),
        (x = B(x ^ o, 8)),
        (p = (p + x) | 0),
        (l = B(l ^ p, 7)),
        (s = (s + f) | 0),
        (h = B(h ^ s, 16)),
        (d = (d + h) | 0),
        (f = B(f ^ d, 12)),
        (s = (s + f) | 0),
        (h = B(h ^ s, 8)),
        (d = (d + h) | 0),
        (f = B(f ^ d, 7)),
        (i = (i + u) | 0),
        (w = B(w ^ i, 16)),
        (g = (g + w) | 0),
        (u = B(u ^ g, 12)),
        (i = (i + u) | 0),
        (w = B(w ^ i, 8)),
        (g = (g + w) | 0),
        (u = B(u ^ g, 7)),
        (a = (a + c) | 0),
        (m = B(m ^ a, 16)),
        (y = (y + m) | 0),
        (c = B(c ^ y, 12)),
        (a = (a + c) | 0),
        (m = B(m ^ a, 8)),
        (y = (y + m) | 0),
        (c = B(c ^ y, 7)))
    let T = 0
    ;((r[T++] = o),
      (r[T++] = s),
      (r[T++] = i),
      (r[T++] = a),
      (r[T++] = h),
      (r[T++] = w),
      (r[T++] = m),
      (r[T++] = x))
  }
  var Zt = Gn(_o, { counterRight: !1, counterLength: 4, allowShortKeys: !1 }),
    na = Gn(_o, { counterRight: !1, counterLength: 8, extendNonceFn: ta, allowShortKeys: !1 })
  var ra = new Uint8Array(16),
    ko = (t, e) => {
      t.update(e)
      let n = e.length % 16
      n && t.update(ra.subarray(n))
    },
    oa = new Uint8Array(32)
  function Io(t, e, n, r, o) {
    let s = t(e, n, oa),
      i = To.create(s)
    ;(o && ko(i, o), ko(i, r))
    let a = new Uint8Array(16),
      c = Me(a)
    ;(Ze(c, 0, BigInt(o ? o.length : 0), !0), Ze(c, 8, BigInt(r.length), !0), i.update(a))
    let l = i.digest()
    return (s.fill(0), l)
  }
  var Uo = t => (e, n, r) => (
      O(e, 32),
      O(n),
      {
        encrypt: (s, i) => {
          let a = s.length,
            c = a + 16
          ;(i ? O(i, c) : (i = new Uint8Array(c)), t(e, n, s, i, 1))
          let l = Io(t, e, n, i.subarray(0, -16), r)
          return (i.set(l, a), i)
        },
        decrypt: (s, i) => {
          let a = s.length,
            c = a - 16
          if (a < 16) throw new Error('encrypted data must be at least 16 bytes')
          i ? O(i, c) : (i = new Uint8Array(c))
          let l = s.subarray(0, -16),
            f = s.subarray(-16),
            u = Io(t, e, n, l, r)
          if (!Ke(f, u)) throw new Error('invalid tag')
          return (t(e, n, l, i, 1), i)
        },
      }
    ),
    Ou = we({ blockSize: 64, nonceLength: 12, tagLength: 16 }, Uo(Zt)),
    Pu = we({ blockSize: 64, nonceLength: 24, tagLength: 16 }, Uo(na))
  var Gt = class extends tt {
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
    it = (t, e, n) => new Gt(t, e).update(n).digest()
  it.create = (t, e) => new Gt(t, e)
  function No(t, e, n) {
    return (re.hash(t), n === void 0 && (n = new Uint8Array(t.outputLen)), it(t, Ne(n), Ne(e)))
  }
  var Jn = new Uint8Array([0]),
    Co = new Uint8Array()
  function Ro(t, e, n, r = 32) {
    if ((re.hash(t), re.number(r), r > 255 * t.outputLen))
      throw new Error('Length should be <= 255*HashLen')
    let o = Math.ceil(r / t.outputLen)
    n === void 0 && (n = Co)
    let s = new Uint8Array(o * t.outputLen),
      i = it.create(t, e),
      a = i._cloneInto(),
      c = new Uint8Array(i.outputLen)
    for (let l = 0; l < o; l++)
      ((Jn[0] = l + 1),
        a
          .update(l === 0 ? Co : c)
          .update(n)
          .update(Jn)
          .digestInto(c),
        s.set(c, t.outputLen * l),
        i._cloneInto(a))
    return (i.destroy(), a.destroy(), c.fill(0), Jn.fill(0), s.slice(0, r))
  }
  var sa = Object.defineProperty,
    W = (t, e) => {
      for (var n in e) sa(t, n, { get: e[n], enumerable: !0 })
    },
    at = Symbol('verified'),
    ia = t => t instanceof Object
  function Yn(t) {
    if (
      !ia(t) ||
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
  var aa = {}
  W(aa, {
    Queue: () => ua,
    QueueNode: () => $o,
    binarySearch: () => Qn,
    bytesToHex: () => j,
    hexToBytes: () => Te,
    insertEventIntoAscendingList: () => fa,
    insertEventIntoDescendingList: () => la,
    normalizeURL: () => ca,
    utf8Decoder: () => ke,
    utf8Encoder: () => de,
  })
  var ke = new TextDecoder('utf-8'),
    de = new TextEncoder()
  function ca(t) {
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
  function la(t, e) {
    let [n, r] = Qn(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : o.created_at - e.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function fa(t, e) {
    let [n, r] = Qn(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : e.created_at - o.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function Qn(t, e) {
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
  var $o = class {
      constructor(t) {
        Ye(this, 'value')
        Ye(this, 'next', null)
        Ye(this, 'prev', null)
        this.value = t
      }
    },
    ua = class {
      constructor() {
        Ye(this, 'first')
        Ye(this, 'last')
        ;((this.first = null), (this.last = null))
      }
      enqueue(t) {
        let e = new $o(t)
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
    da = class {
      generateSecretKey() {
        return et.utils.randomPrivateKey()
      }
      getPublicKey(t) {
        return j(et.getPublicKey(t))
      }
      finalizeEvent(t, e) {
        let n = t
        return (
          (n.pubkey = j(et.getPublicKey(e))),
          (n.id = Jt(n)),
          (n.sig = j(et.sign(Jt(n), e))),
          (n[at] = !0),
          n
        )
      }
      verifyEvent(t) {
        if (typeof t[at] == 'boolean') return t[at]
        let e = Jt(t)
        if (e !== t.id) return ((t[at] = !1), !1)
        try {
          let n = et.verify(t.sig, e, t.pubkey)
          return ((t[at] = n), n)
        } catch {
          return ((t[at] = !1), !1)
        }
      }
    }
  function ha(t) {
    if (!Yn(t)) throw new Error("can't serialize event with wrong or missing properties")
    return JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content])
  }
  function Jt(t) {
    let e = ge(de.encode(ha(t)))
    return j(e)
  }
  var Yt = new da(),
    pa = Yt.generateSecretKey,
    Xn = Yt.getPublicKey,
    xe = Yt.finalizeEvent,
    er = Yt.verifyEvent,
    ga = {}
  W(ga, {
    Application: () => pc,
    BadgeAward: () => Ta,
    BadgeDefinition: () => ac,
    BlockedRelaysList: () => za,
    BookmarkList: () => Wa,
    Bookmarksets: () => oc,
    Calendar: () => vc,
    CalendarEventRSVP: () => Ec,
    ChannelCreation: () => Do,
    ChannelHideMessage: () => Ko,
    ChannelMessage: () => zo,
    ChannelMetadata: () => jo,
    ChannelMuteUser: () => Zo,
    ClassifiedListing: () => wc,
    ClientAuth: () => Jo,
    CommunitiesList: () => Da,
    CommunityDefinition: () => Sc,
    CommunityPostApproval: () => Ua,
    Contacts: () => xa,
    CreateOrUpdateProduct: () => fc,
    CreateOrUpdateStall: () => lc,
    Curationsets: () => sc,
    Date: () => bc,
    DirectMessageRelaysList: () => Ja,
    DraftClassifiedListing: () => mc,
    DraftLong: () => dc,
    Emojisets: () => hc,
    EncryptedDirectMessage: () => va,
    EventDeletion: () => Ea,
    FileMetadata: () => Sa,
    FileServerPreference: () => Fa,
    Followsets: () => tc,
    GenericRepost: () => sr,
    Genericlists: () => nc,
    GiftWrap: () => Go,
    HTTPAuth: () => ir,
    Handlerinformation: () => Ac,
    Handlerrecommendation: () => Tc,
    Highlights: () => Ha,
    InterestsList: () => Za,
    Interestsets: () => cc,
    JobFeedback: () => Ra,
    JobRequest: () => Ca,
    JobResult: () => Na,
    Label: () => _a,
    LightningPubRPC: () => Qa,
    LiveChatMessage: () => Ba,
    LiveEvent: () => gc,
    LongFormArticle: () => uc,
    Metadata: () => ma,
    Mutelist: () => Ma,
    NWCWalletInfo: () => Ya,
    NWCWalletRequest: () => Fo,
    NWCWalletResponse: () => Xa,
    NostrConnect: () => ec,
    OpenTimestamps: () => Aa,
    Pinlist: () => qa,
    PrivateDirectMessage: () => Wo,
    ProblemTracker: () => La,
    ProfileBadges: () => ic,
    PublicChatsList: () => ja,
    Reaction: () => or,
    RecommendRelay: () => ba,
    RelayList: () => Va,
    Relaysets: () => rc,
    Report: () => ka,
    Reporting: () => Ia,
    Repost: () => rr,
    Seal: () => Vo,
    SearchRelaysList: () => Ka,
    ShortTextNote: () => qo,
    Time: () => xc,
    UserEmojiList: () => Ga,
    UserStatuses: () => yc,
    Zap: () => $a,
    ZapGoal: () => Oa,
    ZapRequest: () => Pa,
    classifyKind: () => ya,
    isAddressableKind: () => nr,
    isEphemeralKind: () => Mo,
    isKind: () => wa,
    isRegularKind: () => Ho,
    isReplaceableKind: () => tr,
  })
  function Ho(t) {
    return (1e3 <= t && t < 1e4) || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(t)
  }
  function tr(t) {
    return [0, 3].includes(t) || (1e4 <= t && t < 2e4)
  }
  function Mo(t) {
    return 2e4 <= t && t < 3e4
  }
  function nr(t) {
    return 3e4 <= t && t < 4e4
  }
  function ya(t) {
    return Ho(t)
      ? 'regular'
      : tr(t)
        ? 'replaceable'
        : Mo(t)
          ? 'ephemeral'
          : nr(t)
            ? 'parameterized'
            : 'unknown'
  }
  function wa(t, e) {
    let n = e instanceof Array ? e : [e]
    return (Yn(t) && n.includes(t.kind)) || !1
  }
  var ma = 0,
    qo = 1,
    ba = 2,
    xa = 3,
    va = 4,
    Ea = 5,
    rr = 6,
    or = 7,
    Ta = 8,
    Vo = 13,
    Wo = 14,
    sr = 16,
    Do = 40,
    jo = 41,
    zo = 42,
    Ko = 43,
    Zo = 44,
    Aa = 1040,
    Go = 1059,
    Sa = 1063,
    Ba = 1311,
    La = 1971,
    ka = 1984,
    Ia = 1984,
    _a = 1985,
    Ua = 4550,
    Ca = 5999,
    Na = 6999,
    Ra = 7e3,
    Oa = 9041,
    Pa = 9734,
    $a = 9735,
    Ha = 9802,
    Ma = 1e4,
    qa = 10001,
    Va = 10002,
    Wa = 10003,
    Da = 10004,
    ja = 10005,
    za = 10006,
    Ka = 10007,
    Za = 10015,
    Ga = 10030,
    Ja = 10050,
    Fa = 10096,
    Ya = 13194,
    Qa = 21e3,
    Jo = 22242,
    Fo = 23194,
    Xa = 23195,
    ec = 24133,
    ir = 27235,
    tc = 3e4,
    nc = 30001,
    rc = 30002,
    oc = 30003,
    sc = 30004,
    ic = 30008,
    ac = 30009,
    cc = 30015,
    lc = 30017,
    fc = 30018,
    uc = 30023,
    dc = 30024,
    hc = 30030,
    pc = 30078,
    gc = 30311,
    yc = 30315,
    wc = 30402,
    mc = 30403,
    bc = 31922,
    xc = 31923,
    vc = 31924,
    Ec = 31925,
    Tc = 31989,
    Ac = 31990,
    Sc = 34550
  var Bc = {}
  W(Bc, {
    getHex64: () => ar,
    getInt: () => Yo,
    getSubscriptionId: () => Lc,
    matchEventId: () => kc,
    matchEventKind: () => _c,
    matchEventPubkey: () => Ic,
  })
  function ar(t, e) {
    let n = e.length + 3,
      r = t.indexOf(`"${e}":`) + n,
      o = t.slice(r).indexOf('"') + r + 1
    return t.slice(o, o + 64)
  }
  function Yo(t, e) {
    let n = e.length,
      r = t.indexOf(`"${e}":`) + n + 3,
      o = t.slice(r),
      s = Math.min(o.indexOf(','), o.indexOf('}'))
    return parseInt(o.slice(0, s), 10)
  }
  function Lc(t) {
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
  function kc(t, e) {
    return e === ar(t, 'id')
  }
  function Ic(t, e) {
    return e === ar(t, 'pubkey')
  }
  function _c(t, e) {
    return e === Yo(t, 'kind')
  }
  var Uc = {}
  W(Uc, { makeAuthEvent: () => Cc })
  function Cc(t, e) {
    return {
      kind: Jo,
      created_at: Math.floor(Date.now() / 1e3),
      tags: [
        ['relay', t],
        ['challenge', e],
      ],
      content: '',
    }
  }
  var Nc
  try {
    Nc = WebSocket
  } catch {}
  var Rc
  try {
    Rc = WebSocket
  } catch {}
  var cr = {}
  W(cr, {
    BECH32_REGEX: () => Qo,
    Bech32MaxSize: () => lr,
    NostrTypeGuard: () => Oc,
    decode: () => Qt,
    decodeNostrURI: () => $c,
    encodeBytes: () => en,
    naddrEncode: () => Dc,
    neventEncode: () => Wc,
    noteEncode: () => qc,
    nprofileEncode: () => Vc,
    npubEncode: () => Mc,
    nsecEncode: () => Hc,
  })
  var Oc = {
      isNProfile: t => /^nprofile1[a-z\d]+$/.test(t || ''),
      isNEvent: t => /^nevent1[a-z\d]+$/.test(t || ''),
      isNAddr: t => /^naddr1[a-z\d]+$/.test(t || ''),
      isNSec: t => /^nsec1[a-z\d]{58}$/.test(t || ''),
      isNPub: t => /^npub1[a-z\d]{58}$/.test(t || ''),
      isNote: t => /^note1[a-z\d]+$/.test(t || ''),
      isNcryptsec: t => /^ncryptsec1[a-z\d]+$/.test(t || ''),
    },
    lr = 5e3,
    Qo = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/
  function Pc(t) {
    let e = new Uint8Array(4)
    return (
      (e[0] = (t >> 24) & 255),
      (e[1] = (t >> 16) & 255),
      (e[2] = (t >> 8) & 255),
      (e[3] = t & 255),
      e
    )
  }
  function $c(t) {
    try {
      return (t.startsWith('nostr:') && (t = t.substring(6)), Qt(t))
    } catch {
      return { type: 'invalid', data: null }
    }
  }
  function Qt(t) {
    let { prefix: e, words: n } = $e.decode(t, lr),
      r = new Uint8Array($e.fromWords(n))
    switch (e) {
      case 'nprofile': {
        let o = Fn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        return {
          type: 'nprofile',
          data: { pubkey: j(o[0][0]), relays: o[1] ? o[1].map(s => ke.decode(s)) : [] },
        }
      }
      case 'nevent': {
        let o = Fn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nevent')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        if (o[2] && o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (o[3] && o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'nevent',
          data: {
            id: j(o[0][0]),
            relays: o[1] ? o[1].map(s => ke.decode(s)) : [],
            author: o[2]?.[0] ? j(o[2][0]) : void 0,
            kind: o[3]?.[0] ? parseInt(j(o[3][0]), 16) : void 0,
          },
        }
      }
      case 'naddr': {
        let o = Fn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for naddr')
        if (!o[2]?.[0]) throw new Error('missing TLV 2 for naddr')
        if (o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (!o[3]?.[0]) throw new Error('missing TLV 3 for naddr')
        if (o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'naddr',
          data: {
            identifier: ke.decode(o[0][0]),
            pubkey: j(o[2][0]),
            kind: parseInt(j(o[3][0]), 16),
            relays: o[1] ? o[1].map(s => ke.decode(s)) : [],
          },
        }
      }
      case 'nsec':
        return { type: e, data: r }
      case 'npub':
      case 'note':
        return { type: e, data: j(r) }
      default:
        throw new Error(`unknown prefix ${e}`)
    }
  }
  function Fn(t) {
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
  function Hc(t) {
    return en('nsec', t)
  }
  function Mc(t) {
    return en('npub', Te(t))
  }
  function qc(t) {
    return en('note', Te(t))
  }
  function Xt(t, e) {
    let n = $e.toWords(e)
    return $e.encode(t, n, lr)
  }
  function en(t, e) {
    return Xt(t, e)
  }
  function Vc(t) {
    let e = fr({ 0: [Te(t.pubkey)], 1: (t.relays || []).map(n => de.encode(n)) })
    return Xt('nprofile', e)
  }
  function Wc(t) {
    let e
    t.kind !== void 0 && (e = Pc(t.kind))
    let n = fr({
      0: [Te(t.id)],
      1: (t.relays || []).map(r => de.encode(r)),
      2: t.author ? [Te(t.author)] : [],
      3: e ? [new Uint8Array(e)] : [],
    })
    return Xt('nevent', n)
  }
  function Dc(t) {
    let e = new ArrayBuffer(4)
    new DataView(e).setUint32(0, t.kind, !1)
    let n = fr({
      0: [de.encode(t.identifier)],
      1: (t.relays || []).map(r => de.encode(r)),
      2: [Te(t.pubkey)],
      3: [new Uint8Array(e)],
    })
    return Xt('naddr', n)
  }
  function fr(t) {
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
      nt(...e)
    )
  }
  var jc = {}
  W(jc, { decrypt: () => zc, encrypt: () => Xo })
  function Xo(t, e, n) {
    let r = t instanceof Uint8Array ? j(t) : t,
      o = Ce.getSharedSecret(r, '02' + e),
      s = es(o),
      i = Uint8Array.from(Pt(16)),
      a = de.encode(n),
      c = zn(s, i).encrypt(a),
      l = ie.encode(new Uint8Array(c)),
      f = ie.encode(new Uint8Array(i.buffer))
    return `${l}?iv=${f}`
  }
  function zc(t, e, n) {
    let r = t instanceof Uint8Array ? j(t) : t,
      [o, s] = n.split('?iv='),
      i = Ce.getSharedSecret(r, '02' + e),
      a = es(i),
      c = ie.decode(s),
      l = ie.decode(o),
      f = zn(a, c).decrypt(l)
    return ke.decode(f)
  }
  function es(t) {
    return t.slice(1, 33)
  }
  var Kc = {}
  W(Kc, {
    NIP05_REGEX: () => ur,
    isNip05: () => Zc,
    isValid: () => Fc,
    queryProfile: () => ts,
    searchDomain: () => Jc,
    useFetchImplementation: () => Gc,
  })
  var ur = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/,
    Zc = t => ur.test(t || ''),
    tn
  try {
    tn = fetch
  } catch {}
  function Gc(t) {
    tn = t
  }
  async function Jc(t, e = '') {
    try {
      let n = `https://${t}/.well-known/nostr.json?name=${e}`,
        r = await tn(n, { redirect: 'manual' })
      if (r.status !== 200) throw Error('Wrong response code')
      return (await r.json()).names
    } catch {
      return {}
    }
  }
  async function ts(t) {
    let e = t.match(ur)
    if (!e) return null
    let [, n = '_', r] = e
    try {
      let o = `https://${r}/.well-known/nostr.json?name=${n}`,
        s = await tn(o, { redirect: 'manual' })
      if (s.status !== 200) throw Error('Wrong response code')
      let i = await s.json(),
        a = i.names[n]
      return a ? { pubkey: a, relays: i.relays?.[a] } : null
    } catch {
      return null
    }
  }
  async function Fc(t, e) {
    let n = await ts(e)
    return n ? n.pubkey === t : !1
  }
  var Yc = {}
  W(Yc, { parse: () => Qc })
  function Qc(t) {
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
  var Xc = {}
  W(Xc, { fetchRelayInformation: () => tl, useFetchImplementation: () => el })
  var ns
  try {
    ns = fetch
  } catch {}
  function el(t) {
    ns = t
  }
  async function tl(t) {
    return await (
      await fetch(t.replace('ws://', 'http://').replace('wss://', 'https://'), {
        headers: { Accept: 'application/nostr+json' },
      })
    ).json()
  }
  var nl = {}
  W(nl, { fastEventHash: () => os, getPow: () => rs, minePow: () => rl })
  function rs(t) {
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
  function rl(t, e) {
    let n = 0,
      r = t,
      o = ['nonce', n.toString(), e.toString()]
    for (r.tags.push(o); ; ) {
      let s = Math.floor(new Date().getTime() / 1e3)
      if (
        (s !== r.created_at && ((n = 0), (r.created_at = s)),
        (o[1] = (++n).toString()),
        (r.id = os(r)),
        rs(r.id) >= e)
      )
        break
    }
    return r
  }
  function os(t) {
    return j(ge(de.encode(JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content]))))
  }
  var ol = {}
  W(ol, {
    unwrapEvent: () => yl,
    unwrapManyEvents: () => wl,
    wrapEvent: () => ws,
    wrapManyEvents: () => gl,
  })
  var sl = {}
  W(sl, {
    createRumor: () => hs,
    createSeal: () => ps,
    createWrap: () => gs,
    unwrapEvent: () => yr,
    unwrapManyEvents: () => ys,
    wrapEvent: () => Ft,
    wrapManyEvents: () => hl,
  })
  var il = {}
  W(il, { decrypt: () => gr, encrypt: () => pr, getConversationKey: () => dr, v2: () => ul })
  var ss = 1,
    is = 65535
  function dr(t, e) {
    let n = Ce.getSharedSecret(t, '02' + e).subarray(1, 33)
    return No(ge, n, 'nip44-v2')
  }
  function as(t, e) {
    let n = Ro(ge, t, e, 76)
    return {
      chacha_key: n.subarray(0, 32),
      chacha_nonce: n.subarray(32, 44),
      hmac_key: n.subarray(44, 76),
    }
  }
  function hr(t) {
    if (!Number.isSafeInteger(t) || t < 1) throw new Error('expected positive integer')
    if (t <= 32) return 32
    let e = 1 << (Math.floor(Math.log2(t - 1)) + 1),
      n = e <= 256 ? 32 : e / 8
    return n * (Math.floor((t - 1) / n) + 1)
  }
  function al(t) {
    if (!Number.isSafeInteger(t) || t < ss || t > is)
      throw new Error('invalid plaintext size: must be between 1 and 65535 bytes')
    let e = new Uint8Array(2)
    return (new DataView(e.buffer).setUint16(0, t, !1), e)
  }
  function cl(t) {
    let e = de.encode(t),
      n = e.length,
      r = al(n),
      o = new Uint8Array(hr(n) - n)
    return nt(r, e, o)
  }
  function ll(t) {
    let e = new DataView(t.buffer).getUint16(0),
      n = t.subarray(2, 2 + e)
    if (e < ss || e > is || n.length !== e || t.length !== 2 + hr(e))
      throw new Error('invalid padding')
    return ke.decode(n)
  }
  function cs(t, e, n) {
    if (n.length !== 32) throw new Error('AAD associated data must be 32 bytes')
    let r = nt(n, e)
    return it(ge, t, r)
  }
  function fl(t) {
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
  function pr(t, e, n = Pt(32)) {
    let { chacha_key: r, chacha_nonce: o, hmac_key: s } = as(e, n),
      i = cl(t),
      a = Zt(r, o, i),
      c = cs(s, a, n)
    return ie.encode(nt(new Uint8Array([2]), n, a, c))
  }
  function gr(t, e) {
    let { nonce: n, ciphertext: r, mac: o } = fl(t),
      { chacha_key: s, chacha_nonce: i, hmac_key: a } = as(e, n),
      c = cs(a, r, n)
    if (!Ke(c, o)) throw new Error('invalid MAC')
    let l = Zt(s, i, r)
    return ll(l)
  }
  var ul = { utils: { getConversationKey: dr, calcPaddedLen: hr }, encrypt: pr, decrypt: gr },
    dl = 2880 * 60,
    ls = () => Math.round(Date.now() / 1e3),
    fs = () => Math.round(ls() - Math.random() * dl),
    us = (t, e) => dr(t, e),
    ds = (t, e, n) => pr(JSON.stringify(t), us(e, n)),
    Oo = (t, e) => JSON.parse(gr(t.content, us(e, t.pubkey)))
  function hs(t, e) {
    let n = { created_at: ls(), content: '', tags: [], ...t, pubkey: Xn(e) }
    return ((n.id = Jt(n)), n)
  }
  function ps(t, e, n) {
    return xe({ kind: Vo, content: ds(t, e, n), created_at: fs(), tags: [] }, e)
  }
  function gs(t, e) {
    let n = pa()
    return xe({ kind: Go, content: ds(t, n, e), created_at: fs(), tags: [['p', e]] }, n)
  }
  function Ft(t, e, n) {
    let r = hs(t, e),
      o = ps(r, e, n)
    return gs(o, n)
  }
  function hl(t, e, n) {
    if (!n || n.length === 0) throw new Error('At least one recipient is required.')
    let r = Xn(e),
      o = [Ft(t, e, r)]
    return (
      n.forEach(s => {
        o.push(Ft(t, e, s))
      }),
      o
    )
  }
  function yr(t, e) {
    let n = Oo(t, e)
    return Oo(n, e)
  }
  function ys(t, e) {
    let n = []
    return (
      t.forEach(r => {
        n.push(yr(r, e))
      }),
      n.sort((r, o) => r.created_at - o.created_at),
      n
    )
  }
  function pl(t, e, n, r) {
    let o = { created_at: Math.ceil(Date.now() / 1e3), kind: Wo, tags: [], content: e }
    return (
      (Array.isArray(t) ? t : [t]).forEach(({ publicKey: i, relayUrl: a }) => {
        o.tags.push(a ? ['p', i, a] : ['p', i])
      }),
      r && o.tags.push(['e', r.eventId, r.relayUrl || '', 'reply']),
      n && o.tags.push(['subject', n]),
      o
    )
  }
  function ws(t, e, n, r, o) {
    let s = pl(e, n, r, o)
    return Ft(s, t, e.publicKey)
  }
  function gl(t, e, n, r, o) {
    if (!e || e.length === 0) throw new Error('At least one recipient is required.')
    return [{ publicKey: Xn(t) }, ...e].map(i => ws(t, i, n, r, o))
  }
  var yl = yr,
    wl = ys,
    ml = {}
  W(ml, {
    finishRepostEvent: () => bl,
    getRepostedEvent: () => xl,
    getRepostedEventPointer: () => ms,
  })
  function bl(t, e, n, r) {
    let o,
      s = [...(t.tags ?? []), ['e', e.id, n], ['p', e.pubkey]]
    return (
      e.kind === qo ? (o = rr) : ((o = sr), s.push(['k', String(e.kind)])),
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
  function ms(t) {
    if (![rr, sr].includes(t.kind)) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (e !== void 0)
      return { id: e[1], relays: [e[2], n?.[2]].filter(r => typeof r == 'string'), author: n?.[1] }
  }
  function xl(t, { skipVerification: e } = {}) {
    let n = ms(t)
    if (n === void 0 || t.content === '') return
    let r
    try {
      r = JSON.parse(t.content)
    } catch {
      return
    }
    if (r.id === n.id && !(!e && !er(r))) return r
  }
  var vl = {}
  W(vl, { NOSTR_URI_REGEX: () => wr, parse: () => Tl, test: () => El })
  var wr = new RegExp(`nostr:(${Qo.source})`)
  function El(t) {
    return typeof t == 'string' && new RegExp(`^${wr.source}$`).test(t)
  }
  function Tl(t) {
    let e = t.match(new RegExp(`^${wr.source}$`))
    if (!e) throw new Error(`Invalid Nostr URI: ${t}`)
    return { uri: e[0], value: e[1], decoded: Qt(e[1]) }
  }
  var Al = {}
  W(Al, { finishReactionEvent: () => Sl, getReactedEventPointer: () => Bl })
  function Sl(t, e, n) {
    let r = e.tags.filter(o => o.length >= 2 && (o[0] === 'e' || o[0] === 'p'))
    return xe(
      {
        ...t,
        kind: or,
        tags: [...(t.tags ?? []), ...r, ['e', e.id], ['p', e.pubkey]],
        content: t.content ?? '+',
      },
      n
    )
  }
  function Bl(t) {
    if (t.kind !== or) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (!(e === void 0 || n === void 0))
      return { id: e[1], relays: [e[2], n[2]].filter(r => r !== void 0), author: n[1] }
  }
  var Ll = {}
  W(Ll, { parse: () => Il })
  var kl = /\W/m,
    Po = /\W |\W$|$|,| /m
  function* Il(t) {
    let e = t.length,
      n = 0,
      r = 0
    for (; r < e; ) {
      let o = t.indexOf(':', r)
      if (o === -1) break
      if (t.substring(o - 5, o) === 'nostr') {
        let s = t.substring(o + 60).match(kl),
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
        let s = t.substring(o + 4).match(Po),
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
        let s = t.substring(o + 4).match(Po),
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
  var _l = {}
  W(_l, {
    channelCreateEvent: () => Ul,
    channelHideMessageEvent: () => Rl,
    channelMessageEvent: () => Nl,
    channelMetadataEvent: () => Cl,
    channelMuteUserEvent: () => Ol,
  })
  var Ul = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe({ kind: Do, tags: [...(t.tags ?? [])], content: n, created_at: t.created_at }, e)
    },
    Cl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: jo,
          tags: [['e', t.channel_create_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Nl = (t, e) => {
      let n = [['e', t.channel_create_event_id, t.relay_url, 'root']]
      return (
        t.reply_to_channel_message_event_id &&
          n.push(['e', t.reply_to_channel_message_event_id, t.relay_url, 'reply']),
        xe(
          {
            kind: zo,
            tags: [...n, ...(t.tags ?? [])],
            content: t.content,
            created_at: t.created_at,
          },
          e
        )
      )
    },
    Rl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: Ko,
          tags: [['e', t.channel_message_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Ol = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: Zo,
          tags: [['p', t.pubkey_to_mute], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Pl = {}
  W(Pl, {
    EMOJI_SHORTCODE_REGEX: () => bs,
    matchAll: () => $l,
    regex: () => mr,
    replaceAll: () => Hl,
  })
  var bs = /:(\w+):/,
    mr = () => new RegExp(`\\B${bs.source}\\B`, 'g')
  function* $l(t) {
    let e = t.matchAll(mr())
    for (let n of e)
      try {
        let [r, o] = n
        yield { shortcode: r, name: o, start: n.index, end: n.index + r.length }
      } catch {}
  }
  function Hl(t, e) {
    return t.replaceAll(mr(), (n, r) => e({ shortcode: n, name: r }))
  }
  var Ml = {}
  W(Ml, { useFetchImplementation: () => ql, validateGithub: () => Vl })
  var br
  try {
    br = fetch
  } catch {}
  function ql(t) {
    br = t
  }
  async function Vl(t, e, n) {
    try {
      return (
        (await (await br(`https://gist.github.com/${e}/${n}/raw`)).text()) ===
        `Verifying that I control the following Nostr public key: ${t}`
      )
    } catch {
      return !1
    }
  }
  var Wl = {}
  W(Wl, { makeNwcRequestEvent: () => jl, parseConnectionString: () => Dl })
  function Dl(t) {
    let { host: e, pathname: n, searchParams: r } = new URL(t),
      o = n || e,
      s = r.get('relay'),
      i = r.get('secret')
    if (!o || !s || !i) throw new Error('invalid connection string')
    return { pubkey: o, relay: s, secret: i }
  }
  async function jl(t, e, n) {
    let o = Xo(e, t, JSON.stringify({ method: 'pay_invoice', params: { invoice: n } })),
      s = { kind: Fo, created_at: Math.round(Date.now() / 1e3), content: o, tags: [['p', t]] }
    return xe(s, e)
  }
  var zl = {}
  W(zl, { normalizeIdentifier: () => Kl })
  function Kl(t) {
    return (
      (t = t.trim().toLowerCase()),
      (t = t.normalize('NFKC')),
      Array.from(t)
        .map(e => (/\p{Letter}/u.test(e) || /\p{Number}/u.test(e) ? e : '-'))
        .join('')
    )
  }
  var Zl = {}
  W(Zl, {
    getSatoshisAmountFromBolt11: () => Xl,
    getZapEndpoint: () => Jl,
    makeZapReceipt: () => Ql,
    makeZapRequest: () => Fl,
    useFetchImplementation: () => Gl,
    validateZapRequest: () => Yl,
  })
  var xr
  try {
    xr = fetch
  } catch {}
  function Gl(t) {
    xr = t
  }
  async function Jl(t) {
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
      let s = await (await xr(e)).json()
      if (s.allowsNostr && s.nostrPubkey) return s.callback
    } catch {}
    return null
  }
  function Fl(t) {
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
      if ((e.tags.push(['e', t.event.id]), tr(t.event.kind))) {
        let n = ['a', `${t.event.kind}:${t.event.pubkey}:`]
        e.tags.push(n)
      } else if (nr(t.event.kind)) {
        let n = t.event.tags.find(([o, s]) => o === 'd' && s)
        if (!n) throw new Error('d tag not found or is empty')
        let r = ['a', `${t.event.kind}:${t.event.pubkey}:${n[1]}`]
        e.tags.push(r)
      }
      e.tags.push(['k', t.event.kind.toString()])
    }
    return e
  }
  function Yl(t) {
    let e
    try {
      e = JSON.parse(t)
    } catch {
      return 'Invalid zap request JSON.'
    }
    if (!Yn(e)) return 'Zap request is not a valid Nostr event.'
    if (!er(e)) return 'Invalid signature on zap request.'
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
  function Ql({ zapRequest: t, preimage: e, bolt11: n, paidAt: r }) {
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
  function Xl(t) {
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
  var ef = {}
  W(ef, {
    getToken: () => tf,
    hashPayload: () => vr,
    unpackEventFromToken: () => vs,
    validateEvent: () => Ls,
    validateEventKind: () => Ts,
    validateEventMethodTag: () => Ss,
    validateEventPayloadTag: () => Bs,
    validateEventTimestamp: () => Es,
    validateEventUrlTag: () => As,
    validateToken: () => nf,
  })
  var xs = 'Nostr '
  async function tf(t, e, n, r = !1, o) {
    let s = {
      kind: ir,
      tags: [
        ['u', t],
        ['method', e],
      ],
      created_at: Math.round(new Date().getTime() / 1e3),
      content: '',
    }
    o && s.tags.push(['payload', vr(o)])
    let i = await n(s)
    return (r ? xs : '') + ie.encode(de.encode(JSON.stringify(i)))
  }
  async function nf(t, e, n) {
    let r = await vs(t).catch(s => {
      throw s
    })
    return await Ls(r, e, n).catch(s => {
      throw s
    })
  }
  async function vs(t) {
    if (!t) throw new Error('Missing token')
    t = t.replace(xs, '')
    let e = ke.decode(ie.decode(t))
    if (!e || e.length === 0 || !e.startsWith('{')) throw new Error('Invalid token')
    return JSON.parse(e)
  }
  function Es(t) {
    return t.created_at ? Math.round(new Date().getTime() / 1e3) - t.created_at < 60 : !1
  }
  function Ts(t) {
    return t.kind === ir
  }
  function As(t, e) {
    let n = t.tags.find(r => r[0] === 'u')
    return n ? n.length > 0 && n[1] === e : !1
  }
  function Ss(t, e) {
    let n = t.tags.find(r => r[0] === 'method')
    return n ? n.length > 0 && n[1].toLowerCase() === e.toLowerCase() : !1
  }
  function vr(t) {
    let e = ge(de.encode(JSON.stringify(t)))
    return j(e)
  }
  function Bs(t, e) {
    let n = t.tags.find(o => o[0] === 'payload')
    if (!n) return !1
    let r = vr(e)
    return n.length > 0 && n[1] === r
  }
  async function Ls(t, e, n, r) {
    if (!er(t)) throw new Error('Invalid nostr event, signature invalid')
    if (!Ts(t)) throw new Error('Invalid nostr event, kind invalid')
    if (!Es(t)) throw new Error('Invalid nostr event, created_at timestamp invalid')
    if (!As(t, e)) throw new Error('Invalid nostr event, url tag invalid')
    if (!Ss(t, n)) throw new Error('Invalid nostr event, method tag invalid')
    if (r && typeof r == 'object' && Object.keys(r).length > 0 && !Bs(t, r))
      throw new Error('Invalid nostr event, payload tag does not match request body hash')
    return !0
  }
  function ks(t) {
    try {
      let e = cr.decode(t)
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
  function rf() {
    return ['wss://relay.divine.video', 'wss://relay.nostr.band', 'wss://relay.damus.io']
  }
  function Is(t = [], e = []) {
    let n = [...e, ...t, ...rf()]
    return [...new Set(n)]
  }
  var nn = class {
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
      let n = `embed-${Date.now()}`,
        r
      if (e.type === 'event') r = { ids: [e.data.id] }
      else if (e.type === 'address')
        r = { kinds: [e.data.kind], authors: [e.data.pubkey], '#d': [e.data.identifier] }
      else throw new Error('Invalid identifier type')
      console.log('[Nostr Client] Fetching event with filter:', r)
      let o = this.relays.map(i =>
          this.connectRelay(i).catch(
            a => (console.warn(`[Nostr Client] Failed to connect to ${i}:`, a.message), null)
          )
        ),
        s = (await Promise.all(o)).filter(Boolean)
      if (s.length === 0) throw new Error('Failed to connect to any relay')
      return (
        console.log(`[Nostr Client] Connected to ${s.length}/${this.relays.length} relays`),
        new Promise((i, a) => {
          let c = !1,
            l = e.type === 'address',
            f = [],
            u = 0,
            g = s.length,
            y = setTimeout(() => {
              if (!c)
                if (((c = !0), this.closeSubscription(n), l && f.length > 0)) {
                  let p = f.reduce((d, h) => (h.created_at > d.created_at ? h : d))
                  ;(console.log(
                    `[Nostr Client] Returning newest addressable event (created_at: ${p.created_at})`
                  ),
                    i(p))
                } else a(new Error('Event not found (timeout)'))
            }, 1e4)
          s.forEach(p => {
            let d = w => {
              try {
                let m = JSON.parse(w.data)
                if (m[0] === 'EVENT' && m[1] === n) {
                  let x = m[2]
                  l
                    ? (f.push(x),
                      console.log(
                        `[Nostr Client] Addressable event received (created_at: ${x.created_at}), total: ${f.length}`
                      ))
                    : c ||
                      ((c = !0),
                      clearTimeout(y),
                      console.log('[Nostr Client] Regular event received, returning immediately'),
                      this.closeSubscription(n),
                      i(x))
                }
                if (
                  m[0] === 'EOSE' &&
                  m[1] === n &&
                  (u++, console.log(`[Nostr Client] EOSE received (${u}/${g})`), l && u === g && !c)
                )
                  if (((c = !0), clearTimeout(y), this.closeSubscription(n), f.length > 0)) {
                    let x = f.reduce((T, L) => (L.created_at > T.created_at ? L : T))
                    ;(console.log(
                      `[Nostr Client] All relays responded, returning newest event (created_at: ${x.created_at})`
                    ),
                      i(x))
                  } else a(new Error('Addressable event not found on any relay'))
              } catch (m) {
                console.error('[Nostr Client] Failed to parse message:', m)
              }
            }
            ;(p.addEventListener('message', d),
              this.subscriptions.has(n) || this.subscriptions.set(n, []),
              this.subscriptions.get(n).push({ ws: p, handler: d }))
            let h = JSON.stringify(['REQ', n, r])
            ;(p.send(h), console.log('[Nostr Client] Sent REQ to relay:', h))
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
  function _s(t) {
    let e = t.tags.filter(n => n[0] === 'imeta')
    return e.length > 0 ? of(t, e) : sf(t)
  }
  function of(t, e) {
    let n = e.map(f => af(f)).filter(Boolean),
      r = n.filter(f => f.mimeType?.startsWith('video/')),
      o = n.filter(f => f.mimeType?.startsWith('image/'))
    ;(e.forEach(f => {
      for (let u = 1; u < f.length; u++) {
        let g = f[u]
        if (g.startsWith('image ')) {
          let y = g.substring(6).trim()
          y && !o.some(p => p.url === y) && o.push({ url: y, fallbackUrls: [] })
        }
      }
    }),
      r.sort((f, u) => {
        let g = rn(f)
        return rn(u) - g
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
  function sf(t) {
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
  function af(t) {
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
  function rn(t) {
    if (t.dimensions) {
      let e = t.dimensions.match(/x(\d+)/)
      if (e) return parseInt(e[1], 10)
    }
    return 0
  }
  function Us(t, e = 'auto') {
    if (!t || t.length === 0) return null
    if (e === 'auto') return t[0]
    let n = parseInt(e, 10)
    if (isNaN(n)) return t[0]
    let r = t[0],
      o = Math.abs(rn(r) - n)
    for (let s of t) {
      let i = rn(s),
        a = Math.abs(i - n)
      a < o && ((r = s), (o = a))
    }
    return r
  }
  var pt = class {
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
  var on = class t {
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
  var gt = class t {
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
  var sn = class t {
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
  var Cs = 'nostube-embed-profile-'
  var an = class t {
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
              g = i.length,
              y = setTimeout(() => {
                if (!l)
                  if (((l = !0), this.client.closeSubscription(r), f)) {
                    let p = t.parseProfileMetadata(f)
                    ;(console.log('[ProfileFetcher] Timeout, returning latest profile'), a(p))
                  } else (console.warn('[ProfileFetcher] Timeout, no profile found'), a(null))
              }, 5e3)
            i.forEach(p => {
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
                    (u++, console.log(`[ProfileFetcher] EOSE received (${u}/${g})`), u === g && !l)
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
              ;(p.addEventListener('message', d),
                this.client.subscriptions.has(r) || this.client.subscriptions.set(r, []),
                this.client.subscriptions.get(r).push({ ws: p, handler: d }))
              let h = JSON.stringify(['REQ', r, o])
              ;(p.send(h), console.log('[ProfileFetcher] Sent REQ to relay'))
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
        let n = Cs + e,
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
        let r = Cs + e,
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
  var yt = null,
    Er = null
  async function Ns() {
    console.log('[Nostube Embed] Initializing player...')
    try {
      let t = Lr(),
        e = kr(t)
      if (!e.valid) {
        Ge(e.error)
        return
      }
      cf('Loading video...')
      let n = ks(t.videoId)
      if (!n) {
        Ge('Failed to decode video identifier')
        return
      }
      let r = Is(n.data.relays, t.customRelays)
      ;((yt = new nn(r)), (Er = new an(yt)))
      let o = null
      n.type === 'address' &&
        n.data.pubkey &&
        (console.log('[Nostube Embed] Starting parallel profile fetch (naddr)'),
        (o = Er.fetchProfile(n.data.pubkey, r)))
      let s = await yt.fetchEvent(n),
        i = _s(s)
      ;(console.log('[Nostube Embed] Parsed video:', i),
        n.type === 'event' &&
          i.author &&
          (console.log('[Nostube Embed] Starting profile fetch (nevent)'),
          (o = Er.fetchProfile(i.author, r))))
      let a = Us(i.videoVariants, t.preferredQuality)
      if (!a) {
        Ge('No video URLs found in event')
        return
      }
      console.log('[Nostube Embed] Selected variant:', a)
      try {
        let c = pt.buildVideoPlayer(i, t),
          l = pt.createPlayerContainer(c)
        on.applyToPlayer(l, c, i)
        let f = null
        ;(t.showTitle && (gt.applyToPlayer(l, c, i, t), (f = l.querySelector('.title-overlay'))),
          sn.applyToPlayer(l, c, t.videoId, t),
          (document.body.innerHTML = ''),
          document.body.appendChild(l),
          o &&
            f &&
            o
              .then(u => {
                u
                  ? (console.log('[Nostube Embed] Profile fetched, updating overlay'),
                    gt.updateProfile(f, u))
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
          Ge(`Failed to initialize player: ${c.message}`))
        return
      }
    } catch (t) {
      ;(console.error('[Nostube Embed] Error:', t),
        t.message.includes('timeout')
          ? Ge('Connection failed. Unable to fetch video.')
          : t.message.includes('not found')
            ? Ge('Video not found')
            : Ge(t.message))
    }
  }
  function cf(t) {
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
  function Ge(t) {
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
    yt && yt.closeAll()
  })
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', Ns) : Ns()
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
