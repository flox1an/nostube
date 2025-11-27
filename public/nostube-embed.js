/* Nostube Embed Player v0.1.0 | https://nostube.com */
;(() => {
  var vr = Object.defineProperty
  var _s = (t, e, n) =>
    e in t ? vr(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (t[e] = n)
  var Is = (t, e) => {
    for (var n in e) vr(t, n, { get: e[n], enumerable: !0 })
  }
  var Xt = (t, e, n) => _s(t, typeof e != 'symbol' ? e + '' : e, n)
  function Tr() {
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
  function Ar(t) {
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
  function Br(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function on(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Sr(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(Br(t.outputLen), Br(t.blockLen))
  }
  function Qt(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Lr(t, e) {
    on(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var ye = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var kr = t => t instanceof Uint8Array
  var we = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    lt = (t, e) => (t << (32 - e)) | (t >>> e),
    Us = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Us) throw new Error('Non little-endian hardware is not supported')
  function Rs(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function ae(t) {
    if ((typeof t == 'string' && (t = Rs(t)), !kr(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function _r(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!kr(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var Ft = class {
      clone() {
        return this._cloneInto()
      }
    },
    lf = {}.toString
  function Ir(t) {
    let e = r => t().update(ae(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function be(t = 32) {
    if (ye && typeof ye.getRandomValues == 'function') return ye.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function Cs(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      c = Number(n & s),
      a = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + a, i, r), t.setUint32(e + l, c, r))
  }
  var me = class extends Ft {
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
        (this.view = we(this.buffer)))
    }
    update(e) {
      Qt(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = ae(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let c = Math.min(o - this.pos, s - i)
        if (c === o) {
          let a = we(e)
          for (; o <= s - i; i += o) this.process(a, i)
          continue
        }
        ;(r.set(e.subarray(i, i + c), this.pos),
          (this.pos += c),
          (i += c),
          this.pos === o && (this.process(n, 0), (this.pos = 0)))
      }
      return ((this.length += e.length), this.roundClean(), this)
    }
    digestInto(e) {
      ;(Qt(this), Lr(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let u = i; u < o; u++) n[u] = 0
      ;(Cs(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let c = we(e),
        a = this.outputLen
      if (a % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = a / 4,
        f = this.get()
      if (l > f.length) throw new Error('_sha2: outputLen bigger than state')
      for (let u = 0; u < l; u++) c.setUint32(4 * u, f[u], s)
    }
    digest() {
      let { buffer: e, outputLen: n } = this
      this.digestInto(e)
      let r = e.slice(0, n)
      return (this.destroy(), r)
    }
    _cloneInto(e) {
      ;(e || (e = new this.constructor()), e.set(...this.get()))
      let { blockLen: n, buffer: r, length: o, finished: s, destroyed: i, pos: c } = this
      return (
        (e.length = o),
        (e.pos = c),
        (e.finished = s),
        (e.destroyed = i),
        o % n && e.buffer.set(r),
        e
      )
    }
  }
  var Os = (t, e, n) => (t & e) ^ (~t & n),
    Ns = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    Ps = new Uint32Array([
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
    _t = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    It = new Uint32Array(64),
    sn = class extends me {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = _t[0] | 0),
          (this.B = _t[1] | 0),
          (this.C = _t[2] | 0),
          (this.D = _t[3] | 0),
          (this.E = _t[4] | 0),
          (this.F = _t[5] | 0),
          (this.G = _t[6] | 0),
          (this.H = _t[7] | 0))
      }
      get() {
        let { A: e, B: n, C: r, D: o, E: s, F: i, G: c, H: a } = this
        return [e, n, r, o, s, i, c, a]
      }
      set(e, n, r, o, s, i, c, a) {
        ;((this.A = e | 0),
          (this.B = n | 0),
          (this.C = r | 0),
          (this.D = o | 0),
          (this.E = s | 0),
          (this.F = i | 0),
          (this.G = c | 0),
          (this.H = a | 0))
      }
      process(e, n) {
        for (let u = 0; u < 16; u++, n += 4) It[u] = e.getUint32(n, !1)
        for (let u = 16; u < 64; u++) {
          let g = It[u - 15],
            y = It[u - 2],
            p = lt(g, 7) ^ lt(g, 18) ^ (g >>> 3),
            d = lt(y, 17) ^ lt(y, 19) ^ (y >>> 10)
          It[u] = (d + It[u - 7] + p + It[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: c, F: a, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let g = lt(c, 6) ^ lt(c, 11) ^ lt(c, 25),
            y = (f + g + Os(c, a, l) + Ps[u] + It[u]) | 0,
            d = ((lt(r, 2) ^ lt(r, 13) ^ lt(r, 22)) + Ns(r, o, s)) | 0
          ;((f = l),
            (l = a),
            (a = c),
            (c = (i + y) | 0),
            (i = s),
            (s = o),
            (o = r),
            (r = (y + d) | 0))
        }
        ;((r = (r + this.A) | 0),
          (o = (o + this.B) | 0),
          (s = (s + this.C) | 0),
          (i = (i + this.D) | 0),
          (c = (c + this.E) | 0),
          (a = (a + this.F) | 0),
          (l = (l + this.G) | 0),
          (f = (f + this.H) | 0),
          this.set(r, o, s, i, c, a, l, f))
      }
      roundClean() {
        It.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    }
  var xe = Ir(() => new sn())
  var fn = {}
  Is(fn, {
    bitGet: () => Ds,
    bitLen: () => Ws,
    bitMask: () => le,
    bitSet: () => js,
    bytesToHex: () => Wt,
    bytesToNumberBE: () => J,
    bytesToNumberLE: () => Te,
    concatBytes: () => Et,
    createHmacDrbg: () => ln,
    ensureBytes: () => z,
    equalBytes: () => qs,
    hexToBytes: () => Dt,
    hexToNumber: () => an,
    numberToBytesBE: () => ft,
    numberToBytesLE: () => Ae,
    numberToHexUnpadded: () => Cr,
    numberToVarBytesBE: () => Ms,
    utf8ToBytes: () => Vs,
    validateObject: () => Ut,
  })
  var Rr = BigInt(0),
    Ee = BigInt(1),
    Hs = BigInt(2),
    ve = t => t instanceof Uint8Array,
    $s = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function Wt(t) {
    if (!ve(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += $s[t[n]]
    return e
  }
  function Cr(t) {
    let e = t.toString(16)
    return e.length & 1 ? `0${e}` : e
  }
  function an(t) {
    if (typeof t != 'string') throw new Error('hex string expected, got ' + typeof t)
    return BigInt(t === '' ? '0' : `0x${t}`)
  }
  function Dt(t) {
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
    return an(Wt(t))
  }
  function Te(t) {
    if (!ve(t)) throw new Error('Uint8Array expected')
    return an(Wt(Uint8Array.from(t).reverse()))
  }
  function ft(t, e) {
    return Dt(t.toString(16).padStart(e * 2, '0'))
  }
  function Ae(t, e) {
    return ft(t, e).reverse()
  }
  function Ms(t) {
    return Dt(Cr(t))
  }
  function z(t, e, n) {
    let r
    if (typeof e == 'string')
      try {
        r = Dt(e)
      } catch (s) {
        throw new Error(`${t} must be valid hex string, got "${e}". Cause: ${s}`)
      }
    else if (ve(e)) r = Uint8Array.from(e)
    else throw new Error(`${t} must be hex string or Uint8Array`)
    let o = r.length
    if (typeof n == 'number' && o !== n) throw new Error(`${t} expected ${n} bytes, got ${o}`)
    return r
  }
  function Et(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!ve(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  function qs(t, e) {
    if (t.length !== e.length) return !1
    for (let n = 0; n < t.length; n++) if (t[n] !== e[n]) return !1
    return !0
  }
  function Vs(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Ws(t) {
    let e
    for (e = 0; t > Rr; t >>= Ee, e += 1);
    return e
  }
  function Ds(t, e) {
    return (t >> BigInt(e)) & Ee
  }
  var js = (t, e, n) => t | ((n ? Ee : Rr) << BigInt(e)),
    le = t => (Hs << BigInt(t - 1)) - Ee,
    cn = t => new Uint8Array(t),
    Ur = t => Uint8Array.from(t)
  function ln(t, e, n) {
    if (typeof t != 'number' || t < 2) throw new Error('hashLen must be a number')
    if (typeof e != 'number' || e < 2) throw new Error('qByteLen must be a number')
    if (typeof n != 'function') throw new Error('hmacFn must be a function')
    let r = cn(t),
      o = cn(t),
      s = 0,
      i = () => {
        ;(r.fill(1), o.fill(0), (s = 0))
      },
      c = (...u) => n(o, r, ...u),
      a = (u = cn()) => {
        ;((o = c(Ur([0]), u)), (r = c()), u.length !== 0 && ((o = c(Ur([1]), u)), (r = c())))
      },
      l = () => {
        if (s++ >= 1e3) throw new Error('drbg: tried 1000 values')
        let u = 0,
          g = []
        for (; u < e; ) {
          r = c()
          let y = r.slice()
          ;(g.push(y), (u += r.length))
        }
        return Et(...g)
      }
    return (u, g) => {
      ;(i(), a(u))
      let y
      for (; !(y = g(l())); ) a()
      return (i(), y)
    }
  }
  var zs = {
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
  function Ut(t, e, n = {}) {
    let r = (o, s, i) => {
      let c = zs[s]
      if (typeof c != 'function') throw new Error(`Invalid validator "${s}", expected function`)
      let a = t[o]
      if (!(i && a === void 0) && !c(a, t))
        throw new Error(`Invalid param ${String(o)}=${a} (${typeof a}), expected ${s}`)
    }
    for (let [o, s] of Object.entries(e)) r(o, s, !1)
    for (let [o, s] of Object.entries(n)) r(o, s, !0)
    return t
  }
  var Z = BigInt(0),
    D = BigInt(1),
    jt = BigInt(2),
    Ks = BigInt(3),
    un = BigInt(4),
    Or = BigInt(5),
    Nr = BigInt(8),
    Zs = BigInt(9),
    Gs = BigInt(16)
  function K(t, e) {
    let n = t % e
    return n >= Z ? n : e + n
  }
  function Js(t, e, n) {
    if (n <= Z || e < Z) throw new Error('Expected power/modulo > 0')
    if (n === D) return Z
    let r = D
    for (; e > Z; ) (e & D && (r = (r * t) % n), (t = (t * t) % n), (e >>= D))
    return r
  }
  function nt(t, e, n) {
    let r = t
    for (; e-- > Z; ) ((r *= r), (r %= n))
    return r
  }
  function Be(t, e) {
    if (t === Z || e <= Z)
      throw new Error(`invert: expected positive integers, got n=${t} mod=${e}`)
    let n = K(t, e),
      r = e,
      o = Z,
      s = D,
      i = D,
      c = Z
    for (; n !== Z; ) {
      let l = r / n,
        f = r % n,
        u = o - i * l,
        g = s - c * l
      ;((r = n), (n = f), (o = i), (s = c), (i = u), (c = g))
    }
    if (r !== D) throw new Error('invert: does not exist')
    return K(o, e)
  }
  function Ys(t) {
    let e = (t - D) / jt,
      n,
      r,
      o
    for (n = t - D, r = 0; n % jt === Z; n /= jt, r++);
    for (o = jt; o < t && Js(o, e, t) !== t - D; o++);
    if (r === 1) {
      let i = (t + D) / un
      return function (a, l) {
        let f = a.pow(l, i)
        if (!a.eql(a.sqr(f), l)) throw new Error('Cannot find square root')
        return f
      }
    }
    let s = (n + D) / jt
    return function (c, a) {
      if (c.pow(a, e) === c.neg(c.ONE)) throw new Error('Cannot find square root')
      let l = r,
        f = c.pow(c.mul(c.ONE, o), n),
        u = c.pow(a, s),
        g = c.pow(a, n)
      for (; !c.eql(g, c.ONE); ) {
        if (c.eql(g, c.ZERO)) return c.ZERO
        let y = 1
        for (let d = c.sqr(g); y < l && !c.eql(d, c.ONE); y++) d = c.sqr(d)
        let p = c.pow(f, D << BigInt(l - y - 1))
        ;((f = c.sqr(p)), (u = c.mul(u, p)), (g = c.mul(g, f)), (l = y))
      }
      return u
    }
  }
  function Xs(t) {
    if (t % un === Ks) {
      let e = (t + D) / un
      return function (r, o) {
        let s = r.pow(o, e)
        if (!r.eql(r.sqr(s), o)) throw new Error('Cannot find square root')
        return s
      }
    }
    if (t % Nr === Or) {
      let e = (t - Or) / Nr
      return function (r, o) {
        let s = r.mul(o, jt),
          i = r.pow(s, e),
          c = r.mul(o, i),
          a = r.mul(r.mul(c, jt), i),
          l = r.mul(c, r.sub(a, r.ONE))
        if (!r.eql(r.sqr(l), o)) throw new Error('Cannot find square root')
        return l
      }
    }
    return (t % Gs, Ys(t))
  }
  var Qs = [
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
  function dn(t) {
    let e = { ORDER: 'bigint', MASK: 'bigint', BYTES: 'isSafeInteger', BITS: 'isSafeInteger' },
      n = Qs.reduce((r, o) => ((r[o] = 'function'), r), e)
    return Ut(t, n)
  }
  function Fs(t, e, n) {
    if (n < Z) throw new Error('Expected power > 0')
    if (n === Z) return t.ONE
    if (n === D) return e
    let r = t.ONE,
      o = e
    for (; n > Z; ) (n & D && (r = t.mul(r, o)), (o = t.sqr(o)), (n >>= D))
    return r
  }
  function ti(t, e) {
    let n = new Array(e.length),
      r = e.reduce((s, i, c) => (t.is0(i) ? s : ((n[c] = s), t.mul(s, i))), t.ONE),
      o = t.inv(r)
    return (
      e.reduceRight((s, i, c) => (t.is0(i) ? s : ((n[c] = t.mul(s, n[c])), t.mul(s, i))), o),
      n
    )
  }
  function hn(t, e) {
    let n = e !== void 0 ? e : t.toString(2).length,
      r = Math.ceil(n / 8)
    return { nBitLength: n, nByteLength: r }
  }
  function Pr(t, e, n = !1, r = {}) {
    if (t <= Z) throw new Error(`Expected Field ORDER > 0, got ${t}`)
    let { nBitLength: o, nByteLength: s } = hn(t, e)
    if (s > 2048) throw new Error('Field lengths over 2048 bytes are not supported')
    let i = Xs(t),
      c = Object.freeze({
        ORDER: t,
        BITS: o,
        BYTES: s,
        MASK: le(o),
        ZERO: Z,
        ONE: D,
        create: a => K(a, t),
        isValid: a => {
          if (typeof a != 'bigint')
            throw new Error(`Invalid field element: expected bigint, got ${typeof a}`)
          return Z <= a && a < t
        },
        is0: a => a === Z,
        isOdd: a => (a & D) === D,
        neg: a => K(-a, t),
        eql: (a, l) => a === l,
        sqr: a => K(a * a, t),
        add: (a, l) => K(a + l, t),
        sub: (a, l) => K(a - l, t),
        mul: (a, l) => K(a * l, t),
        pow: (a, l) => Fs(c, a, l),
        div: (a, l) => K(a * Be(l, t), t),
        sqrN: a => a * a,
        addN: (a, l) => a + l,
        subN: (a, l) => a - l,
        mulN: (a, l) => a * l,
        inv: a => Be(a, t),
        sqrt: r.sqrt || (a => i(c, a)),
        invertBatch: a => ti(c, a),
        cmov: (a, l, f) => (f ? l : a),
        toBytes: a => (n ? Ae(a, s) : ft(a, s)),
        fromBytes: a => {
          if (a.length !== s) throw new Error(`Fp.fromBytes: expected ${s}, got ${a.length}`)
          return n ? Te(a) : J(a)
        },
      })
    return Object.freeze(c)
  }
  function Hr(t) {
    if (typeof t != 'bigint') throw new Error('field order must be bigint')
    let e = t.toString(2).length
    return Math.ceil(e / 8)
  }
  function pn(t) {
    let e = Hr(t)
    return e + Math.ceil(e / 2)
  }
  function $r(t, e, n = !1) {
    let r = t.length,
      o = Hr(e),
      s = pn(e)
    if (r < 16 || r < s || r > 1024) throw new Error(`expected ${s}-1024 bytes of input, got ${r}`)
    let i = n ? J(t) : Te(t),
      c = K(i, e - D) + D
    return n ? Ae(c, o) : ft(c, o)
  }
  var ni = BigInt(0),
    gn = BigInt(1)
  function Mr(t, e) {
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
          c = o
        for (; s > ni; ) (s & gn && (i = i.add(c)), (c = c.double()), (s >>= gn))
        return i
      },
      precomputeWindow(o, s) {
        let { windows: i, windowSize: c } = r(s),
          a = [],
          l = o,
          f = l
        for (let u = 0; u < i; u++) {
          ;((f = l), a.push(f))
          for (let g = 1; g < c; g++) ((f = f.add(l)), a.push(f))
          l = f.double()
        }
        return a
      },
      wNAF(o, s, i) {
        let { windows: c, windowSize: a } = r(o),
          l = t.ZERO,
          f = t.BASE,
          u = BigInt(2 ** o - 1),
          g = 2 ** o,
          y = BigInt(o)
        for (let p = 0; p < c; p++) {
          let d = p * a,
            h = Number(i & u)
          ;((i >>= y), h > a && ((h -= g), (i += gn)))
          let w = d,
            b = d + Math.abs(h) - 1,
            E = p % 2 !== 0,
            A = h < 0
          h === 0 ? (f = f.add(n(E, s[w]))) : (l = l.add(n(A, s[b])))
        }
        return { p: l, f }
      },
      wNAFCached(o, s, i, c) {
        let a = o._WINDOW_SIZE || 1,
          l = s.get(o)
        return (
          l || ((l = this.precomputeWindow(o, a)), a !== 1 && s.set(o, c(l))),
          this.wNAF(a, l, i)
        )
      },
    }
  }
  function yn(t) {
    return (
      dn(t.Fp),
      Ut(
        t,
        { n: 'bigint', h: 'bigint', Gx: 'field', Gy: 'field' },
        { nBitLength: 'isSafeInteger', nByteLength: 'isSafeInteger' }
      ),
      Object.freeze({ ...hn(t.n, t.nBitLength), ...t, p: t.Fp.ORDER })
    )
  }
  function ri(t) {
    let e = yn(t)
    Ut(
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
  var { bytesToNumberBE: oi, hexToBytes: si } = fn,
    zt = {
      Err: class extends Error {
        constructor(e = '') {
          super(e)
        }
      },
      _parseInt(t) {
        let { Err: e } = zt
        if (t.length < 2 || t[0] !== 2) throw new e('Invalid signature integer tag')
        let n = t[1],
          r = t.subarray(2, n + 2)
        if (!n || r.length !== n) throw new e('Invalid signature integer: wrong length')
        if (r[0] & 128) throw new e('Invalid signature integer: negative')
        if (r[0] === 0 && !(r[1] & 128))
          throw new e('Invalid signature integer: unnecessary leading zero')
        return { d: oi(r), l: t.subarray(n + 2) }
      },
      toSig(t) {
        let { Err: e } = zt,
          n = typeof t == 'string' ? si(t) : t
        if (!(n instanceof Uint8Array)) throw new Error('ui8a expected')
        let r = n.length
        if (r < 2 || n[0] != 48) throw new e('Invalid signature tag')
        if (n[1] !== r - 2) throw new e('Invalid signature: incorrect length')
        let { d: o, l: s } = zt._parseInt(n.subarray(2)),
          { d: i, l: c } = zt._parseInt(s)
        if (c.length) throw new e('Invalid signature: left bytes after parsing')
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
          c = n(s),
          a = n(i)
        return `30${n(i + s + 4)}02${a}${o}02${c}${r}`
      },
    },
    vt = BigInt(0),
    st = BigInt(1),
    Af = BigInt(2),
    qr = BigInt(3),
    Bf = BigInt(4)
  function ii(t) {
    let e = ri(t),
      { Fp: n } = e,
      r =
        e.toBytes ||
        ((p, d, h) => {
          let w = d.toAffine()
          return Et(Uint8Array.from([4]), n.toBytes(w.x), n.toBytes(w.y))
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
        b = n.mul(w, p)
      return n.add(n.add(b, n.mul(p, d)), h)
    }
    if (!n.eql(n.sqr(e.Gy), s(e.Gx))) throw new Error('bad generator point: equation left != right')
    function i(p) {
      return typeof p == 'bigint' && vt < p && p < e.n
    }
    function c(p) {
      if (!i(p)) throw new Error('Expected valid bigint: 0 < bigint < curve.n')
    }
    function a(p) {
      let { allowedPrivateKeyLengths: d, nByteLength: h, wrapPrivateKey: w, n: b } = e
      if (d && typeof p != 'bigint') {
        if ((p instanceof Uint8Array && (p = Wt(p)), typeof p != 'string' || !d.includes(p.length)))
          throw new Error('Invalid key')
        p = p.padStart(h * 2, '0')
      }
      let E
      try {
        E = typeof p == 'bigint' ? p : J(z('private key', p, h))
      } catch {
        throw new Error(`private key must be ${h} bytes, hex or bigint, not ${typeof p}`)
      }
      return (w && (E = K(E, b)), c(E), E)
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
        let b = E => n.eql(E, n.ZERO)
        return b(h) && b(w) ? u.ZERO : new u(h, w, n.ONE)
      }
      get x() {
        return this.toAffine().x
      }
      get y() {
        return this.toAffine().y
      }
      static normalizeZ(d) {
        let h = n.invertBatch(d.map(w => w.pz))
        return d.map((w, b) => w.toAffine(h[b])).map(u.fromAffine)
      }
      static fromHex(d) {
        let h = u.fromAffine(o(z('pointHex', d)))
        return (h.assertValidity(), h)
      }
      static fromPrivateKey(d) {
        return u.BASE.multiply(a(d))
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
          b = s(d)
        if (!n.eql(w, b)) throw new Error('bad point: equation left != right')
        if (!this.isTorsionFree()) throw new Error('bad point: not in prime-order subgroup')
      }
      hasEvenY() {
        let { y: d } = this.toAffine()
        if (n.isOdd) return !n.isOdd(d)
        throw new Error("Field doesn't support isOdd")
      }
      equals(d) {
        f(d)
        let { px: h, py: w, pz: b } = this,
          { px: E, py: A, pz: _ } = d,
          T = n.eql(n.mul(h, _), n.mul(E, b)),
          B = n.eql(n.mul(w, _), n.mul(A, b))
        return T && B
      }
      negate() {
        return new u(this.px, n.neg(this.py), this.pz)
      }
      double() {
        let { a: d, b: h } = e,
          w = n.mul(h, qr),
          { px: b, py: E, pz: A } = this,
          _ = n.ZERO,
          T = n.ZERO,
          B = n.ZERO,
          L = n.mul(b, b),
          C = n.mul(E, E),
          U = n.mul(A, A),
          I = n.mul(b, E)
        return (
          (I = n.add(I, I)),
          (B = n.mul(b, A)),
          (B = n.add(B, B)),
          (_ = n.mul(d, B)),
          (T = n.mul(w, U)),
          (T = n.add(_, T)),
          (_ = n.sub(C, T)),
          (T = n.add(C, T)),
          (T = n.mul(_, T)),
          (_ = n.mul(I, _)),
          (B = n.mul(w, B)),
          (U = n.mul(d, U)),
          (I = n.sub(L, U)),
          (I = n.mul(d, I)),
          (I = n.add(I, B)),
          (B = n.add(L, L)),
          (L = n.add(B, L)),
          (L = n.add(L, U)),
          (L = n.mul(L, I)),
          (T = n.add(T, L)),
          (U = n.mul(E, A)),
          (U = n.add(U, U)),
          (L = n.mul(U, I)),
          (_ = n.sub(_, L)),
          (B = n.mul(U, C)),
          (B = n.add(B, B)),
          (B = n.add(B, B)),
          new u(_, T, B)
        )
      }
      add(d) {
        f(d)
        let { px: h, py: w, pz: b } = this,
          { px: E, py: A, pz: _ } = d,
          T = n.ZERO,
          B = n.ZERO,
          L = n.ZERO,
          C = e.a,
          U = n.mul(e.b, qr),
          I = n.mul(h, E),
          H = n.mul(w, A),
          $ = n.mul(b, _),
          V = n.add(h, w),
          m = n.add(E, A)
        ;((V = n.mul(V, m)), (m = n.add(I, H)), (V = n.sub(V, m)), (m = n.add(h, b)))
        let x = n.add(E, _)
        return (
          (m = n.mul(m, x)),
          (x = n.add(I, $)),
          (m = n.sub(m, x)),
          (x = n.add(w, b)),
          (T = n.add(A, _)),
          (x = n.mul(x, T)),
          (T = n.add(H, $)),
          (x = n.sub(x, T)),
          (L = n.mul(C, m)),
          (T = n.mul(U, $)),
          (L = n.add(T, L)),
          (T = n.sub(H, L)),
          (L = n.add(H, L)),
          (B = n.mul(T, L)),
          (H = n.add(I, I)),
          (H = n.add(H, I)),
          ($ = n.mul(C, $)),
          (m = n.mul(U, m)),
          (H = n.add(H, $)),
          ($ = n.sub(I, $)),
          ($ = n.mul(C, $)),
          (m = n.add(m, $)),
          (I = n.mul(H, m)),
          (B = n.add(B, I)),
          (I = n.mul(x, m)),
          (T = n.mul(V, T)),
          (T = n.sub(T, I)),
          (I = n.mul(V, H)),
          (L = n.mul(x, L)),
          (L = n.add(L, I)),
          new u(T, B, L)
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
          let w = n.invertBatch(h.map(b => b.pz))
          return h.map((b, E) => b.toAffine(w[E])).map(u.fromAffine)
        })
      }
      multiplyUnsafe(d) {
        let h = u.ZERO
        if (d === vt) return h
        if ((c(d), d === st)) return this
        let { endo: w } = e
        if (!w) return y.unsafeLadder(this, d)
        let { k1neg: b, k1: E, k2neg: A, k2: _ } = w.splitScalar(d),
          T = h,
          B = h,
          L = this
        for (; E > vt || _ > vt; )
          (E & st && (T = T.add(L)),
            _ & st && (B = B.add(L)),
            (L = L.double()),
            (E >>= st),
            (_ >>= st))
        return (
          b && (T = T.negate()),
          A && (B = B.negate()),
          (B = new u(n.mul(B.px, w.beta), B.py, B.pz)),
          T.add(B)
        )
      }
      multiply(d) {
        c(d)
        let h = d,
          w,
          b,
          { endo: E } = e
        if (E) {
          let { k1neg: A, k1: _, k2neg: T, k2: B } = E.splitScalar(h),
            { p: L, f: C } = this.wNAF(_),
            { p: U, f: I } = this.wNAF(B)
          ;((L = y.constTimeNegate(A, L)),
            (U = y.constTimeNegate(T, U)),
            (U = new u(n.mul(U.px, E.beta), U.py, U.pz)),
            (w = L.add(U)),
            (b = C.add(I)))
        } else {
          let { p: A, f: _ } = this.wNAF(h)
          ;((w = A), (b = _))
        }
        return u.normalizeZ([w, b])[0]
      }
      multiplyAndAddUnsafe(d, h, w) {
        let b = u.BASE,
          E = (_, T) =>
            T === vt || T === st || !_.equals(b) ? _.multiplyUnsafe(T) : _.multiply(T),
          A = E(this, h).add(E(d, w))
        return A.is0() ? void 0 : A
      }
      toAffine(d) {
        let { px: h, py: w, pz: b } = this,
          E = this.is0()
        d == null && (d = E ? n.ONE : n.inv(b))
        let A = n.mul(h, d),
          _ = n.mul(w, d),
          T = n.mul(b, d)
        if (E) return { x: n.ZERO, y: n.ZERO }
        if (!n.eql(T, n.ONE)) throw new Error('invZ was invalid')
        return { x: A, y: _ }
      }
      isTorsionFree() {
        let { h: d, isTorsionFree: h } = e
        if (d === st) return !0
        if (h) return h(u, this)
        throw new Error('isTorsionFree() has not been declared for the elliptic curve')
      }
      clearCofactor() {
        let { h: d, clearCofactor: h } = e
        return d === st ? this : h ? h(u, this) : this.multiplyUnsafe(e.h)
      }
      toRawBytes(d = !0) {
        return (this.assertValidity(), r(u, this, d))
      }
      toHex(d = !0) {
        return Wt(this.toRawBytes(d))
      }
    }
    ;((u.BASE = new u(e.Gx, e.Gy, n.ONE)), (u.ZERO = new u(n.ZERO, n.ONE, n.ZERO)))
    let g = e.nBitLength,
      y = Mr(u, e.endo ? Math.ceil(g / 2) : g)
    return {
      CURVE: e,
      ProjectivePoint: u,
      normPrivateKeyToScalar: a,
      weierstrassEquation: s,
      isWithinCurveOrder: i,
    }
  }
  function ci(t) {
    let e = yn(t)
    return (
      Ut(
        e,
        { hash: 'hash', hmac: 'function', randomBytes: 'function' },
        { bits2int: 'function', bits2int_modN: 'function', lowS: 'boolean' }
      ),
      Object.freeze({ lowS: !0, ...e })
    )
  }
  function Vr(t) {
    let e = ci(t),
      { Fp: n, n: r } = e,
      o = n.BYTES + 1,
      s = 2 * n.BYTES + 1
    function i(m) {
      return vt < m && m < n.ORDER
    }
    function c(m) {
      return K(m, r)
    }
    function a(m) {
      return Be(m, r)
    }
    let {
        ProjectivePoint: l,
        normPrivateKeyToScalar: f,
        weierstrassEquation: u,
        isWithinCurveOrder: g,
      } = ii({
        ...e,
        toBytes(m, x, k) {
          let R = x.toAffine(),
            v = n.toBytes(R.x),
            O = Et
          return k
            ? O(Uint8Array.from([x.hasEvenY() ? 2 : 3]), v)
            : O(Uint8Array.from([4]), v, n.toBytes(R.y))
        },
        fromBytes(m) {
          let x = m.length,
            k = m[0],
            R = m.subarray(1)
          if (x === o && (k === 2 || k === 3)) {
            let v = J(R)
            if (!i(v)) throw new Error('Point is not on curve')
            let O = u(v),
              q = n.sqrt(O),
              M = (q & st) === st
            return (((k & 1) === 1) !== M && (q = n.neg(q)), { x: v, y: q })
          } else if (x === s && k === 4) {
            let v = n.fromBytes(R.subarray(0, n.BYTES)),
              O = n.fromBytes(R.subarray(n.BYTES, 2 * n.BYTES))
            return { x: v, y: O }
          } else
            throw new Error(
              `Point of length ${x} was invalid. Expected ${o} compressed bytes or ${s} uncompressed bytes`
            )
        },
      }),
      y = m => Wt(ft(m, e.nByteLength))
    function p(m) {
      let x = r >> st
      return m > x
    }
    function d(m) {
      return p(m) ? c(-m) : m
    }
    let h = (m, x, k) => J(m.slice(x, k))
    class w {
      constructor(x, k, R) {
        ;((this.r = x), (this.s = k), (this.recovery = R), this.assertValidity())
      }
      static fromCompact(x) {
        let k = e.nByteLength
        return ((x = z('compactSignature', x, k * 2)), new w(h(x, 0, k), h(x, k, 2 * k)))
      }
      static fromDER(x) {
        let { r: k, s: R } = zt.toSig(z('DER', x))
        return new w(k, R)
      }
      assertValidity() {
        if (!g(this.r)) throw new Error('r must be 0 < r < CURVE.n')
        if (!g(this.s)) throw new Error('s must be 0 < s < CURVE.n')
      }
      addRecoveryBit(x) {
        return new w(this.r, this.s, x)
      }
      recoverPublicKey(x) {
        let { r: k, s: R, recovery: v } = this,
          O = B(z('msgHash', x))
        if (v == null || ![0, 1, 2, 3].includes(v)) throw new Error('recovery id invalid')
        let q = v === 2 || v === 3 ? k + e.n : k
        if (q >= n.ORDER) throw new Error('recovery id 2 or 3 invalid')
        let M = (v & 1) === 0 ? '02' : '03',
          G = l.fromHex(M + y(q)),
          X = a(q),
          et = c(-O * X),
          ot = c(R * X),
          Q = l.BASE.multiplyAndAddUnsafe(G, et, ot)
        if (!Q) throw new Error('point at infinify')
        return (Q.assertValidity(), Q)
      }
      hasHighS() {
        return p(this.s)
      }
      normalizeS() {
        return this.hasHighS() ? new w(this.r, c(-this.s), this.recovery) : this
      }
      toDERRawBytes() {
        return Dt(this.toDERHex())
      }
      toDERHex() {
        return zt.hexFromSig({ r: this.r, s: this.s })
      }
      toCompactRawBytes() {
        return Dt(this.toCompactHex())
      }
      toCompactHex() {
        return y(this.r) + y(this.s)
      }
    }
    let b = {
      isValidPrivateKey(m) {
        try {
          return (f(m), !0)
        } catch {
          return !1
        }
      },
      normPrivateKeyToScalar: f,
      randomPrivateKey: () => {
        let m = pn(e.n)
        return $r(e.randomBytes(m), e.n)
      },
      precompute(m = 8, x = l.BASE) {
        return (x._setWindowSize(m), x.multiply(BigInt(3)), x)
      },
    }
    function E(m, x = !0) {
      return l.fromPrivateKey(m).toRawBytes(x)
    }
    function A(m) {
      let x = m instanceof Uint8Array,
        k = typeof m == 'string',
        R = (x || k) && m.length
      return x ? R === o || R === s : k ? R === 2 * o || R === 2 * s : m instanceof l
    }
    function _(m, x, k = !0) {
      if (A(m)) throw new Error('first arg must be private key')
      if (!A(x)) throw new Error('second arg must be public key')
      return l.fromHex(x).multiply(f(m)).toRawBytes(k)
    }
    let T =
        e.bits2int ||
        function (m) {
          let x = J(m),
            k = m.length * 8 - e.nBitLength
          return k > 0 ? x >> BigInt(k) : x
        },
      B =
        e.bits2int_modN ||
        function (m) {
          return c(T(m))
        },
      L = le(e.nBitLength)
    function C(m) {
      if (typeof m != 'bigint') throw new Error('bigint expected')
      if (!(vt <= m && m < L)) throw new Error(`bigint expected < 2^${e.nBitLength}`)
      return ft(m, e.nByteLength)
    }
    function U(m, x, k = I) {
      if (['recovered', 'canonical'].some(tt => tt in k))
        throw new Error('sign() legacy options not supported')
      let { hash: R, randomBytes: v } = e,
        { lowS: O, prehash: q, extraEntropy: M } = k
      ;(O == null && (O = !0), (m = z('msgHash', m)), q && (m = z('prehashed msgHash', R(m))))
      let G = B(m),
        X = f(x),
        et = [C(X), C(G)]
      if (M != null) {
        let tt = M === !0 ? v(n.BYTES) : M
        et.push(z('extraEntropy', tt))
      }
      let ot = Et(...et),
        Q = G
      function ht(tt) {
        let Jt = T(tt)
        if (!g(Jt)) return
        let mr = a(Jt),
          pt = l.BASE.multiply(Jt).toAffine(),
          Yt = c(pt.x)
        if (Yt === vt) return
        let ge = c(mr * c(Q + Yt * X))
        if (ge === vt) return
        let xr = (pt.x === Yt ? 0 : 2) | Number(pt.y & st),
          Er = ge
        return (O && p(ge) && ((Er = d(ge)), (xr ^= 1)), new w(Yt, Er, xr))
      }
      return { seed: ot, k2sig: ht }
    }
    let I = { lowS: e.lowS, prehash: !1 },
      H = { lowS: e.lowS, prehash: !1 }
    function $(m, x, k = I) {
      let { seed: R, k2sig: v } = U(m, x, k),
        O = e
      return ln(O.hash.outputLen, O.nByteLength, O.hmac)(R, v)
    }
    l.BASE._setWindowSize(8)
    function V(m, x, k, R = H) {
      let v = m
      if (((x = z('msgHash', x)), (k = z('publicKey', k)), 'strict' in R))
        throw new Error('options.strict was renamed to lowS')
      let { lowS: O, prehash: q } = R,
        M,
        G
      try {
        if (typeof v == 'string' || v instanceof Uint8Array)
          try {
            M = w.fromDER(v)
          } catch (pt) {
            if (!(pt instanceof zt.Err)) throw pt
            M = w.fromCompact(v)
          }
        else if (typeof v == 'object' && typeof v.r == 'bigint' && typeof v.s == 'bigint') {
          let { r: pt, s: Yt } = v
          M = new w(pt, Yt)
        } else throw new Error('PARSE')
        G = l.fromHex(k)
      } catch (pt) {
        if (pt.message === 'PARSE')
          throw new Error('signature must be Signature instance, Uint8Array or hex string')
        return !1
      }
      if (O && M.hasHighS()) return !1
      q && (x = e.hash(x))
      let { r: X, s: et } = M,
        ot = B(x),
        Q = a(et),
        ht = c(ot * Q),
        tt = c(X * Q),
        Jt = l.BASE.multiplyAndAddUnsafe(G, ht, tt)?.toAffine()
      return Jt ? c(Jt.x) === X : !1
    }
    return {
      CURVE: e,
      getPublicKey: E,
      getSharedSecret: _,
      sign: $,
      verify: V,
      ProjectivePoint: l,
      Signature: w,
      utils: b,
    }
  }
  var Se = class extends Ft {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), Sr(e))
        let r = ae(n)
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
        return (Qt(this), this.iHash.update(e), this)
      }
      digestInto(e) {
        ;(Qt(this),
          on(e, this.outputLen),
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
        let { oHash: n, iHash: r, finished: o, destroyed: s, blockLen: i, outputLen: c } = this
        return (
          (e = e),
          (e.finished = o),
          (e.destroyed = s),
          (e.blockLen = i),
          (e.outputLen = c),
          (e.oHash = n._cloneInto(e.oHash)),
          (e.iHash = r._cloneInto(e.iHash)),
          e
        )
      }
      destroy() {
        ;((this.destroyed = !0), this.oHash.destroy(), this.iHash.destroy())
      }
    },
    wn = (t, e, n) => new Se(t, e).update(n).digest()
  wn.create = (t, e) => new Se(t, e)
  function ai(t) {
    return { hash: t, hmac: (e, ...n) => wn(t, e, _r(...n)), randomBytes: be }
  }
  function Wr(t, e) {
    let n = r => Vr({ ...t, ...ai(r) })
    return Object.freeze({ ...n(e), create: n })
  }
  var Ie = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
    Le = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
    zr = BigInt(1),
    ke = BigInt(2),
    Dr = (t, e) => (t + e / ke) / e
  function Kr(t) {
    let e = Ie,
      n = BigInt(3),
      r = BigInt(6),
      o = BigInt(11),
      s = BigInt(22),
      i = BigInt(23),
      c = BigInt(44),
      a = BigInt(88),
      l = (t * t * t) % e,
      f = (l * l * t) % e,
      u = (nt(f, n, e) * f) % e,
      g = (nt(u, n, e) * f) % e,
      y = (nt(g, ke, e) * l) % e,
      p = (nt(y, o, e) * y) % e,
      d = (nt(p, s, e) * p) % e,
      h = (nt(d, c, e) * d) % e,
      w = (nt(h, a, e) * h) % e,
      b = (nt(w, c, e) * d) % e,
      E = (nt(b, n, e) * f) % e,
      A = (nt(E, i, e) * p) % e,
      _ = (nt(A, r, e) * l) % e,
      T = nt(_, ke, e)
    if (!mn.eql(mn.sqr(T), t)) throw new Error('Cannot find square root')
    return T
  }
  var mn = Pr(Ie, void 0, void 0, { sqrt: Kr }),
    Rt = Wr(
      {
        a: BigInt(0),
        b: BigInt(7),
        Fp: mn,
        n: Le,
        Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
        Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
        h: BigInt(1),
        lowS: !0,
        endo: {
          beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
          splitScalar: t => {
            let e = Le,
              n = BigInt('0x3086d221a7d46bcde86c90e49284eb15'),
              r = -zr * BigInt('0xe4437ed6010e88286f547fa90abfe4c3'),
              o = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'),
              s = n,
              i = BigInt('0x100000000000000000000000000000000'),
              c = Dr(s * t, e),
              a = Dr(-r * t, e),
              l = K(t - c * n - a * o, e),
              f = K(-c * r - a * s, e),
              u = l > i,
              g = f > i
            if ((u && (l = e - l), g && (f = e - f), l > i || f > i))
              throw new Error('splitScalar: Endomorphism failed, k=' + t)
            return { k1neg: u, k1: l, k2neg: g, k2: f }
          },
        },
      },
      xe
    ),
    Ue = BigInt(0),
    Zr = t => typeof t == 'bigint' && Ue < t && t < Ie,
    li = t => typeof t == 'bigint' && Ue < t && t < Le,
    jr = {}
  function _e(t, ...e) {
    let n = jr[t]
    if (n === void 0) {
      let r = xe(Uint8Array.from(t, o => o.charCodeAt(0)))
      ;((n = Et(r, r)), (jr[t] = n))
    }
    return xe(Et(n, ...e))
  }
  var vn = t => t.toRawBytes(!0).slice(1),
    xn = t => ft(t, 32),
    bn = t => K(t, Ie),
    fe = t => K(t, Le),
    Tn = Rt.ProjectivePoint,
    fi = (t, e, n) => Tn.BASE.multiplyAndAddUnsafe(t, e, n)
  function En(t) {
    let e = Rt.utils.normPrivateKeyToScalar(t),
      n = Tn.fromPrivateKey(e)
    return { scalar: n.hasEvenY() ? e : fe(-e), bytes: vn(n) }
  }
  function Gr(t) {
    if (!Zr(t)) throw new Error('bad x: need 0 < x < p')
    let e = bn(t * t),
      n = bn(e * t + BigInt(7)),
      r = Kr(n)
    r % ke !== Ue && (r = bn(-r))
    let o = new Tn(t, r, zr)
    return (o.assertValidity(), o)
  }
  function Jr(...t) {
    return fe(J(_e('BIP0340/challenge', ...t)))
  }
  function ui(t) {
    return En(t).bytes
  }
  function di(t, e, n = be(32)) {
    let r = z('message', t),
      { bytes: o, scalar: s } = En(e),
      i = z('auxRand', n, 32),
      c = xn(s ^ J(_e('BIP0340/aux', i))),
      a = _e('BIP0340/nonce', c, o, r),
      l = fe(J(a))
    if (l === Ue) throw new Error('sign failed: k is zero')
    let { bytes: f, scalar: u } = En(l),
      g = Jr(f, o, r),
      y = new Uint8Array(64)
    if ((y.set(f, 0), y.set(xn(fe(u + g * s)), 32), !Yr(y, r, o)))
      throw new Error('sign: Invalid signature produced')
    return y
  }
  function Yr(t, e, n) {
    let r = z('signature', t, 64),
      o = z('message', e),
      s = z('publicKey', n, 32)
    try {
      let i = Gr(J(s)),
        c = J(r.subarray(0, 32))
      if (!Zr(c)) return !1
      let a = J(r.subarray(32, 64))
      if (!li(a)) return !1
      let l = Jr(xn(c), vn(i), o),
        f = fi(i, a, fe(-l))
      return !(!f || !f.hasEvenY() || f.toAffine().x !== c)
    } catch {
      return !1
    }
  }
  var te = {
    getPublicKey: ui,
    sign: di,
    verify: Yr,
    utils: {
      randomPrivateKey: Rt.utils.randomPrivateKey,
      lift_x: Gr,
      pointToBytes: vn,
      numberToBytesBE: ft,
      bytesToNumberBE: J,
      taggedHash: _e,
      mod: K,
    },
  }
  var Re = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var An = t => t instanceof Uint8Array
  var Ce = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    ut = (t, e) => (t << (32 - e)) | (t >>> e),
    hi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!hi) throw new Error('Non little-endian hardware is not supported')
  var pi = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function j(t) {
    if (!An(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += pi[t[n]]
    return e
  }
  function Tt(t) {
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
  function gi(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Ct(t) {
    if ((typeof t == 'string' && (t = gi(t)), !An(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function ne(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!An(r)) throw new Error('Uint8Array expected')
        ;(e.set(r, n), (n += r.length))
      }),
      e
    )
  }
  var ee = class {
    clone() {
      return this._cloneInto()
    }
  }
  function Bn(t) {
    let e = r => t().update(Ct(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function Oe(t = 32) {
    if (Re && typeof Re.getRandomValues == 'function') return Re.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function Sn(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function yi(t) {
    if (typeof t != 'boolean') throw new Error(`Expected boolean, not ${t}`)
  }
  function Xr(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function wi(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(Sn(t.outputLen), Sn(t.blockLen))
  }
  function bi(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function mi(t, e) {
    Xr(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var xi = { number: Sn, bool: yi, bytes: Xr, hash: wi, exists: bi, output: mi },
    rt = xi
  function Ei(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      c = Number(n & s),
      a = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + a, i, r), t.setUint32(e + l, c, r))
  }
  var Ne = class extends ee {
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
        (this.view = Ce(this.buffer)))
    }
    update(e) {
      rt.exists(this)
      let { view: n, buffer: r, blockLen: o } = this
      e = Ct(e)
      let s = e.length
      for (let i = 0; i < s; ) {
        let c = Math.min(o - this.pos, s - i)
        if (c === o) {
          let a = Ce(e)
          for (; o <= s - i; i += o) this.process(a, i)
          continue
        }
        ;(r.set(e.subarray(i, i + c), this.pos),
          (this.pos += c),
          (i += c),
          this.pos === o && (this.process(n, 0), (this.pos = 0)))
      }
      return ((this.length += e.length), this.roundClean(), this)
    }
    digestInto(e) {
      ;(rt.exists(this), rt.output(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let u = i; u < o; u++) n[u] = 0
      ;(Ei(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let c = Ce(e),
        a = this.outputLen
      if (a % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = a / 4,
        f = this.get()
      if (l > f.length) throw new Error('_sha2: outputLen bigger than state')
      for (let u = 0; u < l; u++) c.setUint32(4 * u, f[u], s)
    }
    digest() {
      let { buffer: e, outputLen: n } = this
      this.digestInto(e)
      let r = e.slice(0, n)
      return (this.destroy(), r)
    }
    _cloneInto(e) {
      ;(e || (e = new this.constructor()), e.set(...this.get()))
      let { blockLen: n, buffer: r, length: o, finished: s, destroyed: i, pos: c } = this
      return (
        (e.length = o),
        (e.pos = c),
        (e.finished = s),
        (e.destroyed = i),
        o % n && e.buffer.set(r),
        e
      )
    }
  }
  var vi = (t, e, n) => (t & e) ^ (~t & n),
    Ti = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    Ai = new Uint32Array([
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
    Ot = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Nt = new Uint32Array(64),
    Pe = class extends Ne {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = Ot[0] | 0),
          (this.B = Ot[1] | 0),
          (this.C = Ot[2] | 0),
          (this.D = Ot[3] | 0),
          (this.E = Ot[4] | 0),
          (this.F = Ot[5] | 0),
          (this.G = Ot[6] | 0),
          (this.H = Ot[7] | 0))
      }
      get() {
        let { A: e, B: n, C: r, D: o, E: s, F: i, G: c, H: a } = this
        return [e, n, r, o, s, i, c, a]
      }
      set(e, n, r, o, s, i, c, a) {
        ;((this.A = e | 0),
          (this.B = n | 0),
          (this.C = r | 0),
          (this.D = o | 0),
          (this.E = s | 0),
          (this.F = i | 0),
          (this.G = c | 0),
          (this.H = a | 0))
      }
      process(e, n) {
        for (let u = 0; u < 16; u++, n += 4) Nt[u] = e.getUint32(n, !1)
        for (let u = 16; u < 64; u++) {
          let g = Nt[u - 15],
            y = Nt[u - 2],
            p = ut(g, 7) ^ ut(g, 18) ^ (g >>> 3),
            d = ut(y, 17) ^ ut(y, 19) ^ (y >>> 10)
          Nt[u] = (d + Nt[u - 7] + p + Nt[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: c, F: a, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let g = ut(c, 6) ^ ut(c, 11) ^ ut(c, 25),
            y = (f + g + vi(c, a, l) + Ai[u] + Nt[u]) | 0,
            d = ((ut(r, 2) ^ ut(r, 13) ^ ut(r, 22)) + Ti(r, o, s)) | 0
          ;((f = l),
            (l = a),
            (a = c),
            (c = (i + y) | 0),
            (i = s),
            (s = o),
            (o = r),
            (r = (y + d) | 0))
        }
        ;((r = (r + this.A) | 0),
          (o = (o + this.B) | 0),
          (s = (s + this.C) | 0),
          (i = (i + this.D) | 0),
          (c = (c + this.E) | 0),
          (a = (a + this.F) | 0),
          (l = (l + this.G) | 0),
          (f = (f + this.H) | 0),
          this.set(r, o, s, i, c, a, l, f))
      }
      roundClean() {
        Nt.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    },
    Ln = class extends Pe {
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
    gt = Bn(() => new Pe()),
    Jf = Bn(() => new Ln())
  function re(t) {
    if (!Number.isSafeInteger(t)) throw new Error(`Wrong integer: ${t}`)
  }
  function At(...t) {
    let e = (o, s) => i => o(s(i)),
      n = Array.from(t)
        .reverse()
        .reduce((o, s) => (o ? e(o, s.encode) : s.encode), void 0),
      r = t.reduce((o, s) => (o ? e(o, s.decode) : s.decode), void 0)
    return { encode: n, decode: r }
  }
  function Bt(t) {
    return {
      encode: e => {
        if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
          throw new Error('alphabet.encode input should be an array of numbers')
        return e.map(n => {
          if ((re(n), n < 0 || n >= t.length))
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
  function St(t = '') {
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
  function $e(t, e = '=') {
    if ((re(t), typeof e != 'string')) throw new Error('padding chr should be string')
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
  function ro(t) {
    if (typeof t != 'function') throw new Error('normalize fn should be function')
    return { encode: e => e, decode: e => t(e) }
  }
  function Qr(t, e, n) {
    if (e < 2) throw new Error(`convertRadix: wrong from=${e}, base cannot be less than 2`)
    if (n < 2) throw new Error(`convertRadix: wrong to=${n}, base cannot be less than 2`)
    if (!Array.isArray(t)) throw new Error('convertRadix: data should be array')
    if (!t.length) return []
    let r = 0,
      o = [],
      s = Array.from(t)
    for (
      s.forEach(i => {
        if ((re(i), i < 0 || i >= e)) throw new Error(`Wrong integer: ${i}`)
      });
      ;

    ) {
      let i = 0,
        c = !0
      for (let a = r; a < s.length; a++) {
        let l = s[a],
          f = e * i + l
        if (!Number.isSafeInteger(f) || (e * i) / e !== i || f - l !== e * i)
          throw new Error('convertRadix: carry overflow')
        if (
          ((i = f % n),
          (s[a] = Math.floor(f / n)),
          !Number.isSafeInteger(s[a]) || s[a] * n + i !== f)
        )
          throw new Error('convertRadix: carry overflow')
        if (c) s[a] ? (c = !1) : (r = a)
        else continue
      }
      if ((o.push(i), c)) break
    }
    for (let i = 0; i < t.length - 1 && t[i] === 0; i++) o.push(0)
    return o.reverse()
  }
  var oo = (t, e) => (e ? oo(e, t % e) : t),
    He = (t, e) => t + (e - oo(t, e))
  function kn(t, e, n, r) {
    if (!Array.isArray(t)) throw new Error('convertRadix2: data should be array')
    if (e <= 0 || e > 32) throw new Error(`convertRadix2: wrong from=${e}`)
    if (n <= 0 || n > 32) throw new Error(`convertRadix2: wrong to=${n}`)
    if (He(e, n) > 32)
      throw new Error(`convertRadix2: carry overflow from=${e} to=${n} carryBits=${He(e, n)}`)
    let o = 0,
      s = 0,
      i = 2 ** n - 1,
      c = []
    for (let a of t) {
      if ((re(a), a >= 2 ** e)) throw new Error(`convertRadix2: invalid data word=${a} from=${e}`)
      if (((o = (o << e) | a), s + e > 32))
        throw new Error(`convertRadix2: carry overflow pos=${s} from=${e}`)
      for (s += e; s >= n; s -= n) c.push(((o >> (s - n)) & i) >>> 0)
      o &= 2 ** s - 1
    }
    if (((o = (o << (n - s)) & i), !r && s >= e)) throw new Error('Excess padding')
    if (!r && o) throw new Error(`Non-zero padding: ${o}`)
    return (r && s > 0 && c.push(o >>> 0), c)
  }
  function Bi(t) {
    return (
      re(t),
      {
        encode: e => {
          if (!(e instanceof Uint8Array)) throw new Error('radix.encode input should be Uint8Array')
          return Qr(Array.from(e), 2 ** 8, t)
        },
        decode: e => {
          if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
            throw new Error('radix.decode input should be array of strings')
          return Uint8Array.from(Qr(e, t, 2 ** 8))
        },
      }
    )
  }
  function Pt(t, e = !1) {
    if ((re(t), t <= 0 || t > 32)) throw new Error('radix2: bits should be in (0..32]')
    if (He(8, t) > 32 || He(t, 8) > 32) throw new Error('radix2: carry overflow')
    return {
      encode: n => {
        if (!(n instanceof Uint8Array)) throw new Error('radix2.encode input should be Uint8Array')
        return kn(Array.from(n), 8, t, !e)
      },
      decode: n => {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'number'))
          throw new Error('radix2.decode input should be array of strings')
        return Uint8Array.from(kn(n, t, 8, e))
      },
    }
  }
  function Fr(t) {
    if (typeof t != 'function') throw new Error('unsafeWrapper fn should be function')
    return function (...e) {
      try {
        return t.apply(null, e)
      } catch {}
    }
  }
  var Si = At(Pt(4), Bt('0123456789ABCDEF'), St('')),
    Li = At(Pt(5), Bt('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), $e(5), St('')),
    Xf = At(Pt(5), Bt('0123456789ABCDEFGHIJKLMNOPQRSTUV'), $e(5), St('')),
    Qf = At(
      Pt(5),
      Bt('0123456789ABCDEFGHJKMNPQRSTVWXYZ'),
      St(''),
      ro(t => t.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1'))
    ),
    it = At(
      Pt(6),
      Bt('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'),
      $e(6),
      St('')
    ),
    ki = At(
      Pt(6),
      Bt('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'),
      $e(6),
      St('')
    ),
    Un = t => At(Bi(58), Bt(t), St('')),
    _n = Un('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'),
    Ff = Un('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'),
    tu = Un('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'),
    to = [0, 2, 3, 5, 6, 7, 9, 10, 11],
    _i = {
      encode(t) {
        let e = ''
        for (let n = 0; n < t.length; n += 8) {
          let r = t.subarray(n, n + 8)
          e += _n.encode(r).padStart(to[r.length], '1')
        }
        return e
      },
      decode(t) {
        let e = []
        for (let n = 0; n < t.length; n += 11) {
          let r = t.slice(n, n + 11),
            o = to.indexOf(r.length),
            s = _n.decode(r)
          for (let i = 0; i < s.length - o; i++)
            if (s[i] !== 0) throw new Error('base58xmr: wrong padding')
          e = e.concat(Array.from(s.slice(s.length - o)))
        }
        return Uint8Array.from(e)
      },
    }
  var In = At(Bt('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), St('')),
    eo = [996825010, 642813549, 513874426, 1027748829, 705979059]
  function ue(t) {
    let e = t >> 25,
      n = (t & 33554431) << 5
    for (let r = 0; r < eo.length; r++) ((e >> r) & 1) === 1 && (n ^= eo[r])
    return n
  }
  function no(t, e, n = 1) {
    let r = t.length,
      o = 1
    for (let s = 0; s < r; s++) {
      let i = t.charCodeAt(s)
      if (i < 33 || i > 126) throw new Error(`Invalid prefix (${t})`)
      o = ue(o) ^ (i >> 5)
    }
    o = ue(o)
    for (let s = 0; s < r; s++) o = ue(o) ^ (t.charCodeAt(s) & 31)
    for (let s of e) o = ue(o) ^ s
    for (let s = 0; s < 6; s++) o = ue(o)
    return ((o ^= n), In.encode(kn([o % 2 ** 30], 30, 5, !1)))
  }
  function so(t) {
    let e = t === 'bech32' ? 1 : 734539939,
      n = Pt(5),
      r = n.decode,
      o = n.encode,
      s = Fr(r)
    function i(f, u, g = 90) {
      if (typeof f != 'string')
        throw new Error(`bech32.encode prefix should be string, not ${typeof f}`)
      if (!Array.isArray(u) || (u.length && typeof u[0] != 'number'))
        throw new Error(`bech32.encode words should be array of numbers, not ${typeof u}`)
      let y = f.length + 7 + u.length
      if (g !== !1 && y > g) throw new TypeError(`Length ${y} exceeds limit ${g}`)
      return ((f = f.toLowerCase()), `${f}1${In.encode(u)}${no(f, u, e)}`)
    }
    function c(f, u = 90) {
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
      let h = In.decode(d).slice(0, -6),
        w = no(p, h, e)
      if (!d.endsWith(w)) throw new Error(`Invalid checksum in ${f}: expected "${w}"`)
      return { prefix: p, words: h }
    }
    let a = Fr(c)
    function l(f) {
      let { prefix: u, words: g } = c(f, !1)
      return { prefix: u, words: g, bytes: r(g) }
    }
    return {
      encode: i,
      decode: c,
      decodeToBytes: l,
      decodeUnsafe: a,
      fromWords: r,
      fromWordsUnsafe: s,
      toWords: o,
    }
  }
  var Ht = so('bech32'),
    eu = so('bech32m'),
    Ii = { encode: t => new TextDecoder().decode(t), decode: t => new TextEncoder().encode(t) },
    Ui = At(
      Pt(4),
      Bt('0123456789abcdef'),
      St(''),
      ro(t => {
        if (typeof t != 'string' || t.length % 2)
          throw new TypeError(
            `hex.decode: expected string, got ${typeof t} with length ${t.length}`
          )
        return t.toLowerCase()
      })
    ),
    Ri = {
      utf8: Ii,
      hex: Ui,
      base16: Si,
      base32: Li,
      base64: it,
      base64url: ki,
      base58: _n,
      base58xmr: _i,
    },
    nu = `Invalid encoding type. Available types: ${Object.keys(Ri).join(', ')}`
  function Me(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`positive integer expected, not ${t}`)
  }
  function Rn(t) {
    if (typeof t != 'boolean') throw new Error(`boolean expected, not ${t}`)
  }
  function Cn(t) {
    return (
      t instanceof Uint8Array ||
      (t != null && typeof t == 'object' && t.constructor.name === 'Uint8Array')
    )
  }
  function N(t, ...e) {
    if (!Cn(t)) throw new Error('Uint8Array expected')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Uint8Array expected of length ${e}, not of length=${t.length}`)
  }
  function $t(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function de(t, e) {
    N(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var qe = t => new Uint8Array(t.buffer, t.byteOffset, t.byteLength)
  var P = t => new Uint32Array(t.buffer, t.byteOffset, Math.floor(t.byteLength / 4)),
    Mt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    Ci = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Ci) throw new Error('Non little-endian hardware is not supported')
  function Oi(t) {
    if (typeof t != 'string') throw new Error(`string expected, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function yt(t) {
    if (typeof t == 'string') t = Oi(t)
    else if (Cn(t)) t = t.slice()
    else throw new Error(`Uint8Array expected, got ${typeof t}`)
    return t
  }
  function io(t, e) {
    if (e == null || typeof e != 'object') throw new Error('options must be defined')
    return Object.assign(t, e)
  }
  function Kt(t, e) {
    if (t.length !== e.length) return !1
    let n = 0
    for (let r = 0; r < t.length; r++) n |= t[r] ^ e[r]
    return n === 0
  }
  var wt = (t, e) => (Object.assign(e, t), e)
  function Zt(t, e, n, r) {
    if (typeof t.setBigUint64 == 'function') return t.setBigUint64(e, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      c = Number(n & s),
      a = r ? 4 : 0,
      l = r ? 0 : 4
    ;(t.setUint32(e + a, i, r), t.setUint32(e + l, c, r))
  }
  var Lt = 16,
    Nn = new Uint8Array(16),
    bt = P(Nn),
    Ni = 225,
    Pi = (t, e, n, r) => {
      let o = r & 1
      return {
        s3: (n << 31) | (r >>> 1),
        s2: (e << 31) | (n >>> 1),
        s1: (t << 31) | (e >>> 1),
        s0: (t >>> 1) ^ ((Ni << 24) & -(o & 1)),
      }
    },
    ct = t =>
      (((t >>> 0) & 255) << 24) |
      (((t >>> 8) & 255) << 16) |
      (((t >>> 16) & 255) << 8) |
      ((t >>> 24) & 255) |
      0
  function Hi(t) {
    t.reverse()
    let e = t[15] & 1,
      n = 0
    for (let r = 0; r < t.length; r++) {
      let o = t[r]
      ;((t[r] = (o >>> 1) | n), (n = (o & 1) << 7))
    }
    return ((t[0] ^= -e & 225), t)
  }
  var $i = t => (t > 64 * 1024 ? 8 : t > 1024 ? 4 : 2),
    Ve = class {
      constructor(e, n) {
        ;((this.blockLen = Lt),
          (this.outputLen = Lt),
          (this.s0 = 0),
          (this.s1 = 0),
          (this.s2 = 0),
          (this.s3 = 0),
          (this.finished = !1),
          (e = yt(e)),
          N(e, 16))
        let r = Mt(e),
          o = r.getUint32(0, !1),
          s = r.getUint32(4, !1),
          i = r.getUint32(8, !1),
          c = r.getUint32(12, !1),
          a = []
        for (let p = 0; p < 128; p++)
          (a.push({ s0: ct(o), s1: ct(s), s2: ct(i), s3: ct(c) }),
            ({ s0: o, s1: s, s2: i, s3: c } = Pi(o, s, i, c)))
        let l = $i(n || 1024)
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
              b = 0,
              E = 0
            for (let A = 0; A < l; A++) {
              if (!((d >>> (l - A - 1)) & 1)) continue
              let { s0: T, s1: B, s2: L, s3: C } = a[l * p + A]
              ;((h ^= T), (w ^= B), (b ^= L), (E ^= C))
            }
            y.push({ s0: h, s1: w, s2: b, s3: E })
          }
        this.t = y
      }
      _updateBlock(e, n, r, o) {
        ;((e ^= this.s0), (n ^= this.s1), (r ^= this.s2), (o ^= this.s3))
        let { W: s, t: i, windowSize: c } = this,
          a = 0,
          l = 0,
          f = 0,
          u = 0,
          g = (1 << s) - 1,
          y = 0
        for (let p of [e, n, r, o])
          for (let d = 0; d < 4; d++) {
            let h = (p >>> (8 * d)) & 255
            for (let w = 8 / s - 1; w >= 0; w--) {
              let b = (h >>> (s * w)) & g,
                { s0: E, s1: A, s2: _, s3: T } = i[y * c + b]
              ;((a ^= E), (l ^= A), (f ^= _), (u ^= T), (y += 1))
            }
          }
        ;((this.s0 = a), (this.s1 = l), (this.s2 = f), (this.s3 = u))
      }
      update(e) {
        ;((e = yt(e)), $t(this))
        let n = P(e),
          r = Math.floor(e.length / Lt),
          o = e.length % Lt
        for (let s = 0; s < r; s++)
          this._updateBlock(n[s * 4 + 0], n[s * 4 + 1], n[s * 4 + 2], n[s * 4 + 3])
        return (
          o &&
            (Nn.set(e.subarray(r * Lt)), this._updateBlock(bt[0], bt[1], bt[2], bt[3]), bt.fill(0)),
          this
        )
      }
      destroy() {
        let { t: e } = this
        for (let n of e) ((n.s0 = 0), (n.s1 = 0), (n.s2 = 0), (n.s3 = 0))
      }
      digestInto(e) {
        ;($t(this), de(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e)
      }
      digest() {
        let e = new Uint8Array(Lt)
        return (this.digestInto(e), this.destroy(), e)
      }
    },
    On = class extends Ve {
      constructor(e, n) {
        e = yt(e)
        let r = Hi(e.slice())
        ;(super(r, n), r.fill(0))
      }
      update(e) {
        ;((e = yt(e)), $t(this))
        let n = P(e),
          r = e.length % Lt,
          o = Math.floor(e.length / Lt)
        for (let s = 0; s < o; s++)
          this._updateBlock(ct(n[s * 4 + 3]), ct(n[s * 4 + 2]), ct(n[s * 4 + 1]), ct(n[s * 4 + 0]))
        return (
          r &&
            (Nn.set(e.subarray(o * Lt)),
            this._updateBlock(ct(bt[3]), ct(bt[2]), ct(bt[1]), ct(bt[0])),
            bt.fill(0)),
          this
        )
      }
      digestInto(e) {
        ;($t(this), de(e, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(e)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), e.reverse())
      }
    }
  function co(t) {
    let e = (r, o) => t(o, r.length).update(yt(r)).digest(),
      n = t(new Uint8Array(16), 0)
    return (
      (e.outputLen = n.outputLen),
      (e.blockLen = n.blockLen),
      (e.create = (r, o) => t(r, o)),
      e
    )
  }
  var Pn = co((t, e) => new Ve(t, e)),
    ao = co((t, e) => new On(t, e))
  var F = 16,
    Mn = 4,
    We = new Uint8Array(F),
    Mi = 283
  function qn(t) {
    return (t << 1) ^ (Mi & -(t >> 7))
  }
  function oe(t, e) {
    let n = 0
    for (; e > 0; e >>= 1) ((n ^= t & -(e & 1)), (t = qn(t)))
    return n
  }
  var $n = (() => {
      let t = new Uint8Array(256)
      for (let n = 0, r = 1; n < 256; n++, r ^= qn(r)) t[n] = r
      let e = new Uint8Array(256)
      e[0] = 99
      for (let n = 0; n < 255; n++) {
        let r = t[255 - n]
        ;((r |= r << 8), (e[t[n]] = (r ^ (r >> 4) ^ (r >> 5) ^ (r >> 6) ^ (r >> 7) ^ 99) & 255))
      }
      return e
    })(),
    qi = $n.map((t, e) => $n.indexOf(e)),
    Vi = t => (t << 24) | (t >>> 8),
    Hn = t => (t << 8) | (t >>> 24)
  function lo(t, e) {
    if (t.length !== 256) throw new Error('Wrong sbox length')
    let n = new Uint32Array(256).map((l, f) => e(t[f])),
      r = n.map(Hn),
      o = r.map(Hn),
      s = o.map(Hn),
      i = new Uint32Array(256 * 256),
      c = new Uint32Array(256 * 256),
      a = new Uint16Array(256 * 256)
    for (let l = 0; l < 256; l++)
      for (let f = 0; f < 256; f++) {
        let u = l * 256 + f
        ;((i[u] = n[l] ^ r[f]), (c[u] = o[l] ^ s[f]), (a[u] = (t[l] << 8) | t[f]))
      }
    return { sbox: t, sbox2: a, T0: n, T1: r, T2: o, T3: s, T01: i, T23: c }
  }
  var Vn = lo($n, t => (oe(t, 3) << 24) | (t << 16) | (t << 8) | oe(t, 2)),
    fo = lo(qi, t => (oe(t, 11) << 24) | (oe(t, 13) << 16) | (oe(t, 9) << 8) | oe(t, 14)),
    Wi = (() => {
      let t = new Uint8Array(16)
      for (let e = 0, n = 1; e < 16; e++, n = qn(n)) t[e] = n
      return t
    })()
  function Vt(t) {
    N(t)
    let e = t.length
    if (![16, 24, 32].includes(e))
      throw new Error(`aes: wrong key size: should be 16, 24 or 32, got: ${e}`)
    let { sbox2: n } = Vn,
      r = P(t),
      o = r.length,
      s = c => mt(n, c, c, c, c),
      i = new Uint32Array(e + 28)
    i.set(r)
    for (let c = o; c < i.length; c++) {
      let a = i[c - 1]
      ;(c % o === 0 ? (a = s(Vi(a)) ^ Wi[c / o - 1]) : o > 6 && c % o === 4 && (a = s(a)),
        (i[c] = i[c - o] ^ a))
    }
    return i
  }
  function uo(t) {
    let e = Vt(t),
      n = e.slice(),
      r = e.length,
      { sbox2: o } = Vn,
      { T0: s, T1: i, T2: c, T3: a } = fo
    for (let l = 0; l < r; l += 4) for (let f = 0; f < 4; f++) n[l + f] = e[r - l - 4 + f]
    e.fill(0)
    for (let l = 4; l < r - 4; l++) {
      let f = n[l],
        u = mt(o, f, f, f, f)
      n[l] = s[u & 255] ^ i[(u >>> 8) & 255] ^ c[(u >>> 16) & 255] ^ a[u >>> 24]
    }
    return n
  }
  function qt(t, e, n, r, o, s) {
    return t[((n << 8) & 65280) | ((r >>> 8) & 255)] ^ e[((o >>> 8) & 65280) | ((s >>> 24) & 255)]
  }
  function mt(t, e, n, r, o) {
    return t[(e & 255) | (n & 65280)] | (t[((r >>> 16) & 255) | ((o >>> 16) & 65280)] << 16)
  }
  function at(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: c } = Vn,
      a = 0
    ;((e ^= t[a++]), (n ^= t[a++]), (r ^= t[a++]), (o ^= t[a++]))
    let l = t.length / 4 - 2
    for (let p = 0; p < l; p++) {
      let d = t[a++] ^ qt(i, c, e, n, r, o),
        h = t[a++] ^ qt(i, c, n, r, o, e),
        w = t[a++] ^ qt(i, c, r, o, e, n),
        b = t[a++] ^ qt(i, c, o, e, n, r)
      ;((e = d), (n = h), (r = w), (o = b))
    }
    let f = t[a++] ^ mt(s, e, n, r, o),
      u = t[a++] ^ mt(s, n, r, o, e),
      g = t[a++] ^ mt(s, r, o, e, n),
      y = t[a++] ^ mt(s, o, e, n, r)
    return { s0: f, s1: u, s2: g, s3: y }
  }
  function ho(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: c } = fo,
      a = 0
    ;((e ^= t[a++]), (n ^= t[a++]), (r ^= t[a++]), (o ^= t[a++]))
    let l = t.length / 4 - 2
    for (let p = 0; p < l; p++) {
      let d = t[a++] ^ qt(i, c, e, o, r, n),
        h = t[a++] ^ qt(i, c, n, e, o, r),
        w = t[a++] ^ qt(i, c, r, n, e, o),
        b = t[a++] ^ qt(i, c, o, r, n, e)
      ;((e = d), (n = h), (r = w), (o = b))
    }
    let f = t[a++] ^ mt(s, e, o, r, n),
      u = t[a++] ^ mt(s, n, e, o, r),
      g = t[a++] ^ mt(s, r, n, e, o),
      y = t[a++] ^ mt(s, o, r, n, e)
    return { s0: f, s1: u, s2: g, s3: y }
  }
  function se(t, e) {
    if (!e) return new Uint8Array(t)
    if ((N(e), e.length < t))
      throw new Error(`aes: wrong destination length, expected at least ${t}, got: ${e.length}`)
    return e
  }
  function Di(t, e, n, r) {
    ;(N(e, F), N(n))
    let o = n.length
    r = se(o, r)
    let s = e,
      i = P(s),
      { s0: c, s1: a, s2: l, s3: f } = at(t, i[0], i[1], i[2], i[3]),
      u = P(n),
      g = P(r)
    for (let p = 0; p + 4 <= u.length; p += 4) {
      ;((g[p + 0] = u[p + 0] ^ c),
        (g[p + 1] = u[p + 1] ^ a),
        (g[p + 2] = u[p + 2] ^ l),
        (g[p + 3] = u[p + 3] ^ f))
      let d = 1
      for (let h = s.length - 1; h >= 0; h--)
        ((d = (d + (s[h] & 255)) | 0), (s[h] = d & 255), (d >>>= 8))
      ;({ s0: c, s1: a, s2: l, s3: f } = at(t, i[0], i[1], i[2], i[3]))
    }
    let y = F * Math.floor(u.length / Mn)
    if (y < o) {
      let p = new Uint32Array([c, a, l, f]),
        d = qe(p)
      for (let h = y, w = 0; h < o; h++, w++) r[h] = n[h] ^ d[w]
    }
    return r
  }
  function he(t, e, n, r, o) {
    ;(N(n, F), N(r), (o = se(r.length, o)))
    let s = n,
      i = P(s),
      c = Mt(s),
      a = P(r),
      l = P(o),
      f = e ? 0 : 12,
      u = r.length,
      g = c.getUint32(f, e),
      { s0: y, s1: p, s2: d, s3: h } = at(t, i[0], i[1], i[2], i[3])
    for (let b = 0; b + 4 <= a.length; b += 4)
      ((l[b + 0] = a[b + 0] ^ y),
        (l[b + 1] = a[b + 1] ^ p),
        (l[b + 2] = a[b + 2] ^ d),
        (l[b + 3] = a[b + 3] ^ h),
        (g = (g + 1) >>> 0),
        c.setUint32(f, g, e),
        ({ s0: y, s1: p, s2: d, s3: h } = at(t, i[0], i[1], i[2], i[3])))
    let w = F * Math.floor(a.length / Mn)
    if (w < u) {
      let b = new Uint32Array([y, p, d, h]),
        E = qe(b)
      for (let A = w, _ = 0; A < u; A++, _++) o[A] = r[A] ^ E[_]
    }
    return o
  }
  var hu = wt({ blockSize: 16, nonceLength: 16 }, function (e, n) {
    ;(N(e), N(n, F))
    function r(o, s) {
      let i = Vt(e),
        c = n.slice(),
        a = Di(i, c, o, s)
      return (i.fill(0), c.fill(0), a)
    }
    return { encrypt: (o, s) => r(o, s), decrypt: (o, s) => r(o, s) }
  })
  function po(t) {
    if ((N(t), t.length % F !== 0))
      throw new Error(`aes/(cbc-ecb).decrypt ciphertext should consist of blocks with size ${F}`)
  }
  function go(t, e, n) {
    let r = t.length,
      o = r % F
    if (!e && o !== 0) throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding')
    let s = P(t)
    if (e) {
      let a = F - o
      ;(a || (a = F), (r = r + a))
    }
    let i = se(r, n),
      c = P(i)
    return { b: s, o: c, out: i }
  }
  function yo(t, e) {
    if (!e) return t
    let n = t.length
    if (!n) throw new Error('aes/pcks5: empty ciphertext not allowed')
    let r = t[n - 1]
    if (r <= 0 || r > 16) throw new Error(`aes/pcks5: wrong padding byte: ${r}`)
    let o = t.subarray(0, -r)
    for (let s = 0; s < r; s++) if (t[n - s - 1] !== r) throw new Error('aes/pcks5: wrong padding')
    return o
  }
  function wo(t) {
    let e = new Uint8Array(16),
      n = P(e)
    e.set(t)
    let r = F - t.length
    for (let o = F - r; o < F; o++) e[o] = r
    return n
  }
  var pu = wt({ blockSize: 16 }, function (e, n = {}) {
      N(e)
      let r = !n.disablePadding
      return {
        encrypt: (o, s) => {
          N(o)
          let { b: i, o: c, out: a } = go(o, r, s),
            l = Vt(e),
            f = 0
          for (; f + 4 <= i.length; ) {
            let { s0: u, s1: g, s2: y, s3: p } = at(l, i[f + 0], i[f + 1], i[f + 2], i[f + 3])
            ;((c[f++] = u), (c[f++] = g), (c[f++] = y), (c[f++] = p))
          }
          if (r) {
            let u = wo(o.subarray(f * 4)),
              { s0: g, s1: y, s2: p, s3: d } = at(l, u[0], u[1], u[2], u[3])
            ;((c[f++] = g), (c[f++] = y), (c[f++] = p), (c[f++] = d))
          }
          return (l.fill(0), a)
        },
        decrypt: (o, s) => {
          po(o)
          let i = uo(e),
            c = se(o.length, s),
            a = P(o),
            l = P(c)
          for (let f = 0; f + 4 <= a.length; ) {
            let { s0: u, s1: g, s2: y, s3: p } = ho(i, a[f + 0], a[f + 1], a[f + 2], a[f + 3])
            ;((l[f++] = u), (l[f++] = g), (l[f++] = y), (l[f++] = p))
          }
          return (i.fill(0), yo(c, r))
        },
      }
    }),
    Wn = wt({ blockSize: 16, nonceLength: 16 }, function (e, n, r = {}) {
      ;(N(e), N(n, 16))
      let o = !r.disablePadding
      return {
        encrypt: (s, i) => {
          let c = Vt(e),
            { b: a, o: l, out: f } = go(s, o, i),
            u = P(n),
            g = u[0],
            y = u[1],
            p = u[2],
            d = u[3],
            h = 0
          for (; h + 4 <= a.length; )
            ((g ^= a[h + 0]),
              (y ^= a[h + 1]),
              (p ^= a[h + 2]),
              (d ^= a[h + 3]),
              ({ s0: g, s1: y, s2: p, s3: d } = at(c, g, y, p, d)),
              (l[h++] = g),
              (l[h++] = y),
              (l[h++] = p),
              (l[h++] = d))
          if (o) {
            let w = wo(s.subarray(h * 4))
            ;((g ^= w[0]),
              (y ^= w[1]),
              (p ^= w[2]),
              (d ^= w[3]),
              ({ s0: g, s1: y, s2: p, s3: d } = at(c, g, y, p, d)),
              (l[h++] = g),
              (l[h++] = y),
              (l[h++] = p),
              (l[h++] = d))
          }
          return (c.fill(0), f)
        },
        decrypt: (s, i) => {
          po(s)
          let c = uo(e),
            a = P(n),
            l = se(s.length, i),
            f = P(s),
            u = P(l),
            g = a[0],
            y = a[1],
            p = a[2],
            d = a[3]
          for (let h = 0; h + 4 <= f.length; ) {
            let w = g,
              b = y,
              E = p,
              A = d
            ;((g = f[h + 0]), (y = f[h + 1]), (p = f[h + 2]), (d = f[h + 3]))
            let { s0: _, s1: T, s2: B, s3: L } = ho(c, g, y, p, d)
            ;((u[h++] = _ ^ w), (u[h++] = T ^ b), (u[h++] = B ^ E), (u[h++] = L ^ A))
          }
          return (c.fill(0), yo(l, o))
        },
      }
    }),
    gu = wt({ blockSize: 16, nonceLength: 16 }, function (e, n) {
      ;(N(e), N(n, 16))
      function r(o, s, i) {
        let c = Vt(e),
          a = o.length
        i = se(a, i)
        let l = P(o),
          f = P(i),
          u = s ? f : l,
          g = P(n),
          y = g[0],
          p = g[1],
          d = g[2],
          h = g[3]
        for (let b = 0; b + 4 <= l.length; ) {
          let { s0: E, s1: A, s2: _, s3: T } = at(c, y, p, d, h)
          ;((f[b + 0] = l[b + 0] ^ E),
            (f[b + 1] = l[b + 1] ^ A),
            (f[b + 2] = l[b + 2] ^ _),
            (f[b + 3] = l[b + 3] ^ T),
            (y = u[b++]),
            (p = u[b++]),
            (d = u[b++]),
            (h = u[b++]))
        }
        let w = F * Math.floor(l.length / Mn)
        if (w < a) {
          ;({ s0: y, s1: p, s2: d, s3: h } = at(c, y, p, d, h))
          let b = qe(new Uint32Array([y, p, d, h]))
          for (let E = w, A = 0; E < a; E++, A++) i[E] = o[E] ^ b[A]
          b.fill(0)
        }
        return (c.fill(0), i)
      }
      return { encrypt: (o, s) => r(o, !0, s), decrypt: (o, s) => r(o, !1, s) }
    })
  function bo(t, e, n, r, o) {
    let s = t.create(n, r.length + (o?.length || 0))
    ;(o && s.update(o), s.update(r))
    let i = new Uint8Array(16),
      c = Mt(i)
    return (
      o && Zt(c, 0, BigInt(o.length * 8), e),
      Zt(c, 8, BigInt(r.length * 8), e),
      s.update(i),
      s.digest()
    )
  }
  var yu = wt({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      if ((N(n), n.length === 0)) throw new Error('aes/gcm: empty nonce')
      let o = 16
      function s(c, a, l) {
        let f = bo(Pn, !1, c, l, r)
        for (let u = 0; u < a.length; u++) f[u] ^= a[u]
        return f
      }
      function i() {
        let c = Vt(e),
          a = We.slice(),
          l = We.slice()
        if ((he(c, !1, l, l, a), n.length === 12)) l.set(n)
        else {
          let u = We.slice(),
            g = Mt(u)
          ;(Zt(g, 8, BigInt(n.length * 8), !1), Pn.create(a).update(n).update(u).digestInto(l))
        }
        let f = he(c, !1, l, We)
        return { xk: c, authKey: a, counter: l, tagMask: f }
      }
      return {
        encrypt: c => {
          N(c)
          let { xk: a, authKey: l, counter: f, tagMask: u } = i(),
            g = new Uint8Array(c.length + o)
          he(a, !1, f, c, g)
          let y = s(l, u, g.subarray(0, g.length - o))
          return (g.set(y, c.length), a.fill(0), g)
        },
        decrypt: c => {
          if ((N(c), c.length < o)) throw new Error(`aes/gcm: ciphertext less than tagLen (${o})`)
          let { xk: a, authKey: l, counter: f, tagMask: u } = i(),
            g = c.subarray(0, -o),
            y = c.subarray(-o),
            p = s(l, u, g)
          if (!Kt(p, y)) throw new Error('aes/gcm: invalid ghash tag')
          let d = he(a, !1, f, g)
          return (l.fill(0), u.fill(0), a.fill(0), d)
        },
      }
    }),
    De = (t, e, n) => r => {
      if (!Number.isSafeInteger(r) || e > r || r > n)
        throw new Error(`${t}: invalid value=${r}, must be [${e}..${n}]`)
    },
    wu = wt({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      let s = De('AAD', 0, 68719476736),
        i = De('plaintext', 0, 2 ** 36),
        c = De('nonce', 12, 12),
        a = De('ciphertext', 16, 2 ** 36 + 16)
      ;(N(n), c(n.length), r && (N(r), s(r.length)))
      function l() {
        let g = e.length
        if (g !== 16 && g !== 24 && g !== 32)
          throw new Error(`key length must be 16, 24 or 32 bytes, got: ${g} bytes`)
        let y = Vt(e),
          p = new Uint8Array(g),
          d = new Uint8Array(16),
          h = P(n),
          w = 0,
          b = h[0],
          E = h[1],
          A = h[2],
          _ = 0
        for (let T of [d, p].map(P)) {
          let B = P(T)
          for (let L = 0; L < B.length; L += 2) {
            let { s0: C, s1: U } = at(y, w, b, E, A)
            ;((B[L + 0] = C), (B[L + 1] = U), (w = ++_))
          }
        }
        return (y.fill(0), { authKey: d, encKey: Vt(p) })
      }
      function f(g, y, p) {
        let d = bo(ao, !0, y, p, r)
        for (let _ = 0; _ < 12; _++) d[_] ^= n[_]
        d[15] &= 127
        let h = P(d),
          w = h[0],
          b = h[1],
          E = h[2],
          A = h[3]
        return (
          ({ s0: w, s1: b, s2: E, s3: A } = at(g, w, b, E, A)),
          (h[0] = w),
          (h[1] = b),
          (h[2] = E),
          (h[3] = A),
          d
        )
      }
      function u(g, y, p) {
        let d = y.slice()
        return ((d[15] |= 128), he(g, !0, d, p))
      }
      return {
        encrypt: g => {
          ;(N(g), i(g.length))
          let { encKey: y, authKey: p } = l(),
            d = f(y, p, g),
            h = new Uint8Array(g.length + 16)
          return (h.set(d, g.length), h.set(u(y, d, g)), y.fill(0), p.fill(0), h)
        },
        decrypt: g => {
          ;(N(g), a(g.length))
          let y = g.subarray(-16),
            { encKey: p, authKey: d } = l(),
            h = u(p, y, g.subarray(0, -16)),
            w = f(p, d, h)
          if ((p.fill(0), d.fill(0), !Kt(y, w))) throw new Error('invalid polyval tag')
          return h
        },
      }
    })
  var Y = (t, e) => (t[e++] & 255) | ((t[e++] & 255) << 8),
    Dn = class {
      constructor(e) {
        ;((this.blockLen = 16),
          (this.outputLen = 16),
          (this.buffer = new Uint8Array(16)),
          (this.r = new Uint16Array(10)),
          (this.h = new Uint16Array(10)),
          (this.pad = new Uint16Array(8)),
          (this.pos = 0),
          (this.finished = !1),
          (e = yt(e)),
          N(e, 32))
        let n = Y(e, 0),
          r = Y(e, 2),
          o = Y(e, 4),
          s = Y(e, 6),
          i = Y(e, 8),
          c = Y(e, 10),
          a = Y(e, 12),
          l = Y(e, 14)
        ;((this.r[0] = n & 8191),
          (this.r[1] = ((n >>> 13) | (r << 3)) & 8191),
          (this.r[2] = ((r >>> 10) | (o << 6)) & 7939),
          (this.r[3] = ((o >>> 7) | (s << 9)) & 8191),
          (this.r[4] = ((s >>> 4) | (i << 12)) & 255),
          (this.r[5] = (i >>> 1) & 8190),
          (this.r[6] = ((i >>> 14) | (c << 2)) & 8191),
          (this.r[7] = ((c >>> 11) | (a << 5)) & 8065),
          (this.r[8] = ((a >>> 8) | (l << 8)) & 8191),
          (this.r[9] = (l >>> 5) & 127))
        for (let f = 0; f < 8; f++) this.pad[f] = Y(e, 16 + 2 * f)
      }
      process(e, n, r = !1) {
        let o = r ? 0 : 2048,
          { h: s, r: i } = this,
          c = i[0],
          a = i[1],
          l = i[2],
          f = i[3],
          u = i[4],
          g = i[5],
          y = i[6],
          p = i[7],
          d = i[8],
          h = i[9],
          w = Y(e, n + 0),
          b = Y(e, n + 2),
          E = Y(e, n + 4),
          A = Y(e, n + 6),
          _ = Y(e, n + 8),
          T = Y(e, n + 10),
          B = Y(e, n + 12),
          L = Y(e, n + 14),
          C = s[0] + (w & 8191),
          U = s[1] + (((w >>> 13) | (b << 3)) & 8191),
          I = s[2] + (((b >>> 10) | (E << 6)) & 8191),
          H = s[3] + (((E >>> 7) | (A << 9)) & 8191),
          $ = s[4] + (((A >>> 4) | (_ << 12)) & 8191),
          V = s[5] + ((_ >>> 1) & 8191),
          m = s[6] + (((_ >>> 14) | (T << 2)) & 8191),
          x = s[7] + (((T >>> 11) | (B << 5)) & 8191),
          k = s[8] + (((B >>> 8) | (L << 8)) & 8191),
          R = s[9] + ((L >>> 5) | o),
          v = 0,
          O = v + C * c + U * (5 * h) + I * (5 * d) + H * (5 * p) + $ * (5 * y)
        ;((v = O >>> 13),
          (O &= 8191),
          (O += V * (5 * g) + m * (5 * u) + x * (5 * f) + k * (5 * l) + R * (5 * a)),
          (v += O >>> 13),
          (O &= 8191))
        let q = v + C * a + U * c + I * (5 * h) + H * (5 * d) + $ * (5 * p)
        ;((v = q >>> 13),
          (q &= 8191),
          (q += V * (5 * y) + m * (5 * g) + x * (5 * u) + k * (5 * f) + R * (5 * l)),
          (v += q >>> 13),
          (q &= 8191))
        let M = v + C * l + U * a + I * c + H * (5 * h) + $ * (5 * d)
        ;((v = M >>> 13),
          (M &= 8191),
          (M += V * (5 * p) + m * (5 * y) + x * (5 * g) + k * (5 * u) + R * (5 * f)),
          (v += M >>> 13),
          (M &= 8191))
        let G = v + C * f + U * l + I * a + H * c + $ * (5 * h)
        ;((v = G >>> 13),
          (G &= 8191),
          (G += V * (5 * d) + m * (5 * p) + x * (5 * y) + k * (5 * g) + R * (5 * u)),
          (v += G >>> 13),
          (G &= 8191))
        let X = v + C * u + U * f + I * l + H * a + $ * c
        ;((v = X >>> 13),
          (X &= 8191),
          (X += V * (5 * h) + m * (5 * d) + x * (5 * p) + k * (5 * y) + R * (5 * g)),
          (v += X >>> 13),
          (X &= 8191))
        let et = v + C * g + U * u + I * f + H * l + $ * a
        ;((v = et >>> 13),
          (et &= 8191),
          (et += V * c + m * (5 * h) + x * (5 * d) + k * (5 * p) + R * (5 * y)),
          (v += et >>> 13),
          (et &= 8191))
        let ot = v + C * y + U * g + I * u + H * f + $ * l
        ;((v = ot >>> 13),
          (ot &= 8191),
          (ot += V * a + m * c + x * (5 * h) + k * (5 * d) + R * (5 * p)),
          (v += ot >>> 13),
          (ot &= 8191))
        let Q = v + C * p + U * y + I * g + H * u + $ * f
        ;((v = Q >>> 13),
          (Q &= 8191),
          (Q += V * l + m * a + x * c + k * (5 * h) + R * (5 * d)),
          (v += Q >>> 13),
          (Q &= 8191))
        let ht = v + C * d + U * p + I * y + H * g + $ * u
        ;((v = ht >>> 13),
          (ht &= 8191),
          (ht += V * f + m * l + x * a + k * c + R * (5 * h)),
          (v += ht >>> 13),
          (ht &= 8191))
        let tt = v + C * h + U * d + I * p + H * y + $ * g
        ;((v = tt >>> 13),
          (tt &= 8191),
          (tt += V * u + m * f + x * l + k * a + R * c),
          (v += tt >>> 13),
          (tt &= 8191),
          (v = ((v << 2) + v) | 0),
          (v = (v + O) | 0),
          (O = v & 8191),
          (v = v >>> 13),
          (q += v),
          (s[0] = O),
          (s[1] = q),
          (s[2] = M),
          (s[3] = G),
          (s[4] = X),
          (s[5] = et),
          (s[6] = ot),
          (s[7] = Q),
          (s[8] = ht),
          (s[9] = tt))
      }
      finalize() {
        let { h: e, pad: n } = this,
          r = new Uint16Array(10),
          o = e[1] >>> 13
        e[1] &= 8191
        for (let c = 2; c < 10; c++) ((e[c] += o), (o = e[c] >>> 13), (e[c] &= 8191))
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
        for (let c = 1; c < 10; c++) ((r[c] = e[c] + o), (o = r[c] >>> 13), (r[c] &= 8191))
        r[9] -= 8192
        let s = (o ^ 1) - 1
        for (let c = 0; c < 10; c++) r[c] &= s
        s = ~s
        for (let c = 0; c < 10; c++) e[c] = (e[c] & s) | r[c]
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
        for (let c = 1; c < 8; c++)
          ((i = (((e[c] + n[c]) | 0) + (i >>> 16)) | 0), (e[c] = i & 65535))
      }
      update(e) {
        $t(this)
        let { buffer: n, blockLen: r } = this
        e = yt(e)
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
        ;($t(this), de(e, this), (this.finished = !0))
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
  function ji(t) {
    let e = (r, o) => t(o).update(yt(r)).digest(),
      n = t(new Uint8Array(32))
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = r => t(r)), e)
  }
  var mo = ji(t => new Dn(t))
  var Eo = t => Uint8Array.from(t.split('').map(e => e.charCodeAt(0))),
    zi = Eo('expand 16-byte k'),
    Ki = Eo('expand 32-byte k'),
    Zi = P(zi),
    vo = P(Ki),
    Au = vo.slice()
  function S(t, e) {
    return (t << e) | (t >>> (32 - e))
  }
  function jn(t) {
    return t.byteOffset % 4 === 0
  }
  var je = 64,
    Gi = 16,
    To = 2 ** 32 - 1,
    xo = new Uint32Array()
  function Ji(t, e, n, r, o, s, i, c) {
    let a = o.length,
      l = new Uint8Array(je),
      f = P(l),
      u = jn(o) && jn(s),
      g = u ? P(o) : xo,
      y = u ? P(s) : xo
    for (let p = 0; p < a; i++) {
      if ((t(e, n, r, f, i, c), i >= To)) throw new Error('arx: counter overflow')
      let d = Math.min(je, a - p)
      if (u && d === je) {
        let h = p / 4
        if (p % 4 !== 0) throw new Error('arx: invalid block position')
        for (let w = 0, b; w < Gi; w++) ((b = h + w), (y[b] = g[b] ^ f[w]))
        p += je
        continue
      }
      for (let h = 0, w; h < d; h++) ((w = p + h), (s[w] = o[w] ^ l[h]))
      p += d
    }
  }
  function zn(t, e) {
    let {
      allowShortKeys: n,
      extendNonceFn: r,
      counterLength: o,
      counterRight: s,
      rounds: i,
    } = io({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, e)
    if (typeof t != 'function') throw new Error('core must be a function')
    return (
      Me(o),
      Me(i),
      Rn(s),
      Rn(n),
      (c, a, l, f, u = 0) => {
        ;(N(c), N(a), N(l))
        let g = l.length
        if ((f || (f = new Uint8Array(g)), N(f), Me(u), u < 0 || u >= To))
          throw new Error('arx: counter overflow')
        if (f.length < g) throw new Error(`arx: output (${f.length}) is shorter than data (${g})`)
        let y = [],
          p = c.length,
          d,
          h
        if (p === 32) ((d = c.slice()), y.push(d), (h = vo))
        else if (p === 16 && n)
          ((d = new Uint8Array(32)), d.set(c), d.set(c, 16), (h = Zi), y.push(d))
        else throw new Error(`arx: invalid 32-byte key, got length=${p}`)
        jn(a) || ((a = a.slice()), y.push(a))
        let w = P(d)
        if (r) {
          if (a.length !== 24) throw new Error('arx: extended nonce must be 24 bytes')
          ;(r(h, w, P(a.subarray(0, 16)), w), (a = a.subarray(16)))
        }
        let b = 16 - o
        if (b !== a.length) throw new Error(`arx: nonce must be ${b} or 16 bytes`)
        if (b !== 12) {
          let A = new Uint8Array(12)
          ;(A.set(a, s ? 0 : 12 - a.length), (a = A), y.push(a))
        }
        let E = P(a)
        for (Ji(t, h, w, E, l, f, u, i); y.length > 0; ) y.pop().fill(0)
        return f
      }
    )
  }
  function So(t, e, n, r, o, s = 20) {
    let i = t[0],
      c = t[1],
      a = t[2],
      l = t[3],
      f = e[0],
      u = e[1],
      g = e[2],
      y = e[3],
      p = e[4],
      d = e[5],
      h = e[6],
      w = e[7],
      b = o,
      E = n[0],
      A = n[1],
      _ = n[2],
      T = i,
      B = c,
      L = a,
      C = l,
      U = f,
      I = u,
      H = g,
      $ = y,
      V = p,
      m = d,
      x = h,
      k = w,
      R = b,
      v = E,
      O = A,
      q = _
    for (let G = 0; G < s; G += 2)
      ((T = (T + U) | 0),
        (R = S(R ^ T, 16)),
        (V = (V + R) | 0),
        (U = S(U ^ V, 12)),
        (T = (T + U) | 0),
        (R = S(R ^ T, 8)),
        (V = (V + R) | 0),
        (U = S(U ^ V, 7)),
        (B = (B + I) | 0),
        (v = S(v ^ B, 16)),
        (m = (m + v) | 0),
        (I = S(I ^ m, 12)),
        (B = (B + I) | 0),
        (v = S(v ^ B, 8)),
        (m = (m + v) | 0),
        (I = S(I ^ m, 7)),
        (L = (L + H) | 0),
        (O = S(O ^ L, 16)),
        (x = (x + O) | 0),
        (H = S(H ^ x, 12)),
        (L = (L + H) | 0),
        (O = S(O ^ L, 8)),
        (x = (x + O) | 0),
        (H = S(H ^ x, 7)),
        (C = (C + $) | 0),
        (q = S(q ^ C, 16)),
        (k = (k + q) | 0),
        ($ = S($ ^ k, 12)),
        (C = (C + $) | 0),
        (q = S(q ^ C, 8)),
        (k = (k + q) | 0),
        ($ = S($ ^ k, 7)),
        (T = (T + I) | 0),
        (q = S(q ^ T, 16)),
        (x = (x + q) | 0),
        (I = S(I ^ x, 12)),
        (T = (T + I) | 0),
        (q = S(q ^ T, 8)),
        (x = (x + q) | 0),
        (I = S(I ^ x, 7)),
        (B = (B + H) | 0),
        (R = S(R ^ B, 16)),
        (k = (k + R) | 0),
        (H = S(H ^ k, 12)),
        (B = (B + H) | 0),
        (R = S(R ^ B, 8)),
        (k = (k + R) | 0),
        (H = S(H ^ k, 7)),
        (L = (L + $) | 0),
        (v = S(v ^ L, 16)),
        (V = (V + v) | 0),
        ($ = S($ ^ V, 12)),
        (L = (L + $) | 0),
        (v = S(v ^ L, 8)),
        (V = (V + v) | 0),
        ($ = S($ ^ V, 7)),
        (C = (C + U) | 0),
        (O = S(O ^ C, 16)),
        (m = (m + O) | 0),
        (U = S(U ^ m, 12)),
        (C = (C + U) | 0),
        (O = S(O ^ C, 8)),
        (m = (m + O) | 0),
        (U = S(U ^ m, 7)))
    let M = 0
    ;((r[M++] = (i + T) | 0),
      (r[M++] = (c + B) | 0),
      (r[M++] = (a + L) | 0),
      (r[M++] = (l + C) | 0),
      (r[M++] = (f + U) | 0),
      (r[M++] = (u + I) | 0),
      (r[M++] = (g + H) | 0),
      (r[M++] = (y + $) | 0),
      (r[M++] = (p + V) | 0),
      (r[M++] = (d + m) | 0),
      (r[M++] = (h + x) | 0),
      (r[M++] = (w + k) | 0),
      (r[M++] = (b + R) | 0),
      (r[M++] = (E + v) | 0),
      (r[M++] = (A + O) | 0),
      (r[M++] = (_ + q) | 0))
  }
  function Yi(t, e, n, r) {
    let o = t[0],
      s = t[1],
      i = t[2],
      c = t[3],
      a = e[0],
      l = e[1],
      f = e[2],
      u = e[3],
      g = e[4],
      y = e[5],
      p = e[6],
      d = e[7],
      h = n[0],
      w = n[1],
      b = n[2],
      E = n[3]
    for (let _ = 0; _ < 20; _ += 2)
      ((o = (o + a) | 0),
        (h = S(h ^ o, 16)),
        (g = (g + h) | 0),
        (a = S(a ^ g, 12)),
        (o = (o + a) | 0),
        (h = S(h ^ o, 8)),
        (g = (g + h) | 0),
        (a = S(a ^ g, 7)),
        (s = (s + l) | 0),
        (w = S(w ^ s, 16)),
        (y = (y + w) | 0),
        (l = S(l ^ y, 12)),
        (s = (s + l) | 0),
        (w = S(w ^ s, 8)),
        (y = (y + w) | 0),
        (l = S(l ^ y, 7)),
        (i = (i + f) | 0),
        (b = S(b ^ i, 16)),
        (p = (p + b) | 0),
        (f = S(f ^ p, 12)),
        (i = (i + f) | 0),
        (b = S(b ^ i, 8)),
        (p = (p + b) | 0),
        (f = S(f ^ p, 7)),
        (c = (c + u) | 0),
        (E = S(E ^ c, 16)),
        (d = (d + E) | 0),
        (u = S(u ^ d, 12)),
        (c = (c + u) | 0),
        (E = S(E ^ c, 8)),
        (d = (d + E) | 0),
        (u = S(u ^ d, 7)),
        (o = (o + l) | 0),
        (E = S(E ^ o, 16)),
        (p = (p + E) | 0),
        (l = S(l ^ p, 12)),
        (o = (o + l) | 0),
        (E = S(E ^ o, 8)),
        (p = (p + E) | 0),
        (l = S(l ^ p, 7)),
        (s = (s + f) | 0),
        (h = S(h ^ s, 16)),
        (d = (d + h) | 0),
        (f = S(f ^ d, 12)),
        (s = (s + f) | 0),
        (h = S(h ^ s, 8)),
        (d = (d + h) | 0),
        (f = S(f ^ d, 7)),
        (i = (i + u) | 0),
        (w = S(w ^ i, 16)),
        (g = (g + w) | 0),
        (u = S(u ^ g, 12)),
        (i = (i + u) | 0),
        (w = S(w ^ i, 8)),
        (g = (g + w) | 0),
        (u = S(u ^ g, 7)),
        (c = (c + a) | 0),
        (b = S(b ^ c, 16)),
        (y = (y + b) | 0),
        (a = S(a ^ y, 12)),
        (c = (c + a) | 0),
        (b = S(b ^ c, 8)),
        (y = (y + b) | 0),
        (a = S(a ^ y, 7)))
    let A = 0
    ;((r[A++] = o),
      (r[A++] = s),
      (r[A++] = i),
      (r[A++] = c),
      (r[A++] = h),
      (r[A++] = w),
      (r[A++] = b),
      (r[A++] = E))
  }
  var ze = zn(So, { counterRight: !1, counterLength: 4, allowShortKeys: !1 }),
    Xi = zn(So, { counterRight: !1, counterLength: 8, extendNonceFn: Yi, allowShortKeys: !1 })
  var Qi = new Uint8Array(16),
    Ao = (t, e) => {
      t.update(e)
      let n = e.length % 16
      n && t.update(Qi.subarray(n))
    },
    Fi = new Uint8Array(32)
  function Bo(t, e, n, r, o) {
    let s = t(e, n, Fi),
      i = mo.create(s)
    ;(o && Ao(i, o), Ao(i, r))
    let c = new Uint8Array(16),
      a = Mt(c)
    ;(Zt(a, 0, BigInt(o ? o.length : 0), !0), Zt(a, 8, BigInt(r.length), !0), i.update(c))
    let l = i.digest()
    return (s.fill(0), l)
  }
  var Lo = t => (e, n, r) => (
      N(e, 32),
      N(n),
      {
        encrypt: (s, i) => {
          let c = s.length,
            a = c + 16
          ;(i ? N(i, a) : (i = new Uint8Array(a)), t(e, n, s, i, 1))
          let l = Bo(t, e, n, i.subarray(0, -16), r)
          return (i.set(l, c), i)
        },
        decrypt: (s, i) => {
          let c = s.length,
            a = c - 16
          if (c < 16) throw new Error('encrypted data must be at least 16 bytes')
          i ? N(i, a) : (i = new Uint8Array(a))
          let l = s.subarray(0, -16),
            f = s.subarray(-16),
            u = Bo(t, e, n, l, r)
          if (!Kt(f, u)) throw new Error('invalid tag')
          return (t(e, n, l, i, 1), i)
        },
      }
    ),
    Iu = wt({ blockSize: 64, nonceLength: 12, tagLength: 16 }, Lo(ze)),
    Uu = wt({ blockSize: 64, nonceLength: 24, tagLength: 16 }, Lo(Xi))
  var Ke = class extends ee {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), rt.hash(e))
        let r = Ct(n)
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
        return (rt.exists(this), this.iHash.update(e), this)
      }
      digestInto(e) {
        ;(rt.exists(this),
          rt.bytes(e, this.outputLen),
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
        let { oHash: n, iHash: r, finished: o, destroyed: s, blockLen: i, outputLen: c } = this
        return (
          (e = e),
          (e.finished = o),
          (e.destroyed = s),
          (e.blockLen = i),
          (e.outputLen = c),
          (e.oHash = n._cloneInto(e.oHash)),
          (e.iHash = r._cloneInto(e.iHash)),
          e
        )
      }
      destroy() {
        ;((this.destroyed = !0), this.oHash.destroy(), this.iHash.destroy())
      }
    },
    ie = (t, e, n) => new Ke(t, e).update(n).digest()
  ie.create = (t, e) => new Ke(t, e)
  function _o(t, e, n) {
    return (rt.hash(t), n === void 0 && (n = new Uint8Array(t.outputLen)), ie(t, Ct(n), Ct(e)))
  }
  var Kn = new Uint8Array([0]),
    ko = new Uint8Array()
  function Io(t, e, n, r = 32) {
    if ((rt.hash(t), rt.number(r), r > 255 * t.outputLen))
      throw new Error('Length should be <= 255*HashLen')
    let o = Math.ceil(r / t.outputLen)
    n === void 0 && (n = ko)
    let s = new Uint8Array(o * t.outputLen),
      i = ie.create(t, e),
      c = i._cloneInto(),
      a = new Uint8Array(i.outputLen)
    for (let l = 0; l < o; l++)
      ((Kn[0] = l + 1),
        c
          .update(l === 0 ? ko : a)
          .update(n)
          .update(Kn)
          .digestInto(a),
        s.set(a, t.outputLen * l),
        i._cloneInto(c))
    return (i.destroy(), c.destroy(), a.fill(0), Kn.fill(0), s.slice(0, r))
  }
  var tc = Object.defineProperty,
    W = (t, e) => {
      for (var n in e) tc(t, n, { get: e[n], enumerable: !0 })
    },
    ce = Symbol('verified'),
    ec = t => t instanceof Object
  function Gn(t) {
    if (
      !ec(t) ||
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
  var nc = {}
  W(nc, {
    Queue: () => ic,
    QueueNode: () => Co,
    binarySearch: () => Jn,
    bytesToHex: () => j,
    hexToBytes: () => Tt,
    insertEventIntoAscendingList: () => sc,
    insertEventIntoDescendingList: () => oc,
    normalizeURL: () => rc,
    utf8Decoder: () => kt,
    utf8Encoder: () => dt,
  })
  var kt = new TextDecoder('utf-8'),
    dt = new TextEncoder()
  function rc(t) {
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
  function oc(t, e) {
    let [n, r] = Jn(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : o.created_at - e.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function sc(t, e) {
    let [n, r] = Jn(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : e.created_at - o.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function Jn(t, e) {
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
  var Co = class {
      constructor(t) {
        Xt(this, 'value')
        Xt(this, 'next', null)
        Xt(this, 'prev', null)
        this.value = t
      }
    },
    ic = class {
      constructor() {
        Xt(this, 'first')
        Xt(this, 'last')
        ;((this.first = null), (this.last = null))
      }
      enqueue(t) {
        let e = new Co(t)
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
    cc = class {
      generateSecretKey() {
        return te.utils.randomPrivateKey()
      }
      getPublicKey(t) {
        return j(te.getPublicKey(t))
      }
      finalizeEvent(t, e) {
        let n = t
        return (
          (n.pubkey = j(te.getPublicKey(e))),
          (n.id = Ze(n)),
          (n.sig = j(te.sign(Ze(n), e))),
          (n[ce] = !0),
          n
        )
      }
      verifyEvent(t) {
        if (typeof t[ce] == 'boolean') return t[ce]
        let e = Ze(t)
        if (e !== t.id) return ((t[ce] = !1), !1)
        try {
          let n = te.verify(t.sig, e, t.pubkey)
          return ((t[ce] = n), n)
        } catch {
          return ((t[ce] = !1), !1)
        }
      }
    }
  function ac(t) {
    if (!Gn(t)) throw new Error("can't serialize event with wrong or missing properties")
    return JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content])
  }
  function Ze(t) {
    let e = gt(dt.encode(ac(t)))
    return j(e)
  }
  var Je = new cc(),
    lc = Je.generateSecretKey,
    Yn = Je.getPublicKey,
    xt = Je.finalizeEvent,
    Xn = Je.verifyEvent,
    fc = {}
  W(fc, {
    Application: () => la,
    BadgeAward: () => bc,
    BadgeDefinition: () => na,
    BlockedRelaysList: () => qc,
    BookmarkList: () => Hc,
    Bookmarksets: () => Fc,
    Calendar: () => ya,
    CalendarEventRSVP: () => wa,
    ChannelCreation: () => Mo,
    ChannelHideMessage: () => Wo,
    ChannelMessage: () => Vo,
    ChannelMetadata: () => qo,
    ChannelMuteUser: () => Do,
    ClassifiedListing: () => da,
    ClientAuth: () => zo,
    CommunitiesList: () => $c,
    CommunityDefinition: () => xa,
    CommunityPostApproval: () => Sc,
    Contacts: () => gc,
    CreateOrUpdateProduct: () => sa,
    CreateOrUpdateStall: () => oa,
    Curationsets: () => ta,
    Date: () => pa,
    DirectMessageRelaysList: () => jc,
    DraftClassifiedListing: () => ha,
    DraftLong: () => ca,
    Emojisets: () => aa,
    EncryptedDirectMessage: () => yc,
    EventDeletion: () => wc,
    FileMetadata: () => xc,
    FileServerPreference: () => zc,
    Followsets: () => Yc,
    GenericRepost: () => nr,
    Genericlists: () => Xc,
    GiftWrap: () => jo,
    HTTPAuth: () => rr,
    Handlerinformation: () => ma,
    Handlerrecommendation: () => ba,
    Highlights: () => Cc,
    InterestsList: () => Wc,
    Interestsets: () => ra,
    JobFeedback: () => _c,
    JobRequest: () => Lc,
    JobResult: () => kc,
    Label: () => Bc,
    LightningPubRPC: () => Zc,
    LiveChatMessage: () => Ec,
    LiveEvent: () => fa,
    LongFormArticle: () => ia,
    Metadata: () => hc,
    Mutelist: () => Oc,
    NWCWalletInfo: () => Kc,
    NWCWalletRequest: () => Ko,
    NWCWalletResponse: () => Gc,
    NostrConnect: () => Jc,
    OpenTimestamps: () => mc,
    Pinlist: () => Nc,
    PrivateDirectMessage: () => $o,
    ProblemTracker: () => vc,
    ProfileBadges: () => ea,
    PublicChatsList: () => Mc,
    Reaction: () => er,
    RecommendRelay: () => pc,
    RelayList: () => Pc,
    Relaysets: () => Qc,
    Report: () => Tc,
    Reporting: () => Ac,
    Repost: () => tr,
    Seal: () => Ho,
    SearchRelaysList: () => Vc,
    ShortTextNote: () => Po,
    Time: () => ga,
    UserEmojiList: () => Dc,
    UserStatuses: () => ua,
    Zap: () => Rc,
    ZapGoal: () => Ic,
    ZapRequest: () => Uc,
    classifyKind: () => uc,
    isAddressableKind: () => Fn,
    isEphemeralKind: () => No,
    isKind: () => dc,
    isRegularKind: () => Oo,
    isReplaceableKind: () => Qn,
  })
  function Oo(t) {
    return (1e3 <= t && t < 1e4) || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(t)
  }
  function Qn(t) {
    return [0, 3].includes(t) || (1e4 <= t && t < 2e4)
  }
  function No(t) {
    return 2e4 <= t && t < 3e4
  }
  function Fn(t) {
    return 3e4 <= t && t < 4e4
  }
  function uc(t) {
    return Oo(t)
      ? 'regular'
      : Qn(t)
        ? 'replaceable'
        : No(t)
          ? 'ephemeral'
          : Fn(t)
            ? 'parameterized'
            : 'unknown'
  }
  function dc(t, e) {
    let n = e instanceof Array ? e : [e]
    return (Gn(t) && n.includes(t.kind)) || !1
  }
  var hc = 0,
    Po = 1,
    pc = 2,
    gc = 3,
    yc = 4,
    wc = 5,
    tr = 6,
    er = 7,
    bc = 8,
    Ho = 13,
    $o = 14,
    nr = 16,
    Mo = 40,
    qo = 41,
    Vo = 42,
    Wo = 43,
    Do = 44,
    mc = 1040,
    jo = 1059,
    xc = 1063,
    Ec = 1311,
    vc = 1971,
    Tc = 1984,
    Ac = 1984,
    Bc = 1985,
    Sc = 4550,
    Lc = 5999,
    kc = 6999,
    _c = 7e3,
    Ic = 9041,
    Uc = 9734,
    Rc = 9735,
    Cc = 9802,
    Oc = 1e4,
    Nc = 10001,
    Pc = 10002,
    Hc = 10003,
    $c = 10004,
    Mc = 10005,
    qc = 10006,
    Vc = 10007,
    Wc = 10015,
    Dc = 10030,
    jc = 10050,
    zc = 10096,
    Kc = 13194,
    Zc = 21e3,
    zo = 22242,
    Ko = 23194,
    Gc = 23195,
    Jc = 24133,
    rr = 27235,
    Yc = 3e4,
    Xc = 30001,
    Qc = 30002,
    Fc = 30003,
    ta = 30004,
    ea = 30008,
    na = 30009,
    ra = 30015,
    oa = 30017,
    sa = 30018,
    ia = 30023,
    ca = 30024,
    aa = 30030,
    la = 30078,
    fa = 30311,
    ua = 30315,
    da = 30402,
    ha = 30403,
    pa = 31922,
    ga = 31923,
    ya = 31924,
    wa = 31925,
    ba = 31989,
    ma = 31990,
    xa = 34550
  var Ea = {}
  W(Ea, {
    getHex64: () => or,
    getInt: () => Zo,
    getSubscriptionId: () => va,
    matchEventId: () => Ta,
    matchEventKind: () => Ba,
    matchEventPubkey: () => Aa,
  })
  function or(t, e) {
    let n = e.length + 3,
      r = t.indexOf(`"${e}":`) + n,
      o = t.slice(r).indexOf('"') + r + 1
    return t.slice(o, o + 64)
  }
  function Zo(t, e) {
    let n = e.length,
      r = t.indexOf(`"${e}":`) + n + 3,
      o = t.slice(r),
      s = Math.min(o.indexOf(','), o.indexOf('}'))
    return parseInt(o.slice(0, s), 10)
  }
  function va(t) {
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
  function Ta(t, e) {
    return e === or(t, 'id')
  }
  function Aa(t, e) {
    return e === or(t, 'pubkey')
  }
  function Ba(t, e) {
    return e === Zo(t, 'kind')
  }
  var Sa = {}
  W(Sa, { makeAuthEvent: () => La })
  function La(t, e) {
    return {
      kind: zo,
      created_at: Math.floor(Date.now() / 1e3),
      tags: [
        ['relay', t],
        ['challenge', e],
      ],
      content: '',
    }
  }
  var ka
  try {
    ka = WebSocket
  } catch {}
  var _a
  try {
    _a = WebSocket
  } catch {}
  var sr = {}
  W(sr, {
    BECH32_REGEX: () => Go,
    Bech32MaxSize: () => ir,
    NostrTypeGuard: () => Ia,
    decode: () => Ye,
    decodeNostrURI: () => Ra,
    encodeBytes: () => Qe,
    naddrEncode: () => $a,
    neventEncode: () => Ha,
    noteEncode: () => Na,
    nprofileEncode: () => Pa,
    npubEncode: () => Oa,
    nsecEncode: () => Ca,
  })
  var Ia = {
      isNProfile: t => /^nprofile1[a-z\d]+$/.test(t || ''),
      isNEvent: t => /^nevent1[a-z\d]+$/.test(t || ''),
      isNAddr: t => /^naddr1[a-z\d]+$/.test(t || ''),
      isNSec: t => /^nsec1[a-z\d]{58}$/.test(t || ''),
      isNPub: t => /^npub1[a-z\d]{58}$/.test(t || ''),
      isNote: t => /^note1[a-z\d]+$/.test(t || ''),
      isNcryptsec: t => /^ncryptsec1[a-z\d]+$/.test(t || ''),
    },
    ir = 5e3,
    Go = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/
  function Ua(t) {
    let e = new Uint8Array(4)
    return (
      (e[0] = (t >> 24) & 255),
      (e[1] = (t >> 16) & 255),
      (e[2] = (t >> 8) & 255),
      (e[3] = t & 255),
      e
    )
  }
  function Ra(t) {
    try {
      return (t.startsWith('nostr:') && (t = t.substring(6)), Ye(t))
    } catch {
      return { type: 'invalid', data: null }
    }
  }
  function Ye(t) {
    let { prefix: e, words: n } = Ht.decode(t, ir),
      r = new Uint8Array(Ht.fromWords(n))
    switch (e) {
      case 'nprofile': {
        let o = Zn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        return {
          type: 'nprofile',
          data: { pubkey: j(o[0][0]), relays: o[1] ? o[1].map(s => kt.decode(s)) : [] },
        }
      }
      case 'nevent': {
        let o = Zn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nevent')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        if (o[2] && o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (o[3] && o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'nevent',
          data: {
            id: j(o[0][0]),
            relays: o[1] ? o[1].map(s => kt.decode(s)) : [],
            author: o[2]?.[0] ? j(o[2][0]) : void 0,
            kind: o[3]?.[0] ? parseInt(j(o[3][0]), 16) : void 0,
          },
        }
      }
      case 'naddr': {
        let o = Zn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for naddr')
        if (!o[2]?.[0]) throw new Error('missing TLV 2 for naddr')
        if (o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (!o[3]?.[0]) throw new Error('missing TLV 3 for naddr')
        if (o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'naddr',
          data: {
            identifier: kt.decode(o[0][0]),
            pubkey: j(o[2][0]),
            kind: parseInt(j(o[3][0]), 16),
            relays: o[1] ? o[1].map(s => kt.decode(s)) : [],
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
  function Zn(t) {
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
  function Ca(t) {
    return Qe('nsec', t)
  }
  function Oa(t) {
    return Qe('npub', Tt(t))
  }
  function Na(t) {
    return Qe('note', Tt(t))
  }
  function Xe(t, e) {
    let n = Ht.toWords(e)
    return Ht.encode(t, n, ir)
  }
  function Qe(t, e) {
    return Xe(t, e)
  }
  function Pa(t) {
    let e = cr({ 0: [Tt(t.pubkey)], 1: (t.relays || []).map(n => dt.encode(n)) })
    return Xe('nprofile', e)
  }
  function Ha(t) {
    let e
    t.kind !== void 0 && (e = Ua(t.kind))
    let n = cr({
      0: [Tt(t.id)],
      1: (t.relays || []).map(r => dt.encode(r)),
      2: t.author ? [Tt(t.author)] : [],
      3: e ? [new Uint8Array(e)] : [],
    })
    return Xe('nevent', n)
  }
  function $a(t) {
    let e = new ArrayBuffer(4)
    new DataView(e).setUint32(0, t.kind, !1)
    let n = cr({
      0: [dt.encode(t.identifier)],
      1: (t.relays || []).map(r => dt.encode(r)),
      2: [Tt(t.pubkey)],
      3: [new Uint8Array(e)],
    })
    return Xe('naddr', n)
  }
  function cr(t) {
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
      ne(...e)
    )
  }
  var Ma = {}
  W(Ma, { decrypt: () => qa, encrypt: () => Jo })
  function Jo(t, e, n) {
    let r = t instanceof Uint8Array ? j(t) : t,
      o = Rt.getSharedSecret(r, '02' + e),
      s = Yo(o),
      i = Uint8Array.from(Oe(16)),
      c = dt.encode(n),
      a = Wn(s, i).encrypt(c),
      l = it.encode(new Uint8Array(a)),
      f = it.encode(new Uint8Array(i.buffer))
    return `${l}?iv=${f}`
  }
  function qa(t, e, n) {
    let r = t instanceof Uint8Array ? j(t) : t,
      [o, s] = n.split('?iv='),
      i = Rt.getSharedSecret(r, '02' + e),
      c = Yo(i),
      a = it.decode(s),
      l = it.decode(o),
      f = Wn(c, a).decrypt(l)
    return kt.decode(f)
  }
  function Yo(t) {
    return t.slice(1, 33)
  }
  var Va = {}
  W(Va, {
    NIP05_REGEX: () => ar,
    isNip05: () => Wa,
    isValid: () => za,
    queryProfile: () => Xo,
    searchDomain: () => ja,
    useFetchImplementation: () => Da,
  })
  var ar = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/,
    Wa = t => ar.test(t || ''),
    Fe
  try {
    Fe = fetch
  } catch {}
  function Da(t) {
    Fe = t
  }
  async function ja(t, e = '') {
    try {
      let n = `https://${t}/.well-known/nostr.json?name=${e}`,
        r = await Fe(n, { redirect: 'manual' })
      if (r.status !== 200) throw Error('Wrong response code')
      return (await r.json()).names
    } catch {
      return {}
    }
  }
  async function Xo(t) {
    let e = t.match(ar)
    if (!e) return null
    let [, n = '_', r] = e
    try {
      let o = `https://${r}/.well-known/nostr.json?name=${n}`,
        s = await Fe(o, { redirect: 'manual' })
      if (s.status !== 200) throw Error('Wrong response code')
      let i = await s.json(),
        c = i.names[n]
      return c ? { pubkey: c, relays: i.relays?.[c] } : null
    } catch {
      return null
    }
  }
  async function za(t, e) {
    let n = await Xo(e)
    return n ? n.pubkey === t : !1
  }
  var Ka = {}
  W(Ka, { parse: () => Za })
  function Za(t) {
    let e = { reply: void 0, root: void 0, mentions: [], profiles: [], quotes: [] },
      n,
      r
    for (let o = t.tags.length - 1; o >= 0; o--) {
      let s = t.tags[o]
      if (s[0] === 'e' && s[1]) {
        let [i, c, a, l, f] = s,
          u = { id: c, relays: a ? [a] : [], author: f }
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
        let [i, c, a] = s
        e.quotes.push({ id: c, relays: a ? [a] : [] })
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
          let i = e.profiles.find(c => c.pubkey === o.author)
          i &&
            i.relays &&
            (o.relays || (o.relays = []),
            i.relays.forEach(c => {
              o.relays?.indexOf(c) === -1 && o.relays.push(c)
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
  var Ga = {}
  W(Ga, { fetchRelayInformation: () => Ya, useFetchImplementation: () => Ja })
  var Qo
  try {
    Qo = fetch
  } catch {}
  function Ja(t) {
    Qo = t
  }
  async function Ya(t) {
    return await (
      await fetch(t.replace('ws://', 'http://').replace('wss://', 'https://'), {
        headers: { Accept: 'application/nostr+json' },
      })
    ).json()
  }
  var Xa = {}
  W(Xa, { fastEventHash: () => ts, getPow: () => Fo, minePow: () => Qa })
  function Fo(t) {
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
  function Qa(t, e) {
    let n = 0,
      r = t,
      o = ['nonce', n.toString(), e.toString()]
    for (r.tags.push(o); ; ) {
      let s = Math.floor(new Date().getTime() / 1e3)
      if (
        (s !== r.created_at && ((n = 0), (r.created_at = s)),
        (o[1] = (++n).toString()),
        (r.id = ts(r)),
        Fo(r.id) >= e)
      )
        break
    }
    return r
  }
  function ts(t) {
    return j(gt(dt.encode(JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content]))))
  }
  var Fa = {}
  W(Fa, {
    unwrapEvent: () => ul,
    unwrapManyEvents: () => dl,
    wrapEvent: () => hs,
    wrapManyEvents: () => fl,
  })
  var tl = {}
  W(tl, {
    createRumor: () => ls,
    createSeal: () => fs,
    createWrap: () => us,
    unwrapEvent: () => hr,
    unwrapManyEvents: () => ds,
    wrapEvent: () => Ge,
    wrapManyEvents: () => al,
  })
  var el = {}
  W(el, { decrypt: () => dr, encrypt: () => ur, getConversationKey: () => lr, v2: () => il })
  var es = 1,
    ns = 65535
  function lr(t, e) {
    let n = Rt.getSharedSecret(t, '02' + e).subarray(1, 33)
    return _o(gt, n, 'nip44-v2')
  }
  function rs(t, e) {
    let n = Io(gt, t, e, 76)
    return {
      chacha_key: n.subarray(0, 32),
      chacha_nonce: n.subarray(32, 44),
      hmac_key: n.subarray(44, 76),
    }
  }
  function fr(t) {
    if (!Number.isSafeInteger(t) || t < 1) throw new Error('expected positive integer')
    if (t <= 32) return 32
    let e = 1 << (Math.floor(Math.log2(t - 1)) + 1),
      n = e <= 256 ? 32 : e / 8
    return n * (Math.floor((t - 1) / n) + 1)
  }
  function nl(t) {
    if (!Number.isSafeInteger(t) || t < es || t > ns)
      throw new Error('invalid plaintext size: must be between 1 and 65535 bytes')
    let e = new Uint8Array(2)
    return (new DataView(e.buffer).setUint16(0, t, !1), e)
  }
  function rl(t) {
    let e = dt.encode(t),
      n = e.length,
      r = nl(n),
      o = new Uint8Array(fr(n) - n)
    return ne(r, e, o)
  }
  function ol(t) {
    let e = new DataView(t.buffer).getUint16(0),
      n = t.subarray(2, 2 + e)
    if (e < es || e > ns || n.length !== e || t.length !== 2 + fr(e))
      throw new Error('invalid padding')
    return kt.decode(n)
  }
  function os(t, e, n) {
    if (n.length !== 32) throw new Error('AAD associated data must be 32 bytes')
    let r = ne(n, e)
    return ie(gt, t, r)
  }
  function sl(t) {
    if (typeof t != 'string') throw new Error('payload must be a valid string')
    let e = t.length
    if (e < 132 || e > 87472) throw new Error('invalid payload length: ' + e)
    if (t[0] === '#') throw new Error('unknown encryption version')
    let n
    try {
      n = it.decode(t)
    } catch (s) {
      throw new Error('invalid base64: ' + s.message)
    }
    let r = n.length
    if (r < 99 || r > 65603) throw new Error('invalid data length: ' + r)
    let o = n[0]
    if (o !== 2) throw new Error('unknown encryption version ' + o)
    return { nonce: n.subarray(1, 33), ciphertext: n.subarray(33, -32), mac: n.subarray(-32) }
  }
  function ur(t, e, n = Oe(32)) {
    let { chacha_key: r, chacha_nonce: o, hmac_key: s } = rs(e, n),
      i = rl(t),
      c = ze(r, o, i),
      a = os(s, c, n)
    return it.encode(ne(new Uint8Array([2]), n, c, a))
  }
  function dr(t, e) {
    let { nonce: n, ciphertext: r, mac: o } = sl(t),
      { chacha_key: s, chacha_nonce: i, hmac_key: c } = rs(e, n),
      a = os(c, r, n)
    if (!Kt(a, o)) throw new Error('invalid MAC')
    let l = ze(s, i, r)
    return ol(l)
  }
  var il = { utils: { getConversationKey: lr, calcPaddedLen: fr }, encrypt: ur, decrypt: dr },
    cl = 2880 * 60,
    ss = () => Math.round(Date.now() / 1e3),
    is = () => Math.round(ss() - Math.random() * cl),
    cs = (t, e) => lr(t, e),
    as = (t, e, n) => ur(JSON.stringify(t), cs(e, n)),
    Uo = (t, e) => JSON.parse(dr(t.content, cs(e, t.pubkey)))
  function ls(t, e) {
    let n = { created_at: ss(), content: '', tags: [], ...t, pubkey: Yn(e) }
    return ((n.id = Ze(n)), n)
  }
  function fs(t, e, n) {
    return xt({ kind: Ho, content: as(t, e, n), created_at: is(), tags: [] }, e)
  }
  function us(t, e) {
    let n = lc()
    return xt({ kind: jo, content: as(t, n, e), created_at: is(), tags: [['p', e]] }, n)
  }
  function Ge(t, e, n) {
    let r = ls(t, e),
      o = fs(r, e, n)
    return us(o, n)
  }
  function al(t, e, n) {
    if (!n || n.length === 0) throw new Error('At least one recipient is required.')
    let r = Yn(e),
      o = [Ge(t, e, r)]
    return (
      n.forEach(s => {
        o.push(Ge(t, e, s))
      }),
      o
    )
  }
  function hr(t, e) {
    let n = Uo(t, e)
    return Uo(n, e)
  }
  function ds(t, e) {
    let n = []
    return (
      t.forEach(r => {
        n.push(hr(r, e))
      }),
      n.sort((r, o) => r.created_at - o.created_at),
      n
    )
  }
  function ll(t, e, n, r) {
    let o = { created_at: Math.ceil(Date.now() / 1e3), kind: $o, tags: [], content: e }
    return (
      (Array.isArray(t) ? t : [t]).forEach(({ publicKey: i, relayUrl: c }) => {
        o.tags.push(c ? ['p', i, c] : ['p', i])
      }),
      r && o.tags.push(['e', r.eventId, r.relayUrl || '', 'reply']),
      n && o.tags.push(['subject', n]),
      o
    )
  }
  function hs(t, e, n, r, o) {
    let s = ll(e, n, r, o)
    return Ge(s, t, e.publicKey)
  }
  function fl(t, e, n, r, o) {
    if (!e || e.length === 0) throw new Error('At least one recipient is required.')
    return [{ publicKey: Yn(t) }, ...e].map(i => hs(t, i, n, r, o))
  }
  var ul = hr,
    dl = ds,
    hl = {}
  W(hl, {
    finishRepostEvent: () => pl,
    getRepostedEvent: () => gl,
    getRepostedEventPointer: () => ps,
  })
  function pl(t, e, n, r) {
    let o,
      s = [...(t.tags ?? []), ['e', e.id, n], ['p', e.pubkey]]
    return (
      e.kind === Po ? (o = tr) : ((o = nr), s.push(['k', String(e.kind)])),
      xt(
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
  function ps(t) {
    if (![tr, nr].includes(t.kind)) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (e !== void 0)
      return { id: e[1], relays: [e[2], n?.[2]].filter(r => typeof r == 'string'), author: n?.[1] }
  }
  function gl(t, { skipVerification: e } = {}) {
    let n = ps(t)
    if (n === void 0 || t.content === '') return
    let r
    try {
      r = JSON.parse(t.content)
    } catch {
      return
    }
    if (r.id === n.id && !(!e && !Xn(r))) return r
  }
  var yl = {}
  W(yl, { NOSTR_URI_REGEX: () => pr, parse: () => bl, test: () => wl })
  var pr = new RegExp(`nostr:(${Go.source})`)
  function wl(t) {
    return typeof t == 'string' && new RegExp(`^${pr.source}$`).test(t)
  }
  function bl(t) {
    let e = t.match(new RegExp(`^${pr.source}$`))
    if (!e) throw new Error(`Invalid Nostr URI: ${t}`)
    return { uri: e[0], value: e[1], decoded: Ye(e[1]) }
  }
  var ml = {}
  W(ml, { finishReactionEvent: () => xl, getReactedEventPointer: () => El })
  function xl(t, e, n) {
    let r = e.tags.filter(o => o.length >= 2 && (o[0] === 'e' || o[0] === 'p'))
    return xt(
      {
        ...t,
        kind: er,
        tags: [...(t.tags ?? []), ...r, ['e', e.id], ['p', e.pubkey]],
        content: t.content ?? '+',
      },
      n
    )
  }
  function El(t) {
    if (t.kind !== er) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (!(e === void 0 || n === void 0))
      return { id: e[1], relays: [e[2], n[2]].filter(r => r !== void 0), author: n[1] }
  }
  var vl = {}
  W(vl, { parse: () => Al })
  var Tl = /\W/m,
    Ro = /\W |\W$|$|,| /m
  function* Al(t) {
    let e = t.length,
      n = 0,
      r = 0
    for (; r < e; ) {
      let o = t.indexOf(':', r)
      if (o === -1) break
      if (t.substring(o - 5, o) === 'nostr') {
        let s = t.substring(o + 60).match(Tl),
          i = s ? o + 60 + s.index : e
        try {
          let c,
            { data: a, type: l } = Ye(t.substring(o + 1, i))
          switch (l) {
            case 'npub':
              c = { pubkey: a }
              break
            case 'nsec':
            case 'note':
              r = i + 1
              continue
            default:
              c = a
          }
          ;(n !== o - 5 && (yield { type: 'text', text: t.substring(n, o - 5) }),
            yield { type: 'reference', pointer: c },
            (r = i),
            (n = r))
          continue
        } catch {
          r = o + 1
          continue
        }
      } else if (t.substring(o - 5, o) === 'https' || t.substring(o - 4, o) === 'http') {
        let s = t.substring(o + 4).match(Ro),
          i = s ? o + 4 + s.index : e,
          c = t[o - 1] === 's' ? 5 : 4
        try {
          let a = new URL(t.substring(o - c, i))
          if (a.hostname.indexOf('.') === -1) throw new Error('invalid url')
          if (
            (n !== o - c && (yield { type: 'text', text: t.substring(n, o - c) }),
            /\.(png|jpe?g|gif|webp)$/i.test(a.pathname))
          ) {
            ;(yield { type: 'image', url: a.toString() }, (r = i), (n = r))
            continue
          }
          if (/\.(mp4|avi|webm|mkv)$/i.test(a.pathname)) {
            ;(yield { type: 'video', url: a.toString() }, (r = i), (n = r))
            continue
          }
          if (/\.(mp3|aac|ogg|opus)$/i.test(a.pathname)) {
            ;(yield { type: 'audio', url: a.toString() }, (r = i), (n = r))
            continue
          }
          ;(yield { type: 'url', url: a.toString() }, (r = i), (n = r))
          continue
        } catch {
          r = i + 1
          continue
        }
      } else if (t.substring(o - 3, o) === 'wss' || t.substring(o - 2, o) === 'ws') {
        let s = t.substring(o + 4).match(Ro),
          i = s ? o + 4 + s.index : e,
          c = t[o - 1] === 's' ? 3 : 2
        try {
          let a = new URL(t.substring(o - c, i))
          if (a.hostname.indexOf('.') === -1) throw new Error('invalid ws url')
          ;(n !== o - c && (yield { type: 'text', text: t.substring(n, o - c) }),
            yield { type: 'relay', url: a.toString() },
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
  var Bl = {}
  W(Bl, {
    channelCreateEvent: () => Sl,
    channelHideMessageEvent: () => _l,
    channelMessageEvent: () => kl,
    channelMetadataEvent: () => Ll,
    channelMuteUserEvent: () => Il,
  })
  var Sl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xt({ kind: Mo, tags: [...(t.tags ?? [])], content: n, created_at: t.created_at }, e)
    },
    Ll = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xt(
        {
          kind: qo,
          tags: [['e', t.channel_create_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    kl = (t, e) => {
      let n = [['e', t.channel_create_event_id, t.relay_url, 'root']]
      return (
        t.reply_to_channel_message_event_id &&
          n.push(['e', t.reply_to_channel_message_event_id, t.relay_url, 'reply']),
        xt(
          {
            kind: Vo,
            tags: [...n, ...(t.tags ?? [])],
            content: t.content,
            created_at: t.created_at,
          },
          e
        )
      )
    },
    _l = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xt(
        {
          kind: Wo,
          tags: [['e', t.channel_message_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Il = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xt(
        {
          kind: Do,
          tags: [['p', t.pubkey_to_mute], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Ul = {}
  W(Ul, {
    EMOJI_SHORTCODE_REGEX: () => gs,
    matchAll: () => Rl,
    regex: () => gr,
    replaceAll: () => Cl,
  })
  var gs = /:(\w+):/,
    gr = () => new RegExp(`\\B${gs.source}\\B`, 'g')
  function* Rl(t) {
    let e = t.matchAll(gr())
    for (let n of e)
      try {
        let [r, o] = n
        yield { shortcode: r, name: o, start: n.index, end: n.index + r.length }
      } catch {}
  }
  function Cl(t, e) {
    return t.replaceAll(gr(), (n, r) => e({ shortcode: n, name: r }))
  }
  var Ol = {}
  W(Ol, { useFetchImplementation: () => Nl, validateGithub: () => Pl })
  var yr
  try {
    yr = fetch
  } catch {}
  function Nl(t) {
    yr = t
  }
  async function Pl(t, e, n) {
    try {
      return (
        (await (await yr(`https://gist.github.com/${e}/${n}/raw`)).text()) ===
        `Verifying that I control the following Nostr public key: ${t}`
      )
    } catch {
      return !1
    }
  }
  var Hl = {}
  W(Hl, { makeNwcRequestEvent: () => Ml, parseConnectionString: () => $l })
  function $l(t) {
    let { host: e, pathname: n, searchParams: r } = new URL(t),
      o = n || e,
      s = r.get('relay'),
      i = r.get('secret')
    if (!o || !s || !i) throw new Error('invalid connection string')
    return { pubkey: o, relay: s, secret: i }
  }
  async function Ml(t, e, n) {
    let o = Jo(e, t, JSON.stringify({ method: 'pay_invoice', params: { invoice: n } })),
      s = { kind: Ko, created_at: Math.round(Date.now() / 1e3), content: o, tags: [['p', t]] }
    return xt(s, e)
  }
  var ql = {}
  W(ql, { normalizeIdentifier: () => Vl })
  function Vl(t) {
    return (
      (t = t.trim().toLowerCase()),
      (t = t.normalize('NFKC')),
      Array.from(t)
        .map(e => (/\p{Letter}/u.test(e) || /\p{Number}/u.test(e) ? e : '-'))
        .join('')
    )
  }
  var Wl = {}
  W(Wl, {
    getSatoshisAmountFromBolt11: () => Gl,
    getZapEndpoint: () => jl,
    makeZapReceipt: () => Zl,
    makeZapRequest: () => zl,
    useFetchImplementation: () => Dl,
    validateZapRequest: () => Kl,
  })
  var wr
  try {
    wr = fetch
  } catch {}
  function Dl(t) {
    wr = t
  }
  async function jl(t) {
    try {
      let e = '',
        { lud06: n, lud16: r } = JSON.parse(t.content)
      if (r) {
        let [i, c] = r.split('@')
        e = new URL(`/.well-known/lnurlp/${i}`, `https://${c}`).toString()
      } else if (n) {
        let { words: i } = Ht.decode(n, 1e3),
          c = Ht.fromWords(i)
        e = kt.decode(c)
      } else return null
      let s = await (await wr(e)).json()
      if (s.allowsNostr && s.nostrPubkey) return s.callback
    } catch {}
    return null
  }
  function zl(t) {
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
      if ((e.tags.push(['e', t.event.id]), Qn(t.event.kind))) {
        let n = ['a', `${t.event.kind}:${t.event.pubkey}:`]
        e.tags.push(n)
      } else if (Fn(t.event.kind)) {
        let n = t.event.tags.find(([o, s]) => o === 'd' && s)
        if (!n) throw new Error('d tag not found or is empty')
        let r = ['a', `${t.event.kind}:${t.event.pubkey}:${n[1]}`]
        e.tags.push(r)
      }
      e.tags.push(['k', t.event.kind.toString()])
    }
    return e
  }
  function Kl(t) {
    let e
    try {
      e = JSON.parse(t)
    } catch {
      return 'Invalid zap request JSON.'
    }
    if (!Gn(e)) return 'Zap request is not a valid Nostr event.'
    if (!Xn(e)) return 'Invalid signature on zap request.'
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
  function Zl({ zapRequest: t, preimage: e, bolt11: n, paidAt: r }) {
    let o = JSON.parse(t),
      s = o.tags.filter(([c]) => c === 'e' || c === 'p' || c === 'a'),
      i = {
        kind: 9735,
        created_at: Math.round(r.getTime() / 1e3),
        content: '',
        tags: [...s, ['P', o.pubkey], ['bolt11', n], ['description', t]],
      }
    return (e && i.tags.push(['preimage', e]), i)
  }
  function Gl(t) {
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
      c = r.length - 1
    if ((i && c++, c < 1)) return 0
    let a = parseInt(r.substring(0, c))
    switch (o) {
      case 'm':
        return a * 1e5
      case 'u':
        return a * 100
      case 'n':
        return a / 10
      case 'p':
        return a / 1e4
      default:
        return a * 1e8
    }
  }
  var Jl = {}
  W(Jl, {
    getToken: () => Yl,
    hashPayload: () => br,
    unpackEventFromToken: () => ws,
    validateEvent: () => Ts,
    validateEventKind: () => ms,
    validateEventMethodTag: () => Es,
    validateEventPayloadTag: () => vs,
    validateEventTimestamp: () => bs,
    validateEventUrlTag: () => xs,
    validateToken: () => Xl,
  })
  var ys = 'Nostr '
  async function Yl(t, e, n, r = !1, o) {
    let s = {
      kind: rr,
      tags: [
        ['u', t],
        ['method', e],
      ],
      created_at: Math.round(new Date().getTime() / 1e3),
      content: '',
    }
    o && s.tags.push(['payload', br(o)])
    let i = await n(s)
    return (r ? ys : '') + it.encode(dt.encode(JSON.stringify(i)))
  }
  async function Xl(t, e, n) {
    let r = await ws(t).catch(s => {
      throw s
    })
    return await Ts(r, e, n).catch(s => {
      throw s
    })
  }
  async function ws(t) {
    if (!t) throw new Error('Missing token')
    t = t.replace(ys, '')
    let e = kt.decode(it.decode(t))
    if (!e || e.length === 0 || !e.startsWith('{')) throw new Error('Invalid token')
    return JSON.parse(e)
  }
  function bs(t) {
    return t.created_at ? Math.round(new Date().getTime() / 1e3) - t.created_at < 60 : !1
  }
  function ms(t) {
    return t.kind === rr
  }
  function xs(t, e) {
    let n = t.tags.find(r => r[0] === 'u')
    return n ? n.length > 0 && n[1] === e : !1
  }
  function Es(t, e) {
    let n = t.tags.find(r => r[0] === 'method')
    return n ? n.length > 0 && n[1].toLowerCase() === e.toLowerCase() : !1
  }
  function br(t) {
    let e = gt(dt.encode(JSON.stringify(t)))
    return j(e)
  }
  function vs(t, e) {
    let n = t.tags.find(o => o[0] === 'payload')
    if (!n) return !1
    let r = br(e)
    return n.length > 0 && n[1] === r
  }
  async function Ts(t, e, n, r) {
    if (!Xn(t)) throw new Error('Invalid nostr event, signature invalid')
    if (!ms(t)) throw new Error('Invalid nostr event, kind invalid')
    if (!bs(t)) throw new Error('Invalid nostr event, created_at timestamp invalid')
    if (!xs(t, e)) throw new Error('Invalid nostr event, url tag invalid')
    if (!Es(t, n)) throw new Error('Invalid nostr event, method tag invalid')
    if (r && typeof r == 'object' && Object.keys(r).length > 0 && !vs(t, r))
      throw new Error('Invalid nostr event, payload tag does not match request body hash')
    return !0
  }
  function As(t) {
    try {
      let e = sr.decode(t)
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
  function Ql() {
    return ['wss://relay.divine.video', 'wss://relay.nostr.band', 'wss://relay.damus.io']
  }
  function Bs(t = [], e = []) {
    let n = [...e, ...t, ...Ql()]
    return [...new Set(n)]
  }
  var tn = class {
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
            c => (console.warn(`[Nostr Client] Failed to connect to ${i}:`, c.message), null)
          )
        ),
        s = (await Promise.all(o)).filter(Boolean)
      if (s.length === 0) throw new Error('Failed to connect to any relay')
      return (
        console.log(`[Nostr Client] Connected to ${s.length}/${this.relays.length} relays`),
        new Promise((i, c) => {
          let a = !1,
            l = setTimeout(() => {
              a || ((a = !0), this.closeSubscription(n), c(new Error('Event not found (timeout)')))
            }, 1e4)
          s.forEach(f => {
            let u = y => {
              try {
                let p = JSON.parse(y.data)
                if (p[0] === 'EVENT' && p[1] === n && !a) {
                  ;((a = !0), clearTimeout(l))
                  let d = p[2]
                  ;(console.log('[Nostr Client] Event received:', d),
                    this.closeSubscription(n),
                    i(d))
                }
                p[0] === 'EOSE' &&
                  p[1] === n &&
                  console.log('[Nostr Client] EOSE received from relay')
              } catch (p) {
                console.error('[Nostr Client] Failed to parse message:', p)
              }
            }
            ;(f.addEventListener('message', u),
              this.subscriptions.has(n) || this.subscriptions.set(n, []),
              this.subscriptions.get(n).push({ ws: f, handler: u }))
            let g = JSON.stringify(['REQ', n, r])
            ;(f.send(g), console.log('[Nostr Client] Sent REQ to relay:', g))
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
  function Ss(t) {
    let e = t.tags.filter(n => n[0] === 'imeta')
    return e.length > 0 ? Fl(t, e) : tf(t)
  }
  function Fl(t, e) {
    let n = e.map(f => ef(f)).filter(Boolean),
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
        let g = en(f)
        return en(u) - g
      }))
    let s =
        t.tags.find(f => f[0] === 'title')?.[1] ||
        t.tags.find(f => f[0] === 'alt')?.[1] ||
        t.content ||
        'Untitled Video',
      i = t.content || '',
      c = parseInt(t.tags.find(f => f[0] === 'duration')?.[1] || '0', 10),
      a = t.tags.find(f => f[0] === 'content-warning')?.[1],
      l = t.pubkey
    return {
      id: t.id,
      kind: t.kind,
      title: s,
      description: i,
      author: l,
      createdAt: t.created_at,
      duration: c,
      contentWarning: a,
      videoVariants: r,
      thumbnails: o,
    }
  }
  function tf(t) {
    let e = t.tags.find(u => u[0] === 'url')?.[1] || '',
      n = t.tags.find(u => u[0] === 'm')?.[1] || 'video/mp4',
      r = t.tags.find(u => u[0] === 'thumb')?.[1] || '',
      o = t.tags.find(u => u[0] === 'title')?.[1] || t.content || 'Untitled Video',
      s = t.tags.find(u => u[0] === 'description')?.[1] || t.content || '',
      i = parseInt(t.tags.find(u => u[0] === 'duration')?.[1] || '0', 10),
      c = t.tags.find(u => u[0] === 'content-warning')?.[1],
      a = t.tags.find(u => u[0] === 'dim')?.[1],
      l = e ? [{ url: e, mimeType: n, dimensions: a, fallbackUrls: [] }] : [],
      f = r ? [{ url: r, fallbackUrls: [] }] : []
    return {
      id: t.id,
      kind: t.kind,
      title: o,
      description: s,
      author: t.pubkey,
      createdAt: t.created_at,
      duration: i,
      contentWarning: c,
      videoVariants: l,
      thumbnails: f,
    }
  }
  function ef(t) {
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
  function en(t) {
    if (t.dimensions) {
      let e = t.dimensions.match(/x(\d+)/)
      if (e) return parseInt(e[1], 10)
    }
    return 0
  }
  function Ls(t, e = 'auto') {
    if (!t || t.length === 0) return null
    if (e === 'auto') return t[0]
    let n = parseInt(e, 10)
    if (isNaN(n)) return t[0]
    let r = t[0],
      o = Math.abs(en(r) - n)
    for (let s of t) {
      let i = en(s),
        c = Math.abs(i - n)
      c < o && ((r = s), (o = c))
    }
    return r
  }
  var pe = class {
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
        e.showControls && (n.controls = !0),
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
              o.fallbackUrls.forEach((c, a) => {
                let l = document.createElement('source')
                ;((l.src = c),
                  o.mimeType && (l.type = o.mimeType),
                  e.appendChild(l),
                  console.log(`[PlayerUI] Added fallback ${a + 1} for variant ${s + 1}: ${c}`))
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
  var nn = class t {
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
      let c = document.createElement('div')
      ;((c.className = 'content-warning-icon'),
        c.setAttribute('aria-hidden', 'true'),
        (c.textContent = '\u26A0\uFE0F'))
      let a = document.createElement('h2')
      ;((a.className = 'content-warning-heading'), (a.textContent = 'Sensitive Content'))
      let l = document.createElement('p')
      ;((l.className = 'content-warning-message'),
        (l.textContent = e || 'This video may contain sensitive content'))
      let f = document.createElement('button')
      return (
        (f.className = 'content-warning-button'),
        (f.textContent = 'Click to reveal'),
        f.setAttribute('type', 'button'),
        f.setAttribute('aria-label', 'Reveal sensitive content'),
        i.appendChild(c),
        i.appendChild(a),
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
        i.addEventListener('keydown', c => {
          ;(c.key === 'Enter' || c.key === ' ') && (c.preventDefault(), i.click())
        }),
        i.setAttribute('tabindex', '0'),
        i.setAttribute('role', 'button'),
        i.setAttribute('aria-label', 'Sensitive content warning. Press Enter to reveal.'),
        e.appendChild(i),
        console.log('[ContentWarning] Overlay applied successfully'))
    }
  }
  var rn = null
  async function ks() {
    console.log('[Nostube Embed] Initializing player...')
    try {
      let t = Tr(),
        e = Ar(t)
      if (!e.valid) {
        Gt(e.error)
        return
      }
      nf('Loading video...')
      let n = As(t.videoId)
      if (!n) {
        Gt('Failed to decode video identifier')
        return
      }
      let r = Bs(n.data.relays, t.customRelays)
      rn = new tn(r)
      let o = await rn.fetchEvent(n),
        s = Ss(o)
      console.log('[Nostube Embed] Parsed video:', s)
      let i = Ls(s.videoVariants, t.preferredQuality)
      if (!i) {
        Gt('No video URLs found in event')
        return
      }
      console.log('[Nostube Embed] Selected variant:', i)
      try {
        let c = pe.buildVideoPlayer(s, t),
          a = pe.createPlayerContainer(c)
        ;(nn.applyToPlayer(a, c, s),
          (document.body.innerHTML = ''),
          document.body.appendChild(a),
          c.addEventListener(
            'canplay',
            () => {
              console.log('[Nostube Embed] Player ready')
            },
            { once: !0 }
          ))
      } catch (c) {
        ;(console.error('[Nostube Embed] Player error:', c),
          Gt(`Failed to initialize player: ${c.message}`))
        return
      }
    } catch (t) {
      ;(console.error('[Nostube Embed] Error:', t),
        t.message.includes('timeout')
          ? Gt('Connection failed. Unable to fetch video.')
          : t.message.includes('not found')
            ? Gt('Video not found')
            : Gt(t.message))
    }
  }
  function nf(t) {
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
  function Gt(t) {
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
    rn && rn.closeAll()
  })
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ks) : ks()
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
