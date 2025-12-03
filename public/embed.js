/* Nostube Embed Player v0.1.0 | https://nostu.be */
;(() => {
  var qr = Object.defineProperty
  var ei = (t, e, n) =>
    e in t ? qr(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (t[e] = n)
  var ti = (t, e) => {
    for (var n in e) qr(t, n, { get: e[n], enumerable: !0 })
  }
  var z = (t, e, n) => ei(t, typeof e != 'symbol' ? e + '' : e, n)
  function Vr() {
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
  function Dr(t) {
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
  function zr(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function bn(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Wr(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(zr(t.outputLen), zr(t.blockLen))
  }
  function ot(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function jr(t, e) {
    bn(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var St = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Kr = t => t instanceof Uint8Array
  var Bt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    fe = (t, e) => (t << (32 - e)) | (t >>> e),
    ni = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!ni) throw new Error('Non little-endian hardware is not supported')
  function ri(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function gt(t) {
    if ((typeof t == 'string' && (t = ri(t)), !Kr(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function Zr(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!Kr(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var st = class {
      clone() {
        return this._cloneInto()
      }
    },
    Du = {}.toString
  function Gr(t) {
    let e = r => t().update(gt(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function Lt(t = 32) {
    if (St && typeof St.getRandomValues == 'function') return St.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function oi(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var _t = class extends st {
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
        (this.view = Bt(this.buffer)))
    }
    update(e) {
      ot(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = gt(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = Bt(e)
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
      ;(ot(this), jr(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let f = i; f < o; f++) n[f] = 0
      ;(oi(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = Bt(e),
        c = this.outputLen
      if (c % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = c / 4,
        u = this.get()
      if (l > u.length) throw new Error('_sha2: outputLen bigger than state')
      for (let f = 0; f < l; f++) a.setUint32(4 * f, u[f], s)
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
  var si = (t, e, n) => (t & e) ^ (~t & n),
    ii = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    ai = new Uint32Array([
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
    Ne = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Oe = new Uint32Array(64),
    xn = class extends _t {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = Ne[0] | 0),
          (this.B = Ne[1] | 0),
          (this.C = Ne[2] | 0),
          (this.D = Ne[3] | 0),
          (this.E = Ne[4] | 0),
          (this.F = Ne[5] | 0),
          (this.G = Ne[6] | 0),
          (this.H = Ne[7] | 0))
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
        for (let f = 0; f < 16; f++, n += 4) Oe[f] = e.getUint32(n, !1)
        for (let f = 16; f < 64; f++) {
          let p = Oe[f - 15],
            y = Oe[f - 2],
            g = fe(p, 7) ^ fe(p, 18) ^ (p >>> 3),
            d = fe(y, 17) ^ fe(y, 19) ^ (y >>> 10)
          Oe[f] = (d + Oe[f - 7] + g + Oe[f - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: u } = this
        for (let f = 0; f < 64; f++) {
          let p = fe(a, 6) ^ fe(a, 11) ^ fe(a, 25),
            y = (u + p + si(a, c, l) + ai[f] + Oe[f]) | 0,
            d = ((fe(r, 2) ^ fe(r, 13) ^ fe(r, 22)) + ii(r, o, s)) | 0
          ;((u = l),
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
          (u = (u + this.H) | 0),
          this.set(r, o, s, i, a, c, l, u))
      }
      roundClean() {
        Oe.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    }
  var kt = Gr(() => new xn())
  var An = {}
  ti(An, {
    bitGet: () => pi,
    bitLen: () => hi,
    bitMask: () => yt,
    bitSet: () => gi,
    bytesToHex: () => Ze,
    bytesToNumberBE: () => J,
    bytesToNumberLE: () => Ut,
    concatBytes: () => Ee,
    createHmacDrbg: () => Tn,
    ensureBytes: () => K,
    equalBytes: () => fi,
    hexToBytes: () => Ge,
    hexToNumber: () => En,
    numberToBytesBE: () => de,
    numberToBytesLE: () => Nt,
    numberToHexUnpadded: () => Xr,
    numberToVarBytesBE: () => ui,
    utf8ToBytes: () => di,
    validateObject: () => Re,
  })
  var Jr = BigInt(0),
    Ct = BigInt(1),
    ci = BigInt(2),
    It = t => t instanceof Uint8Array,
    li = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function Ze(t) {
    if (!It(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += li[t[n]]
    return e
  }
  function Xr(t) {
    let e = t.toString(16)
    return e.length & 1 ? `0${e}` : e
  }
  function En(t) {
    if (typeof t != 'string') throw new Error('hex string expected, got ' + typeof t)
    return BigInt(t === '' ? '0' : `0x${t}`)
  }
  function Ge(t) {
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
    return En(Ze(t))
  }
  function Ut(t) {
    if (!It(t)) throw new Error('Uint8Array expected')
    return En(Ze(Uint8Array.from(t).reverse()))
  }
  function de(t, e) {
    return Ge(t.toString(16).padStart(e * 2, '0'))
  }
  function Nt(t, e) {
    return de(t, e).reverse()
  }
  function ui(t) {
    return Ge(Xr(t))
  }
  function K(t, e, n) {
    let r
    if (typeof e == 'string')
      try {
        r = Ge(e)
      } catch (s) {
        throw new Error(`${t} must be valid hex string, got "${e}". Cause: ${s}`)
      }
    else if (It(e)) r = Uint8Array.from(e)
    else throw new Error(`${t} must be hex string or Uint8Array`)
    let o = r.length
    if (typeof n == 'number' && o !== n) throw new Error(`${t} expected ${n} bytes, got ${o}`)
    return r
  }
  function Ee(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!It(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  function fi(t, e) {
    if (t.length !== e.length) return !1
    for (let n = 0; n < t.length; n++) if (t[n] !== e[n]) return !1
    return !0
  }
  function di(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function hi(t) {
    let e
    for (e = 0; t > Jr; t >>= Ct, e += 1);
    return e
  }
  function pi(t, e) {
    return (t >> BigInt(e)) & Ct
  }
  var gi = (t, e, n) => t | ((n ? Ct : Jr) << BigInt(e)),
    yt = t => (ci << BigInt(t - 1)) - Ct,
    vn = t => new Uint8Array(t),
    Fr = t => Uint8Array.from(t)
  function Tn(t, e, n) {
    if (typeof t != 'number' || t < 2) throw new Error('hashLen must be a number')
    if (typeof e != 'number' || e < 2) throw new Error('qByteLen must be a number')
    if (typeof n != 'function') throw new Error('hmacFn must be a function')
    let r = vn(t),
      o = vn(t),
      s = 0,
      i = () => {
        ;(r.fill(1), o.fill(0), (s = 0))
      },
      a = (...f) => n(o, r, ...f),
      c = (f = vn()) => {
        ;((o = a(Fr([0]), f)), (r = a()), f.length !== 0 && ((o = a(Fr([1]), f)), (r = a())))
      },
      l = () => {
        if (s++ >= 1e3) throw new Error('drbg: tried 1000 values')
        let f = 0,
          p = []
        for (; f < e; ) {
          r = a()
          let y = r.slice()
          ;(p.push(y), (f += r.length))
        }
        return Ee(...p)
      }
    return (f, p) => {
      ;(i(), c(f))
      let y
      for (; !(y = p(l())); ) c()
      return (i(), y)
    }
  }
  var yi = {
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
  function Re(t, e, n = {}) {
    let r = (o, s, i) => {
      let a = yi[s]
      if (typeof a != 'function') throw new Error(`Invalid validator "${s}", expected function`)
      let c = t[o]
      if (!(i && c === void 0) && !a(c, t))
        throw new Error(`Invalid param ${String(o)}=${c} (${typeof c}), expected ${s}`)
    }
    for (let [o, s] of Object.entries(e)) r(o, s, !1)
    for (let [o, s] of Object.entries(n)) r(o, s, !0)
    return t
  }
  var G = BigInt(0),
    W = BigInt(1),
    Fe = BigInt(2),
    mi = BigInt(3),
    Sn = BigInt(4),
    Yr = BigInt(5),
    Qr = BigInt(8),
    wi = BigInt(9),
    bi = BigInt(16)
  function Z(t, e) {
    let n = t % e
    return n >= G ? n : e + n
  }
  function xi(t, e, n) {
    if (n <= G || e < G) throw new Error('Expected power/modulo > 0')
    if (n === W) return G
    let r = W
    for (; e > G; ) (e & W && (r = (r * t) % n), (t = (t * t) % n), (e >>= W))
    return r
  }
  function re(t, e, n) {
    let r = t
    for (; e-- > G; ) ((r *= r), (r %= n))
    return r
  }
  function Ot(t, e) {
    if (t === G || e <= G)
      throw new Error(`invert: expected positive integers, got n=${t} mod=${e}`)
    let n = Z(t, e),
      r = e,
      o = G,
      s = W,
      i = W,
      a = G
    for (; n !== G; ) {
      let l = r / n,
        u = r % n,
        f = o - i * l,
        p = s - a * l
      ;((r = n), (n = u), (o = i), (s = a), (i = f), (a = p))
    }
    if (r !== W) throw new Error('invert: does not exist')
    return Z(o, e)
  }
  function vi(t) {
    let e = (t - W) / Fe,
      n,
      r,
      o
    for (n = t - W, r = 0; n % Fe === G; n /= Fe, r++);
    for (o = Fe; o < t && xi(o, e, t) !== t - W; o++);
    if (r === 1) {
      let i = (t + W) / Sn
      return function (c, l) {
        let u = c.pow(l, i)
        if (!c.eql(c.sqr(u), l)) throw new Error('Cannot find square root')
        return u
      }
    }
    let s = (n + W) / Fe
    return function (a, c) {
      if (a.pow(c, e) === a.neg(a.ONE)) throw new Error('Cannot find square root')
      let l = r,
        u = a.pow(a.mul(a.ONE, o), n),
        f = a.pow(c, s),
        p = a.pow(c, n)
      for (; !a.eql(p, a.ONE); ) {
        if (a.eql(p, a.ZERO)) return a.ZERO
        let y = 1
        for (let d = a.sqr(p); y < l && !a.eql(d, a.ONE); y++) d = a.sqr(d)
        let g = a.pow(u, W << BigInt(l - y - 1))
        ;((u = a.sqr(g)), (f = a.mul(f, g)), (p = a.mul(p, u)), (l = y))
      }
      return f
    }
  }
  function Ei(t) {
    if (t % Sn === mi) {
      let e = (t + W) / Sn
      return function (r, o) {
        let s = r.pow(o, e)
        if (!r.eql(r.sqr(s), o)) throw new Error('Cannot find square root')
        return s
      }
    }
    if (t % Qr === Yr) {
      let e = (t - Yr) / Qr
      return function (r, o) {
        let s = r.mul(o, Fe),
          i = r.pow(s, e),
          a = r.mul(o, i),
          c = r.mul(r.mul(a, Fe), i),
          l = r.mul(a, r.sub(c, r.ONE))
        if (!r.eql(r.sqr(l), o)) throw new Error('Cannot find square root')
        return l
      }
    }
    return (t % bi, vi(t))
  }
  var Ti = [
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
  function Bn(t) {
    let e = { ORDER: 'bigint', MASK: 'bigint', BYTES: 'isSafeInteger', BITS: 'isSafeInteger' },
      n = Ti.reduce((r, o) => ((r[o] = 'function'), r), e)
    return Re(t, n)
  }
  function Ai(t, e, n) {
    if (n < G) throw new Error('Expected power > 0')
    if (n === G) return t.ONE
    if (n === W) return e
    let r = t.ONE,
      o = e
    for (; n > G; ) (n & W && (r = t.mul(r, o)), (o = t.sqr(o)), (n >>= W))
    return r
  }
  function Si(t, e) {
    let n = new Array(e.length),
      r = e.reduce((s, i, a) => (t.is0(i) ? s : ((n[a] = s), t.mul(s, i))), t.ONE),
      o = t.inv(r)
    return (
      e.reduceRight((s, i, a) => (t.is0(i) ? s : ((n[a] = t.mul(s, n[a])), t.mul(s, i))), o),
      n
    )
  }
  function Ln(t, e) {
    let n = e !== void 0 ? e : t.toString(2).length,
      r = Math.ceil(n / 8)
    return { nBitLength: n, nByteLength: r }
  }
  function eo(t, e, n = !1, r = {}) {
    if (t <= G) throw new Error(`Expected Field ORDER > 0, got ${t}`)
    let { nBitLength: o, nByteLength: s } = Ln(t, e)
    if (s > 2048) throw new Error('Field lengths over 2048 bytes are not supported')
    let i = Ei(t),
      a = Object.freeze({
        ORDER: t,
        BITS: o,
        BYTES: s,
        MASK: yt(o),
        ZERO: G,
        ONE: W,
        create: c => Z(c, t),
        isValid: c => {
          if (typeof c != 'bigint')
            throw new Error(`Invalid field element: expected bigint, got ${typeof c}`)
          return G <= c && c < t
        },
        is0: c => c === G,
        isOdd: c => (c & W) === W,
        neg: c => Z(-c, t),
        eql: (c, l) => c === l,
        sqr: c => Z(c * c, t),
        add: (c, l) => Z(c + l, t),
        sub: (c, l) => Z(c - l, t),
        mul: (c, l) => Z(c * l, t),
        pow: (c, l) => Ai(a, c, l),
        div: (c, l) => Z(c * Ot(l, t), t),
        sqrN: c => c * c,
        addN: (c, l) => c + l,
        subN: (c, l) => c - l,
        mulN: (c, l) => c * l,
        inv: c => Ot(c, t),
        sqrt: r.sqrt || (c => i(a, c)),
        invertBatch: c => Si(a, c),
        cmov: (c, l, u) => (u ? l : c),
        toBytes: c => (n ? Nt(c, s) : de(c, s)),
        fromBytes: c => {
          if (c.length !== s) throw new Error(`Fp.fromBytes: expected ${s}, got ${c.length}`)
          return n ? Ut(c) : J(c)
        },
      })
    return Object.freeze(a)
  }
  function to(t) {
    if (typeof t != 'bigint') throw new Error('field order must be bigint')
    let e = t.toString(2).length
    return Math.ceil(e / 8)
  }
  function _n(t) {
    let e = to(t)
    return e + Math.ceil(e / 2)
  }
  function no(t, e, n = !1) {
    let r = t.length,
      o = to(e),
      s = _n(e)
    if (r < 16 || r < s || r > 1024) throw new Error(`expected ${s}-1024 bytes of input, got ${r}`)
    let i = n ? J(t) : Ut(t),
      a = Z(i, e - W) + W
    return n ? Nt(a, o) : de(a, o)
  }
  var Li = BigInt(0),
    kn = BigInt(1)
  function ro(t, e) {
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
        for (; s > Li; ) (s & kn && (i = i.add(a)), (a = a.double()), (s >>= kn))
        return i
      },
      precomputeWindow(o, s) {
        let { windows: i, windowSize: a } = r(s),
          c = [],
          l = o,
          u = l
        for (let f = 0; f < i; f++) {
          ;((u = l), c.push(u))
          for (let p = 1; p < a; p++) ((u = u.add(l)), c.push(u))
          l = u.double()
        }
        return c
      },
      wNAF(o, s, i) {
        let { windows: a, windowSize: c } = r(o),
          l = t.ZERO,
          u = t.BASE,
          f = BigInt(2 ** o - 1),
          p = 2 ** o,
          y = BigInt(o)
        for (let g = 0; g < a; g++) {
          let d = g * c,
            h = Number(i & f)
          ;((i >>= y), h > c && ((h -= p), (i += kn)))
          let m = d,
            w = d + Math.abs(h) - 1,
            b = g % 2 !== 0,
            E = h < 0
          h === 0 ? (u = u.add(n(b, s[m]))) : (l = l.add(n(E, s[w])))
        }
        return { p: l, f: u }
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
  function Cn(t) {
    return (
      Bn(t.Fp),
      Re(
        t,
        { n: 'bigint', h: 'bigint', Gx: 'field', Gy: 'field' },
        { nBitLength: 'isSafeInteger', nByteLength: 'isSafeInteger' }
      ),
      Object.freeze({ ...Ln(t.n, t.nBitLength), ...t, p: t.Fp.ORDER })
    )
  }
  function _i(t) {
    let e = Cn(t)
    Re(
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
  var { bytesToNumberBE: ki, hexToBytes: Ci } = An,
    Je = {
      Err: class extends Error {
        constructor(e = '') {
          super(e)
        }
      },
      _parseInt(t) {
        let { Err: e } = Je
        if (t.length < 2 || t[0] !== 2) throw new e('Invalid signature integer tag')
        let n = t[1],
          r = t.subarray(2, n + 2)
        if (!n || r.length !== n) throw new e('Invalid signature integer: wrong length')
        if (r[0] & 128) throw new e('Invalid signature integer: negative')
        if (r[0] === 0 && !(r[1] & 128))
          throw new e('Invalid signature integer: unnecessary leading zero')
        return { d: ki(r), l: t.subarray(n + 2) }
      },
      toSig(t) {
        let { Err: e } = Je,
          n = typeof t == 'string' ? Ci(t) : t
        if (!(n instanceof Uint8Array)) throw new Error('ui8a expected')
        let r = n.length
        if (r < 2 || n[0] != 48) throw new e('Invalid signature tag')
        if (n[1] !== r - 2) throw new e('Invalid signature: incorrect length')
        let { d: o, l: s } = Je._parseInt(n.subarray(2)),
          { d: i, l: a } = Je._parseInt(s)
        if (a.length) throw new e('Invalid signature: left bytes after parsing')
        return { r: o, s: i }
      },
      hexFromSig(t) {
        let e = l => (Number.parseInt(l[0], 16) & 8 ? '00' + l : l),
          n = l => {
            let u = l.toString(16)
            return u.length & 1 ? `0${u}` : u
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
    Te = BigInt(0),
    ie = BigInt(1),
    rf = BigInt(2),
    oo = BigInt(3),
    of = BigInt(4)
  function Ii(t) {
    let e = _i(t),
      { Fp: n } = e,
      r =
        e.toBytes ||
        ((g, d, h) => {
          let m = d.toAffine()
          return Ee(Uint8Array.from([4]), n.toBytes(m.x), n.toBytes(m.y))
        }),
      o =
        e.fromBytes ||
        (g => {
          let d = g.subarray(1),
            h = n.fromBytes(d.subarray(0, n.BYTES)),
            m = n.fromBytes(d.subarray(n.BYTES, 2 * n.BYTES))
          return { x: h, y: m }
        })
    function s(g) {
      let { a: d, b: h } = e,
        m = n.sqr(g),
        w = n.mul(m, g)
      return n.add(n.add(w, n.mul(g, d)), h)
    }
    if (!n.eql(n.sqr(e.Gy), s(e.Gx))) throw new Error('bad generator point: equation left != right')
    function i(g) {
      return typeof g == 'bigint' && Te < g && g < e.n
    }
    function a(g) {
      if (!i(g)) throw new Error('Expected valid bigint: 0 < bigint < curve.n')
    }
    function c(g) {
      let { allowedPrivateKeyLengths: d, nByteLength: h, wrapPrivateKey: m, n: w } = e
      if (d && typeof g != 'bigint') {
        if ((g instanceof Uint8Array && (g = Ze(g)), typeof g != 'string' || !d.includes(g.length)))
          throw new Error('Invalid key')
        g = g.padStart(h * 2, '0')
      }
      let b
      try {
        b = typeof g == 'bigint' ? g : J(K('private key', g, h))
      } catch {
        throw new Error(`private key must be ${h} bytes, hex or bigint, not ${typeof g}`)
      }
      return (m && (b = Z(b, w)), a(b), b)
    }
    let l = new Map()
    function u(g) {
      if (!(g instanceof f)) throw new Error('ProjectivePoint expected')
    }
    class f {
      constructor(d, h, m) {
        if (((this.px = d), (this.py = h), (this.pz = m), d == null || !n.isValid(d)))
          throw new Error('x required')
        if (h == null || !n.isValid(h)) throw new Error('y required')
        if (m == null || !n.isValid(m)) throw new Error('z required')
      }
      static fromAffine(d) {
        let { x: h, y: m } = d || {}
        if (!d || !n.isValid(h) || !n.isValid(m)) throw new Error('invalid affine point')
        if (d instanceof f) throw new Error('projective point not allowed')
        let w = b => n.eql(b, n.ZERO)
        return w(h) && w(m) ? f.ZERO : new f(h, m, n.ONE)
      }
      get x() {
        return this.toAffine().x
      }
      get y() {
        return this.toAffine().y
      }
      static normalizeZ(d) {
        let h = n.invertBatch(d.map(m => m.pz))
        return d.map((m, w) => m.toAffine(h[w])).map(f.fromAffine)
      }
      static fromHex(d) {
        let h = f.fromAffine(o(K('pointHex', d)))
        return (h.assertValidity(), h)
      }
      static fromPrivateKey(d) {
        return f.BASE.multiply(c(d))
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
        let m = n.sqr(h),
          w = s(d)
        if (!n.eql(m, w)) throw new Error('bad point: equation left != right')
        if (!this.isTorsionFree()) throw new Error('bad point: not in prime-order subgroup')
      }
      hasEvenY() {
        let { y: d } = this.toAffine()
        if (n.isOdd) return !n.isOdd(d)
        throw new Error("Field doesn't support isOdd")
      }
      equals(d) {
        u(d)
        let { px: h, py: m, pz: w } = this,
          { px: b, py: E, pz: S } = d,
          A = n.eql(n.mul(h, S), n.mul(b, w)),
          B = n.eql(n.mul(m, S), n.mul(E, w))
        return A && B
      }
      negate() {
        return new f(this.px, n.neg(this.py), this.pz)
      }
      double() {
        let { a: d, b: h } = e,
          m = n.mul(h, oo),
          { px: w, py: b, pz: E } = this,
          S = n.ZERO,
          A = n.ZERO,
          B = n.ZERO,
          _ = n.mul(w, w),
          N = n.mul(b, b),
          I = n.mul(E, E),
          C = n.mul(w, b)
        return (
          (C = n.add(C, C)),
          (B = n.mul(w, E)),
          (B = n.add(B, B)),
          (S = n.mul(d, B)),
          (A = n.mul(m, I)),
          (A = n.add(S, A)),
          (S = n.sub(N, A)),
          (A = n.add(N, A)),
          (A = n.mul(S, A)),
          (S = n.mul(C, S)),
          (B = n.mul(m, B)),
          (I = n.mul(d, I)),
          (C = n.sub(_, I)),
          (C = n.mul(d, C)),
          (C = n.add(C, B)),
          (B = n.add(_, _)),
          (_ = n.add(B, _)),
          (_ = n.add(_, I)),
          (_ = n.mul(_, C)),
          (A = n.add(A, _)),
          (I = n.mul(b, E)),
          (I = n.add(I, I)),
          (_ = n.mul(I, C)),
          (S = n.sub(S, _)),
          (B = n.mul(I, N)),
          (B = n.add(B, B)),
          (B = n.add(B, B)),
          new f(S, A, B)
        )
      }
      add(d) {
        u(d)
        let { px: h, py: m, pz: w } = this,
          { px: b, py: E, pz: S } = d,
          A = n.ZERO,
          B = n.ZERO,
          _ = n.ZERO,
          N = e.a,
          I = n.mul(e.b, oo),
          C = n.mul(h, b),
          $ = n.mul(m, E),
          H = n.mul(w, S),
          V = n.add(h, m),
          x = n.add(b, E)
        ;((V = n.mul(V, x)), (x = n.add(C, $)), (V = n.sub(V, x)), (x = n.add(h, w)))
        let v = n.add(b, S)
        return (
          (x = n.mul(x, v)),
          (v = n.add(C, H)),
          (x = n.sub(x, v)),
          (v = n.add(m, w)),
          (A = n.add(E, S)),
          (v = n.mul(v, A)),
          (A = n.add($, H)),
          (v = n.sub(v, A)),
          (_ = n.mul(N, x)),
          (A = n.mul(I, H)),
          (_ = n.add(A, _)),
          (A = n.sub($, _)),
          (_ = n.add($, _)),
          (B = n.mul(A, _)),
          ($ = n.add(C, C)),
          ($ = n.add($, C)),
          (H = n.mul(N, H)),
          (x = n.mul(I, x)),
          ($ = n.add($, H)),
          (H = n.sub(C, H)),
          (H = n.mul(N, H)),
          (x = n.add(x, H)),
          (C = n.mul($, x)),
          (B = n.add(B, C)),
          (C = n.mul(v, x)),
          (A = n.mul(V, A)),
          (A = n.sub(A, C)),
          (C = n.mul(V, $)),
          (_ = n.mul(v, _)),
          (_ = n.add(_, C)),
          new f(A, B, _)
        )
      }
      subtract(d) {
        return this.add(d.negate())
      }
      is0() {
        return this.equals(f.ZERO)
      }
      wNAF(d) {
        return y.wNAFCached(this, l, d, h => {
          let m = n.invertBatch(h.map(w => w.pz))
          return h.map((w, b) => w.toAffine(m[b])).map(f.fromAffine)
        })
      }
      multiplyUnsafe(d) {
        let h = f.ZERO
        if (d === Te) return h
        if ((a(d), d === ie)) return this
        let { endo: m } = e
        if (!m) return y.unsafeLadder(this, d)
        let { k1neg: w, k1: b, k2neg: E, k2: S } = m.splitScalar(d),
          A = h,
          B = h,
          _ = this
        for (; b > Te || S > Te; )
          (b & ie && (A = A.add(_)),
            S & ie && (B = B.add(_)),
            (_ = _.double()),
            (b >>= ie),
            (S >>= ie))
        return (
          w && (A = A.negate()),
          E && (B = B.negate()),
          (B = new f(n.mul(B.px, m.beta), B.py, B.pz)),
          A.add(B)
        )
      }
      multiply(d) {
        a(d)
        let h = d,
          m,
          w,
          { endo: b } = e
        if (b) {
          let { k1neg: E, k1: S, k2neg: A, k2: B } = b.splitScalar(h),
            { p: _, f: N } = this.wNAF(S),
            { p: I, f: C } = this.wNAF(B)
          ;((_ = y.constTimeNegate(E, _)),
            (I = y.constTimeNegate(A, I)),
            (I = new f(n.mul(I.px, b.beta), I.py, I.pz)),
            (m = _.add(I)),
            (w = N.add(C)))
        } else {
          let { p: E, f: S } = this.wNAF(h)
          ;((m = E), (w = S))
        }
        return f.normalizeZ([m, w])[0]
      }
      multiplyAndAddUnsafe(d, h, m) {
        let w = f.BASE,
          b = (S, A) =>
            A === Te || A === ie || !S.equals(w) ? S.multiplyUnsafe(A) : S.multiply(A),
          E = b(this, h).add(b(d, m))
        return E.is0() ? void 0 : E
      }
      toAffine(d) {
        let { px: h, py: m, pz: w } = this,
          b = this.is0()
        d == null && (d = b ? n.ONE : n.inv(w))
        let E = n.mul(h, d),
          S = n.mul(m, d),
          A = n.mul(w, d)
        if (b) return { x: n.ZERO, y: n.ZERO }
        if (!n.eql(A, n.ONE)) throw new Error('invZ was invalid')
        return { x: E, y: S }
      }
      isTorsionFree() {
        let { h: d, isTorsionFree: h } = e
        if (d === ie) return !0
        if (h) return h(f, this)
        throw new Error('isTorsionFree() has not been declared for the elliptic curve')
      }
      clearCofactor() {
        let { h: d, clearCofactor: h } = e
        return d === ie ? this : h ? h(f, this) : this.multiplyUnsafe(e.h)
      }
      toRawBytes(d = !0) {
        return (this.assertValidity(), r(f, this, d))
      }
      toHex(d = !0) {
        return Ze(this.toRawBytes(d))
      }
    }
    ;((f.BASE = new f(e.Gx, e.Gy, n.ONE)), (f.ZERO = new f(n.ZERO, n.ONE, n.ZERO)))
    let p = e.nBitLength,
      y = ro(f, e.endo ? Math.ceil(p / 2) : p)
    return {
      CURVE: e,
      ProjectivePoint: f,
      normPrivateKeyToScalar: c,
      weierstrassEquation: s,
      isWithinCurveOrder: i,
    }
  }
  function Ui(t) {
    let e = Cn(t)
    return (
      Re(
        e,
        { hash: 'hash', hmac: 'function', randomBytes: 'function' },
        { bits2int: 'function', bits2int_modN: 'function', lowS: 'boolean' }
      ),
      Object.freeze({ lowS: !0, ...e })
    )
  }
  function so(t) {
    let e = Ui(t),
      { Fp: n, n: r } = e,
      o = n.BYTES + 1,
      s = 2 * n.BYTES + 1
    function i(x) {
      return Te < x && x < n.ORDER
    }
    function a(x) {
      return Z(x, r)
    }
    function c(x) {
      return Ot(x, r)
    }
    let {
        ProjectivePoint: l,
        normPrivateKeyToScalar: u,
        weierstrassEquation: f,
        isWithinCurveOrder: p,
      } = Ii({
        ...e,
        toBytes(x, v, k) {
          let U = v.toAffine(),
            T = n.toBytes(U.x),
            O = Ee
          return k
            ? O(Uint8Array.from([v.hasEvenY() ? 2 : 3]), T)
            : O(Uint8Array.from([4]), T, n.toBytes(U.y))
        },
        fromBytes(x) {
          let v = x.length,
            k = x[0],
            U = x.subarray(1)
          if (v === o && (k === 2 || k === 3)) {
            let T = J(U)
            if (!i(T)) throw new Error('Point is not on curve')
            let O = f(T),
              q = n.sqrt(O),
              M = (q & ie) === ie
            return (((k & 1) === 1) !== M && (q = n.neg(q)), { x: T, y: q })
          } else if (v === s && k === 4) {
            let T = n.fromBytes(U.subarray(0, n.BYTES)),
              O = n.fromBytes(U.subarray(n.BYTES, 2 * n.BYTES))
            return { x: T, y: O }
          } else
            throw new Error(
              `Point of length ${v} was invalid. Expected ${o} compressed bytes or ${s} uncompressed bytes`
            )
        },
      }),
      y = x => Ze(de(x, e.nByteLength))
    function g(x) {
      let v = r >> ie
      return x > v
    }
    function d(x) {
      return g(x) ? a(-x) : x
    }
    let h = (x, v, k) => J(x.slice(v, k))
    class m {
      constructor(v, k, U) {
        ;((this.r = v), (this.s = k), (this.recovery = U), this.assertValidity())
      }
      static fromCompact(v) {
        let k = e.nByteLength
        return ((v = K('compactSignature', v, k * 2)), new m(h(v, 0, k), h(v, k, 2 * k)))
      }
      static fromDER(v) {
        let { r: k, s: U } = Je.toSig(K('DER', v))
        return new m(k, U)
      }
      assertValidity() {
        if (!p(this.r)) throw new Error('r must be 0 < r < CURVE.n')
        if (!p(this.s)) throw new Error('s must be 0 < s < CURVE.n')
      }
      addRecoveryBit(v) {
        return new m(this.r, this.s, v)
      }
      recoverPublicKey(v) {
        let { r: k, s: U, recovery: T } = this,
          O = B(K('msgHash', v))
        if (T == null || ![0, 1, 2, 3].includes(T)) throw new Error('recovery id invalid')
        let q = T === 2 || T === 3 ? k + e.n : k
        if (q >= n.ORDER) throw new Error('recovery id 2 or 3 invalid')
        let M = (T & 1) === 0 ? '02' : '03',
          F = l.fromHex(M + y(q)),
          Y = c(q),
          ne = a(-O * Y),
          se = a(U * Y),
          Q = l.BASE.multiplyAndAddUnsafe(F, ne, se)
        if (!Q) throw new Error('point at infinify')
        return (Q.assertValidity(), Q)
      }
      hasHighS() {
        return g(this.s)
      }
      normalizeS() {
        return this.hasHighS() ? new m(this.r, a(-this.s), this.recovery) : this
      }
      toDERRawBytes() {
        return Ge(this.toDERHex())
      }
      toDERHex() {
        return Je.hexFromSig({ r: this.r, s: this.s })
      }
      toCompactRawBytes() {
        return Ge(this.toCompactHex())
      }
      toCompactHex() {
        return y(this.r) + y(this.s)
      }
    }
    let w = {
      isValidPrivateKey(x) {
        try {
          return (u(x), !0)
        } catch {
          return !1
        }
      },
      normPrivateKeyToScalar: u,
      randomPrivateKey: () => {
        let x = _n(e.n)
        return no(e.randomBytes(x), e.n)
      },
      precompute(x = 8, v = l.BASE) {
        return (v._setWindowSize(x), v.multiply(BigInt(3)), v)
      },
    }
    function b(x, v = !0) {
      return l.fromPrivateKey(x).toRawBytes(v)
    }
    function E(x) {
      let v = x instanceof Uint8Array,
        k = typeof x == 'string',
        U = (v || k) && x.length
      return v ? U === o || U === s : k ? U === 2 * o || U === 2 * s : x instanceof l
    }
    function S(x, v, k = !0) {
      if (E(x)) throw new Error('first arg must be private key')
      if (!E(v)) throw new Error('second arg must be public key')
      return l.fromHex(v).multiply(u(x)).toRawBytes(k)
    }
    let A =
        e.bits2int ||
        function (x) {
          let v = J(x),
            k = x.length * 8 - e.nBitLength
          return k > 0 ? v >> BigInt(k) : v
        },
      B =
        e.bits2int_modN ||
        function (x) {
          return a(A(x))
        },
      _ = yt(e.nBitLength)
    function N(x) {
      if (typeof x != 'bigint') throw new Error('bigint expected')
      if (!(Te <= x && x < _)) throw new Error(`bigint expected < 2^${e.nBitLength}`)
      return de(x, e.nByteLength)
    }
    function I(x, v, k = C) {
      if (['recovered', 'canonical'].some(te => te in k))
        throw new Error('sign() legacy options not supported')
      let { hash: U, randomBytes: T } = e,
        { lowS: O, prehash: q, extraEntropy: M } = k
      ;(O == null && (O = !0), (x = K('msgHash', x)), q && (x = K('prehashed msgHash', U(x))))
      let F = B(x),
        Y = u(v),
        ne = [N(Y), N(F)]
      if (M != null) {
        let te = M === !0 ? T(n.BYTES) : M
        ne.push(K('extraEntropy', te))
      }
      let se = Ee(...ne),
        Q = F
      function ge(te) {
        let nt = A(te)
        if (!p(nt)) return
        let $r = c(nt),
          ye = l.BASE.multiply(nt).toAffine(),
          rt = a(ye.x)
        if (rt === Te) return
        let At = a($r * a(Q + rt * Y))
        if (At === Te) return
        let Hr = (ye.x === rt ? 0 : 2) | Number(ye.y & ie),
          Mr = At
        return (O && g(At) && ((Mr = d(At)), (Hr ^= 1)), new m(rt, Mr, Hr))
      }
      return { seed: se, k2sig: ge }
    }
    let C = { lowS: e.lowS, prehash: !1 },
      $ = { lowS: e.lowS, prehash: !1 }
    function H(x, v, k = C) {
      let { seed: U, k2sig: T } = I(x, v, k),
        O = e
      return Tn(O.hash.outputLen, O.nByteLength, O.hmac)(U, T)
    }
    l.BASE._setWindowSize(8)
    function V(x, v, k, U = $) {
      let T = x
      if (((v = K('msgHash', v)), (k = K('publicKey', k)), 'strict' in U))
        throw new Error('options.strict was renamed to lowS')
      let { lowS: O, prehash: q } = U,
        M,
        F
      try {
        if (typeof T == 'string' || T instanceof Uint8Array)
          try {
            M = m.fromDER(T)
          } catch (ye) {
            if (!(ye instanceof Je.Err)) throw ye
            M = m.fromCompact(T)
          }
        else if (typeof T == 'object' && typeof T.r == 'bigint' && typeof T.s == 'bigint') {
          let { r: ye, s: rt } = T
          M = new m(ye, rt)
        } else throw new Error('PARSE')
        F = l.fromHex(k)
      } catch (ye) {
        if (ye.message === 'PARSE')
          throw new Error('signature must be Signature instance, Uint8Array or hex string')
        return !1
      }
      if (O && M.hasHighS()) return !1
      q && (v = e.hash(v))
      let { r: Y, s: ne } = M,
        se = B(v),
        Q = c(ne),
        ge = a(se * Q),
        te = a(Y * Q),
        nt = l.BASE.multiplyAndAddUnsafe(F, ge, te)?.toAffine()
      return nt ? a(nt.x) === Y : !1
    }
    return {
      CURVE: e,
      getPublicKey: b,
      getSharedSecret: S,
      sign: H,
      verify: V,
      ProjectivePoint: l,
      Signature: m,
      utils: w,
    }
  }
  var Rt = class extends st {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), Wr(e))
        let r = gt(n)
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
        return (ot(this), this.iHash.update(e), this)
      }
      digestInto(e) {
        ;(ot(this),
          bn(e, this.outputLen),
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
    In = (t, e, n) => new Rt(t, e).update(n).digest()
  In.create = (t, e) => new Rt(t, e)
  function Ni(t) {
    return { hash: t, hmac: (e, ...n) => In(t, e, Zr(...n)), randomBytes: Lt }
  }
  function io(t, e) {
    let n = r => so({ ...t, ...Ni(r) })
    return Object.freeze({ ...n(e), create: n })
  }
  var Mt = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
    Pt = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
    lo = BigInt(1),
    $t = BigInt(2),
    ao = (t, e) => (t + e / $t) / e
  function uo(t) {
    let e = Mt,
      n = BigInt(3),
      r = BigInt(6),
      o = BigInt(11),
      s = BigInt(22),
      i = BigInt(23),
      a = BigInt(44),
      c = BigInt(88),
      l = (t * t * t) % e,
      u = (l * l * t) % e,
      f = (re(u, n, e) * u) % e,
      p = (re(f, n, e) * u) % e,
      y = (re(p, $t, e) * l) % e,
      g = (re(y, o, e) * y) % e,
      d = (re(g, s, e) * g) % e,
      h = (re(d, a, e) * d) % e,
      m = (re(h, c, e) * h) % e,
      w = (re(m, a, e) * d) % e,
      b = (re(w, n, e) * u) % e,
      E = (re(b, i, e) * g) % e,
      S = (re(E, r, e) * l) % e,
      A = re(S, $t, e)
    if (!Nn.eql(Nn.sqr(A), t)) throw new Error('Cannot find square root')
    return A
  }
  var Nn = eo(Mt, void 0, void 0, { sqrt: uo }),
    Pe = io(
      {
        a: BigInt(0),
        b: BigInt(7),
        Fp: Nn,
        n: Pt,
        Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
        Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
        h: BigInt(1),
        lowS: !0,
        endo: {
          beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
          splitScalar: t => {
            let e = Pt,
              n = BigInt('0x3086d221a7d46bcde86c90e49284eb15'),
              r = -lo * BigInt('0xe4437ed6010e88286f547fa90abfe4c3'),
              o = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'),
              s = n,
              i = BigInt('0x100000000000000000000000000000000'),
              a = ao(s * t, e),
              c = ao(-r * t, e),
              l = Z(t - a * n - c * o, e),
              u = Z(-a * r - c * s, e),
              f = l > i,
              p = u > i
            if ((f && (l = e - l), p && (u = e - u), l > i || u > i))
              throw new Error('splitScalar: Endomorphism failed, k=' + t)
            return { k1neg: f, k1: l, k2neg: p, k2: u }
          },
        },
      },
      kt
    ),
    qt = BigInt(0),
    fo = t => typeof t == 'bigint' && qt < t && t < Mt,
    Oi = t => typeof t == 'bigint' && qt < t && t < Pt,
    co = {}
  function Ht(t, ...e) {
    let n = co[t]
    if (n === void 0) {
      let r = kt(Uint8Array.from(t, o => o.charCodeAt(0)))
      ;((n = Ee(r, r)), (co[t] = n))
    }
    return kt(Ee(n, ...e))
  }
  var Pn = t => t.toRawBytes(!0).slice(1),
    On = t => de(t, 32),
    Un = t => Z(t, Mt),
    mt = t => Z(t, Pt),
    $n = Pe.ProjectivePoint,
    Ri = (t, e, n) => $n.BASE.multiplyAndAddUnsafe(t, e, n)
  function Rn(t) {
    let e = Pe.utils.normPrivateKeyToScalar(t),
      n = $n.fromPrivateKey(e)
    return { scalar: n.hasEvenY() ? e : mt(-e), bytes: Pn(n) }
  }
  function ho(t) {
    if (!fo(t)) throw new Error('bad x: need 0 < x < p')
    let e = Un(t * t),
      n = Un(e * t + BigInt(7)),
      r = uo(n)
    r % $t !== qt && (r = Un(-r))
    let o = new $n(t, r, lo)
    return (o.assertValidity(), o)
  }
  function po(...t) {
    return mt(J(Ht('BIP0340/challenge', ...t)))
  }
  function Pi(t) {
    return Rn(t).bytes
  }
  function $i(t, e, n = Lt(32)) {
    let r = K('message', t),
      { bytes: o, scalar: s } = Rn(e),
      i = K('auxRand', n, 32),
      a = On(s ^ J(Ht('BIP0340/aux', i))),
      c = Ht('BIP0340/nonce', a, o, r),
      l = mt(J(c))
    if (l === qt) throw new Error('sign failed: k is zero')
    let { bytes: u, scalar: f } = Rn(l),
      p = po(u, o, r),
      y = new Uint8Array(64)
    if ((y.set(u, 0), y.set(On(mt(f + p * s)), 32), !go(y, r, o)))
      throw new Error('sign: Invalid signature produced')
    return y
  }
  function go(t, e, n) {
    let r = K('signature', t, 64),
      o = K('message', e),
      s = K('publicKey', n, 32)
    try {
      let i = ho(J(s)),
        a = J(r.subarray(0, 32))
      if (!fo(a)) return !1
      let c = J(r.subarray(32, 64))
      if (!Oi(c)) return !1
      let l = po(On(a), Pn(i), o),
        u = Ri(i, c, mt(-l))
      return !(!u || !u.hasEvenY() || u.toAffine().x !== a)
    } catch {
      return !1
    }
  }
  var it = {
    getPublicKey: Pi,
    sign: $i,
    verify: go,
    utils: {
      randomPrivateKey: Pe.utils.randomPrivateKey,
      lift_x: ho,
      pointToBytes: Pn,
      numberToBytesBE: de,
      bytesToNumberBE: J,
      taggedHash: Ht,
      mod: Z,
    },
  }
  var Vt = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Hn = t => t instanceof Uint8Array
  var Dt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    he = (t, e) => (t << (32 - e)) | (t >>> e),
    Hi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Hi) throw new Error('Non little-endian hardware is not supported')
  var Mi = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function j(t) {
    if (!Hn(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += Mi[t[n]]
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
  function qi(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function $e(t) {
    if ((typeof t == 'string' && (t = qi(t)), !Hn(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function ct(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!Hn(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var at = class {
    clone() {
      return this._cloneInto()
    }
  }
  function Mn(t) {
    let e = r => t().update($e(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function zt(t = 32) {
    if (Vt && typeof Vt.getRandomValues == 'function') return Vt.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function qn(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function Vi(t) {
    if (typeof t != 'boolean') throw new Error(`Expected boolean, not ${t}`)
  }
  function yo(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Di(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(qn(t.outputLen), qn(t.blockLen))
  }
  function zi(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Wi(t, e) {
    yo(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var ji = { number: qn, bool: Vi, bytes: yo, hash: Di, exists: zi, output: Wi },
    oe = ji
  function Ki(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var Wt = class extends at {
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
        (this.view = Dt(this.buffer)))
    }
    update(e) {
      oe.exists(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = $e(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = Dt(e)
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
      ;(oe.exists(this), oe.output(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let f = i; f < o; f++) n[f] = 0
      ;(Ki(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = Dt(e),
        c = this.outputLen
      if (c % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = c / 4,
        u = this.get()
      if (l > u.length) throw new Error('_sha2: outputLen bigger than state')
      for (let f = 0; f < l; f++) a.setUint32(4 * f, u[f], s)
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
  var Zi = (t, e, n) => (t & e) ^ (~t & n),
    Gi = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    Fi = new Uint32Array([
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
    He = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Me = new Uint32Array(64),
    jt = class extends Wt {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = He[0] | 0),
          (this.B = He[1] | 0),
          (this.C = He[2] | 0),
          (this.D = He[3] | 0),
          (this.E = He[4] | 0),
          (this.F = He[5] | 0),
          (this.G = He[6] | 0),
          (this.H = He[7] | 0))
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
        for (let f = 0; f < 16; f++, n += 4) Me[f] = e.getUint32(n, !1)
        for (let f = 16; f < 64; f++) {
          let p = Me[f - 15],
            y = Me[f - 2],
            g = he(p, 7) ^ he(p, 18) ^ (p >>> 3),
            d = he(y, 17) ^ he(y, 19) ^ (y >>> 10)
          Me[f] = (d + Me[f - 7] + g + Me[f - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: u } = this
        for (let f = 0; f < 64; f++) {
          let p = he(a, 6) ^ he(a, 11) ^ he(a, 25),
            y = (u + p + Zi(a, c, l) + Fi[f] + Me[f]) | 0,
            d = ((he(r, 2) ^ he(r, 13) ^ he(r, 22)) + Gi(r, o, s)) | 0
          ;((u = l),
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
          (u = (u + this.H) | 0),
          this.set(r, o, s, i, a, c, l, u))
      }
      roundClean() {
        Me.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    },
    Vn = class extends jt {
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
    ae = Mn(() => new jt()),
    kf = Mn(() => new Vn())
  function lt(t) {
    if (!Number.isSafeInteger(t)) throw new Error(`Wrong integer: ${t}`)
  }
  function Se(...t) {
    let e = (o, s) => i => o(s(i)),
      n = Array.from(t)
        .reverse()
        .reduce((o, s) => (o ? e(o, s.encode) : s.encode), void 0),
      r = t.reduce((o, s) => (o ? e(o, s.decode) : s.decode), void 0)
    return { encode: n, decode: r }
  }
  function Be(t) {
    return {
      encode: e => {
        if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
          throw new Error('alphabet.encode input should be an array of numbers')
        return e.map(n => {
          if ((lt(n), n < 0 || n >= t.length))
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
  function Le(t = '') {
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
  function Zt(t, e = '=') {
    if ((lt(t), typeof e != 'string')) throw new Error('padding chr should be string')
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
  function Eo(t) {
    if (typeof t != 'function') throw new Error('normalize fn should be function')
    return { encode: e => e, decode: e => t(e) }
  }
  function mo(t, e, n) {
    if (e < 2) throw new Error(`convertRadix: wrong from=${e}, base cannot be less than 2`)
    if (n < 2) throw new Error(`convertRadix: wrong to=${n}, base cannot be less than 2`)
    if (!Array.isArray(t)) throw new Error('convertRadix: data should be array')
    if (!t.length) return []
    let r = 0,
      o = [],
      s = Array.from(t)
    for (
      s.forEach(i => {
        if ((lt(i), i < 0 || i >= e)) throw new Error(`Wrong integer: ${i}`)
      });
      ;
    ) {
      let i = 0,
        a = !0
      for (let c = r; c < s.length; c++) {
        let l = s[c],
          u = e * i + l
        if (!Number.isSafeInteger(u) || (e * i) / e !== i || u - l !== e * i)
          throw new Error('convertRadix: carry overflow')
        if (
          ((i = u % n),
          (s[c] = Math.floor(u / n)),
          !Number.isSafeInteger(s[c]) || s[c] * n + i !== u)
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
  var To = (t, e) => (e ? To(e, t % e) : t),
    Kt = (t, e) => t + (e - To(t, e))
  function Dn(t, e, n, r) {
    if (!Array.isArray(t)) throw new Error('convertRadix2: data should be array')
    if (e <= 0 || e > 32) throw new Error(`convertRadix2: wrong from=${e}`)
    if (n <= 0 || n > 32) throw new Error(`convertRadix2: wrong to=${n}`)
    if (Kt(e, n) > 32)
      throw new Error(`convertRadix2: carry overflow from=${e} to=${n} carryBits=${Kt(e, n)}`)
    let o = 0,
      s = 0,
      i = 2 ** n - 1,
      a = []
    for (let c of t) {
      if ((lt(c), c >= 2 ** e)) throw new Error(`convertRadix2: invalid data word=${c} from=${e}`)
      if (((o = (o << e) | c), s + e > 32))
        throw new Error(`convertRadix2: carry overflow pos=${s} from=${e}`)
      for (s += e; s >= n; s -= n) a.push(((o >> (s - n)) & i) >>> 0)
      o &= 2 ** s - 1
    }
    if (((o = (o << (n - s)) & i), !r && s >= e)) throw new Error('Excess padding')
    if (!r && o) throw new Error(`Non-zero padding: ${o}`)
    return (r && s > 0 && a.push(o >>> 0), a)
  }
  function Ji(t) {
    return (
      lt(t),
      {
        encode: e => {
          if (!(e instanceof Uint8Array)) throw new Error('radix.encode input should be Uint8Array')
          return mo(Array.from(e), 2 ** 8, t)
        },
        decode: e => {
          if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
            throw new Error('radix.decode input should be array of strings')
          return Uint8Array.from(mo(e, t, 2 ** 8))
        },
      }
    )
  }
  function qe(t, e = !1) {
    if ((lt(t), t <= 0 || t > 32)) throw new Error('radix2: bits should be in (0..32]')
    if (Kt(8, t) > 32 || Kt(t, 8) > 32) throw new Error('radix2: carry overflow')
    return {
      encode: n => {
        if (!(n instanceof Uint8Array)) throw new Error('radix2.encode input should be Uint8Array')
        return Dn(Array.from(n), 8, t, !e)
      },
      decode: n => {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'number'))
          throw new Error('radix2.decode input should be array of strings')
        return Uint8Array.from(Dn(n, t, 8, e))
      },
    }
  }
  function wo(t) {
    if (typeof t != 'function') throw new Error('unsafeWrapper fn should be function')
    return function (...e) {
      try {
        return t.apply(null, e)
      } catch {}
    }
  }
  var Xi = Se(qe(4), Be('0123456789ABCDEF'), Le('')),
    Yi = Se(qe(5), Be('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), Zt(5), Le('')),
    If = Se(qe(5), Be('0123456789ABCDEFGHIJKLMNOPQRSTUV'), Zt(5), Le('')),
    Uf = Se(
      qe(5),
      Be('0123456789ABCDEFGHJKMNPQRSTVWXYZ'),
      Le(''),
      Eo(t => t.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1'))
    ),
    ce = Se(
      qe(6),
      Be('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'),
      Zt(6),
      Le('')
    ),
    Qi = Se(
      qe(6),
      Be('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'),
      Zt(6),
      Le('')
    ),
    jn = t => Se(Ji(58), Be(t), Le('')),
    zn = jn('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'),
    Nf = jn('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'),
    Of = jn('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'),
    bo = [0, 2, 3, 5, 6, 7, 9, 10, 11],
    ea = {
      encode(t) {
        let e = ''
        for (let n = 0; n < t.length; n += 8) {
          let r = t.subarray(n, n + 8)
          e += zn.encode(r).padStart(bo[r.length], '1')
        }
        return e
      },
      decode(t) {
        let e = []
        for (let n = 0; n < t.length; n += 11) {
          let r = t.slice(n, n + 11),
            o = bo.indexOf(r.length),
            s = zn.decode(r)
          for (let i = 0; i < s.length - o; i++)
            if (s[i] !== 0) throw new Error('base58xmr: wrong padding')
          e = e.concat(Array.from(s.slice(s.length - o)))
        }
        return Uint8Array.from(e)
      },
    }
  var Wn = Se(Be('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), Le('')),
    xo = [996825010, 642813549, 513874426, 1027748829, 705979059]
  function wt(t) {
    let e = t >> 25,
      n = (t & 33554431) << 5
    for (let r = 0; r < xo.length; r++) ((e >> r) & 1) === 1 && (n ^= xo[r])
    return n
  }
  function vo(t, e, n = 1) {
    let r = t.length,
      o = 1
    for (let s = 0; s < r; s++) {
      let i = t.charCodeAt(s)
      if (i < 33 || i > 126) throw new Error(`Invalid prefix (${t})`)
      o = wt(o) ^ (i >> 5)
    }
    o = wt(o)
    for (let s = 0; s < r; s++) o = wt(o) ^ (t.charCodeAt(s) & 31)
    for (let s of e) o = wt(o) ^ s
    for (let s = 0; s < 6; s++) o = wt(o)
    return ((o ^= n), Wn.encode(Dn([o % 2 ** 30], 30, 5, !1)))
  }
  function Ao(t) {
    let e = t === 'bech32' ? 1 : 734539939,
      n = qe(5),
      r = n.decode,
      o = n.encode,
      s = wo(r)
    function i(u, f, p = 90) {
      if (typeof u != 'string')
        throw new Error(`bech32.encode prefix should be string, not ${typeof u}`)
      if (!Array.isArray(f) || (f.length && typeof f[0] != 'number'))
        throw new Error(`bech32.encode words should be array of numbers, not ${typeof f}`)
      let y = u.length + 7 + f.length
      if (p !== !1 && y > p) throw new TypeError(`Length ${y} exceeds limit ${p}`)
      return ((u = u.toLowerCase()), `${u}1${Wn.encode(f)}${vo(u, f, e)}`)
    }
    function a(u, f = 90) {
      if (typeof u != 'string')
        throw new Error(`bech32.decode input should be string, not ${typeof u}`)
      if (u.length < 8 || (f !== !1 && u.length > f))
        throw new TypeError(`Wrong string length: ${u.length} (${u}). Expected (8..${f})`)
      let p = u.toLowerCase()
      if (u !== p && u !== u.toUpperCase()) throw new Error('String must be lowercase or uppercase')
      u = p
      let y = u.lastIndexOf('1')
      if (y === 0 || y === -1)
        throw new Error('Letter "1" must be present between prefix and data only')
      let g = u.slice(0, y),
        d = u.slice(y + 1)
      if (d.length < 6) throw new Error('Data must be at least 6 characters long')
      let h = Wn.decode(d).slice(0, -6),
        m = vo(g, h, e)
      if (!d.endsWith(m)) throw new Error(`Invalid checksum in ${u}: expected "${m}"`)
      return { prefix: g, words: h }
    }
    let c = wo(a)
    function l(u) {
      let { prefix: f, words: p } = a(u, !1)
      return { prefix: f, words: p, bytes: r(p) }
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
  var Ve = Ao('bech32'),
    Rf = Ao('bech32m'),
    ta = { encode: t => new TextDecoder().decode(t), decode: t => new TextEncoder().encode(t) },
    na = Se(
      qe(4),
      Be('0123456789abcdef'),
      Le(''),
      Eo(t => {
        if (typeof t != 'string' || t.length % 2)
          throw new TypeError(
            `hex.decode: expected string, got ${typeof t} with length ${t.length}`
          )
        return t.toLowerCase()
      })
    ),
    ra = {
      utf8: ta,
      hex: na,
      base16: Xi,
      base32: Yi,
      base64: ce,
      base64url: Qi,
      base58: zn,
      base58xmr: ea,
    },
    Pf = `Invalid encoding type. Available types: ${Object.keys(ra).join(', ')}`
  function Gt(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`positive integer expected, not ${t}`)
  }
  function Kn(t) {
    if (typeof t != 'boolean') throw new Error(`boolean expected, not ${t}`)
  }
  function Zn(t) {
    return (
      t instanceof Uint8Array ||
      (t != null && typeof t == 'object' && t.constructor.name === 'Uint8Array')
    )
  }
  function R(t, ...e) {
    if (!Zn(t)) throw new Error('Uint8Array expected')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Uint8Array expected of length ${e}, not of length=${t.length}`)
  }
  function De(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function bt(t, e) {
    R(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Ft = t => new Uint8Array(t.buffer, t.byteOffset, t.byteLength)
  var P = t => new Uint32Array(t.buffer, t.byteOffset, Math.floor(t.byteLength / 4)),
    ze = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    oa = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!oa) throw new Error('Non little-endian hardware is not supported')
  var sa = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function Xe(t) {
    R(t)
    let e = ''
    for (let n = 0; n < t.length; n++) e += sa[t[n]]
    return e
  }
  var _e = { _0: 48, _9: 57, _A: 65, _F: 70, _a: 97, _f: 102 }
  function So(t) {
    if (t >= _e._0 && t <= _e._9) return t - _e._0
    if (t >= _e._A && t <= _e._F) return t - (_e._A - 10)
    if (t >= _e._a && t <= _e._f) return t - (_e._a - 10)
  }
  function Gn(t) {
    if (typeof t != 'string') throw new Error('hex string expected, got ' + typeof t)
    let e = t.length,
      n = e / 2
    if (e % 2) throw new Error('padded hex string expected, got unpadded hex of length ' + e)
    let r = new Uint8Array(n)
    for (let o = 0, s = 0; o < n; o++, s += 2) {
      let i = So(t.charCodeAt(s)),
        a = So(t.charCodeAt(s + 1))
      if (i === void 0 || a === void 0) {
        let c = t[s] + t[s + 1]
        throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + s)
      }
      r[o] = i * 16 + a
    }
    return r
  }
  function ia(t) {
    if (typeof t != 'string') throw new Error(`string expected, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function me(t) {
    if (typeof t == 'string') t = ia(t)
    else if (Zn(t)) t = t.slice()
    else throw new Error(`Uint8Array expected, got ${typeof t}`)
    return t
  }
  function Bo(t, e) {
    if (e == null || typeof e != 'object') throw new Error('options must be defined')
    return Object.assign(t, e)
  }
  function Ye(t, e) {
    if (t.length !== e.length) return !1
    let n = 0
    for (let r = 0; r < t.length; r++) n |= t[r] ^ e[r]
    return n === 0
  }
  var we = (t, e) => (Object.assign(e, t), e)
  function Qe(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + c, i, r), t.setUint32(e + l, a, r))
  }
  var ke = 16,
    Jn = new Uint8Array(16),
    be = P(Jn),
    aa = 225,
    ca = (t, e, n, r) => {
      let o = r & 1
      return {
        s3: (n << 31) | (r >>> 1),
        s2: (e << 31) | (n >>> 1),
        s1: (t << 31) | (e >>> 1),
        s0: (t >>> 1) ^ ((aa << 24) & -(o & 1)),
      }
    },
    le = t =>
      (((t >>> 0) & 255) << 24) |
      (((t >>> 8) & 255) << 16) |
      (((t >>> 16) & 255) << 8) |
      ((t >>> 24) & 255) |
      0
  function la(t) {
    t.reverse()
    let e = t[15] & 1,
      n = 0
    for (let r = 0; r < t.length; r++) {
      let o = t[r]
      ;((t[r] = (o >>> 1) | n), (n = (o & 1) << 7))
    }
    return ((t[0] ^= -e & 225), t)
  }
  var ua = t => (t > 64 * 1024 ? 8 : t > 1024 ? 4 : 2),
    Jt = class {
      constructor(e, n) {
        ;((this.blockLen = ke),
          (this.outputLen = ke),
          (this.s0 = 0),
          (this.s1 = 0),
          (this.s2 = 0),
          (this.s3 = 0),
          (this.finished = !1),
          (e = me(e)),
          R(e, 16))
        let r = ze(e),
          o = r.getUint32(0, !1),
          s = r.getUint32(4, !1),
          i = r.getUint32(8, !1),
          a = r.getUint32(12, !1),
          c = []
        for (let g = 0; g < 128; g++)
          (c.push({ s0: le(o), s1: le(s), s2: le(i), s3: le(a) }),
            ({ s0: o, s1: s, s2: i, s3: a } = ca(o, s, i, a)))
        let l = ua(n || 1024)
        if (![1, 2, 4, 8].includes(l))
          throw new Error(`ghash: wrong window size=${l}, should be 2, 4 or 8`)
        this.W = l
        let f = 128 / l,
          p = (this.windowSize = 2 ** l),
          y = []
        for (let g = 0; g < f; g++)
          for (let d = 0; d < p; d++) {
            let h = 0,
              m = 0,
              w = 0,
              b = 0
            for (let E = 0; E < l; E++) {
              if (!((d >>> (l - E - 1)) & 1)) continue
              let { s0: A, s1: B, s2: _, s3: N } = c[l * g + E]
              ;((h ^= A), (m ^= B), (w ^= _), (b ^= N))
            }
            y.push({ s0: h, s1: m, s2: w, s3: b })
          }
        this.t = y
      }
      _updateBlock(e, n, r, o) {
        ;((e ^= this.s0), (n ^= this.s1), (r ^= this.s2), (o ^= this.s3))
        let { W: s, t: i, windowSize: a } = this,
          c = 0,
          l = 0,
          u = 0,
          f = 0,
          p = (1 << s) - 1,
          y = 0
        for (let g of [e, n, r, o])
          for (let d = 0; d < 4; d++) {
            let h = (g >>> (8 * d)) & 255
            for (let m = 8 / s - 1; m >= 0; m--) {
              let w = (h >>> (s * m)) & p,
                { s0: b, s1: E, s2: S, s3: A } = i[y * a + w]
              ;((c ^= b), (l ^= E), (u ^= S), (f ^= A), (y += 1))
            }
          }
        ;((this.s0 = c), (this.s1 = l), (this.s2 = u), (this.s3 = f))
      }
      update(e) {
        ;((e = me(e)), De(this))
        let n = P(e),
          r = Math.floor(e.length / ke),
          o = e.length % ke
        for (let s = 0; s < r; s++)
          this._updateBlock(n[s * 4 + 0], n[s * 4 + 1], n[s * 4 + 2], n[s * 4 + 3])
        return (
          o &&
            (Jn.set(e.subarray(r * ke)), this._updateBlock(be[0], be[1], be[2], be[3]), be.fill(0)),
          this
        )
      }
      destroy() {
        let { t: e } = this
        for (let n of e) ((n.s0 = 0), (n.s1 = 0), (n.s2 = 0), (n.s3 = 0))
      }
      digestInto(e) {
        ;(De(this), bt(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e)
      }
      digest() {
        let e = new Uint8Array(ke)
        return (this.digestInto(e), this.destroy(), e)
      }
    },
    Fn = class extends Jt {
      constructor(e, n) {
        e = me(e)
        let r = la(e.slice())
        ;(super(r, n), r.fill(0))
      }
      update(e) {
        ;((e = me(e)), De(this))
        let n = P(e),
          r = e.length % ke,
          o = Math.floor(e.length / ke)
        for (let s = 0; s < o; s++)
          this._updateBlock(le(n[s * 4 + 3]), le(n[s * 4 + 2]), le(n[s * 4 + 1]), le(n[s * 4 + 0]))
        return (
          r &&
            (Jn.set(e.subarray(o * ke)),
            this._updateBlock(le(be[3]), le(be[2]), le(be[1]), le(be[0])),
            be.fill(0)),
          this
        )
      }
      digestInto(e) {
        ;(De(this), bt(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e.reverse())
      }
    }
  function Lo(t) {
    let e = (r, o) => t(o, r.length).update(me(r)).digest(),
      n = t(new Uint8Array(16), 0)
    return (
      (e.outputLen = n.outputLen),
      (e.blockLen = n.blockLen),
      (e.create = (r, o) => t(r, o)),
      e
    )
  }
  var Xn = Lo((t, e) => new Jt(t, e)),
    _o = Lo((t, e) => new Fn(t, e))
  var ee = 16,
    er = 4,
    Xt = new Uint8Array(ee),
    fa = 283
  function tr(t) {
    return (t << 1) ^ (fa & -(t >> 7))
  }
  function ut(t, e) {
    let n = 0
    for (; e > 0; e >>= 1) ((n ^= t & -(e & 1)), (t = tr(t)))
    return n
  }
  var Qn = (() => {
      let t = new Uint8Array(256)
      for (let n = 0, r = 1; n < 256; n++, r ^= tr(r)) t[n] = r
      let e = new Uint8Array(256)
      e[0] = 99
      for (let n = 0; n < 255; n++) {
        let r = t[255 - n]
        ;((r |= r << 8), (e[t[n]] = (r ^ (r >> 4) ^ (r >> 5) ^ (r >> 6) ^ (r >> 7) ^ 99) & 255))
      }
      return e
    })(),
    da = Qn.map((t, e) => Qn.indexOf(e)),
    ha = t => (t << 24) | (t >>> 8),
    Yn = t => (t << 8) | (t >>> 24)
  function ko(t, e) {
    if (t.length !== 256) throw new Error('Wrong sbox length')
    let n = new Uint32Array(256).map((l, u) => e(t[u])),
      r = n.map(Yn),
      o = r.map(Yn),
      s = o.map(Yn),
      i = new Uint32Array(256 * 256),
      a = new Uint32Array(256 * 256),
      c = new Uint16Array(256 * 256)
    for (let l = 0; l < 256; l++)
      for (let u = 0; u < 256; u++) {
        let f = l * 256 + u
        ;((i[f] = n[l] ^ r[u]), (a[f] = o[l] ^ s[u]), (c[f] = (t[l] << 8) | t[u]))
      }
    return { sbox: t, sbox2: c, T0: n, T1: r, T2: o, T3: s, T01: i, T23: a }
  }
  var nr = ko(Qn, t => (ut(t, 3) << 24) | (t << 16) | (t << 8) | ut(t, 2)),
    Co = ko(da, t => (ut(t, 11) << 24) | (ut(t, 13) << 16) | (ut(t, 9) << 8) | ut(t, 14)),
    pa = (() => {
      let t = new Uint8Array(16)
      for (let e = 0, n = 1; e < 16; e++, n = tr(n)) t[e] = n
      return t
    })()
  function je(t) {
    R(t)
    let e = t.length
    if (![16, 24, 32].includes(e))
      throw new Error(`aes: wrong key size: should be 16, 24 or 32, got: ${e}`)
    let { sbox2: n } = nr,
      r = P(t),
      o = r.length,
      s = a => xe(n, a, a, a, a),
      i = new Uint32Array(e + 28)
    i.set(r)
    for (let a = o; a < i.length; a++) {
      let c = i[a - 1]
      ;(a % o === 0 ? (c = s(ha(c)) ^ pa[a / o - 1]) : o > 6 && a % o === 4 && (c = s(c)),
        (i[a] = i[a - o] ^ c))
    }
    return i
  }
  function Io(t) {
    let e = je(t),
      n = e.slice(),
      r = e.length,
      { sbox2: o } = nr,
      { T0: s, T1: i, T2: a, T3: c } = Co
    for (let l = 0; l < r; l += 4) for (let u = 0; u < 4; u++) n[l + u] = e[r - l - 4 + u]
    e.fill(0)
    for (let l = 4; l < r - 4; l++) {
      let u = n[l],
        f = xe(o, u, u, u, u)
      n[l] = s[f & 255] ^ i[(f >>> 8) & 255] ^ a[(f >>> 16) & 255] ^ c[f >>> 24]
    }
    return n
  }
  function We(t, e, n, r, o, s) {
    return t[((n << 8) & 65280) | ((r >>> 8) & 255)] ^ e[((o >>> 8) & 65280) | ((s >>> 24) & 255)]
  }
  function xe(t, e, n, r, o) {
    return t[(e & 255) | (n & 65280)] | (t[((r >>> 16) & 255) | ((o >>> 16) & 65280)] << 16)
  }
  function ue(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = nr,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let g = 0; g < l; g++) {
      let d = t[c++] ^ We(i, a, e, n, r, o),
        h = t[c++] ^ We(i, a, n, r, o, e),
        m = t[c++] ^ We(i, a, r, o, e, n),
        w = t[c++] ^ We(i, a, o, e, n, r)
      ;((e = d), (n = h), (r = m), (o = w))
    }
    let u = t[c++] ^ xe(s, e, n, r, o),
      f = t[c++] ^ xe(s, n, r, o, e),
      p = t[c++] ^ xe(s, r, o, e, n),
      y = t[c++] ^ xe(s, o, e, n, r)
    return { s0: u, s1: f, s2: p, s3: y }
  }
  function Uo(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = Co,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let g = 0; g < l; g++) {
      let d = t[c++] ^ We(i, a, e, o, r, n),
        h = t[c++] ^ We(i, a, n, e, o, r),
        m = t[c++] ^ We(i, a, r, n, e, o),
        w = t[c++] ^ We(i, a, o, r, n, e)
      ;((e = d), (n = h), (r = m), (o = w))
    }
    let u = t[c++] ^ xe(s, e, o, r, n),
      f = t[c++] ^ xe(s, n, e, o, r),
      p = t[c++] ^ xe(s, r, n, e, o),
      y = t[c++] ^ xe(s, o, r, n, e)
    return { s0: u, s1: f, s2: p, s3: y }
  }
  function ft(t, e) {
    if (!e) return new Uint8Array(t)
    if ((R(e), e.length < t))
      throw new Error(`aes: wrong destination length, expected at least ${t}, got: ${e.length}`)
    return e
  }
  function ga(t, e, n, r) {
    ;(R(e, ee), R(n))
    let o = n.length
    r = ft(o, r)
    let s = e,
      i = P(s),
      { s0: a, s1: c, s2: l, s3: u } = ue(t, i[0], i[1], i[2], i[3]),
      f = P(n),
      p = P(r)
    for (let g = 0; g + 4 <= f.length; g += 4) {
      ;((p[g + 0] = f[g + 0] ^ a),
        (p[g + 1] = f[g + 1] ^ c),
        (p[g + 2] = f[g + 2] ^ l),
        (p[g + 3] = f[g + 3] ^ u))
      let d = 1
      for (let h = s.length - 1; h >= 0; h--)
        ((d = (d + (s[h] & 255)) | 0), (s[h] = d & 255), (d >>>= 8))
      ;({ s0: a, s1: c, s2: l, s3: u } = ue(t, i[0], i[1], i[2], i[3]))
    }
    let y = ee * Math.floor(f.length / er)
    if (y < o) {
      let g = new Uint32Array([a, c, l, u]),
        d = Ft(g)
      for (let h = y, m = 0; h < o; h++, m++) r[h] = n[h] ^ d[m]
    }
    return r
  }
  function xt(t, e, n, r, o) {
    ;(R(n, ee), R(r), (o = ft(r.length, o)))
    let s = n,
      i = P(s),
      a = ze(s),
      c = P(r),
      l = P(o),
      u = e ? 0 : 12,
      f = r.length,
      p = a.getUint32(u, e),
      { s0: y, s1: g, s2: d, s3: h } = ue(t, i[0], i[1], i[2], i[3])
    for (let w = 0; w + 4 <= c.length; w += 4)
      ((l[w + 0] = c[w + 0] ^ y),
        (l[w + 1] = c[w + 1] ^ g),
        (l[w + 2] = c[w + 2] ^ d),
        (l[w + 3] = c[w + 3] ^ h),
        (p = (p + 1) >>> 0),
        a.setUint32(u, p, e),
        ({ s0: y, s1: g, s2: d, s3: h } = ue(t, i[0], i[1], i[2], i[3])))
    let m = ee * Math.floor(c.length / er)
    if (m < f) {
      let w = new Uint32Array([y, g, d, h]),
        b = Ft(w)
      for (let E = m, S = 0; E < f; E++, S++) o[E] = r[E] ^ b[S]
    }
    return o
  }
  var Zf = we({ blockSize: 16, nonceLength: 16 }, function (e, n) {
    ;(R(e), R(n, ee))
    function r(o, s) {
      let i = je(e),
        a = n.slice(),
        c = ga(i, a, o, s)
      return (i.fill(0), a.fill(0), c)
    }
    return { encrypt: (o, s) => r(o, s), decrypt: (o, s) => r(o, s) }
  })
  function No(t) {
    if ((R(t), t.length % ee !== 0))
      throw new Error(`aes/(cbc-ecb).decrypt ciphertext should consist of blocks with size ${ee}`)
  }
  function Oo(t, e, n) {
    let r = t.length,
      o = r % ee
    if (!e && o !== 0) throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding')
    let s = P(t)
    if (e) {
      let c = ee - o
      ;(c || (c = ee), (r = r + c))
    }
    let i = ft(r, n),
      a = P(i)
    return { b: s, o: a, out: i }
  }
  function Ro(t, e) {
    if (!e) return t
    let n = t.length
    if (!n) throw new Error('aes/pcks5: empty ciphertext not allowed')
    let r = t[n - 1]
    if (r <= 0 || r > 16) throw new Error(`aes/pcks5: wrong padding byte: ${r}`)
    let o = t.subarray(0, -r)
    for (let s = 0; s < r; s++) if (t[n - s - 1] !== r) throw new Error('aes/pcks5: wrong padding')
    return o
  }
  function Po(t) {
    let e = new Uint8Array(16),
      n = P(e)
    e.set(t)
    let r = ee - t.length
    for (let o = ee - r; o < ee; o++) e[o] = r
    return n
  }
  var Gf = we({ blockSize: 16 }, function (e, n = {}) {
      R(e)
      let r = !n.disablePadding
      return {
        encrypt: (o, s) => {
          R(o)
          let { b: i, o: a, out: c } = Oo(o, r, s),
            l = je(e),
            u = 0
          for (; u + 4 <= i.length; ) {
            let { s0: f, s1: p, s2: y, s3: g } = ue(l, i[u + 0], i[u + 1], i[u + 2], i[u + 3])
            ;((a[u++] = f), (a[u++] = p), (a[u++] = y), (a[u++] = g))
          }
          if (r) {
            let f = Po(o.subarray(u * 4)),
              { s0: p, s1: y, s2: g, s3: d } = ue(l, f[0], f[1], f[2], f[3])
            ;((a[u++] = p), (a[u++] = y), (a[u++] = g), (a[u++] = d))
          }
          return (l.fill(0), c)
        },
        decrypt: (o, s) => {
          No(o)
          let i = Io(e),
            a = ft(o.length, s),
            c = P(o),
            l = P(a)
          for (let u = 0; u + 4 <= c.length; ) {
            let { s0: f, s1: p, s2: y, s3: g } = Uo(i, c[u + 0], c[u + 1], c[u + 2], c[u + 3])
            ;((l[u++] = f), (l[u++] = p), (l[u++] = y), (l[u++] = g))
          }
          return (i.fill(0), Ro(a, r))
        },
      }
    }),
    rr = we({ blockSize: 16, nonceLength: 16 }, function (e, n, r = {}) {
      ;(R(e), R(n, 16))
      let o = !r.disablePadding
      return {
        encrypt: (s, i) => {
          let a = je(e),
            { b: c, o: l, out: u } = Oo(s, o, i),
            f = P(n),
            p = f[0],
            y = f[1],
            g = f[2],
            d = f[3],
            h = 0
          for (; h + 4 <= c.length; )
            ((p ^= c[h + 0]),
              (y ^= c[h + 1]),
              (g ^= c[h + 2]),
              (d ^= c[h + 3]),
              ({ s0: p, s1: y, s2: g, s3: d } = ue(a, p, y, g, d)),
              (l[h++] = p),
              (l[h++] = y),
              (l[h++] = g),
              (l[h++] = d))
          if (o) {
            let m = Po(s.subarray(h * 4))
            ;((p ^= m[0]),
              (y ^= m[1]),
              (g ^= m[2]),
              (d ^= m[3]),
              ({ s0: p, s1: y, s2: g, s3: d } = ue(a, p, y, g, d)),
              (l[h++] = p),
              (l[h++] = y),
              (l[h++] = g),
              (l[h++] = d))
          }
          return (a.fill(0), u)
        },
        decrypt: (s, i) => {
          No(s)
          let a = Io(e),
            c = P(n),
            l = ft(s.length, i),
            u = P(s),
            f = P(l),
            p = c[0],
            y = c[1],
            g = c[2],
            d = c[3]
          for (let h = 0; h + 4 <= u.length; ) {
            let m = p,
              w = y,
              b = g,
              E = d
            ;((p = u[h + 0]), (y = u[h + 1]), (g = u[h + 2]), (d = u[h + 3]))
            let { s0: S, s1: A, s2: B, s3: _ } = Uo(a, p, y, g, d)
            ;((f[h++] = S ^ m), (f[h++] = A ^ w), (f[h++] = B ^ b), (f[h++] = _ ^ E))
          }
          return (a.fill(0), Ro(l, o))
        },
      }
    }),
    Ff = we({ blockSize: 16, nonceLength: 16 }, function (e, n) {
      ;(R(e), R(n, 16))
      function r(o, s, i) {
        let a = je(e),
          c = o.length
        i = ft(c, i)
        let l = P(o),
          u = P(i),
          f = s ? u : l,
          p = P(n),
          y = p[0],
          g = p[1],
          d = p[2],
          h = p[3]
        for (let w = 0; w + 4 <= l.length; ) {
          let { s0: b, s1: E, s2: S, s3: A } = ue(a, y, g, d, h)
          ;((u[w + 0] = l[w + 0] ^ b),
            (u[w + 1] = l[w + 1] ^ E),
            (u[w + 2] = l[w + 2] ^ S),
            (u[w + 3] = l[w + 3] ^ A),
            (y = f[w++]),
            (g = f[w++]),
            (d = f[w++]),
            (h = f[w++]))
        }
        let m = ee * Math.floor(l.length / er)
        if (m < c) {
          ;({ s0: y, s1: g, s2: d, s3: h } = ue(a, y, g, d, h))
          let w = Ft(new Uint32Array([y, g, d, h]))
          for (let b = m, E = 0; b < c; b++, E++) i[b] = o[b] ^ w[E]
          w.fill(0)
        }
        return (a.fill(0), i)
      }
      return { encrypt: (o, s) => r(o, !0, s), decrypt: (o, s) => r(o, !1, s) }
    })
  function $o(t, e, n, r, o) {
    let s = t.create(n, r.length + (o?.length || 0))
    ;(o && s.update(o), s.update(r))
    let i = new Uint8Array(16),
      a = ze(i)
    return (
      o && Qe(a, 0, BigInt(o.length * 8), e),
      Qe(a, 8, BigInt(r.length * 8), e),
      s.update(i),
      s.digest()
    )
  }
  var Jf = we({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      if ((R(n), n.length === 0)) throw new Error('aes/gcm: empty nonce')
      let o = 16
      function s(a, c, l) {
        let u = $o(Xn, !1, a, l, r)
        for (let f = 0; f < c.length; f++) u[f] ^= c[f]
        return u
      }
      function i() {
        let a = je(e),
          c = Xt.slice(),
          l = Xt.slice()
        if ((xt(a, !1, l, l, c), n.length === 12)) l.set(n)
        else {
          let f = Xt.slice(),
            p = ze(f)
          ;(Qe(p, 8, BigInt(n.length * 8), !1), Xn.create(c).update(n).update(f).digestInto(l))
        }
        let u = xt(a, !1, l, Xt)
        return { xk: a, authKey: c, counter: l, tagMask: u }
      }
      return {
        encrypt: a => {
          R(a)
          let { xk: c, authKey: l, counter: u, tagMask: f } = i(),
            p = new Uint8Array(a.length + o)
          xt(c, !1, u, a, p)
          let y = s(l, f, p.subarray(0, p.length - o))
          return (p.set(y, a.length), c.fill(0), p)
        },
        decrypt: a => {
          if ((R(a), a.length < o)) throw new Error(`aes/gcm: ciphertext less than tagLen (${o})`)
          let { xk: c, authKey: l, counter: u, tagMask: f } = i(),
            p = a.subarray(0, -o),
            y = a.subarray(-o),
            g = s(l, f, p)
          if (!Ye(g, y)) throw new Error('aes/gcm: invalid ghash tag')
          let d = xt(c, !1, u, p)
          return (l.fill(0), f.fill(0), c.fill(0), d)
        },
      }
    }),
    Yt = (t, e, n) => r => {
      if (!Number.isSafeInteger(r) || e > r || r > n)
        throw new Error(`${t}: invalid value=${r}, must be [${e}..${n}]`)
    },
    Xf = we({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      let s = Yt('AAD', 0, 68719476736),
        i = Yt('plaintext', 0, 2 ** 36),
        a = Yt('nonce', 12, 12),
        c = Yt('ciphertext', 16, 2 ** 36 + 16)
      ;(R(n), a(n.length), r && (R(r), s(r.length)))
      function l() {
        let p = e.length
        if (p !== 16 && p !== 24 && p !== 32)
          throw new Error(`key length must be 16, 24 or 32 bytes, got: ${p} bytes`)
        let y = je(e),
          g = new Uint8Array(p),
          d = new Uint8Array(16),
          h = P(n),
          m = 0,
          w = h[0],
          b = h[1],
          E = h[2],
          S = 0
        for (let A of [d, g].map(P)) {
          let B = P(A)
          for (let _ = 0; _ < B.length; _ += 2) {
            let { s0: N, s1: I } = ue(y, m, w, b, E)
            ;((B[_ + 0] = N), (B[_ + 1] = I), (m = ++S))
          }
        }
        return (y.fill(0), { authKey: d, encKey: je(g) })
      }
      function u(p, y, g) {
        let d = $o(_o, !0, y, g, r)
        for (let S = 0; S < 12; S++) d[S] ^= n[S]
        d[15] &= 127
        let h = P(d),
          m = h[0],
          w = h[1],
          b = h[2],
          E = h[3]
        return (
          ({ s0: m, s1: w, s2: b, s3: E } = ue(p, m, w, b, E)),
          (h[0] = m),
          (h[1] = w),
          (h[2] = b),
          (h[3] = E),
          d
        )
      }
      function f(p, y, g) {
        let d = y.slice()
        return ((d[15] |= 128), xt(p, !0, d, g))
      }
      return {
        encrypt: p => {
          ;(R(p), i(p.length))
          let { encKey: y, authKey: g } = l(),
            d = u(y, g, p),
            h = new Uint8Array(p.length + 16)
          return (h.set(d, p.length), h.set(f(y, d, p)), y.fill(0), g.fill(0), h)
        },
        decrypt: p => {
          ;(R(p), c(p.length))
          let y = p.subarray(-16),
            { encKey: g, authKey: d } = l(),
            h = f(g, y, p.subarray(0, -16)),
            m = u(g, d, h)
          if ((g.fill(0), d.fill(0), !Ye(y, m))) throw new Error('invalid polyval tag')
          return h
        },
      }
    })
  var X = (t, e) => (t[e++] & 255) | ((t[e++] & 255) << 8),
    or = class {
      constructor(e) {
        ;((this.blockLen = 16),
          (this.outputLen = 16),
          (this.buffer = new Uint8Array(16)),
          (this.r = new Uint16Array(10)),
          (this.h = new Uint16Array(10)),
          (this.pad = new Uint16Array(8)),
          (this.pos = 0),
          (this.finished = !1),
          (e = me(e)),
          R(e, 32))
        let n = X(e, 0),
          r = X(e, 2),
          o = X(e, 4),
          s = X(e, 6),
          i = X(e, 8),
          a = X(e, 10),
          c = X(e, 12),
          l = X(e, 14)
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
        for (let u = 0; u < 8; u++) this.pad[u] = X(e, 16 + 2 * u)
      }
      process(e, n, r = !1) {
        let o = r ? 0 : 2048,
          { h: s, r: i } = this,
          a = i[0],
          c = i[1],
          l = i[2],
          u = i[3],
          f = i[4],
          p = i[5],
          y = i[6],
          g = i[7],
          d = i[8],
          h = i[9],
          m = X(e, n + 0),
          w = X(e, n + 2),
          b = X(e, n + 4),
          E = X(e, n + 6),
          S = X(e, n + 8),
          A = X(e, n + 10),
          B = X(e, n + 12),
          _ = X(e, n + 14),
          N = s[0] + (m & 8191),
          I = s[1] + (((m >>> 13) | (w << 3)) & 8191),
          C = s[2] + (((w >>> 10) | (b << 6)) & 8191),
          $ = s[3] + (((b >>> 7) | (E << 9)) & 8191),
          H = s[4] + (((E >>> 4) | (S << 12)) & 8191),
          V = s[5] + ((S >>> 1) & 8191),
          x = s[6] + (((S >>> 14) | (A << 2)) & 8191),
          v = s[7] + (((A >>> 11) | (B << 5)) & 8191),
          k = s[8] + (((B >>> 8) | (_ << 8)) & 8191),
          U = s[9] + ((_ >>> 5) | o),
          T = 0,
          O = T + N * a + I * (5 * h) + C * (5 * d) + $ * (5 * g) + H * (5 * y)
        ;((T = O >>> 13),
          (O &= 8191),
          (O += V * (5 * p) + x * (5 * f) + v * (5 * u) + k * (5 * l) + U * (5 * c)),
          (T += O >>> 13),
          (O &= 8191))
        let q = T + N * c + I * a + C * (5 * h) + $ * (5 * d) + H * (5 * g)
        ;((T = q >>> 13),
          (q &= 8191),
          (q += V * (5 * y) + x * (5 * p) + v * (5 * f) + k * (5 * u) + U * (5 * l)),
          (T += q >>> 13),
          (q &= 8191))
        let M = T + N * l + I * c + C * a + $ * (5 * h) + H * (5 * d)
        ;((T = M >>> 13),
          (M &= 8191),
          (M += V * (5 * g) + x * (5 * y) + v * (5 * p) + k * (5 * f) + U * (5 * u)),
          (T += M >>> 13),
          (M &= 8191))
        let F = T + N * u + I * l + C * c + $ * a + H * (5 * h)
        ;((T = F >>> 13),
          (F &= 8191),
          (F += V * (5 * d) + x * (5 * g) + v * (5 * y) + k * (5 * p) + U * (5 * f)),
          (T += F >>> 13),
          (F &= 8191))
        let Y = T + N * f + I * u + C * l + $ * c + H * a
        ;((T = Y >>> 13),
          (Y &= 8191),
          (Y += V * (5 * h) + x * (5 * d) + v * (5 * g) + k * (5 * y) + U * (5 * p)),
          (T += Y >>> 13),
          (Y &= 8191))
        let ne = T + N * p + I * f + C * u + $ * l + H * c
        ;((T = ne >>> 13),
          (ne &= 8191),
          (ne += V * a + x * (5 * h) + v * (5 * d) + k * (5 * g) + U * (5 * y)),
          (T += ne >>> 13),
          (ne &= 8191))
        let se = T + N * y + I * p + C * f + $ * u + H * l
        ;((T = se >>> 13),
          (se &= 8191),
          (se += V * c + x * a + v * (5 * h) + k * (5 * d) + U * (5 * g)),
          (T += se >>> 13),
          (se &= 8191))
        let Q = T + N * g + I * y + C * p + $ * f + H * u
        ;((T = Q >>> 13),
          (Q &= 8191),
          (Q += V * l + x * c + v * a + k * (5 * h) + U * (5 * d)),
          (T += Q >>> 13),
          (Q &= 8191))
        let ge = T + N * d + I * g + C * y + $ * p + H * f
        ;((T = ge >>> 13),
          (ge &= 8191),
          (ge += V * u + x * l + v * c + k * a + U * (5 * h)),
          (T += ge >>> 13),
          (ge &= 8191))
        let te = T + N * h + I * d + C * g + $ * y + H * p
        ;((T = te >>> 13),
          (te &= 8191),
          (te += V * f + x * u + v * l + k * c + U * a),
          (T += te >>> 13),
          (te &= 8191),
          (T = ((T << 2) + T) | 0),
          (T = (T + O) | 0),
          (O = T & 8191),
          (T = T >>> 13),
          (q += T),
          (s[0] = O),
          (s[1] = q),
          (s[2] = M),
          (s[3] = F),
          (s[4] = Y),
          (s[5] = ne),
          (s[6] = se),
          (s[7] = Q),
          (s[8] = ge),
          (s[9] = te))
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
        De(this)
        let { buffer: n, blockLen: r } = this
        e = me(e)
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
        ;(De(this), bt(e, this), (this.finished = !0))
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
  function ya(t) {
    let e = (r, o) => t(o).update(me(r)).digest(),
      n = t(new Uint8Array(32))
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = r => t(r)), e)
  }
  var Ho = ya(t => new or(t))
  var qo = t => Uint8Array.from(t.split('').map(e => e.charCodeAt(0))),
    ma = qo('expand 16-byte k'),
    wa = qo('expand 32-byte k'),
    ba = P(ma),
    Vo = P(wa),
    od = Vo.slice()
  function L(t, e) {
    return (t << e) | (t >>> (32 - e))
  }
  function sr(t) {
    return t.byteOffset % 4 === 0
  }
  var Qt = 64,
    xa = 16,
    Do = 2 ** 32 - 1,
    Mo = new Uint32Array()
  function va(t, e, n, r, o, s, i, a) {
    let c = o.length,
      l = new Uint8Array(Qt),
      u = P(l),
      f = sr(o) && sr(s),
      p = f ? P(o) : Mo,
      y = f ? P(s) : Mo
    for (let g = 0; g < c; i++) {
      if ((t(e, n, r, u, i, a), i >= Do)) throw new Error('arx: counter overflow')
      let d = Math.min(Qt, c - g)
      if (f && d === Qt) {
        let h = g / 4
        if (g % 4 !== 0) throw new Error('arx: invalid block position')
        for (let m = 0, w; m < xa; m++) ((w = h + m), (y[w] = p[w] ^ u[m]))
        g += Qt
        continue
      }
      for (let h = 0, m; h < d; h++) ((m = g + h), (s[m] = o[m] ^ l[h]))
      g += d
    }
  }
  function ir(t, e) {
    let {
      allowShortKeys: n,
      extendNonceFn: r,
      counterLength: o,
      counterRight: s,
      rounds: i,
    } = Bo({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, e)
    if (typeof t != 'function') throw new Error('core must be a function')
    return (
      Gt(o),
      Gt(i),
      Kn(s),
      Kn(n),
      (a, c, l, u, f = 0) => {
        ;(R(a), R(c), R(l))
        let p = l.length
        if ((u || (u = new Uint8Array(p)), R(u), Gt(f), f < 0 || f >= Do))
          throw new Error('arx: counter overflow')
        if (u.length < p) throw new Error(`arx: output (${u.length}) is shorter than data (${p})`)
        let y = [],
          g = a.length,
          d,
          h
        if (g === 32) ((d = a.slice()), y.push(d), (h = Vo))
        else if (g === 16 && n)
          ((d = new Uint8Array(32)), d.set(a), d.set(a, 16), (h = ba), y.push(d))
        else throw new Error(`arx: invalid 32-byte key, got length=${g}`)
        sr(c) || ((c = c.slice()), y.push(c))
        let m = P(d)
        if (r) {
          if (c.length !== 24) throw new Error('arx: extended nonce must be 24 bytes')
          ;(r(h, m, P(c.subarray(0, 16)), m), (c = c.subarray(16)))
        }
        let w = 16 - o
        if (w !== c.length) throw new Error(`arx: nonce must be ${w} or 16 bytes`)
        if (w !== 12) {
          let E = new Uint8Array(12)
          ;(E.set(c, s ? 0 : 12 - c.length), (c = E), y.push(c))
        }
        let b = P(c)
        for (va(t, h, m, b, l, u, f, i); y.length > 0; ) y.pop().fill(0)
        return u
      }
    )
  }
  function jo(t, e, n, r, o, s = 20) {
    let i = t[0],
      a = t[1],
      c = t[2],
      l = t[3],
      u = e[0],
      f = e[1],
      p = e[2],
      y = e[3],
      g = e[4],
      d = e[5],
      h = e[6],
      m = e[7],
      w = o,
      b = n[0],
      E = n[1],
      S = n[2],
      A = i,
      B = a,
      _ = c,
      N = l,
      I = u,
      C = f,
      $ = p,
      H = y,
      V = g,
      x = d,
      v = h,
      k = m,
      U = w,
      T = b,
      O = E,
      q = S
    for (let F = 0; F < s; F += 2)
      ((A = (A + I) | 0),
        (U = L(U ^ A, 16)),
        (V = (V + U) | 0),
        (I = L(I ^ V, 12)),
        (A = (A + I) | 0),
        (U = L(U ^ A, 8)),
        (V = (V + U) | 0),
        (I = L(I ^ V, 7)),
        (B = (B + C) | 0),
        (T = L(T ^ B, 16)),
        (x = (x + T) | 0),
        (C = L(C ^ x, 12)),
        (B = (B + C) | 0),
        (T = L(T ^ B, 8)),
        (x = (x + T) | 0),
        (C = L(C ^ x, 7)),
        (_ = (_ + $) | 0),
        (O = L(O ^ _, 16)),
        (v = (v + O) | 0),
        ($ = L($ ^ v, 12)),
        (_ = (_ + $) | 0),
        (O = L(O ^ _, 8)),
        (v = (v + O) | 0),
        ($ = L($ ^ v, 7)),
        (N = (N + H) | 0),
        (q = L(q ^ N, 16)),
        (k = (k + q) | 0),
        (H = L(H ^ k, 12)),
        (N = (N + H) | 0),
        (q = L(q ^ N, 8)),
        (k = (k + q) | 0),
        (H = L(H ^ k, 7)),
        (A = (A + C) | 0),
        (q = L(q ^ A, 16)),
        (v = (v + q) | 0),
        (C = L(C ^ v, 12)),
        (A = (A + C) | 0),
        (q = L(q ^ A, 8)),
        (v = (v + q) | 0),
        (C = L(C ^ v, 7)),
        (B = (B + $) | 0),
        (U = L(U ^ B, 16)),
        (k = (k + U) | 0),
        ($ = L($ ^ k, 12)),
        (B = (B + $) | 0),
        (U = L(U ^ B, 8)),
        (k = (k + U) | 0),
        ($ = L($ ^ k, 7)),
        (_ = (_ + H) | 0),
        (T = L(T ^ _, 16)),
        (V = (V + T) | 0),
        (H = L(H ^ V, 12)),
        (_ = (_ + H) | 0),
        (T = L(T ^ _, 8)),
        (V = (V + T) | 0),
        (H = L(H ^ V, 7)),
        (N = (N + I) | 0),
        (O = L(O ^ N, 16)),
        (x = (x + O) | 0),
        (I = L(I ^ x, 12)),
        (N = (N + I) | 0),
        (O = L(O ^ N, 8)),
        (x = (x + O) | 0),
        (I = L(I ^ x, 7)))
    let M = 0
    ;((r[M++] = (i + A) | 0),
      (r[M++] = (a + B) | 0),
      (r[M++] = (c + _) | 0),
      (r[M++] = (l + N) | 0),
      (r[M++] = (u + I) | 0),
      (r[M++] = (f + C) | 0),
      (r[M++] = (p + $) | 0),
      (r[M++] = (y + H) | 0),
      (r[M++] = (g + V) | 0),
      (r[M++] = (d + x) | 0),
      (r[M++] = (h + v) | 0),
      (r[M++] = (m + k) | 0),
      (r[M++] = (w + U) | 0),
      (r[M++] = (b + T) | 0),
      (r[M++] = (E + O) | 0),
      (r[M++] = (S + q) | 0))
  }
  function Ea(t, e, n, r) {
    let o = t[0],
      s = t[1],
      i = t[2],
      a = t[3],
      c = e[0],
      l = e[1],
      u = e[2],
      f = e[3],
      p = e[4],
      y = e[5],
      g = e[6],
      d = e[7],
      h = n[0],
      m = n[1],
      w = n[2],
      b = n[3]
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
        (m = L(m ^ s, 16)),
        (y = (y + m) | 0),
        (l = L(l ^ y, 12)),
        (s = (s + l) | 0),
        (m = L(m ^ s, 8)),
        (y = (y + m) | 0),
        (l = L(l ^ y, 7)),
        (i = (i + u) | 0),
        (w = L(w ^ i, 16)),
        (g = (g + w) | 0),
        (u = L(u ^ g, 12)),
        (i = (i + u) | 0),
        (w = L(w ^ i, 8)),
        (g = (g + w) | 0),
        (u = L(u ^ g, 7)),
        (a = (a + f) | 0),
        (b = L(b ^ a, 16)),
        (d = (d + b) | 0),
        (f = L(f ^ d, 12)),
        (a = (a + f) | 0),
        (b = L(b ^ a, 8)),
        (d = (d + b) | 0),
        (f = L(f ^ d, 7)),
        (o = (o + l) | 0),
        (b = L(b ^ o, 16)),
        (g = (g + b) | 0),
        (l = L(l ^ g, 12)),
        (o = (o + l) | 0),
        (b = L(b ^ o, 8)),
        (g = (g + b) | 0),
        (l = L(l ^ g, 7)),
        (s = (s + u) | 0),
        (h = L(h ^ s, 16)),
        (d = (d + h) | 0),
        (u = L(u ^ d, 12)),
        (s = (s + u) | 0),
        (h = L(h ^ s, 8)),
        (d = (d + h) | 0),
        (u = L(u ^ d, 7)),
        (i = (i + f) | 0),
        (m = L(m ^ i, 16)),
        (p = (p + m) | 0),
        (f = L(f ^ p, 12)),
        (i = (i + f) | 0),
        (m = L(m ^ i, 8)),
        (p = (p + m) | 0),
        (f = L(f ^ p, 7)),
        (a = (a + c) | 0),
        (w = L(w ^ a, 16)),
        (y = (y + w) | 0),
        (c = L(c ^ y, 12)),
        (a = (a + c) | 0),
        (w = L(w ^ a, 8)),
        (y = (y + w) | 0),
        (c = L(c ^ y, 7)))
    let E = 0
    ;((r[E++] = o),
      (r[E++] = s),
      (r[E++] = i),
      (r[E++] = a),
      (r[E++] = h),
      (r[E++] = m),
      (r[E++] = w),
      (r[E++] = b))
  }
  var en = ir(jo, { counterRight: !1, counterLength: 4, allowShortKeys: !1 }),
    Ta = ir(jo, { counterRight: !1, counterLength: 8, extendNonceFn: Ea, allowShortKeys: !1 })
  var Aa = new Uint8Array(16),
    zo = (t, e) => {
      t.update(e)
      let n = e.length % 16
      n && t.update(Aa.subarray(n))
    },
    Sa = new Uint8Array(32)
  function Wo(t, e, n, r, o) {
    let s = t(e, n, Sa),
      i = Ho.create(s)
    ;(o && zo(i, o), zo(i, r))
    let a = new Uint8Array(16),
      c = ze(a)
    ;(Qe(c, 0, BigInt(o ? o.length : 0), !0), Qe(c, 8, BigInt(r.length), !0), i.update(a))
    let l = i.digest()
    return (s.fill(0), l)
  }
  var Ko = t => (e, n, r) => (
      R(e, 32),
      R(n),
      {
        encrypt: (s, i) => {
          let a = s.length,
            c = a + 16
          ;(i ? R(i, c) : (i = new Uint8Array(c)), t(e, n, s, i, 1))
          let l = Wo(t, e, n, i.subarray(0, -16), r)
          return (i.set(l, a), i)
        },
        decrypt: (s, i) => {
          let a = s.length,
            c = a - 16
          if (a < 16) throw new Error('encrypted data must be at least 16 bytes')
          i ? R(i, c) : (i = new Uint8Array(c))
          let l = s.subarray(0, -16),
            u = s.subarray(-16),
            f = Wo(t, e, n, l, r)
          if (!Ye(u, f)) throw new Error('invalid tag')
          return (t(e, n, l, i, 1), i)
        },
      }
    ),
    ud = we({ blockSize: 64, nonceLength: 12, tagLength: 16 }, Ko(en)),
    fd = we({ blockSize: 64, nonceLength: 24, tagLength: 16 }, Ko(Ta))
  var tn = class extends at {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), oe.hash(e))
        let r = $e(n)
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
        return (oe.exists(this), this.iHash.update(e), this)
      }
      digestInto(e) {
        ;(oe.exists(this),
          oe.bytes(e, this.outputLen),
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
    dt = (t, e, n) => new tn(t, e).update(n).digest()
  dt.create = (t, e) => new tn(t, e)
  function Go(t, e, n) {
    return (oe.hash(t), n === void 0 && (n = new Uint8Array(t.outputLen)), dt(t, $e(n), $e(e)))
  }
  var ar = new Uint8Array([0]),
    Zo = new Uint8Array()
  function Fo(t, e, n, r = 32) {
    if ((oe.hash(t), oe.number(r), r > 255 * t.outputLen))
      throw new Error('Length should be <= 255*HashLen')
    let o = Math.ceil(r / t.outputLen)
    n === void 0 && (n = Zo)
    let s = new Uint8Array(o * t.outputLen),
      i = dt.create(t, e),
      a = i._cloneInto(),
      c = new Uint8Array(i.outputLen)
    for (let l = 0; l < o; l++)
      ((ar[0] = l + 1),
        a
          .update(l === 0 ? Zo : c)
          .update(n)
          .update(ar)
          .digestInto(c),
        s.set(c, t.outputLen * l),
        i._cloneInto(a))
    return (i.destroy(), a.destroy(), c.fill(0), ar.fill(0), s.slice(0, r))
  }
  var Ba = Object.defineProperty,
    D = (t, e) => {
      for (var n in e) Ba(t, n, { get: e[n], enumerable: !0 })
    },
    ht = Symbol('verified'),
    La = t => t instanceof Object
  function fr(t) {
    if (
      !La(t) ||
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
  var _a = {}
  D(_a, {
    Queue: () => Ua,
    QueueNode: () => Qo,
    binarySearch: () => dr,
    bytesToHex: () => j,
    hexToBytes: () => Ae,
    insertEventIntoAscendingList: () => Ia,
    insertEventIntoDescendingList: () => Ca,
    normalizeURL: () => ka,
    utf8Decoder: () => Ue,
    utf8Encoder: () => pe,
  })
  var Ue = new TextDecoder('utf-8'),
    pe = new TextEncoder()
  function ka(t) {
    try {
      t.indexOf('://') === -1 && (t = 'wss://' + t)
      let e = new URL(t)
      return (
        e.protocol === 'http:'
          ? (e.protocol = 'ws:')
          : e.protocol === 'https:' && (e.protocol = 'wss:'),
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
  function Ca(t, e) {
    let [n, r] = dr(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : o.created_at - e.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function Ia(t, e) {
    let [n, r] = dr(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : e.created_at - o.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function dr(t, e) {
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
  var Qo = class {
      constructor(t) {
        z(this, 'value')
        z(this, 'next', null)
        z(this, 'prev', null)
        this.value = t
      }
    },
    Ua = class {
      constructor() {
        z(this, 'first')
        z(this, 'last')
        ;((this.first = null), (this.last = null))
      }
      enqueue(t) {
        let e = new Qo(t)
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
    Na = class {
      generateSecretKey() {
        return it.utils.randomPrivateKey()
      }
      getPublicKey(t) {
        return j(it.getPublicKey(t))
      }
      finalizeEvent(t, e) {
        let n = t
        return (
          (n.pubkey = j(it.getPublicKey(e))),
          (n.id = rn(n)),
          (n.sig = j(it.sign(rn(n), e))),
          (n[ht] = !0),
          n
        )
      }
      verifyEvent(t) {
        if (typeof t[ht] == 'boolean') return t[ht]
        let e = rn(t)
        if (e !== t.id) return ((t[ht] = !1), !1)
        try {
          let n = it.verify(t.sig, e, t.pubkey)
          return ((t[ht] = n), n)
        } catch {
          return ((t[ht] = !1), !1)
        }
      }
    }
  function Oa(t) {
    if (!fr(t)) throw new Error("can't serialize event with wrong or missing properties")
    return JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content])
  }
  function rn(t) {
    let e = ae(pe.encode(Oa(t)))
    return j(e)
  }
  var an = new Na(),
    Ra = an.generateSecretKey,
    hr = an.getPublicKey,
    ve = an.finalizeEvent,
    pr = an.verifyEvent,
    Pa = {}
  D(Pa, {
    Application: () => Rc,
    BadgeAward: () => Wa,
    BadgeDefinition: () => _c,
    BlockedRelaysList: () => dc,
    BookmarkList: () => lc,
    Bookmarksets: () => Sc,
    Calendar: () => Dc,
    CalendarEventRSVP: () => zc,
    ChannelCreation: () => ss,
    ChannelHideMessage: () => cs,
    ChannelMessage: () => as,
    ChannelMetadata: () => is,
    ChannelMuteUser: () => ls,
    ClassifiedListing: () => Hc,
    ClientAuth: () => fs,
    CommunitiesList: () => uc,
    CommunityDefinition: () => Kc,
    CommunityPostApproval: () => Ya,
    Contacts: () => Va,
    CreateOrUpdateProduct: () => Ic,
    CreateOrUpdateStall: () => Cc,
    Curationsets: () => Bc,
    Date: () => qc,
    DirectMessageRelaysList: () => yc,
    DraftClassifiedListing: () => Mc,
    DraftLong: () => Nc,
    Emojisets: () => Oc,
    EncryptedDirectMessage: () => Da,
    EventDeletion: () => za,
    FileMetadata: () => Ka,
    FileServerPreference: () => mc,
    Followsets: () => Ec,
    GenericRepost: () => br,
    Genericlists: () => Tc,
    GiftWrap: () => us,
    HTTPAuth: () => xr,
    Handlerinformation: () => jc,
    Handlerrecommendation: () => Wc,
    Highlights: () => sc,
    InterestsList: () => pc,
    Interestsets: () => kc,
    JobFeedback: () => tc,
    JobRequest: () => Qa,
    JobResult: () => ec,
    Label: () => Xa,
    LightningPubRPC: () => bc,
    LiveChatMessage: () => Za,
    LiveEvent: () => Pc,
    LongFormArticle: () => Uc,
    Metadata: () => Ma,
    Mutelist: () => ic,
    NWCWalletInfo: () => wc,
    NWCWalletRequest: () => ds,
    NWCWalletResponse: () => xc,
    NostrConnect: () => vc,
    OpenTimestamps: () => ja,
    Pinlist: () => ac,
    PrivateDirectMessage: () => os,
    ProblemTracker: () => Ga,
    ProfileBadges: () => Lc,
    PublicChatsList: () => fc,
    Reaction: () => wr,
    RecommendRelay: () => qa,
    RelayList: () => cc,
    Relaysets: () => Ac,
    Report: () => Fa,
    Reporting: () => Ja,
    Repost: () => mr,
    Seal: () => rs,
    SearchRelaysList: () => hc,
    ShortTextNote: () => ns,
    Time: () => Vc,
    UserEmojiList: () => gc,
    UserStatuses: () => $c,
    Zap: () => oc,
    ZapGoal: () => nc,
    ZapRequest: () => rc,
    classifyKind: () => $a,
    isAddressableKind: () => yr,
    isEphemeralKind: () => ts,
    isKind: () => Ha,
    isRegularKind: () => es,
    isReplaceableKind: () => gr,
  })
  function es(t) {
    return t < 1e4 && t !== 0 && t !== 3
  }
  function gr(t) {
    return t === 0 || t === 3 || (1e4 <= t && t < 2e4)
  }
  function ts(t) {
    return 2e4 <= t && t < 3e4
  }
  function yr(t) {
    return 3e4 <= t && t < 4e4
  }
  function $a(t) {
    return es(t)
      ? 'regular'
      : gr(t)
        ? 'replaceable'
        : ts(t)
          ? 'ephemeral'
          : yr(t)
            ? 'parameterized'
            : 'unknown'
  }
  function Ha(t, e) {
    let n = e instanceof Array ? e : [e]
    return (fr(t) && n.includes(t.kind)) || !1
  }
  var Ma = 0,
    ns = 1,
    qa = 2,
    Va = 3,
    Da = 4,
    za = 5,
    mr = 6,
    wr = 7,
    Wa = 8,
    rs = 13,
    os = 14,
    br = 16,
    ss = 40,
    is = 41,
    as = 42,
    cs = 43,
    ls = 44,
    ja = 1040,
    us = 1059,
    Ka = 1063,
    Za = 1311,
    Ga = 1971,
    Fa = 1984,
    Ja = 1984,
    Xa = 1985,
    Ya = 4550,
    Qa = 5999,
    ec = 6999,
    tc = 7e3,
    nc = 9041,
    rc = 9734,
    oc = 9735,
    sc = 9802,
    ic = 1e4,
    ac = 10001,
    cc = 10002,
    lc = 10003,
    uc = 10004,
    fc = 10005,
    dc = 10006,
    hc = 10007,
    pc = 10015,
    gc = 10030,
    yc = 10050,
    mc = 10096,
    wc = 13194,
    bc = 21e3,
    fs = 22242,
    ds = 23194,
    xc = 23195,
    vc = 24133,
    xr = 27235,
    Ec = 3e4,
    Tc = 30001,
    Ac = 30002,
    Sc = 30003,
    Bc = 30004,
    Lc = 30008,
    _c = 30009,
    kc = 30015,
    Cc = 30017,
    Ic = 30018,
    Uc = 30023,
    Nc = 30024,
    Oc = 30030,
    Rc = 30078,
    Pc = 30311,
    $c = 30315,
    Hc = 30402,
    Mc = 30403,
    qc = 31922,
    Vc = 31923,
    Dc = 31924,
    zc = 31925,
    Wc = 31989,
    jc = 31990,
    Kc = 34550
  var Zc = {}
  D(Zc, {
    getHex64: () => vr,
    getInt: () => hs,
    getSubscriptionId: () => Gc,
    matchEventId: () => Fc,
    matchEventKind: () => Xc,
    matchEventPubkey: () => Jc,
  })
  function vr(t, e) {
    let n = e.length + 3,
      r = t.indexOf(`"${e}":`) + n,
      o = t.slice(r).indexOf('"') + r + 1
    return t.slice(o, o + 64)
  }
  function hs(t, e) {
    let n = e.length,
      r = t.indexOf(`"${e}":`) + n + 3,
      o = t.slice(r),
      s = Math.min(o.indexOf(','), o.indexOf('}'))
    return parseInt(o.slice(0, s), 10)
  }
  function Gc(t) {
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
  function Fc(t, e) {
    return e === vr(t, 'id')
  }
  function Jc(t, e) {
    return e === vr(t, 'pubkey')
  }
  function Xc(t, e) {
    return e === hs(t, 'kind')
  }
  var Yc = {}
  D(Yc, { makeAuthEvent: () => Qc })
  function Qc(t, e) {
    return {
      kind: fs,
      created_at: Math.floor(Date.now() / 1e3),
      tags: [
        ['relay', t],
        ['challenge', e],
      ],
      content: '',
    }
  }
  var el
  try {
    el = WebSocket
  } catch {}
  var tl
  try {
    tl = WebSocket
  } catch {}
  var Er = {}
  D(Er, {
    BECH32_REGEX: () => ps,
    Bech32MaxSize: () => Tr,
    NostrTypeGuard: () => nl,
    decode: () => cn,
    decodeNostrURI: () => ol,
    encodeBytes: () => un,
    naddrEncode: () => ul,
    neventEncode: () => ll,
    noteEncode: () => al,
    nprofileEncode: () => cl,
    npubEncode: () => il,
    nsecEncode: () => sl,
  })
  var nl = {
      isNProfile: t => /^nprofile1[a-z\d]+$/.test(t || ''),
      isNEvent: t => /^nevent1[a-z\d]+$/.test(t || ''),
      isNAddr: t => /^naddr1[a-z\d]+$/.test(t || ''),
      isNSec: t => /^nsec1[a-z\d]{58}$/.test(t || ''),
      isNPub: t => /^npub1[a-z\d]{58}$/.test(t || ''),
      isNote: t => /^note1[a-z\d]+$/.test(t || ''),
      isNcryptsec: t => /^ncryptsec1[a-z\d]+$/.test(t || ''),
    },
    Tr = 5e3,
    ps = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/
  function rl(t) {
    let e = new Uint8Array(4)
    return (
      (e[0] = (t >> 24) & 255),
      (e[1] = (t >> 16) & 255),
      (e[2] = (t >> 8) & 255),
      (e[3] = t & 255),
      e
    )
  }
  function ol(t) {
    try {
      return (t.startsWith('nostr:') && (t = t.substring(6)), cn(t))
    } catch {
      return { type: 'invalid', data: null }
    }
  }
  function cn(t) {
    let { prefix: e, words: n } = Ve.decode(t, Tr),
      r = new Uint8Array(Ve.fromWords(n))
    switch (e) {
      case 'nprofile': {
        let o = cr(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        return {
          type: 'nprofile',
          data: { pubkey: j(o[0][0]), relays: o[1] ? o[1].map(s => Ue.decode(s)) : [] },
        }
      }
      case 'nevent': {
        let o = cr(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nevent')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        if (o[2] && o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (o[3] && o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'nevent',
          data: {
            id: j(o[0][0]),
            relays: o[1] ? o[1].map(s => Ue.decode(s)) : [],
            author: o[2]?.[0] ? j(o[2][0]) : void 0,
            kind: o[3]?.[0] ? parseInt(j(o[3][0]), 16) : void 0,
          },
        }
      }
      case 'naddr': {
        let o = cr(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for naddr')
        if (!o[2]?.[0]) throw new Error('missing TLV 2 for naddr')
        if (o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (!o[3]?.[0]) throw new Error('missing TLV 3 for naddr')
        if (o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'naddr',
          data: {
            identifier: Ue.decode(o[0][0]),
            pubkey: j(o[2][0]),
            kind: parseInt(j(o[3][0]), 16),
            relays: o[1] ? o[1].map(s => Ue.decode(s)) : [],
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
  function cr(t) {
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
  function sl(t) {
    return un('nsec', t)
  }
  function il(t) {
    return un('npub', Ae(t))
  }
  function al(t) {
    return un('note', Ae(t))
  }
  function ln(t, e) {
    let n = Ve.toWords(e)
    return Ve.encode(t, n, Tr)
  }
  function un(t, e) {
    return ln(t, e)
  }
  function cl(t) {
    let e = Ar({ 0: [Ae(t.pubkey)], 1: (t.relays || []).map(n => pe.encode(n)) })
    return ln('nprofile', e)
  }
  function ll(t) {
    let e
    t.kind !== void 0 && (e = rl(t.kind))
    let n = Ar({
      0: [Ae(t.id)],
      1: (t.relays || []).map(r => pe.encode(r)),
      2: t.author ? [Ae(t.author)] : [],
      3: e ? [new Uint8Array(e)] : [],
    })
    return ln('nevent', n)
  }
  function ul(t) {
    let e = new ArrayBuffer(4)
    new DataView(e).setUint32(0, t.kind, !1)
    let n = Ar({
      0: [pe.encode(t.identifier)],
      1: (t.relays || []).map(r => pe.encode(r)),
      2: [Ae(t.pubkey)],
      3: [new Uint8Array(e)],
    })
    return ln('naddr', n)
  }
  function Ar(t) {
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
      ct(...e)
    )
  }
  var fl = {}
  D(fl, { decrypt: () => dl, encrypt: () => gs })
  function gs(t, e, n) {
    let r = t instanceof Uint8Array ? j(t) : t,
      o = Pe.getSharedSecret(r, '02' + e),
      s = ys(o),
      i = Uint8Array.from(zt(16)),
      a = pe.encode(n),
      c = rr(s, i).encrypt(a),
      l = ce.encode(new Uint8Array(c)),
      u = ce.encode(new Uint8Array(i.buffer))
    return `${l}?iv=${u}`
  }
  function dl(t, e, n) {
    let r = t instanceof Uint8Array ? j(t) : t,
      [o, s] = n.split('?iv='),
      i = Pe.getSharedSecret(r, '02' + e),
      a = ys(i),
      c = ce.decode(s),
      l = ce.decode(o),
      u = rr(a, c).decrypt(l)
    return Ue.decode(u)
  }
  function ys(t) {
    return t.slice(1, 33)
  }
  var hl = {}
  D(hl, {
    NIP05_REGEX: () => Sr,
    isNip05: () => pl,
    isValid: () => ml,
    queryProfile: () => ms,
    searchDomain: () => yl,
    useFetchImplementation: () => gl,
  })
  var Sr = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/,
    pl = t => Sr.test(t || ''),
    fn
  try {
    fn = fetch
  } catch {}
  function gl(t) {
    fn = t
  }
  async function yl(t, e = '') {
    try {
      let n = `https://${t}/.well-known/nostr.json?name=${e}`,
        r = await fn(n, { redirect: 'manual' })
      if (r.status !== 200) throw Error('Wrong response code')
      return (await r.json()).names
    } catch {
      return {}
    }
  }
  async function ms(t) {
    let e = t.match(Sr)
    if (!e) return null
    let [, n = '_', r] = e
    try {
      let o = `https://${r}/.well-known/nostr.json?name=${n}`,
        s = await fn(o, { redirect: 'manual' })
      if (s.status !== 200) throw Error('Wrong response code')
      let i = await s.json(),
        a = i.names[n]
      return a ? { pubkey: a, relays: i.relays?.[a] } : null
    } catch {
      return null
    }
  }
  async function ml(t, e) {
    let n = await ms(e)
    return n ? n.pubkey === t : !1
  }
  var wl = {}
  D(wl, { parse: () => bl })
  function bl(t) {
    let e = { reply: void 0, root: void 0, mentions: [], profiles: [], quotes: [] },
      n,
      r
    for (let o = t.tags.length - 1; o >= 0; o--) {
      let s = t.tags[o]
      if (s[0] === 'e' && s[1]) {
        let [i, a, c, l, u] = s,
          f = { id: a, relays: c ? [c] : [], author: u }
        if (l === 'root') {
          e.root = f
          continue
        }
        if (l === 'reply') {
          e.reply = f
          continue
        }
        if (l === 'mention') {
          e.mentions.push(f)
          continue
        }
        ;(n ? (r = f) : (n = f), e.mentions.push(f))
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
  var xl = {}
  D(xl, { fetchRelayInformation: () => El, useFetchImplementation: () => vl })
  var ws
  try {
    ws = fetch
  } catch {}
  function vl(t) {
    ws = t
  }
  async function El(t) {
    return await (
      await fetch(t.replace('ws://', 'http://').replace('wss://', 'https://'), {
        headers: { Accept: 'application/nostr+json' },
      })
    ).json()
  }
  var Tl = {}
  D(Tl, { fastEventHash: () => xs, getPow: () => bs, minePow: () => Al })
  function bs(t) {
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
  function Al(t, e) {
    let n = 0,
      r = t,
      o = ['nonce', n.toString(), e.toString()]
    for (r.tags.push(o); ; ) {
      let s = Math.floor(new Date().getTime() / 1e3)
      if (
        (s !== r.created_at && ((n = 0), (r.created_at = s)),
        (o[1] = (++n).toString()),
        (r.id = xs(r)),
        bs(r.id) >= e)
      )
        break
    }
    return r
  }
  function xs(t) {
    return j(ae(pe.encode(JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content]))))
  }
  var Sl = {}
  D(Sl, {
    unwrapEvent: () => $l,
    unwrapManyEvents: () => Hl,
    wrapEvent: () => Ns,
    wrapManyEvents: () => Pl,
  })
  var Bl = {}
  D(Bl, {
    createRumor: () => ks,
    createSeal: () => Cs,
    createWrap: () => Is,
    unwrapEvent: () => Cr,
    unwrapManyEvents: () => Us,
    wrapEvent: () => sn,
    wrapManyEvents: () => Ol,
  })
  var Ll = {}
  D(Ll, { decrypt: () => kr, encrypt: () => _r, getConversationKey: () => Br, v2: () => Ul })
  var vs = 1,
    Es = 65535
  function Br(t, e) {
    let n = Pe.getSharedSecret(t, '02' + e).subarray(1, 33)
    return Go(ae, n, 'nip44-v2')
  }
  function Ts(t, e) {
    let n = Fo(ae, t, e, 76)
    return {
      chacha_key: n.subarray(0, 32),
      chacha_nonce: n.subarray(32, 44),
      hmac_key: n.subarray(44, 76),
    }
  }
  function Lr(t) {
    if (!Number.isSafeInteger(t) || t < 1) throw new Error('expected positive integer')
    if (t <= 32) return 32
    let e = 1 << (Math.floor(Math.log2(t - 1)) + 1),
      n = e <= 256 ? 32 : e / 8
    return n * (Math.floor((t - 1) / n) + 1)
  }
  function _l(t) {
    if (!Number.isSafeInteger(t) || t < vs || t > Es)
      throw new Error('invalid plaintext size: must be between 1 and 65535 bytes')
    let e = new Uint8Array(2)
    return (new DataView(e.buffer).setUint16(0, t, !1), e)
  }
  function kl(t) {
    let e = pe.encode(t),
      n = e.length,
      r = _l(n),
      o = new Uint8Array(Lr(n) - n)
    return ct(r, e, o)
  }
  function Cl(t) {
    let e = new DataView(t.buffer).getUint16(0),
      n = t.subarray(2, 2 + e)
    if (e < vs || e > Es || n.length !== e || t.length !== 2 + Lr(e))
      throw new Error('invalid padding')
    return Ue.decode(n)
  }
  function As(t, e, n) {
    if (n.length !== 32) throw new Error('AAD associated data must be 32 bytes')
    let r = ct(n, e)
    return dt(ae, t, r)
  }
  function Il(t) {
    if (typeof t != 'string') throw new Error('payload must be a valid string')
    let e = t.length
    if (e < 132 || e > 87472) throw new Error('invalid payload length: ' + e)
    if (t[0] === '#') throw new Error('unknown encryption version')
    let n
    try {
      n = ce.decode(t)
    } catch (s) {
      throw new Error('invalid base64: ' + s.message)
    }
    let r = n.length
    if (r < 99 || r > 65603) throw new Error('invalid data length: ' + r)
    let o = n[0]
    if (o !== 2) throw new Error('unknown encryption version ' + o)
    return { nonce: n.subarray(1, 33), ciphertext: n.subarray(33, -32), mac: n.subarray(-32) }
  }
  function _r(t, e, n = zt(32)) {
    let { chacha_key: r, chacha_nonce: o, hmac_key: s } = Ts(e, n),
      i = kl(t),
      a = en(r, o, i),
      c = As(s, a, n)
    return ce.encode(ct(new Uint8Array([2]), n, a, c))
  }
  function kr(t, e) {
    let { nonce: n, ciphertext: r, mac: o } = Il(t),
      { chacha_key: s, chacha_nonce: i, hmac_key: a } = Ts(e, n),
      c = As(a, r, n)
    if (!Ye(c, o)) throw new Error('invalid MAC')
    let l = en(s, i, r)
    return Cl(l)
  }
  var Ul = { utils: { getConversationKey: Br, calcPaddedLen: Lr }, encrypt: _r, decrypt: kr },
    Nl = 2880 * 60,
    Ss = () => Math.round(Date.now() / 1e3),
    Bs = () => Math.round(Ss() - Math.random() * Nl),
    Ls = (t, e) => Br(t, e),
    _s = (t, e, n) => _r(JSON.stringify(t), Ls(e, n)),
    Jo = (t, e) => JSON.parse(kr(t.content, Ls(e, t.pubkey)))
  function ks(t, e) {
    let n = { created_at: Ss(), content: '', tags: [], ...t, pubkey: hr(e) }
    return ((n.id = rn(n)), n)
  }
  function Cs(t, e, n) {
    return ve({ kind: rs, content: _s(t, e, n), created_at: Bs(), tags: [] }, e)
  }
  function Is(t, e) {
    let n = Ra()
    return ve({ kind: us, content: _s(t, n, e), created_at: Bs(), tags: [['p', e]] }, n)
  }
  function sn(t, e, n) {
    let r = ks(t, e),
      o = Cs(r, e, n)
    return Is(o, n)
  }
  function Ol(t, e, n) {
    if (!n || n.length === 0) throw new Error('At least one recipient is required.')
    let r = hr(e),
      o = [sn(t, e, r)]
    return (
      n.forEach(s => {
        o.push(sn(t, e, s))
      }),
      o
    )
  }
  function Cr(t, e) {
    let n = Jo(t, e)
    return Jo(n, e)
  }
  function Us(t, e) {
    let n = []
    return (
      t.forEach(r => {
        n.push(Cr(r, e))
      }),
      n.sort((r, o) => r.created_at - o.created_at),
      n
    )
  }
  function Rl(t, e, n, r) {
    let o = { created_at: Math.ceil(Date.now() / 1e3), kind: os, tags: [], content: e }
    return (
      (Array.isArray(t) ? t : [t]).forEach(({ publicKey: i, relayUrl: a }) => {
        o.tags.push(a ? ['p', i, a] : ['p', i])
      }),
      r && o.tags.push(['e', r.eventId, r.relayUrl || '', 'reply']),
      n && o.tags.push(['subject', n]),
      o
    )
  }
  function Ns(t, e, n, r, o) {
    let s = Rl(e, n, r, o)
    return sn(s, t, e.publicKey)
  }
  function Pl(t, e, n, r, o) {
    if (!e || e.length === 0) throw new Error('At least one recipient is required.')
    return [{ publicKey: hr(t) }, ...e].map(i => Ns(t, i, n, r, o))
  }
  var $l = Cr,
    Hl = Us,
    Ml = {}
  D(Ml, {
    finishRepostEvent: () => ql,
    getRepostedEvent: () => Vl,
    getRepostedEventPointer: () => Os,
  })
  function ql(t, e, n, r) {
    let o,
      s = [...(t.tags ?? []), ['e', e.id, n], ['p', e.pubkey]]
    return (
      e.kind === ns ? (o = mr) : ((o = br), s.push(['k', String(e.kind)])),
      ve(
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
  function Os(t) {
    if (![mr, br].includes(t.kind)) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (e !== void 0)
      return { id: e[1], relays: [e[2], n?.[2]].filter(r => typeof r == 'string'), author: n?.[1] }
  }
  function Vl(t, { skipVerification: e } = {}) {
    let n = Os(t)
    if (n === void 0 || t.content === '') return
    let r
    try {
      r = JSON.parse(t.content)
    } catch {
      return
    }
    if (r.id === n.id && !(!e && !pr(r))) return r
  }
  var Dl = {}
  D(Dl, { NOSTR_URI_REGEX: () => Ir, parse: () => Wl, test: () => zl })
  var Ir = new RegExp(`nostr:(${ps.source})`)
  function zl(t) {
    return typeof t == 'string' && new RegExp(`^${Ir.source}$`).test(t)
  }
  function Wl(t) {
    let e = t.match(new RegExp(`^${Ir.source}$`))
    if (!e) throw new Error(`Invalid Nostr URI: ${t}`)
    return { uri: e[0], value: e[1], decoded: cn(e[1]) }
  }
  var jl = {}
  D(jl, { finishReactionEvent: () => Kl, getReactedEventPointer: () => Zl })
  function Kl(t, e, n) {
    let r = e.tags.filter(o => o.length >= 2 && (o[0] === 'e' || o[0] === 'p'))
    return ve(
      {
        ...t,
        kind: wr,
        tags: [...(t.tags ?? []), ...r, ['e', e.id], ['p', e.pubkey]],
        content: t.content ?? '+',
      },
      n
    )
  }
  function Zl(t) {
    if (t.kind !== wr) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (!(e === void 0 || n === void 0))
      return { id: e[1], relays: [e[2], n[2]].filter(r => r !== void 0), author: n[1] }
  }
  var Gl = {}
  D(Gl, { parse: () => Jl })
  var Xo = /\W/m,
    Yo = /\W |\W$|$|,| /m,
    Fl = 42
  function* Jl(t) {
    let e = []
    if (typeof t != 'string') {
      for (let s = 0; s < t.tags.length; s++) {
        let i = t.tags[s]
        i[0] === 'emoji' && i.length >= 3 && e.push({ type: 'emoji', shortcode: i[1], url: i[2] })
      }
      t = t.content
    }
    let n = t.length,
      r = 0,
      o = 0
    e: for (; o < n; ) {
      let s = t.indexOf(':', o),
        i = t.indexOf('#', o)
      if (s === -1 && i === -1) break e
      if (s === -1 || (i >= 0 && i < s)) {
        if (i === 0 || t[i - 1] === ' ') {
          let a = t.slice(i + 1, i + Fl).match(Xo),
            c = a ? i + 1 + a.index : n
          ;(yield { type: 'text', text: t.slice(r, i) },
            yield { type: 'hashtag', value: t.slice(i + 1, c) },
            (o = c),
            (r = o))
          continue e
        }
        o = i + 1
        continue e
      }
      if (t.slice(s - 5, s) === 'nostr') {
        let a = t.slice(s + 60).match(Xo),
          c = a ? s + 60 + a.index : n
        try {
          let l,
            { data: u, type: f } = cn(t.slice(s + 1, c))
          switch (f) {
            case 'npub':
              l = { pubkey: u }
              break
            case 'nsec':
            case 'note':
              o = c + 1
              continue
            default:
              l = u
          }
          ;(r !== s - 5 && (yield { type: 'text', text: t.slice(r, s - 5) }),
            yield { type: 'reference', pointer: l },
            (o = c),
            (r = o))
          continue e
        } catch {
          o = s + 1
          continue e
        }
      } else if (t.slice(s - 5, s) === 'https' || t.slice(s - 4, s) === 'http') {
        let a = t.slice(s + 4).match(Yo),
          c = a ? s + 4 + a.index : n,
          l = t[s - 1] === 's' ? 5 : 4
        try {
          let u = new URL(t.slice(s - l, c))
          if (u.hostname.indexOf('.') === -1) throw new Error('invalid url')
          if (
            (r !== s - l && (yield { type: 'text', text: t.slice(r, s - l) }),
            /\.(png|jpe?g|gif|webp|heic|svg)$/i.test(u.pathname))
          ) {
            ;(yield { type: 'image', url: u.toString() }, (o = c), (r = o))
            continue e
          }
          if (/\.(mp4|avi|webm|mkv|mov)$/i.test(u.pathname)) {
            ;(yield { type: 'video', url: u.toString() }, (o = c), (r = o))
            continue e
          }
          if (/\.(mp3|aac|ogg|opus|wav|flac)$/i.test(u.pathname)) {
            ;(yield { type: 'audio', url: u.toString() }, (o = c), (r = o))
            continue e
          }
          ;(yield { type: 'url', url: u.toString() }, (o = c), (r = o))
          continue e
        } catch {
          o = c + 1
          continue e
        }
      } else if (t.slice(s - 3, s) === 'wss' || t.slice(s - 2, s) === 'ws') {
        let a = t.slice(s + 4).match(Yo),
          c = a ? s + 4 + a.index : n,
          l = t[s - 1] === 's' ? 3 : 2
        try {
          let u = new URL(t.slice(s - l, c))
          if (u.hostname.indexOf('.') === -1) throw new Error('invalid ws url')
          ;(r !== s - l && (yield { type: 'text', text: t.slice(r, s - l) }),
            yield { type: 'relay', url: u.toString() },
            (o = c),
            (r = o))
          continue e
        } catch {
          o = c + 1
          continue e
        }
      } else {
        for (let a = 0; a < e.length; a++) {
          let c = e[a]
          if (
            t[s + c.shortcode.length + 1] === ':' &&
            t.slice(s + 1, s + c.shortcode.length + 1) === c.shortcode
          ) {
            ;(r !== s && (yield { type: 'text', text: t.slice(r, s) }),
              yield c,
              (o = s + c.shortcode.length + 2),
              (r = o))
            continue e
          }
        }
        o = s + 1
        continue e
      }
    }
    r !== n && (yield { type: 'text', text: t.slice(r) })
  }
  var Xl = {}
  D(Xl, {
    channelCreateEvent: () => Yl,
    channelHideMessageEvent: () => tu,
    channelMessageEvent: () => eu,
    channelMetadataEvent: () => Ql,
    channelMuteUserEvent: () => nu,
  })
  var Yl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return ve({ kind: ss, tags: [...(t.tags ?? [])], content: n, created_at: t.created_at }, e)
    },
    Ql = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return ve(
        {
          kind: is,
          tags: [['e', t.channel_create_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    eu = (t, e) => {
      let n = [['e', t.channel_create_event_id, t.relay_url, 'root']]
      return (
        t.reply_to_channel_message_event_id &&
          n.push(['e', t.reply_to_channel_message_event_id, t.relay_url, 'reply']),
        ve(
          {
            kind: as,
            tags: [...n, ...(t.tags ?? [])],
            content: t.content,
            created_at: t.created_at,
          },
          e
        )
      )
    },
    tu = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return ve(
        {
          kind: cs,
          tags: [['e', t.channel_message_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    nu = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return ve(
        {
          kind: ls,
          tags: [['p', t.pubkey_to_mute], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    ru = {}
  D(ru, {
    EMOJI_SHORTCODE_REGEX: () => Rs,
    matchAll: () => ou,
    regex: () => Ur,
    replaceAll: () => su,
  })
  var Rs = /:(\w+):/,
    Ur = () => new RegExp(`\\B${Rs.source}\\B`, 'g')
  function* ou(t) {
    let e = t.matchAll(Ur())
    for (let n of e)
      try {
        let [r, o] = n
        yield { shortcode: r, name: o, start: n.index, end: n.index + r.length }
      } catch {}
  }
  function su(t, e) {
    return t.replaceAll(Ur(), (n, r) => e({ shortcode: n, name: r }))
  }
  var iu = {}
  D(iu, { useFetchImplementation: () => au, validateGithub: () => cu })
  var Nr
  try {
    Nr = fetch
  } catch {}
  function au(t) {
    Nr = t
  }
  async function cu(t, e, n) {
    try {
      return (
        (await (await Nr(`https://gist.github.com/${e}/${n}/raw`)).text()) ===
        `Verifying that I control the following Nostr public key: ${t}`
      )
    } catch {
      return !1
    }
  }
  var lu = {}
  D(lu, { makeNwcRequestEvent: () => fu, parseConnectionString: () => uu })
  function uu(t) {
    let { host: e, pathname: n, searchParams: r } = new URL(t),
      o = n || e,
      s = r.get('relay'),
      i = r.get('secret')
    if (!o || !s || !i) throw new Error('invalid connection string')
    return { pubkey: o, relay: s, secret: i }
  }
  async function fu(t, e, n) {
    let o = gs(e, t, JSON.stringify({ method: 'pay_invoice', params: { invoice: n } })),
      s = { kind: ds, created_at: Math.round(Date.now() / 1e3), content: o, tags: [['p', t]] }
    return ve(s, e)
  }
  var du = {}
  D(du, { normalizeIdentifier: () => hu })
  function hu(t) {
    return (
      (t = t.trim().toLowerCase()),
      (t = t.normalize('NFKC')),
      Array.from(t)
        .map(e => (/\p{Letter}/u.test(e) || /\p{Number}/u.test(e) ? e : '-'))
        .join('')
    )
  }
  var pu = {}
  D(pu, {
    getSatoshisAmountFromBolt11: () => xu,
    getZapEndpoint: () => yu,
    makeZapReceipt: () => bu,
    makeZapRequest: () => mu,
    useFetchImplementation: () => gu,
    validateZapRequest: () => wu,
  })
  var Or
  try {
    Or = fetch
  } catch {}
  function gu(t) {
    Or = t
  }
  async function yu(t) {
    try {
      let e = '',
        { lud06: n, lud16: r } = JSON.parse(t.content)
      if (r) {
        let [i, a] = r.split('@')
        e = new URL(`/.well-known/lnurlp/${i}`, `https://${a}`).toString()
      } else if (n) {
        let { words: i } = Ve.decode(n, 1e3),
          a = Ve.fromWords(i)
        e = Ue.decode(a)
      } else return null
      let s = await (await Or(e)).json()
      if (s.allowsNostr && s.nostrPubkey) return s.callback
    } catch {}
    return null
  }
  function mu(t) {
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
      if ((e.tags.push(['e', t.event.id]), gr(t.event.kind))) {
        let n = ['a', `${t.event.kind}:${t.event.pubkey}:`]
        e.tags.push(n)
      } else if (yr(t.event.kind)) {
        let n = t.event.tags.find(([o, s]) => o === 'd' && s)
        if (!n) throw new Error('d tag not found or is empty')
        let r = ['a', `${t.event.kind}:${t.event.pubkey}:${n[1]}`]
        e.tags.push(r)
      }
      e.tags.push(['k', t.event.kind.toString()])
    }
    return e
  }
  function wu(t) {
    let e
    try {
      e = JSON.parse(t)
    } catch {
      return 'Invalid zap request JSON.'
    }
    if (!fr(e)) return 'Zap request is not a valid Nostr event.'
    if (!pr(e)) return 'Invalid signature on zap request.'
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
  function bu({ zapRequest: t, preimage: e, bolt11: n, paidAt: r }) {
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
  function xu(t) {
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
  var vu = {}
  D(vu, { Negentropy: () => $s, NegentropyStorageVector: () => Au, NegentropySync: () => Su })
  var lr = 97,
    pt = 32,
    Ps = 16,
    et = { Skip: 0, Fingerprint: 1, IdList: 2 },
    Ie = class {
      constructor(t) {
        z(this, '_raw')
        z(this, 'length')
        typeof t == 'number'
          ? ((this._raw = new Uint8Array(t)), (this.length = 0))
          : t instanceof Uint8Array
            ? ((this._raw = new Uint8Array(t)), (this.length = t.length))
            : ((this._raw = new Uint8Array(512)), (this.length = 0))
      }
      unwrap() {
        return this._raw.subarray(0, this.length)
      }
      get capacity() {
        return this._raw.byteLength
      }
      extend(t) {
        if ((t instanceof Ie && (t = t.unwrap()), typeof t.length != 'number'))
          throw Error('bad length')
        let e = t.length + this.length
        if (this.capacity < e) {
          let n = this._raw,
            r = Math.max(this.capacity * 2, e)
          ;((this._raw = new Uint8Array(r)), this._raw.set(n))
        }
        ;(this._raw.set(t, this.length), (this.length += t.length))
      }
      shift() {
        let t = this._raw[0]
        return ((this._raw = this._raw.subarray(1)), this.length--, t)
      }
      shiftN(t = 1) {
        let e = this._raw.subarray(0, t)
        return ((this._raw = this._raw.subarray(t)), (this.length -= t), e)
      }
    }
  function nn(t) {
    let e = 0
    for (;;) {
      if (t.length === 0) throw Error('parse ends prematurely')
      let n = t.shift()
      if (((e = (e << 7) | (n & 127)), (n & 128) === 0)) break
    }
    return e
  }
  function Ce(t) {
    if (t === 0) return new Ie(new Uint8Array([0]))
    let e = []
    for (; t !== 0; ) (e.push(t & 127), (t >>>= 7))
    e.reverse()
    for (let n = 0; n < e.length - 1; n++) e[n] |= 128
    return new Ie(new Uint8Array(e))
  }
  function Eu(t) {
    return on(t, 1)[0]
  }
  function on(t, e) {
    if (t.length < e) throw Error('parse ends prematurely')
    return t.shiftN(e)
  }
  var Tu = class {
      constructor() {
        z(this, 'buf')
        this.setToZero()
      }
      setToZero() {
        this.buf = new Uint8Array(pt)
      }
      add(t) {
        let e = 0,
          n = 0,
          r = new DataView(this.buf.buffer),
          o = new DataView(t.buffer)
        for (let s = 0; s < 8; s++) {
          let i = s * 4,
            a = r.getUint32(i, !0),
            c = o.getUint32(i, !0),
            l = a
          ;((l += e),
            (l += c),
            l > 4294967295 && (n = 1),
            r.setUint32(i, l & 4294967295, !0),
            (e = n),
            (n = 0))
        }
      }
      negate() {
        let t = new DataView(this.buf.buffer)
        for (let n = 0; n < 8; n++) {
          let r = n * 4
          t.setUint32(r, ~t.getUint32(r, !0))
        }
        let e = new Uint8Array(pt)
        ;((e[0] = 1), this.add(e))
      }
      getFingerprint(t) {
        let e = new Ie()
        return (e.extend(this.buf), e.extend(Ce(t)), ae(e.unwrap()).subarray(0, Ps))
      }
    },
    Au = class {
      constructor() {
        z(this, 'items')
        z(this, 'sealed')
        ;((this.items = []), (this.sealed = !1))
      }
      insert(t, e) {
        if (this.sealed) throw Error('already sealed')
        let n = Gn(e)
        if (n.byteLength !== pt) throw Error('bad id size for added item')
        this.items.push({ timestamp: t, id: n })
      }
      seal() {
        if (this.sealed) throw Error('already sealed')
        ;((this.sealed = !0), this.items.sort(ur))
        for (let t = 1; t < this.items.length; t++)
          if (ur(this.items[t - 1], this.items[t]) === 0) throw Error('duplicate item inserted')
      }
      unseal() {
        this.sealed = !1
      }
      size() {
        return (this._checkSealed(), this.items.length)
      }
      getItem(t) {
        if ((this._checkSealed(), t >= this.items.length)) throw Error('out of range')
        return this.items[t]
      }
      iterate(t, e, n) {
        ;(this._checkSealed(), this._checkBounds(t, e))
        for (let r = t; r < e && n(this.items[r], r); ++r);
      }
      findLowerBound(t, e, n) {
        return (
          this._checkSealed(),
          this._checkBounds(t, e),
          this._binarySearch(this.items, t, e, r => ur(r, n) < 0)
        )
      }
      fingerprint(t, e) {
        let n = new Tu()
        return (n.setToZero(), this.iterate(t, e, r => (n.add(r.id), !0)), n.getFingerprint(e - t))
      }
      _checkSealed() {
        if (!this.sealed) throw Error('not sealed')
      }
      _checkBounds(t, e) {
        if (t > e || e > this.items.length) throw Error('bad range')
      }
      _binarySearch(t, e, n, r) {
        let o = n - e
        for (; o > 0; ) {
          let s = e,
            i = Math.floor(o / 2)
          ;((s += i), r(t[s]) ? ((e = ++s), (o -= i + 1)) : (o = i))
        }
        return e
      }
    },
    $s = class {
      constructor(t, e = 6e4) {
        z(this, 'storage')
        z(this, 'frameSizeLimit')
        z(this, 'lastTimestampIn')
        z(this, 'lastTimestampOut')
        if (e < 4096) throw Error('frameSizeLimit too small')
        ;((this.storage = t),
          (this.frameSizeLimit = e),
          (this.lastTimestampIn = 0),
          (this.lastTimestampOut = 0))
      }
      _bound(t, e) {
        return { timestamp: t, id: e || new Uint8Array(0) }
      }
      initiate() {
        let t = new Ie()
        return (
          t.extend(new Uint8Array([lr])),
          this.splitRange(0, this.storage.size(), this._bound(Number.MAX_VALUE), t),
          Xe(t.unwrap())
        )
      }
      reconcile(t, e, n) {
        let r = new Ie(Gn(t))
        this.lastTimestampIn = this.lastTimestampOut = 0
        let o = new Ie()
        o.extend(new Uint8Array([lr]))
        let s = Eu(r)
        if (s < 96 || s > 111) throw Error('invalid negentropy protocol version byte')
        if (s !== lr) throw Error('unsupported negentropy protocol version requested: ' + (s - 96))
        let i = this.storage.size(),
          a = this._bound(0),
          c = 0,
          l = !1
        for (; r.length !== 0; ) {
          let u = new Ie(),
            f = () => {
              l && ((l = !1), u.extend(this.encodeBound(a)), u.extend(Ce(et.Skip)))
            },
            p = this.decodeBound(r),
            y = nn(r),
            g = c,
            d = this.storage.findLowerBound(c, i, p)
          if (y === et.Skip) l = !0
          else if (y === et.Fingerprint) {
            let h = on(r, Ps),
              m = this.storage.fingerprint(g, d)
            Hs(h, m) !== 0 ? (f(), this.splitRange(g, d, p, u)) : (l = !0)
          } else if (y === et.IdList) {
            let h = nn(r),
              m = {}
            for (let w = 0; w < h; w++) {
              let b = on(r, pt)
              m[Xe(b)] = b
            }
            if (
              ((l = !0),
              this.storage.iterate(g, d, w => {
                let b = w.id,
                  E = Xe(b)
                return (m[E] ? delete m[Xe(b)] : e?.(E), !0)
              }),
              n)
            )
              for (let w of Object.values(m)) n(Xe(w))
          } else throw Error('unexpected mode')
          if (this.exceededFrameSizeLimit(o.length + u.length)) {
            let h = this.storage.fingerprint(d, i)
            ;(o.extend(this.encodeBound(this._bound(Number.MAX_VALUE))),
              o.extend(Ce(et.Fingerprint)),
              o.extend(h))
            break
          } else o.extend(u)
          ;((c = d), (a = p))
        }
        return o.length === 1 ? null : Xe(o.unwrap())
      }
      splitRange(t, e, n, r) {
        let o = e - t,
          s = 16
        if (o < s * 2)
          (r.extend(this.encodeBound(n)),
            r.extend(Ce(et.IdList)),
            r.extend(Ce(o)),
            this.storage.iterate(t, e, i => (r.extend(i.id), !0)))
        else {
          let i = Math.floor(o / s),
            a = o % s,
            c = t
          for (let l = 0; l < s; l++) {
            let u = i + (l < a ? 1 : 0),
              f = this.storage.fingerprint(c, c + u)
            c += u
            let p
            if (c === e) p = n
            else {
              let y, g
              ;(this.storage.iterate(c - 1, c + 1, (d, h) => (h === c - 1 ? (y = d) : (g = d), !0)),
                (p = this.getMinimalBound(y, g)))
            }
            ;(r.extend(this.encodeBound(p)), r.extend(Ce(et.Fingerprint)), r.extend(f))
          }
        }
      }
      exceededFrameSizeLimit(t) {
        return t > this.frameSizeLimit - 200
      }
      decodeTimestampIn(t) {
        let e = nn(t)
        return (
          (e = e === 0 ? Number.MAX_VALUE : e - 1),
          this.lastTimestampIn === Number.MAX_VALUE || e === Number.MAX_VALUE
            ? ((this.lastTimestampIn = Number.MAX_VALUE), Number.MAX_VALUE)
            : ((e += this.lastTimestampIn), (this.lastTimestampIn = e), e)
        )
      }
      decodeBound(t) {
        let e = this.decodeTimestampIn(t),
          n = nn(t)
        if (n > pt) throw Error('bound key too long')
        let r = on(t, n)
        return { timestamp: e, id: r }
      }
      encodeTimestampOut(t) {
        if (t === Number.MAX_VALUE) return ((this.lastTimestampOut = Number.MAX_VALUE), Ce(0))
        let e = t
        return ((t -= this.lastTimestampOut), (this.lastTimestampOut = e), Ce(t + 1))
      }
      encodeBound(t) {
        let e = new Ie()
        return (
          e.extend(this.encodeTimestampOut(t.timestamp)),
          e.extend(Ce(t.id.length)),
          e.extend(t.id),
          e
        )
      }
      getMinimalBound(t, e) {
        if (e.timestamp !== t.timestamp) return this._bound(e.timestamp)
        {
          let n = 0,
            r = e.id,
            o = t.id
          for (let s = 0; s < pt && r[s] === o[s]; s++) n++
          return this._bound(e.timestamp, e.id.subarray(0, n + 1))
        }
      }
    }
  function Hs(t, e) {
    for (let n = 0; n < t.byteLength; n++) {
      if (t[n] < e[n]) return -1
      if (t[n] > e[n]) return 1
    }
    return t.byteLength > e.byteLength ? 1 : t.byteLength < e.byteLength ? -1 : 0
  }
  function ur(t, e) {
    return t.timestamp === e.timestamp ? Hs(t.id, e.id) : t.timestamp - e.timestamp
  }
  var Su = class {
      constructor(t, e, n, r = {}) {
        z(this, 'relay')
        z(this, 'storage')
        z(this, 'neg')
        z(this, 'filter')
        z(this, 'subscription')
        z(this, 'onhave')
        z(this, 'onneed')
        ;((this.relay = t),
          (this.storage = e),
          (this.neg = new $s(e)),
          (this.onhave = r.onhave),
          (this.onneed = r.onneed),
          (this.filter = n),
          (this.subscription = this.relay.prepareSubscription([{}], {
            label: r.label || 'negentropy',
          })),
          (this.subscription.oncustom = o => {
            switch (o[0]) {
              case 'NEG-MSG': {
                o.length < 3 && console.warn(`got invalid NEG-MSG from ${this.relay.url}: ${o}`)
                try {
                  let s = this.neg.reconcile(o[2], this.onhave, this.onneed)
                  s
                    ? this.relay.send(`["NEG-MSG", "${this.subscription.id}", "${s}"]`)
                    : (this.close(), r.onclose?.())
                } catch (s) {
                  ;(console.error('negentropy reconcile error:', s),
                    r?.onclose?.(`reconcile error: ${s}`))
                }
                break
              }
              case 'NEG-CLOSE': {
                let s = o[2]
                ;(console.warn('negentropy error:', s), r.onclose?.(s))
                break
              }
              case 'NEG-ERR':
                r.onclose?.()
            }
          }))
      }
      async start() {
        let t = this.neg.initiate()
        this.relay.send(
          `["NEG-OPEN","${this.subscription.id}",${JSON.stringify(this.filter)},"${t}"]`
        )
      }
      close() {
        ;(this.relay.send(`["NEG-CLOSE","${this.subscription.id}"]`), this.subscription.close())
      }
    },
    Bu = {}
  D(Bu, {
    getToken: () => Lu,
    hashPayload: () => Rr,
    unpackEventFromToken: () => qs,
    validateEvent: () => Ks,
    validateEventKind: () => Ds,
    validateEventMethodTag: () => Ws,
    validateEventPayloadTag: () => js,
    validateEventTimestamp: () => Vs,
    validateEventUrlTag: () => zs,
    validateToken: () => _u,
  })
  var Ms = 'Nostr '
  async function Lu(t, e, n, r = !1, o) {
    let s = {
      kind: xr,
      tags: [
        ['u', t],
        ['method', e],
      ],
      created_at: Math.round(new Date().getTime() / 1e3),
      content: '',
    }
    o && s.tags.push(['payload', Rr(o)])
    let i = await n(s)
    return (r ? Ms : '') + ce.encode(pe.encode(JSON.stringify(i)))
  }
  async function _u(t, e, n) {
    let r = await qs(t).catch(s => {
      throw s
    })
    return await Ks(r, e, n).catch(s => {
      throw s
    })
  }
  async function qs(t) {
    if (!t) throw new Error('Missing token')
    t = t.replace(Ms, '')
    let e = Ue.decode(ce.decode(t))
    if (!e || e.length === 0 || !e.startsWith('{')) throw new Error('Invalid token')
    return JSON.parse(e)
  }
  function Vs(t) {
    return t.created_at ? Math.round(new Date().getTime() / 1e3) - t.created_at < 60 : !1
  }
  function Ds(t) {
    return t.kind === xr
  }
  function zs(t, e) {
    let n = t.tags.find(r => r[0] === 'u')
    return n ? n.length > 0 && n[1] === e : !1
  }
  function Ws(t, e) {
    let n = t.tags.find(r => r[0] === 'method')
    return n ? n.length > 0 && n[1].toLowerCase() === e.toLowerCase() : !1
  }
  function Rr(t) {
    let e = ae(pe.encode(JSON.stringify(t)))
    return j(e)
  }
  function js(t, e) {
    let n = t.tags.find(o => o[0] === 'payload')
    if (!n) return !1
    let r = Rr(e)
    return n.length > 0 && n[1] === r
  }
  async function Ks(t, e, n, r) {
    if (!pr(t)) throw new Error('Invalid nostr event, signature invalid')
    if (!Ds(t)) throw new Error('Invalid nostr event, kind invalid')
    if (!Vs(t)) throw new Error('Invalid nostr event, created_at timestamp invalid')
    if (!zs(t, e)) throw new Error('Invalid nostr event, url tag invalid')
    if (!Ws(t, n)) throw new Error('Invalid nostr event, method tag invalid')
    if (r && typeof r == 'object' && Object.keys(r).length > 0 && !js(t, r))
      throw new Error('Invalid nostr event, payload tag does not match request body hash')
    return !0
  }
  function Zs(t) {
    try {
      let e = Er.decode(t)
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
  function ku() {
    return ['wss://relay.divine.video', 'wss://relay.nostr.band', 'wss://relay.damus.io']
  }
  function Gs(t = [], e = []) {
    let n = [...e, ...t, ...ku()]
    return [...new Set(n)]
  }
  var dn = 'nostube-embed-event-'
  var Ke = class t {
    static getCachedEvent(e) {
      try {
        let n = dn + e,
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
        let r = dn + e,
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
          r && r.startsWith(dn) && e.push(r)
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
          if (s && s.startsWith(dn)) {
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
  var hn = class {
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
        n = Ke.getAddressableKey(e.data.kind, e.data.pubkey, e.data.identifier)
      else throw new Error('Invalid identifier type')
      let r = Ke.getCachedEvent(n)
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
          let u = !1,
            f = e.type === 'address',
            p = [],
            y = 0,
            g = a.length,
            d = setTimeout(() => {
              if (!u)
                if (((u = !0), this.closeSubscription(o), f && p.length > 0)) {
                  let h = p.reduce((m, w) => (w.created_at > m.created_at ? w : m))
                  ;(console.log(
                    `[Nostr Client] Returning newest addressable event (created_at: ${h.created_at})`
                  ),
                    Ke.setCachedEvent(n, h),
                    c(h))
                } else l(new Error('Event not found (timeout)'))
            }, 1e4)
          a.forEach(h => {
            let m = b => {
              try {
                let E = JSON.parse(b.data)
                if (E[0] === 'EVENT' && E[1] === o) {
                  let S = E[2]
                  f
                    ? (p.push(S),
                      console.log(
                        `[Nostr Client] Addressable event received (created_at: ${S.created_at}), total: ${p.length}`
                      ))
                    : u ||
                      ((u = !0),
                      clearTimeout(d),
                      console.log('[Nostr Client] Regular event received, returning immediately'),
                      this.closeSubscription(o),
                      Ke.setCachedEvent(n, S),
                      c(S))
                }
                if (
                  E[0] === 'EOSE' &&
                  E[1] === o &&
                  (y++, console.log(`[Nostr Client] EOSE received (${y}/${g})`), f && y === g && !u)
                )
                  if (((u = !0), clearTimeout(d), this.closeSubscription(o), p.length > 0)) {
                    let S = p.reduce((A, B) => (B.created_at > A.created_at ? B : A))
                    ;(console.log(
                      `[Nostr Client] All relays responded, returning newest event (created_at: ${S.created_at})`
                    ),
                      Ke.setCachedEvent(n, S),
                      c(S))
                  } else l(new Error('Addressable event not found on any relay'))
              } catch (E) {
                console.error('[Nostr Client] Failed to parse message:', E)
              }
            }
            ;(h.addEventListener('message', m),
              this.subscriptions.has(o) || this.subscriptions.set(o, []),
              this.subscriptions.get(o).push({ ws: h, handler: m }))
            let w = JSON.stringify(['REQ', o, s])
            ;(h.send(w), console.log('[Nostr Client] Sent REQ to relay:', w))
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
  function Cu() {
    if (typeof navigator > 'u') return !1
    let t = navigator.userAgent || navigator.vendor || window.opera || ''
    return (
      /iPad|iPhone|iPod/.test(t) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
  }
  var Iu = ['hevc', 'h265', 'vp9', 'av01', 'av1']
  function Uu(t) {
    if (!t) return !0
    let e = t.toLowerCase()
    if (Cu()) {
      for (let n of Iu)
        if (e.includes(n))
          return (
            console.log(`[Nostube Embed] Filtered incompatible codec on iOS: ${n} in ${t}`),
            !1
          )
    }
    if (typeof document < 'u') {
      let n = document.createElement('video')
      if (n.canPlayType && n.canPlayType(t) === '')
        return (console.log(`[Nostube Embed] Browser cannot play: ${t}`), !1)
    }
    return !0
  }
  function Fs(t) {
    if (!t || t.length === 0) return t
    let e = t.filter(n => Uu(n.mimeType))
    return e.length === 0
      ? (console.warn(
          '[Nostube Embed] All variants filtered out, returning original variants as fallback'
        ),
        t)
      : (e.length < t.length &&
          console.log(
            `[Nostube Embed] Filtered ${t.length - e.length} incompatible variants (${e.length} remaining)`
          ),
        e)
  }
  function Js(t) {
    let e = t.tags.filter(n => n[0] === 'imeta')
    return e.length > 0 ? Nu(t, e) : Ou(t)
  }
  function Nu(t, e) {
    let n = e.map(p => Ru(p)).filter(Boolean),
      r = n.filter(p => p.mimeType?.startsWith('video/')),
      s = Fs(r),
      i = n.filter(p => p.mimeType?.startsWith('image/'))
    ;(e.forEach(p => {
      for (let y = 1; y < p.length; y++) {
        let g = p[y]
        if (g.startsWith('image ')) {
          let d = g.substring(6).trim()
          d && !i.some(h => h.url === d) && i.push({ url: d, fallbackUrls: [] })
        }
      }
    }),
      s.sort((p, y) => {
        let g = pn(p)
        return pn(y) - g
      }))
    let a =
        t.tags.find(p => p[0] === 'title')?.[1] ||
        t.tags.find(p => p[0] === 'alt')?.[1] ||
        t.content ||
        'Untitled Video',
      c = t.content || '',
      l = parseInt(t.tags.find(p => p[0] === 'duration')?.[1] || '0', 10),
      u = t.tags.find(p => p[0] === 'content-warning')?.[1],
      f = t.pubkey
    return {
      id: t.id,
      kind: t.kind,
      title: a,
      description: c,
      author: f,
      createdAt: t.created_at,
      duration: l,
      contentWarning: u,
      videoVariants: s,
      thumbnails: i,
    }
  }
  function Ou(t) {
    let e = t.tags.find(f => f[0] === 'url')?.[1] || '',
      n = t.tags.find(f => f[0] === 'm')?.[1] || 'video/mp4',
      r = t.tags.find(f => f[0] === 'thumb')?.[1] || '',
      o = t.tags.find(f => f[0] === 'title')?.[1] || t.content || 'Untitled Video',
      s = t.tags.find(f => f[0] === 'description')?.[1] || t.content || '',
      i = parseInt(t.tags.find(f => f[0] === 'duration')?.[1] || '0', 10),
      a = t.tags.find(f => f[0] === 'content-warning')?.[1],
      c = t.tags.find(f => f[0] === 'dim')?.[1],
      l = e ? [{ url: e, mimeType: n, dimensions: c, fallbackUrls: [] }] : [],
      u = r ? [{ url: r, fallbackUrls: [] }] : []
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
      thumbnails: u,
    }
  }
  function Ru(t) {
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
  function pn(t) {
    if (t.dimensions) {
      let e = t.dimensions.match(/x(\d+)/)
      if (e) return parseInt(e[1], 10)
    }
    return 0
  }
  function Xs(t, e = 'auto') {
    if (!t || t.length === 0) return null
    if (e === 'auto') return t[0]
    let n = parseInt(e, 10)
    if (isNaN(n)) return t[0]
    let r = t[0],
      o = Math.abs(pn(r) - n)
    for (let s of t) {
      let i = pn(s),
        a = Math.abs(i - n)
      a < o && ((r = s), (o = a))
    }
    return r
  }
  var vt = class {
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
  var gn = class t {
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
      let u = document.createElement('button')
      return (
        (u.className = 'content-warning-button'),
        (u.textContent = 'Click to reveal'),
        u.setAttribute('type', 'button'),
        u.setAttribute('aria-label', 'Reveal sensitive content'),
        i.appendChild(a),
        i.appendChild(c),
        i.appendChild(l),
        i.appendChild(u),
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
  var Et = class t {
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
  var yn = class t {
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
  var Ys = 'nostube-embed-profile-'
  var mn = class t {
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
              u = null,
              f = 0,
              p = i.length,
              y = setTimeout(() => {
                if (!l)
                  if (((l = !0), this.client.closeSubscription(r), u)) {
                    let g = t.parseProfileMetadata(u)
                    ;(console.log('[ProfileFetcher] Timeout, returning latest profile'), a(g))
                  } else (console.warn('[ProfileFetcher] Timeout, no profile found'), a(null))
              }, 5e3)
            i.forEach(g => {
              let d = m => {
                try {
                  let w = JSON.parse(m.data)
                  if (w[0] === 'EVENT' && w[1] === r) {
                    let b = w[2]
                    ;(!u || b.created_at > u.created_at) &&
                      ((u = b),
                      console.log(
                        `[ProfileFetcher] Profile event received (created_at: ${b.created_at})`
                      ))
                  }
                  if (
                    w[0] === 'EOSE' &&
                    w[1] === r &&
                    (f++, console.log(`[ProfileFetcher] EOSE received (${f}/${p})`), f === p && !l)
                  )
                    if (((l = !0), clearTimeout(y), this.client.closeSubscription(r), u)) {
                      let b = t.parseProfileMetadata(u)
                      ;(console.log('[ProfileFetcher] All relays responded, returning profile'),
                        a(b))
                    } else (console.warn('[ProfileFetcher] No profile found on any relay'), a(null))
                } catch (w) {
                  console.error('[ProfileFetcher] Failed to parse message:', w)
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
        let n = Ys + e,
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
        let r = Ys + e,
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
  var wn = class t {
    static applyToPlayer(e, n) {
      console.log('[PlayPauseOverlay] Applying play/pause overlay')
      let r = t.createOverlay()
      e.appendChild(r)
      let o = null,
        s = null,
        i = () => {
          ;(t.showIcon(r, !1),
            clearTimeout(o),
            clearTimeout(s),
            (o = setTimeout(() => {
              ;(t.startFadeOut(r),
                (s = setTimeout(() => {
                  ;(t.hideIcon(r), (o = null), (s = null))
                }, 100)))
            }, 400)))
        },
        a = () => {
          ;(t.showIcon(r, !0),
            clearTimeout(o),
            clearTimeout(s),
            (o = setTimeout(() => {
              ;(t.startFadeOut(r),
                (s = setTimeout(() => {
                  ;(t.hideIcon(r), (o = null), (s = null))
                }, 100)))
            }, 400)))
        }
      return (
        n.addEventListener('play', i),
        n.addEventListener('pause', a),
        console.log('[PlayPauseOverlay] Overlay applied successfully'),
        () => {
          ;(n.removeEventListener('play', i),
            n.removeEventListener('pause', a),
            clearTimeout(o),
            clearTimeout(s),
            r.parentNode && r.parentNode.removeChild(r))
        }
      )
    }
    static createOverlay() {
      let e = document.createElement('div')
      ;((e.className = 'play-pause-overlay'),
        (e.style.cssText = `
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 10;
    `))
      let n = document.createElement('div')
      ;((n.className = 'play-pause-icon-container'),
        (n.style.cssText = `
      background: rgba(0, 0, 0, 0.5);
      border-radius: 50%;
      padding: 12px;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 0.1s ease-out, transform 0.1s ease-out;
    `))
      let r = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      ;(r.setAttribute('width', '56'),
        r.setAttribute('height', '56'),
        r.setAttribute('viewBox', '0 0 24 24'),
        r.setAttribute('fill', 'currentColor'),
        (r.style.cssText = 'color: white; margin-top:2px;'))
      let o = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      return (
        r.appendChild(o),
        n.appendChild(r),
        e.appendChild(n),
        (e._iconContainer = n),
        (e._iconPath = o),
        e
      )
    }
    static showIcon(e, n) {
      ;((e.style.display = 'flex'),
        n
          ? e._iconPath.setAttribute('d', 'M6 4h4v16H6V4zm8 0h4v16h-4V4z')
          : e._iconPath.setAttribute('d', 'M8 5v14l11-7z'),
        requestAnimationFrame(() => {
          ;((e._iconContainer.style.opacity = '1'), (e._iconContainer.style.transform = 'scale(1)'))
        }))
    }
    static startFadeOut(e) {
      ;((e._iconContainer.style.opacity = '0'), (e._iconContainer.style.transform = 'scale(0.8)'))
    }
    static hideIcon(e) {
      e.style.display = 'none'
    }
  }
  var Tt = null,
    Pr = null
  async function Qs() {
    console.log('[Nostube Embed] Initializing player...')
    try {
      let t = Vr(),
        e = Dr(t)
      if (!e.valid) {
        tt(e.error)
        return
      }
      Pu('Loading video...')
      let n = Zs(t.videoId)
      if (!n) {
        tt('Failed to decode video identifier')
        return
      }
      let r = Gs(n.data.relays, t.customRelays)
      ;((Tt = new hn(r)), (Pr = new mn(Tt)))
      let o = null
      n.type === 'address' &&
        n.data.pubkey &&
        (console.log('[Nostube Embed] Starting parallel profile fetch (naddr)'),
        (o = Pr.fetchProfile(n.data.pubkey, r)))
      let s = await Tt.fetchEvent(n),
        i = Js(s)
      ;(console.log('[Nostube Embed] Parsed video:', i),
        n.type === 'event' &&
          i.author &&
          (console.log('[Nostube Embed] Starting profile fetch (nevent)'),
          (o = Pr.fetchProfile(i.author, r))))
      let a = Xs(i.videoVariants, t.preferredQuality)
      if (!a) {
        tt('No video URLs found in event')
        return
      }
      console.log('[Nostube Embed] Selected variant:', a)
      try {
        let c = vt.buildVideoPlayer(i, t),
          l = vt.createPlayerContainer(c)
        gn.applyToPlayer(l, c, i)
        let u = null
        ;(t.showTitle && (Et.applyToPlayer(l, c, i, t), (u = l.querySelector('.title-overlay'))),
          yn.applyToPlayer(l, c, t.videoId, t),
          wn.applyToPlayer(l, c),
          (document.body.innerHTML = ''),
          document.body.appendChild(l),
          o &&
            u &&
            o
              .then(f => {
                f
                  ? (console.log('[Nostube Embed] Profile fetched, updating overlay'),
                    Et.updateProfile(u, f))
                  : console.log('[Nostube Embed] Profile fetch returned null, using fallback')
              })
              .catch(f => {
                console.warn('[Nostube Embed] Profile fetch error:', f.message)
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
          tt(`Failed to initialize player: ${c.message}`))
        return
      }
    } catch (t) {
      ;(console.error('[Nostube Embed] Error:', t),
        t.message.includes('timeout')
          ? tt('Connection failed. Unable to fetch video.')
          : t.message.includes('not found')
            ? tt('Video not found')
            : tt(t.message))
    }
  }
  function Pu(t) {
    document.body.innerHTML = `
    <div class="nostube-loading">
      <div>
        <div class="nostube-loading-logo">
          <svg viewBox="0 0 72 72" width="64" height="64">
            <defs>
              <linearGradient id="loading-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#9e51ff;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#8e51ff;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#7524ff;stop-opacity:1" />
              </linearGradient>
            </defs>
            <circle cx="36" cy="36" r="36" fill="url(#loading-logo-gradient)" />
            <path d="M 28 22 L 28 50 L 50 36 Z" fill="#ffffff" />
          </svg>
        </div>
        <div class="nostube-loading-text">${t}</div>
      </div>
    </div>
  `
  }
  function tt(t) {
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
    Tt && Tt.closeAll()
  })
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', Qs) : Qs()
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
