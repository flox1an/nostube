/* Nostube Embed Player v0.1.0 | https://nostube.com */
;(() => {
  var Tr = Object.defineProperty
  var Us = (e, t, n) =>
    t in e ? Tr(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (e[t] = n)
  var Rs = (e, t) => {
    for (var n in t) Tr(e, n, { get: t[n], enumerable: !0 })
  }
  var Xt = (e, t, n) => Us(e, typeof t != 'symbol' ? t + '' : t, n)
  function Br() {
    let e = new URLSearchParams(window.location.search)
    return {
      videoId: e.get('v') || '',
      autoplay: e.get('autoplay') === '1',
      muted: e.get('muted') === '1',
      loop: e.get('loop') === '1',
      startTime: parseInt(e.get('t') || '0', 10),
      controls: e.get('controls') !== '0',
      showTitle: e.get('title') !== '0',
      showBranding: e.get('branding') !== '0',
      preferredQuality: e.get('quality') || 'auto',
      customRelays: e.get('relays')
        ? e
            .get('relays')
            .split(',')
            .map(t => t.trim())
        : [],
      accentColor: e.get('color') || '8b5cf6',
    }
  }
  function Sr(e) {
    return e.videoId
      ? !e.videoId.startsWith('nevent1') &&
        !e.videoId.startsWith('naddr1') &&
        !e.videoId.startsWith('note1')
        ? {
            valid: !1,
            error: 'Invalid video ID format. Must be nevent1..., naddr1..., or note1...',
          }
        : { valid: !0 }
      : { valid: !1, error: 'Missing required parameter: v (video ID)' }
  }
  function kr(e) {
    if (!Number.isSafeInteger(e) || e < 0) throw new Error(`Wrong positive integer: ${e}`)
  }
  function an(e, ...t) {
    if (!(e instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (t.length > 0 && !t.includes(e.length))
      throw new Error(`Expected Uint8Array of length ${t}, not of length=${e.length}`)
  }
  function Lr(e) {
    if (typeof e != 'function' || typeof e.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(kr(e.outputLen), kr(e.blockLen))
  }
  function Qt(e, t = !0) {
    if (e.destroyed) throw new Error('Hash instance has been destroyed')
    if (t && e.finished) throw new Error('Hash#digest() has already been called')
  }
  function _r(e, t) {
    an(e)
    let n = t.outputLen
    if (e.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var ye = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Ir = e => e instanceof Uint8Array
  var we = e => new DataView(e.buffer, e.byteOffset, e.byteLength),
    lt = (e, t) => (e << (32 - t)) | (e >>> t),
    Cs = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Cs) throw new Error('Non little-endian hardware is not supported')
  function Ns(e) {
    if (typeof e != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof e}`)
    return new Uint8Array(new TextEncoder().encode(e))
  }
  function ce(e) {
    if ((typeof e == 'string' && (e = Ns(e)), !Ir(e)))
      throw new Error(`expected Uint8Array, got ${typeof e}`)
    return e
  }
  function Ur(...e) {
    let t = new Uint8Array(e.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      e.forEach(r => {
        if (!Ir(r)) throw new Error('Uint8Array expected')
        ;(t.set(r, n), (n += r.length))
      }),
      t
    )
  }
  var Ft = class {
      clone() {
        return this._cloneInto()
      }
    },
    uf = {}.toString
  function Rr(e) {
    let t = r => e().update(ce(r)).digest(),
      n = e()
    return ((t.outputLen = n.outputLen), (t.blockLen = n.blockLen), (t.create = () => e()), t)
  }
  function be(e = 32) {
    if (ye && typeof ye.getRandomValues == 'function') return ye.getRandomValues(new Uint8Array(e))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function Os(e, t, n, r) {
    if (typeof e.setBigUint64 == 'function') return e.setBigUint64(t, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(e.setUint32(t + c, i, r), e.setUint32(t + l, a, r))
  }
  var me = class extends Ft {
    constructor(t, n, r, o) {
      ;(super(),
        (this.blockLen = t),
        (this.outputLen = n),
        (this.padOffset = r),
        (this.isLE = o),
        (this.finished = !1),
        (this.length = 0),
        (this.pos = 0),
        (this.destroyed = !1),
        (this.buffer = new Uint8Array(t)),
        (this.view = we(this.buffer)))
    }
    update(t) {
      Qt(this)
      let { view: n, buffer: r, blockLen: o } = this
      t = ce(t)
      let s = t.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = we(t)
          for (; o <= s - i; i += o) this.process(c, i)
          continue
        }
        ;(r.set(t.subarray(i, i + a), this.pos),
          (this.pos += a),
          (i += a),
          this.pos === o && (this.process(n, 0), (this.pos = 0)))
      }
      return ((this.length += t.length), this.roundClean(), this)
    }
    digestInto(t) {
      ;(Qt(this), _r(t, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let u = i; u < o; u++) n[u] = 0
      ;(Os(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = we(t),
        c = this.outputLen
      if (c % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = c / 4,
        f = this.get()
      if (l > f.length) throw new Error('_sha2: outputLen bigger than state')
      for (let u = 0; u < l; u++) a.setUint32(4 * u, f[u], s)
    }
    digest() {
      let { buffer: t, outputLen: n } = this
      this.digestInto(t)
      let r = t.slice(0, n)
      return (this.destroy(), r)
    }
    _cloneInto(t) {
      ;(t || (t = new this.constructor()), t.set(...this.get()))
      let { blockLen: n, buffer: r, length: o, finished: s, destroyed: i, pos: a } = this
      return (
        (t.length = o),
        (t.pos = a),
        (t.finished = s),
        (t.destroyed = i),
        o % n && t.buffer.set(r),
        t
      )
    }
  }
  var Ps = (e, t, n) => (e & t) ^ (~e & n),
    $s = (e, t, n) => (e & t) ^ (e & n) ^ (t & n),
    Hs = new Uint32Array([
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
    cn = class extends me {
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
        let { A: t, B: n, C: r, D: o, E: s, F: i, G: a, H: c } = this
        return [t, n, r, o, s, i, a, c]
      }
      set(t, n, r, o, s, i, a, c) {
        ;((this.A = t | 0),
          (this.B = n | 0),
          (this.C = r | 0),
          (this.D = o | 0),
          (this.E = s | 0),
          (this.F = i | 0),
          (this.G = a | 0),
          (this.H = c | 0))
      }
      process(t, n) {
        for (let u = 0; u < 16; u++, n += 4) It[u] = t.getUint32(n, !1)
        for (let u = 16; u < 64; u++) {
          let g = It[u - 15],
            y = It[u - 2],
            p = lt(g, 7) ^ lt(g, 18) ^ (g >>> 3),
            d = lt(y, 17) ^ lt(y, 19) ^ (y >>> 10)
          It[u] = (d + It[u - 7] + p + It[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let g = lt(a, 6) ^ lt(a, 11) ^ lt(a, 25),
            y = (f + g + Ps(a, c, l) + Hs[u] + It[u]) | 0,
            d = ((lt(r, 2) ^ lt(r, 13) ^ lt(r, 22)) + $s(r, o, s)) | 0
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
        It.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    }
  var xe = Rr(() => new cn())
  var dn = {}
  Rs(dn, {
    bitGet: () => zs,
    bitLen: () => js,
    bitMask: () => le,
    bitSet: () => Ks,
    bytesToHex: () => Wt,
    bytesToNumberBE: () => J,
    bytesToNumberLE: () => Ae,
    concatBytes: () => vt,
    createHmacDrbg: () => un,
    ensureBytes: () => z,
    equalBytes: () => Ws,
    hexToBytes: () => Dt,
    hexToNumber: () => fn,
    numberToBytesBE: () => ft,
    numberToBytesLE: () => Te,
    numberToHexUnpadded: () => Or,
    numberToVarBytesBE: () => Vs,
    utf8ToBytes: () => Ds,
    validateObject: () => Ut,
  })
  var Nr = BigInt(0),
    ve = BigInt(1),
    Ms = BigInt(2),
    Ee = e => e instanceof Uint8Array,
    qs = Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, '0'))
  function Wt(e) {
    if (!Ee(e)) throw new Error('Uint8Array expected')
    let t = ''
    for (let n = 0; n < e.length; n++) t += qs[e[n]]
    return t
  }
  function Or(e) {
    let t = e.toString(16)
    return t.length & 1 ? `0${t}` : t
  }
  function fn(e) {
    if (typeof e != 'string') throw new Error('hex string expected, got ' + typeof e)
    return BigInt(e === '' ? '0' : `0x${e}`)
  }
  function Dt(e) {
    if (typeof e != 'string') throw new Error('hex string expected, got ' + typeof e)
    let t = e.length
    if (t % 2) throw new Error('padded hex string expected, got unpadded hex of length ' + t)
    let n = new Uint8Array(t / 2)
    for (let r = 0; r < n.length; r++) {
      let o = r * 2,
        s = e.slice(o, o + 2),
        i = Number.parseInt(s, 16)
      if (Number.isNaN(i) || i < 0) throw new Error('Invalid byte sequence')
      n[r] = i
    }
    return n
  }
  function J(e) {
    return fn(Wt(e))
  }
  function Ae(e) {
    if (!Ee(e)) throw new Error('Uint8Array expected')
    return fn(Wt(Uint8Array.from(e).reverse()))
  }
  function ft(e, t) {
    return Dt(e.toString(16).padStart(t * 2, '0'))
  }
  function Te(e, t) {
    return ft(e, t).reverse()
  }
  function Vs(e) {
    return Dt(Or(e))
  }
  function z(e, t, n) {
    let r
    if (typeof t == 'string')
      try {
        r = Dt(t)
      } catch (s) {
        throw new Error(`${e} must be valid hex string, got "${t}". Cause: ${s}`)
      }
    else if (Ee(t)) r = Uint8Array.from(t)
    else throw new Error(`${e} must be hex string or Uint8Array`)
    let o = r.length
    if (typeof n == 'number' && o !== n) throw new Error(`${e} expected ${n} bytes, got ${o}`)
    return r
  }
  function vt(...e) {
    let t = new Uint8Array(e.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      e.forEach(r => {
        if (!Ee(r)) throw new Error('Uint8Array expected')
        ;(t.set(r, n), (n += r.length))
      }),
      t
    )
  }
  function Ws(e, t) {
    if (e.length !== t.length) return !1
    for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1
    return !0
  }
  function Ds(e) {
    if (typeof e != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof e}`)
    return new Uint8Array(new TextEncoder().encode(e))
  }
  function js(e) {
    let t
    for (t = 0; e > Nr; e >>= ve, t += 1);
    return t
  }
  function zs(e, t) {
    return (e >> BigInt(t)) & ve
  }
  var Ks = (e, t, n) => e | ((n ? ve : Nr) << BigInt(t)),
    le = e => (Ms << BigInt(e - 1)) - ve,
    ln = e => new Uint8Array(e),
    Cr = e => Uint8Array.from(e)
  function un(e, t, n) {
    if (typeof e != 'number' || e < 2) throw new Error('hashLen must be a number')
    if (typeof t != 'number' || t < 2) throw new Error('qByteLen must be a number')
    if (typeof n != 'function') throw new Error('hmacFn must be a function')
    let r = ln(e),
      o = ln(e),
      s = 0,
      i = () => {
        ;(r.fill(1), o.fill(0), (s = 0))
      },
      a = (...u) => n(o, r, ...u),
      c = (u = ln()) => {
        ;((o = a(Cr([0]), u)), (r = a()), u.length !== 0 && ((o = a(Cr([1]), u)), (r = a())))
      },
      l = () => {
        if (s++ >= 1e3) throw new Error('drbg: tried 1000 values')
        let u = 0,
          g = []
        for (; u < t; ) {
          r = a()
          let y = r.slice()
          ;(g.push(y), (u += r.length))
        }
        return vt(...g)
      }
    return (u, g) => {
      ;(i(), c(u))
      let y
      for (; !(y = g(l())); ) c()
      return (i(), y)
    }
  }
  var Zs = {
    bigint: e => typeof e == 'bigint',
    function: e => typeof e == 'function',
    boolean: e => typeof e == 'boolean',
    string: e => typeof e == 'string',
    stringOrUint8Array: e => typeof e == 'string' || e instanceof Uint8Array,
    isSafeInteger: e => Number.isSafeInteger(e),
    array: e => Array.isArray(e),
    field: (e, t) => t.Fp.isValid(e),
    hash: e => typeof e == 'function' && Number.isSafeInteger(e.outputLen),
  }
  function Ut(e, t, n = {}) {
    let r = (o, s, i) => {
      let a = Zs[s]
      if (typeof a != 'function') throw new Error(`Invalid validator "${s}", expected function`)
      let c = e[o]
      if (!(i && c === void 0) && !a(c, e))
        throw new Error(`Invalid param ${String(o)}=${c} (${typeof c}), expected ${s}`)
    }
    for (let [o, s] of Object.entries(t)) r(o, s, !1)
    for (let [o, s] of Object.entries(n)) r(o, s, !0)
    return e
  }
  var Z = BigInt(0),
    D = BigInt(1),
    jt = BigInt(2),
    Gs = BigInt(3),
    hn = BigInt(4),
    Pr = BigInt(5),
    $r = BigInt(8),
    Js = BigInt(9),
    Ys = BigInt(16)
  function K(e, t) {
    let n = e % t
    return n >= Z ? n : t + n
  }
  function Xs(e, t, n) {
    if (n <= Z || t < Z) throw new Error('Expected power/modulo > 0')
    if (n === D) return Z
    let r = D
    for (; t > Z; ) (t & D && (r = (r * e) % n), (e = (e * e) % n), (t >>= D))
    return r
  }
  function nt(e, t, n) {
    let r = e
    for (; t-- > Z; ) ((r *= r), (r %= n))
    return r
  }
  function Be(e, t) {
    if (e === Z || t <= Z)
      throw new Error(`invert: expected positive integers, got n=${e} mod=${t}`)
    let n = K(e, t),
      r = t,
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
    return K(o, t)
  }
  function Qs(e) {
    let t = (e - D) / jt,
      n,
      r,
      o
    for (n = e - D, r = 0; n % jt === Z; n /= jt, r++);
    for (o = jt; o < e && Xs(o, t, e) !== e - D; o++);
    if (r === 1) {
      let i = (e + D) / hn
      return function (c, l) {
        let f = c.pow(l, i)
        if (!c.eql(c.sqr(f), l)) throw new Error('Cannot find square root')
        return f
      }
    }
    let s = (n + D) / jt
    return function (a, c) {
      if (a.pow(c, t) === a.neg(a.ONE)) throw new Error('Cannot find square root')
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
  function Fs(e) {
    if (e % hn === Gs) {
      let t = (e + D) / hn
      return function (r, o) {
        let s = r.pow(o, t)
        if (!r.eql(r.sqr(s), o)) throw new Error('Cannot find square root')
        return s
      }
    }
    if (e % $r === Pr) {
      let t = (e - Pr) / $r
      return function (r, o) {
        let s = r.mul(o, jt),
          i = r.pow(s, t),
          a = r.mul(o, i),
          c = r.mul(r.mul(a, jt), i),
          l = r.mul(a, r.sub(c, r.ONE))
        if (!r.eql(r.sqr(l), o)) throw new Error('Cannot find square root')
        return l
      }
    }
    return (e % Ys, Qs(e))
  }
  var ti = [
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
  function pn(e) {
    let t = { ORDER: 'bigint', MASK: 'bigint', BYTES: 'isSafeInteger', BITS: 'isSafeInteger' },
      n = ti.reduce((r, o) => ((r[o] = 'function'), r), t)
    return Ut(e, n)
  }
  function ei(e, t, n) {
    if (n < Z) throw new Error('Expected power > 0')
    if (n === Z) return e.ONE
    if (n === D) return t
    let r = e.ONE,
      o = t
    for (; n > Z; ) (n & D && (r = e.mul(r, o)), (o = e.sqr(o)), (n >>= D))
    return r
  }
  function ni(e, t) {
    let n = new Array(t.length),
      r = t.reduce((s, i, a) => (e.is0(i) ? s : ((n[a] = s), e.mul(s, i))), e.ONE),
      o = e.inv(r)
    return (
      t.reduceRight((s, i, a) => (e.is0(i) ? s : ((n[a] = e.mul(s, n[a])), e.mul(s, i))), o),
      n
    )
  }
  function gn(e, t) {
    let n = t !== void 0 ? t : e.toString(2).length,
      r = Math.ceil(n / 8)
    return { nBitLength: n, nByteLength: r }
  }
  function Hr(e, t, n = !1, r = {}) {
    if (e <= Z) throw new Error(`Expected Field ORDER > 0, got ${e}`)
    let { nBitLength: o, nByteLength: s } = gn(e, t)
    if (s > 2048) throw new Error('Field lengths over 2048 bytes are not supported')
    let i = Fs(e),
      a = Object.freeze({
        ORDER: e,
        BITS: o,
        BYTES: s,
        MASK: le(o),
        ZERO: Z,
        ONE: D,
        create: c => K(c, e),
        isValid: c => {
          if (typeof c != 'bigint')
            throw new Error(`Invalid field element: expected bigint, got ${typeof c}`)
          return Z <= c && c < e
        },
        is0: c => c === Z,
        isOdd: c => (c & D) === D,
        neg: c => K(-c, e),
        eql: (c, l) => c === l,
        sqr: c => K(c * c, e),
        add: (c, l) => K(c + l, e),
        sub: (c, l) => K(c - l, e),
        mul: (c, l) => K(c * l, e),
        pow: (c, l) => ei(a, c, l),
        div: (c, l) => K(c * Be(l, e), e),
        sqrN: c => c * c,
        addN: (c, l) => c + l,
        subN: (c, l) => c - l,
        mulN: (c, l) => c * l,
        inv: c => Be(c, e),
        sqrt: r.sqrt || (c => i(a, c)),
        invertBatch: c => ni(a, c),
        cmov: (c, l, f) => (f ? l : c),
        toBytes: c => (n ? Te(c, s) : ft(c, s)),
        fromBytes: c => {
          if (c.length !== s) throw new Error(`Fp.fromBytes: expected ${s}, got ${c.length}`)
          return n ? Ae(c) : J(c)
        },
      })
    return Object.freeze(a)
  }
  function Mr(e) {
    if (typeof e != 'bigint') throw new Error('field order must be bigint')
    let t = e.toString(2).length
    return Math.ceil(t / 8)
  }
  function yn(e) {
    let t = Mr(e)
    return t + Math.ceil(t / 2)
  }
  function qr(e, t, n = !1) {
    let r = e.length,
      o = Mr(t),
      s = yn(t)
    if (r < 16 || r < s || r > 1024) throw new Error(`expected ${s}-1024 bytes of input, got ${r}`)
    let i = n ? J(e) : Ae(e),
      a = K(i, t - D) + D
    return n ? Te(a, o) : ft(a, o)
  }
  var oi = BigInt(0),
    wn = BigInt(1)
  function Vr(e, t) {
    let n = (o, s) => {
        let i = s.negate()
        return o ? i : s
      },
      r = o => {
        let s = Math.ceil(t / o) + 1,
          i = 2 ** (o - 1)
        return { windows: s, windowSize: i }
      }
    return {
      constTimeNegate: n,
      unsafeLadder(o, s) {
        let i = e.ZERO,
          a = o
        for (; s > oi; ) (s & wn && (i = i.add(a)), (a = a.double()), (s >>= wn))
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
          l = e.ZERO,
          f = e.BASE,
          u = BigInt(2 ** o - 1),
          g = 2 ** o,
          y = BigInt(o)
        for (let p = 0; p < a; p++) {
          let d = p * c,
            h = Number(i & u)
          ;((i >>= y), h > c && ((h -= g), (i += wn)))
          let w = d,
            b = d + Math.abs(h) - 1,
            x = p % 2 !== 0,
            A = h < 0
          h === 0 ? (f = f.add(n(x, s[w]))) : (l = l.add(n(A, s[b])))
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
  function bn(e) {
    return (
      pn(e.Fp),
      Ut(
        e,
        { n: 'bigint', h: 'bigint', Gx: 'field', Gy: 'field' },
        { nBitLength: 'isSafeInteger', nByteLength: 'isSafeInteger' }
      ),
      Object.freeze({ ...gn(e.n, e.nBitLength), ...e, p: e.Fp.ORDER })
    )
  }
  function si(e) {
    let t = bn(e)
    Ut(
      t,
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
    let { endo: n, Fp: r, a: o } = t
    if (n) {
      if (!r.eql(o, r.ZERO))
        throw new Error('Endomorphism can only be defined for Koblitz curves that have a=0')
      if (typeof n != 'object' || typeof n.beta != 'bigint' || typeof n.splitScalar != 'function')
        throw new Error('Expected endomorphism with beta: bigint and splitScalar: function')
    }
    return Object.freeze({ ...t })
  }
  var { bytesToNumberBE: ii, hexToBytes: ai } = dn,
    zt = {
      Err: class extends Error {
        constructor(t = '') {
          super(t)
        }
      },
      _parseInt(e) {
        let { Err: t } = zt
        if (e.length < 2 || e[0] !== 2) throw new t('Invalid signature integer tag')
        let n = e[1],
          r = e.subarray(2, n + 2)
        if (!n || r.length !== n) throw new t('Invalid signature integer: wrong length')
        if (r[0] & 128) throw new t('Invalid signature integer: negative')
        if (r[0] === 0 && !(r[1] & 128))
          throw new t('Invalid signature integer: unnecessary leading zero')
        return { d: ii(r), l: e.subarray(n + 2) }
      },
      toSig(e) {
        let { Err: t } = zt,
          n = typeof e == 'string' ? ai(e) : e
        if (!(n instanceof Uint8Array)) throw new Error('ui8a expected')
        let r = n.length
        if (r < 2 || n[0] != 48) throw new t('Invalid signature tag')
        if (n[1] !== r - 2) throw new t('Invalid signature: incorrect length')
        let { d: o, l: s } = zt._parseInt(n.subarray(2)),
          { d: i, l: a } = zt._parseInt(s)
        if (a.length) throw new t('Invalid signature: left bytes after parsing')
        return { r: o, s: i }
      },
      hexFromSig(e) {
        let t = l => (Number.parseInt(l[0], 16) & 8 ? '00' + l : l),
          n = l => {
            let f = l.toString(16)
            return f.length & 1 ? `0${f}` : f
          },
          r = t(n(e.s)),
          o = t(n(e.r)),
          s = r.length / 2,
          i = o.length / 2,
          a = n(s),
          c = n(i)
        return `30${n(i + s + 4)}02${c}${o}02${a}${r}`
      },
    },
    Et = BigInt(0),
    st = BigInt(1),
    Sf = BigInt(2),
    Wr = BigInt(3),
    kf = BigInt(4)
  function ci(e) {
    let t = si(e),
      { Fp: n } = t,
      r =
        t.toBytes ||
        ((p, d, h) => {
          let w = d.toAffine()
          return vt(Uint8Array.from([4]), n.toBytes(w.x), n.toBytes(w.y))
        }),
      o =
        t.fromBytes ||
        (p => {
          let d = p.subarray(1),
            h = n.fromBytes(d.subarray(0, n.BYTES)),
            w = n.fromBytes(d.subarray(n.BYTES, 2 * n.BYTES))
          return { x: h, y: w }
        })
    function s(p) {
      let { a: d, b: h } = t,
        w = n.sqr(p),
        b = n.mul(w, p)
      return n.add(n.add(b, n.mul(p, d)), h)
    }
    if (!n.eql(n.sqr(t.Gy), s(t.Gx))) throw new Error('bad generator point: equation left != right')
    function i(p) {
      return typeof p == 'bigint' && Et < p && p < t.n
    }
    function a(p) {
      if (!i(p)) throw new Error('Expected valid bigint: 0 < bigint < curve.n')
    }
    function c(p) {
      let { allowedPrivateKeyLengths: d, nByteLength: h, wrapPrivateKey: w, n: b } = t
      if (d && typeof p != 'bigint') {
        if ((p instanceof Uint8Array && (p = Wt(p)), typeof p != 'string' || !d.includes(p.length)))
          throw new Error('Invalid key')
        p = p.padStart(h * 2, '0')
      }
      let x
      try {
        x = typeof p == 'bigint' ? p : J(z('private key', p, h))
      } catch {
        throw new Error(`private key must be ${h} bytes, hex or bigint, not ${typeof p}`)
      }
      return (w && (x = K(x, b)), a(x), x)
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
        let b = x => n.eql(x, n.ZERO)
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
        return u.BASE.multiply(c(d))
      }
      _setWindowSize(d) {
        ;((this._WINDOW_SIZE = d), l.delete(this))
      }
      assertValidity() {
        if (this.is0()) {
          if (t.allowInfinityPoint && !n.is0(this.py)) return
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
          { px: x, py: A, pz: k } = d,
          T = n.eql(n.mul(h, k), n.mul(x, b)),
          B = n.eql(n.mul(w, k), n.mul(A, b))
        return T && B
      }
      negate() {
        return new u(this.px, n.neg(this.py), this.pz)
      }
      double() {
        let { a: d, b: h } = t,
          w = n.mul(h, Wr),
          { px: b, py: x, pz: A } = this,
          k = n.ZERO,
          T = n.ZERO,
          B = n.ZERO,
          L = n.mul(b, b),
          C = n.mul(x, x),
          U = n.mul(A, A),
          I = n.mul(b, x)
        return (
          (I = n.add(I, I)),
          (B = n.mul(b, A)),
          (B = n.add(B, B)),
          (k = n.mul(d, B)),
          (T = n.mul(w, U)),
          (T = n.add(k, T)),
          (k = n.sub(C, T)),
          (T = n.add(C, T)),
          (T = n.mul(k, T)),
          (k = n.mul(I, k)),
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
          (U = n.mul(x, A)),
          (U = n.add(U, U)),
          (L = n.mul(U, I)),
          (k = n.sub(k, L)),
          (B = n.mul(U, C)),
          (B = n.add(B, B)),
          (B = n.add(B, B)),
          new u(k, T, B)
        )
      }
      add(d) {
        f(d)
        let { px: h, py: w, pz: b } = this,
          { px: x, py: A, pz: k } = d,
          T = n.ZERO,
          B = n.ZERO,
          L = n.ZERO,
          C = t.a,
          U = n.mul(t.b, Wr),
          I = n.mul(h, x),
          $ = n.mul(w, A),
          H = n.mul(b, k),
          V = n.add(h, w),
          m = n.add(x, A)
        ;((V = n.mul(V, m)), (m = n.add(I, $)), (V = n.sub(V, m)), (m = n.add(h, b)))
        let v = n.add(x, k)
        return (
          (m = n.mul(m, v)),
          (v = n.add(I, H)),
          (m = n.sub(m, v)),
          (v = n.add(w, b)),
          (T = n.add(A, k)),
          (v = n.mul(v, T)),
          (T = n.add($, H)),
          (v = n.sub(v, T)),
          (L = n.mul(C, m)),
          (T = n.mul(U, H)),
          (L = n.add(T, L)),
          (T = n.sub($, L)),
          (L = n.add($, L)),
          (B = n.mul(T, L)),
          ($ = n.add(I, I)),
          ($ = n.add($, I)),
          (H = n.mul(C, H)),
          (m = n.mul(U, m)),
          ($ = n.add($, H)),
          (H = n.sub(I, H)),
          (H = n.mul(C, H)),
          (m = n.add(m, H)),
          (I = n.mul($, m)),
          (B = n.add(B, I)),
          (I = n.mul(v, m)),
          (T = n.mul(V, T)),
          (T = n.sub(T, I)),
          (I = n.mul(V, $)),
          (L = n.mul(v, L)),
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
          return h.map((b, x) => b.toAffine(w[x])).map(u.fromAffine)
        })
      }
      multiplyUnsafe(d) {
        let h = u.ZERO
        if (d === Et) return h
        if ((a(d), d === st)) return this
        let { endo: w } = t
        if (!w) return y.unsafeLadder(this, d)
        let { k1neg: b, k1: x, k2neg: A, k2: k } = w.splitScalar(d),
          T = h,
          B = h,
          L = this
        for (; x > Et || k > Et; )
          (x & st && (T = T.add(L)),
            k & st && (B = B.add(L)),
            (L = L.double()),
            (x >>= st),
            (k >>= st))
        return (
          b && (T = T.negate()),
          A && (B = B.negate()),
          (B = new u(n.mul(B.px, w.beta), B.py, B.pz)),
          T.add(B)
        )
      }
      multiply(d) {
        a(d)
        let h = d,
          w,
          b,
          { endo: x } = t
        if (x) {
          let { k1neg: A, k1: k, k2neg: T, k2: B } = x.splitScalar(h),
            { p: L, f: C } = this.wNAF(k),
            { p: U, f: I } = this.wNAF(B)
          ;((L = y.constTimeNegate(A, L)),
            (U = y.constTimeNegate(T, U)),
            (U = new u(n.mul(U.px, x.beta), U.py, U.pz)),
            (w = L.add(U)),
            (b = C.add(I)))
        } else {
          let { p: A, f: k } = this.wNAF(h)
          ;((w = A), (b = k))
        }
        return u.normalizeZ([w, b])[0]
      }
      multiplyAndAddUnsafe(d, h, w) {
        let b = u.BASE,
          x = (k, T) =>
            T === Et || T === st || !k.equals(b) ? k.multiplyUnsafe(T) : k.multiply(T),
          A = x(this, h).add(x(d, w))
        return A.is0() ? void 0 : A
      }
      toAffine(d) {
        let { px: h, py: w, pz: b } = this,
          x = this.is0()
        d == null && (d = x ? n.ONE : n.inv(b))
        let A = n.mul(h, d),
          k = n.mul(w, d),
          T = n.mul(b, d)
        if (x) return { x: n.ZERO, y: n.ZERO }
        if (!n.eql(T, n.ONE)) throw new Error('invZ was invalid')
        return { x: A, y: k }
      }
      isTorsionFree() {
        let { h: d, isTorsionFree: h } = t
        if (d === st) return !0
        if (h) return h(u, this)
        throw new Error('isTorsionFree() has not been declared for the elliptic curve')
      }
      clearCofactor() {
        let { h: d, clearCofactor: h } = t
        return d === st ? this : h ? h(u, this) : this.multiplyUnsafe(t.h)
      }
      toRawBytes(d = !0) {
        return (this.assertValidity(), r(u, this, d))
      }
      toHex(d = !0) {
        return Wt(this.toRawBytes(d))
      }
    }
    ;((u.BASE = new u(t.Gx, t.Gy, n.ONE)), (u.ZERO = new u(n.ZERO, n.ONE, n.ZERO)))
    let g = t.nBitLength,
      y = Vr(u, t.endo ? Math.ceil(g / 2) : g)
    return {
      CURVE: t,
      ProjectivePoint: u,
      normPrivateKeyToScalar: c,
      weierstrassEquation: s,
      isWithinCurveOrder: i,
    }
  }
  function li(e) {
    let t = bn(e)
    return (
      Ut(
        t,
        { hash: 'hash', hmac: 'function', randomBytes: 'function' },
        { bits2int: 'function', bits2int_modN: 'function', lowS: 'boolean' }
      ),
      Object.freeze({ lowS: !0, ...t })
    )
  }
  function Dr(e) {
    let t = li(e),
      { Fp: n, n: r } = t,
      o = n.BYTES + 1,
      s = 2 * n.BYTES + 1
    function i(m) {
      return Et < m && m < n.ORDER
    }
    function a(m) {
      return K(m, r)
    }
    function c(m) {
      return Be(m, r)
    }
    let {
        ProjectivePoint: l,
        normPrivateKeyToScalar: f,
        weierstrassEquation: u,
        isWithinCurveOrder: g,
      } = ci({
        ...t,
        toBytes(m, v, _) {
          let R = v.toAffine(),
            E = n.toBytes(R.x),
            N = vt
          return _
            ? N(Uint8Array.from([v.hasEvenY() ? 2 : 3]), E)
            : N(Uint8Array.from([4]), E, n.toBytes(R.y))
        },
        fromBytes(m) {
          let v = m.length,
            _ = m[0],
            R = m.subarray(1)
          if (v === o && (_ === 2 || _ === 3)) {
            let E = J(R)
            if (!i(E)) throw new Error('Point is not on curve')
            let N = u(E),
              q = n.sqrt(N),
              M = (q & st) === st
            return (((_ & 1) === 1) !== M && (q = n.neg(q)), { x: E, y: q })
          } else if (v === s && _ === 4) {
            let E = n.fromBytes(R.subarray(0, n.BYTES)),
              N = n.fromBytes(R.subarray(n.BYTES, 2 * n.BYTES))
            return { x: E, y: N }
          } else
            throw new Error(
              `Point of length ${v} was invalid. Expected ${o} compressed bytes or ${s} uncompressed bytes`
            )
        },
      }),
      y = m => Wt(ft(m, t.nByteLength))
    function p(m) {
      let v = r >> st
      return m > v
    }
    function d(m) {
      return p(m) ? a(-m) : m
    }
    let h = (m, v, _) => J(m.slice(v, _))
    class w {
      constructor(v, _, R) {
        ;((this.r = v), (this.s = _), (this.recovery = R), this.assertValidity())
      }
      static fromCompact(v) {
        let _ = t.nByteLength
        return ((v = z('compactSignature', v, _ * 2)), new w(h(v, 0, _), h(v, _, 2 * _)))
      }
      static fromDER(v) {
        let { r: _, s: R } = zt.toSig(z('DER', v))
        return new w(_, R)
      }
      assertValidity() {
        if (!g(this.r)) throw new Error('r must be 0 < r < CURVE.n')
        if (!g(this.s)) throw new Error('s must be 0 < s < CURVE.n')
      }
      addRecoveryBit(v) {
        return new w(this.r, this.s, v)
      }
      recoverPublicKey(v) {
        let { r: _, s: R, recovery: E } = this,
          N = B(z('msgHash', v))
        if (E == null || ![0, 1, 2, 3].includes(E)) throw new Error('recovery id invalid')
        let q = E === 2 || E === 3 ? _ + t.n : _
        if (q >= n.ORDER) throw new Error('recovery id 2 or 3 invalid')
        let M = (E & 1) === 0 ? '02' : '03',
          G = l.fromHex(M + y(q)),
          X = c(q),
          et = a(-N * X),
          ot = a(R * X),
          Q = l.BASE.multiplyAndAddUnsafe(G, et, ot)
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
        let m = yn(t.n)
        return qr(t.randomBytes(m), t.n)
      },
      precompute(m = 8, v = l.BASE) {
        return (v._setWindowSize(m), v.multiply(BigInt(3)), v)
      },
    }
    function x(m, v = !0) {
      return l.fromPrivateKey(m).toRawBytes(v)
    }
    function A(m) {
      let v = m instanceof Uint8Array,
        _ = typeof m == 'string',
        R = (v || _) && m.length
      return v ? R === o || R === s : _ ? R === 2 * o || R === 2 * s : m instanceof l
    }
    function k(m, v, _ = !0) {
      if (A(m)) throw new Error('first arg must be private key')
      if (!A(v)) throw new Error('second arg must be public key')
      return l.fromHex(v).multiply(f(m)).toRawBytes(_)
    }
    let T =
        t.bits2int ||
        function (m) {
          let v = J(m),
            _ = m.length * 8 - t.nBitLength
          return _ > 0 ? v >> BigInt(_) : v
        },
      B =
        t.bits2int_modN ||
        function (m) {
          return a(T(m))
        },
      L = le(t.nBitLength)
    function C(m) {
      if (typeof m != 'bigint') throw new Error('bigint expected')
      if (!(Et <= m && m < L)) throw new Error(`bigint expected < 2^${t.nBitLength}`)
      return ft(m, t.nByteLength)
    }
    function U(m, v, _ = I) {
      if (['recovered', 'canonical'].some(tt => tt in _))
        throw new Error('sign() legacy options not supported')
      let { hash: R, randomBytes: E } = t,
        { lowS: N, prehash: q, extraEntropy: M } = _
      ;(N == null && (N = !0), (m = z('msgHash', m)), q && (m = z('prehashed msgHash', R(m))))
      let G = B(m),
        X = f(v),
        et = [C(X), C(G)]
      if (M != null) {
        let tt = M === !0 ? E(n.BYTES) : M
        et.push(z('extraEntropy', tt))
      }
      let ot = vt(...et),
        Q = G
      function ht(tt) {
        let Jt = T(tt)
        if (!g(Jt)) return
        let vr = c(Jt),
          pt = l.BASE.multiply(Jt).toAffine(),
          Yt = a(pt.x)
        if (Yt === Et) return
        let ge = a(vr * a(Q + Yt * X))
        if (ge === Et) return
        let Er = (pt.x === Yt ? 0 : 2) | Number(pt.y & st),
          Ar = ge
        return (N && p(ge) && ((Ar = d(ge)), (Er ^= 1)), new w(Yt, Ar, Er))
      }
      return { seed: ot, k2sig: ht }
    }
    let I = { lowS: t.lowS, prehash: !1 },
      $ = { lowS: t.lowS, prehash: !1 }
    function H(m, v, _ = I) {
      let { seed: R, k2sig: E } = U(m, v, _),
        N = t
      return un(N.hash.outputLen, N.nByteLength, N.hmac)(R, E)
    }
    l.BASE._setWindowSize(8)
    function V(m, v, _, R = $) {
      let E = m
      if (((v = z('msgHash', v)), (_ = z('publicKey', _)), 'strict' in R))
        throw new Error('options.strict was renamed to lowS')
      let { lowS: N, prehash: q } = R,
        M,
        G
      try {
        if (typeof E == 'string' || E instanceof Uint8Array)
          try {
            M = w.fromDER(E)
          } catch (pt) {
            if (!(pt instanceof zt.Err)) throw pt
            M = w.fromCompact(E)
          }
        else if (typeof E == 'object' && typeof E.r == 'bigint' && typeof E.s == 'bigint') {
          let { r: pt, s: Yt } = E
          M = new w(pt, Yt)
        } else throw new Error('PARSE')
        G = l.fromHex(_)
      } catch (pt) {
        if (pt.message === 'PARSE')
          throw new Error('signature must be Signature instance, Uint8Array or hex string')
        return !1
      }
      if (N && M.hasHighS()) return !1
      q && (v = t.hash(v))
      let { r: X, s: et } = M,
        ot = B(v),
        Q = c(et),
        ht = a(ot * Q),
        tt = a(X * Q),
        Jt = l.BASE.multiplyAndAddUnsafe(G, ht, tt)?.toAffine()
      return Jt ? a(Jt.x) === X : !1
    }
    return {
      CURVE: t,
      getPublicKey: x,
      getSharedSecret: k,
      sign: H,
      verify: V,
      ProjectivePoint: l,
      Signature: w,
      utils: b,
    }
  }
  var Se = class extends Ft {
      constructor(t, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), Lr(t))
        let r = ce(n)
        if (((this.iHash = t.create()), typeof this.iHash.update != 'function'))
          throw new Error('Expected instance of class which extends utils.Hash')
        ;((this.blockLen = this.iHash.blockLen), (this.outputLen = this.iHash.outputLen))
        let o = this.blockLen,
          s = new Uint8Array(o)
        s.set(r.length > o ? t.create().update(r).digest() : r)
        for (let i = 0; i < s.length; i++) s[i] ^= 54
        ;(this.iHash.update(s), (this.oHash = t.create()))
        for (let i = 0; i < s.length; i++) s[i] ^= 106
        ;(this.oHash.update(s), s.fill(0))
      }
      update(t) {
        return (Qt(this), this.iHash.update(t), this)
      }
      digestInto(t) {
        ;(Qt(this),
          an(t, this.outputLen),
          (this.finished = !0),
          this.iHash.digestInto(t),
          this.oHash.update(t),
          this.oHash.digestInto(t),
          this.destroy())
      }
      digest() {
        let t = new Uint8Array(this.oHash.outputLen)
        return (this.digestInto(t), t)
      }
      _cloneInto(t) {
        t || (t = Object.create(Object.getPrototypeOf(this), {}))
        let { oHash: n, iHash: r, finished: o, destroyed: s, blockLen: i, outputLen: a } = this
        return (
          (t = t),
          (t.finished = o),
          (t.destroyed = s),
          (t.blockLen = i),
          (t.outputLen = a),
          (t.oHash = n._cloneInto(t.oHash)),
          (t.iHash = r._cloneInto(t.iHash)),
          t
        )
      }
      destroy() {
        ;((this.destroyed = !0), this.oHash.destroy(), this.iHash.destroy())
      }
    },
    mn = (e, t, n) => new Se(e, t).update(n).digest()
  mn.create = (e, t) => new Se(e, t)
  function fi(e) {
    return { hash: e, hmac: (t, ...n) => mn(e, t, Ur(...n)), randomBytes: be }
  }
  function jr(e, t) {
    let n = r => Dr({ ...e, ...fi(r) })
    return Object.freeze({ ...n(t), create: n })
  }
  var Ie = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
    ke = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
    Zr = BigInt(1),
    Le = BigInt(2),
    zr = (e, t) => (e + t / Le) / t
  function Gr(e) {
    let t = Ie,
      n = BigInt(3),
      r = BigInt(6),
      o = BigInt(11),
      s = BigInt(22),
      i = BigInt(23),
      a = BigInt(44),
      c = BigInt(88),
      l = (e * e * e) % t,
      f = (l * l * e) % t,
      u = (nt(f, n, t) * f) % t,
      g = (nt(u, n, t) * f) % t,
      y = (nt(g, Le, t) * l) % t,
      p = (nt(y, o, t) * y) % t,
      d = (nt(p, s, t) * p) % t,
      h = (nt(d, a, t) * d) % t,
      w = (nt(h, c, t) * h) % t,
      b = (nt(w, a, t) * d) % t,
      x = (nt(b, n, t) * f) % t,
      A = (nt(x, i, t) * p) % t,
      k = (nt(A, r, t) * l) % t,
      T = nt(k, Le, t)
    if (!vn.eql(vn.sqr(T), e)) throw new Error('Cannot find square root')
    return T
  }
  var vn = Hr(Ie, void 0, void 0, { sqrt: Gr }),
    Rt = jr(
      {
        a: BigInt(0),
        b: BigInt(7),
        Fp: vn,
        n: ke,
        Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
        Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
        h: BigInt(1),
        lowS: !0,
        endo: {
          beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
          splitScalar: e => {
            let t = ke,
              n = BigInt('0x3086d221a7d46bcde86c90e49284eb15'),
              r = -Zr * BigInt('0xe4437ed6010e88286f547fa90abfe4c3'),
              o = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'),
              s = n,
              i = BigInt('0x100000000000000000000000000000000'),
              a = zr(s * e, t),
              c = zr(-r * e, t),
              l = K(e - a * n - c * o, t),
              f = K(-a * r - c * s, t),
              u = l > i,
              g = f > i
            if ((u && (l = t - l), g && (f = t - f), l > i || f > i))
              throw new Error('splitScalar: Endomorphism failed, k=' + e)
            return { k1neg: u, k1: l, k2neg: g, k2: f }
          },
        },
      },
      xe
    ),
    Ue = BigInt(0),
    Jr = e => typeof e == 'bigint' && Ue < e && e < Ie,
    ui = e => typeof e == 'bigint' && Ue < e && e < ke,
    Kr = {}
  function _e(e, ...t) {
    let n = Kr[e]
    if (n === void 0) {
      let r = xe(Uint8Array.from(e, o => o.charCodeAt(0)))
      ;((n = vt(r, r)), (Kr[e] = n))
    }
    return xe(vt(n, ...t))
  }
  var Tn = e => e.toRawBytes(!0).slice(1),
    En = e => ft(e, 32),
    xn = e => K(e, Ie),
    fe = e => K(e, ke),
    Bn = Rt.ProjectivePoint,
    di = (e, t, n) => Bn.BASE.multiplyAndAddUnsafe(e, t, n)
  function An(e) {
    let t = Rt.utils.normPrivateKeyToScalar(e),
      n = Bn.fromPrivateKey(t)
    return { scalar: n.hasEvenY() ? t : fe(-t), bytes: Tn(n) }
  }
  function Yr(e) {
    if (!Jr(e)) throw new Error('bad x: need 0 < x < p')
    let t = xn(e * e),
      n = xn(t * e + BigInt(7)),
      r = Gr(n)
    r % Le !== Ue && (r = xn(-r))
    let o = new Bn(e, r, Zr)
    return (o.assertValidity(), o)
  }
  function Xr(...e) {
    return fe(J(_e('BIP0340/challenge', ...e)))
  }
  function hi(e) {
    return An(e).bytes
  }
  function pi(e, t, n = be(32)) {
    let r = z('message', e),
      { bytes: o, scalar: s } = An(t),
      i = z('auxRand', n, 32),
      a = En(s ^ J(_e('BIP0340/aux', i))),
      c = _e('BIP0340/nonce', a, o, r),
      l = fe(J(c))
    if (l === Ue) throw new Error('sign failed: k is zero')
    let { bytes: f, scalar: u } = An(l),
      g = Xr(f, o, r),
      y = new Uint8Array(64)
    if ((y.set(f, 0), y.set(En(fe(u + g * s)), 32), !Qr(y, r, o)))
      throw new Error('sign: Invalid signature produced')
    return y
  }
  function Qr(e, t, n) {
    let r = z('signature', e, 64),
      o = z('message', t),
      s = z('publicKey', n, 32)
    try {
      let i = Yr(J(s)),
        a = J(r.subarray(0, 32))
      if (!Jr(a)) return !1
      let c = J(r.subarray(32, 64))
      if (!ui(c)) return !1
      let l = Xr(En(a), Tn(i), o),
        f = di(i, c, fe(-l))
      return !(!f || !f.hasEvenY() || f.toAffine().x !== a)
    } catch {
      return !1
    }
  }
  var te = {
    getPublicKey: hi,
    sign: pi,
    verify: Qr,
    utils: {
      randomPrivateKey: Rt.utils.randomPrivateKey,
      lift_x: Yr,
      pointToBytes: Tn,
      numberToBytesBE: ft,
      bytesToNumberBE: J,
      taggedHash: _e,
      mod: K,
    },
  }
  var Re = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Sn = e => e instanceof Uint8Array
  var Ce = e => new DataView(e.buffer, e.byteOffset, e.byteLength),
    ut = (e, t) => (e << (32 - t)) | (e >>> t),
    gi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!gi) throw new Error('Non little-endian hardware is not supported')
  var yi = Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, '0'))
  function j(e) {
    if (!Sn(e)) throw new Error('Uint8Array expected')
    let t = ''
    for (let n = 0; n < e.length; n++) t += yi[e[n]]
    return t
  }
  function At(e) {
    if (typeof e != 'string') throw new Error('hex string expected, got ' + typeof e)
    let t = e.length
    if (t % 2) throw new Error('padded hex string expected, got unpadded hex of length ' + t)
    let n = new Uint8Array(t / 2)
    for (let r = 0; r < n.length; r++) {
      let o = r * 2,
        s = e.slice(o, o + 2),
        i = Number.parseInt(s, 16)
      if (Number.isNaN(i) || i < 0) throw new Error('Invalid byte sequence')
      n[r] = i
    }
    return n
  }
  function wi(e) {
    if (typeof e != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof e}`)
    return new Uint8Array(new TextEncoder().encode(e))
  }
  function Ct(e) {
    if ((typeof e == 'string' && (e = wi(e)), !Sn(e)))
      throw new Error(`expected Uint8Array, got ${typeof e}`)
    return e
  }
  function ne(...e) {
    let t = new Uint8Array(e.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      e.forEach(r => {
        if (!Sn(r)) throw new Error('Uint8Array expected')
        ;(t.set(r, n), (n += r.length))
      }),
      t
    )
  }
  var ee = class {
    clone() {
      return this._cloneInto()
    }
  }
  function kn(e) {
    let t = r => e().update(Ct(r)).digest(),
      n = e()
    return ((t.outputLen = n.outputLen), (t.blockLen = n.blockLen), (t.create = () => e()), t)
  }
  function Ne(e = 32) {
    if (Re && typeof Re.getRandomValues == 'function') return Re.getRandomValues(new Uint8Array(e))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function Ln(e) {
    if (!Number.isSafeInteger(e) || e < 0) throw new Error(`Wrong positive integer: ${e}`)
  }
  function bi(e) {
    if (typeof e != 'boolean') throw new Error(`Expected boolean, not ${e}`)
  }
  function Fr(e, ...t) {
    if (!(e instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (t.length > 0 && !t.includes(e.length))
      throw new Error(`Expected Uint8Array of length ${t}, not of length=${e.length}`)
  }
  function mi(e) {
    if (typeof e != 'function' || typeof e.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(Ln(e.outputLen), Ln(e.blockLen))
  }
  function xi(e, t = !0) {
    if (e.destroyed) throw new Error('Hash instance has been destroyed')
    if (t && e.finished) throw new Error('Hash#digest() has already been called')
  }
  function vi(e, t) {
    Fr(e)
    let n = t.outputLen
    if (e.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Ei = { number: Ln, bool: bi, bytes: Fr, hash: mi, exists: xi, output: vi },
    rt = Ei
  function Ai(e, t, n, r) {
    if (typeof e.setBigUint64 == 'function') return e.setBigUint64(t, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(e.setUint32(t + c, i, r), e.setUint32(t + l, a, r))
  }
  var Oe = class extends ee {
    constructor(t, n, r, o) {
      ;(super(),
        (this.blockLen = t),
        (this.outputLen = n),
        (this.padOffset = r),
        (this.isLE = o),
        (this.finished = !1),
        (this.length = 0),
        (this.pos = 0),
        (this.destroyed = !1),
        (this.buffer = new Uint8Array(t)),
        (this.view = Ce(this.buffer)))
    }
    update(t) {
      rt.exists(this)
      let { view: n, buffer: r, blockLen: o } = this
      t = Ct(t)
      let s = t.length
      for (let i = 0; i < s; ) {
        let a = Math.min(o - this.pos, s - i)
        if (a === o) {
          let c = Ce(t)
          for (; o <= s - i; i += o) this.process(c, i)
          continue
        }
        ;(r.set(t.subarray(i, i + a), this.pos),
          (this.pos += a),
          (i += a),
          this.pos === o && (this.process(n, 0), (this.pos = 0)))
      }
      return ((this.length += t.length), this.roundClean(), this)
    }
    digestInto(t) {
      ;(rt.exists(this), rt.output(t, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let u = i; u < o; u++) n[u] = 0
      ;(Ai(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = Ce(t),
        c = this.outputLen
      if (c % 4) throw new Error('_sha2: outputLen should be aligned to 32bit')
      let l = c / 4,
        f = this.get()
      if (l > f.length) throw new Error('_sha2: outputLen bigger than state')
      for (let u = 0; u < l; u++) a.setUint32(4 * u, f[u], s)
    }
    digest() {
      let { buffer: t, outputLen: n } = this
      this.digestInto(t)
      let r = t.slice(0, n)
      return (this.destroy(), r)
    }
    _cloneInto(t) {
      ;(t || (t = new this.constructor()), t.set(...this.get()))
      let { blockLen: n, buffer: r, length: o, finished: s, destroyed: i, pos: a } = this
      return (
        (t.length = o),
        (t.pos = a),
        (t.finished = s),
        (t.destroyed = i),
        o % n && t.buffer.set(r),
        t
      )
    }
  }
  var Ti = (e, t, n) => (e & t) ^ (~e & n),
    Bi = (e, t, n) => (e & t) ^ (e & n) ^ (t & n),
    Si = new Uint32Array([
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
    Nt = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Ot = new Uint32Array(64),
    Pe = class extends Oe {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = Nt[0] | 0),
          (this.B = Nt[1] | 0),
          (this.C = Nt[2] | 0),
          (this.D = Nt[3] | 0),
          (this.E = Nt[4] | 0),
          (this.F = Nt[5] | 0),
          (this.G = Nt[6] | 0),
          (this.H = Nt[7] | 0))
      }
      get() {
        let { A: t, B: n, C: r, D: o, E: s, F: i, G: a, H: c } = this
        return [t, n, r, o, s, i, a, c]
      }
      set(t, n, r, o, s, i, a, c) {
        ;((this.A = t | 0),
          (this.B = n | 0),
          (this.C = r | 0),
          (this.D = o | 0),
          (this.E = s | 0),
          (this.F = i | 0),
          (this.G = a | 0),
          (this.H = c | 0))
      }
      process(t, n) {
        for (let u = 0; u < 16; u++, n += 4) Ot[u] = t.getUint32(n, !1)
        for (let u = 16; u < 64; u++) {
          let g = Ot[u - 15],
            y = Ot[u - 2],
            p = ut(g, 7) ^ ut(g, 18) ^ (g >>> 3),
            d = ut(y, 17) ^ ut(y, 19) ^ (y >>> 10)
          Ot[u] = (d + Ot[u - 7] + p + Ot[u - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: f } = this
        for (let u = 0; u < 64; u++) {
          let g = ut(a, 6) ^ ut(a, 11) ^ ut(a, 25),
            y = (f + g + Ti(a, c, l) + Si[u] + Ot[u]) | 0,
            d = ((ut(r, 2) ^ ut(r, 13) ^ ut(r, 22)) + Bi(r, o, s)) | 0
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
        Ot.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    },
    _n = class extends Pe {
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
    gt = kn(() => new Pe()),
    Xf = kn(() => new _n())
  function re(e) {
    if (!Number.isSafeInteger(e)) throw new Error(`Wrong integer: ${e}`)
  }
  function Tt(...e) {
    let t = (o, s) => i => o(s(i)),
      n = Array.from(e)
        .reverse()
        .reduce((o, s) => (o ? t(o, s.encode) : s.encode), void 0),
      r = e.reduce((o, s) => (o ? t(o, s.decode) : s.decode), void 0)
    return { encode: n, decode: r }
  }
  function Bt(e) {
    return {
      encode: t => {
        if (!Array.isArray(t) || (t.length && typeof t[0] != 'number'))
          throw new Error('alphabet.encode input should be an array of numbers')
        return t.map(n => {
          if ((re(n), n < 0 || n >= e.length))
            throw new Error(`Digit index outside alphabet: ${n} (alphabet: ${e.length})`)
          return e[n]
        })
      },
      decode: t => {
        if (!Array.isArray(t) || (t.length && typeof t[0] != 'string'))
          throw new Error('alphabet.decode input should be array of strings')
        return t.map(n => {
          if (typeof n != 'string') throw new Error(`alphabet.decode: not string element=${n}`)
          let r = e.indexOf(n)
          if (r === -1) throw new Error(`Unknown letter: "${n}". Allowed: ${e}`)
          return r
        })
      },
    }
  }
  function St(e = '') {
    if (typeof e != 'string') throw new Error('join separator should be string')
    return {
      encode: t => {
        if (!Array.isArray(t) || (t.length && typeof t[0] != 'string'))
          throw new Error('join.encode input should be array of strings')
        for (let n of t)
          if (typeof n != 'string') throw new Error(`join.encode: non-string input=${n}`)
        return t.join(e)
      },
      decode: t => {
        if (typeof t != 'string') throw new Error('join.decode input should be string')
        return t.split(e)
      },
    }
  }
  function He(e, t = '=') {
    if ((re(e), typeof t != 'string')) throw new Error('padding chr should be string')
    return {
      encode(n) {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'string'))
          throw new Error('padding.encode input should be array of strings')
        for (let r of n)
          if (typeof r != 'string') throw new Error(`padding.encode: non-string input=${r}`)
        for (; (n.length * e) % 8; ) n.push(t)
        return n
      },
      decode(n) {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'string'))
          throw new Error('padding.encode input should be array of strings')
        for (let o of n)
          if (typeof o != 'string') throw new Error(`padding.decode: non-string input=${o}`)
        let r = n.length
        if ((r * e) % 8)
          throw new Error('Invalid padding: string should have whole number of bytes')
        for (; r > 0 && n[r - 1] === t; r--)
          if (!(((r - 1) * e) % 8)) throw new Error('Invalid padding: string has too much padding')
        return n.slice(0, r)
      },
    }
  }
  function so(e) {
    if (typeof e != 'function') throw new Error('normalize fn should be function')
    return { encode: t => t, decode: t => e(t) }
  }
  function to(e, t, n) {
    if (t < 2) throw new Error(`convertRadix: wrong from=${t}, base cannot be less than 2`)
    if (n < 2) throw new Error(`convertRadix: wrong to=${n}, base cannot be less than 2`)
    if (!Array.isArray(e)) throw new Error('convertRadix: data should be array')
    if (!e.length) return []
    let r = 0,
      o = [],
      s = Array.from(e)
    for (
      s.forEach(i => {
        if ((re(i), i < 0 || i >= t)) throw new Error(`Wrong integer: ${i}`)
      });
      ;

    ) {
      let i = 0,
        a = !0
      for (let c = r; c < s.length; c++) {
        let l = s[c],
          f = t * i + l
        if (!Number.isSafeInteger(f) || (t * i) / t !== i || f - l !== t * i)
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
    for (let i = 0; i < e.length - 1 && e[i] === 0; i++) o.push(0)
    return o.reverse()
  }
  var io = (e, t) => (t ? io(t, e % t) : e),
    $e = (e, t) => e + (t - io(e, t))
  function In(e, t, n, r) {
    if (!Array.isArray(e)) throw new Error('convertRadix2: data should be array')
    if (t <= 0 || t > 32) throw new Error(`convertRadix2: wrong from=${t}`)
    if (n <= 0 || n > 32) throw new Error(`convertRadix2: wrong to=${n}`)
    if ($e(t, n) > 32)
      throw new Error(`convertRadix2: carry overflow from=${t} to=${n} carryBits=${$e(t, n)}`)
    let o = 0,
      s = 0,
      i = 2 ** n - 1,
      a = []
    for (let c of e) {
      if ((re(c), c >= 2 ** t)) throw new Error(`convertRadix2: invalid data word=${c} from=${t}`)
      if (((o = (o << t) | c), s + t > 32))
        throw new Error(`convertRadix2: carry overflow pos=${s} from=${t}`)
      for (s += t; s >= n; s -= n) a.push(((o >> (s - n)) & i) >>> 0)
      o &= 2 ** s - 1
    }
    if (((o = (o << (n - s)) & i), !r && s >= t)) throw new Error('Excess padding')
    if (!r && o) throw new Error(`Non-zero padding: ${o}`)
    return (r && s > 0 && a.push(o >>> 0), a)
  }
  function ki(e) {
    return (
      re(e),
      {
        encode: t => {
          if (!(t instanceof Uint8Array)) throw new Error('radix.encode input should be Uint8Array')
          return to(Array.from(t), 2 ** 8, e)
        },
        decode: t => {
          if (!Array.isArray(t) || (t.length && typeof t[0] != 'number'))
            throw new Error('radix.decode input should be array of strings')
          return Uint8Array.from(to(t, e, 2 ** 8))
        },
      }
    )
  }
  function Pt(e, t = !1) {
    if ((re(e), e <= 0 || e > 32)) throw new Error('radix2: bits should be in (0..32]')
    if ($e(8, e) > 32 || $e(e, 8) > 32) throw new Error('radix2: carry overflow')
    return {
      encode: n => {
        if (!(n instanceof Uint8Array)) throw new Error('radix2.encode input should be Uint8Array')
        return In(Array.from(n), 8, e, !t)
      },
      decode: n => {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'number'))
          throw new Error('radix2.decode input should be array of strings')
        return Uint8Array.from(In(n, e, 8, t))
      },
    }
  }
  function eo(e) {
    if (typeof e != 'function') throw new Error('unsafeWrapper fn should be function')
    return function (...t) {
      try {
        return e.apply(null, t)
      } catch {}
    }
  }
  var Li = Tt(Pt(4), Bt('0123456789ABCDEF'), St('')),
    _i = Tt(Pt(5), Bt('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), He(5), St('')),
    Ff = Tt(Pt(5), Bt('0123456789ABCDEFGHIJKLMNOPQRSTUV'), He(5), St('')),
    tu = Tt(
      Pt(5),
      Bt('0123456789ABCDEFGHJKMNPQRSTVWXYZ'),
      St(''),
      so(e => e.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1'))
    ),
    it = Tt(
      Pt(6),
      Bt('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'),
      He(6),
      St('')
    ),
    Ii = Tt(
      Pt(6),
      Bt('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'),
      He(6),
      St('')
    ),
    Cn = e => Tt(ki(58), Bt(e), St('')),
    Un = Cn('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'),
    eu = Cn('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'),
    nu = Cn('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'),
    no = [0, 2, 3, 5, 6, 7, 9, 10, 11],
    Ui = {
      encode(e) {
        let t = ''
        for (let n = 0; n < e.length; n += 8) {
          let r = e.subarray(n, n + 8)
          t += Un.encode(r).padStart(no[r.length], '1')
        }
        return t
      },
      decode(e) {
        let t = []
        for (let n = 0; n < e.length; n += 11) {
          let r = e.slice(n, n + 11),
            o = no.indexOf(r.length),
            s = Un.decode(r)
          for (let i = 0; i < s.length - o; i++)
            if (s[i] !== 0) throw new Error('base58xmr: wrong padding')
          t = t.concat(Array.from(s.slice(s.length - o)))
        }
        return Uint8Array.from(t)
      },
    }
  var Rn = Tt(Bt('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), St('')),
    ro = [996825010, 642813549, 513874426, 1027748829, 705979059]
  function ue(e) {
    let t = e >> 25,
      n = (e & 33554431) << 5
    for (let r = 0; r < ro.length; r++) ((t >> r) & 1) === 1 && (n ^= ro[r])
    return n
  }
  function oo(e, t, n = 1) {
    let r = e.length,
      o = 1
    for (let s = 0; s < r; s++) {
      let i = e.charCodeAt(s)
      if (i < 33 || i > 126) throw new Error(`Invalid prefix (${e})`)
      o = ue(o) ^ (i >> 5)
    }
    o = ue(o)
    for (let s = 0; s < r; s++) o = ue(o) ^ (e.charCodeAt(s) & 31)
    for (let s of t) o = ue(o) ^ s
    for (let s = 0; s < 6; s++) o = ue(o)
    return ((o ^= n), Rn.encode(In([o % 2 ** 30], 30, 5, !1)))
  }
  function ao(e) {
    let t = e === 'bech32' ? 1 : 734539939,
      n = Pt(5),
      r = n.decode,
      o = n.encode,
      s = eo(r)
    function i(f, u, g = 90) {
      if (typeof f != 'string')
        throw new Error(`bech32.encode prefix should be string, not ${typeof f}`)
      if (!Array.isArray(u) || (u.length && typeof u[0] != 'number'))
        throw new Error(`bech32.encode words should be array of numbers, not ${typeof u}`)
      let y = f.length + 7 + u.length
      if (g !== !1 && y > g) throw new TypeError(`Length ${y} exceeds limit ${g}`)
      return ((f = f.toLowerCase()), `${f}1${Rn.encode(u)}${oo(f, u, t)}`)
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
      let h = Rn.decode(d).slice(0, -6),
        w = oo(p, h, t)
      if (!d.endsWith(w)) throw new Error(`Invalid checksum in ${f}: expected "${w}"`)
      return { prefix: p, words: h }
    }
    let c = eo(a)
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
  var $t = ao('bech32'),
    ru = ao('bech32m'),
    Ri = { encode: e => new TextDecoder().decode(e), decode: e => new TextEncoder().encode(e) },
    Ci = Tt(
      Pt(4),
      Bt('0123456789abcdef'),
      St(''),
      so(e => {
        if (typeof e != 'string' || e.length % 2)
          throw new TypeError(
            `hex.decode: expected string, got ${typeof e} with length ${e.length}`
          )
        return e.toLowerCase()
      })
    ),
    Ni = {
      utf8: Ri,
      hex: Ci,
      base16: Li,
      base32: _i,
      base64: it,
      base64url: Ii,
      base58: Un,
      base58xmr: Ui,
    },
    ou = `Invalid encoding type. Available types: ${Object.keys(Ni).join(', ')}`
  function Me(e) {
    if (!Number.isSafeInteger(e) || e < 0) throw new Error(`positive integer expected, not ${e}`)
  }
  function Nn(e) {
    if (typeof e != 'boolean') throw new Error(`boolean expected, not ${e}`)
  }
  function On(e) {
    return (
      e instanceof Uint8Array ||
      (e != null && typeof e == 'object' && e.constructor.name === 'Uint8Array')
    )
  }
  function O(e, ...t) {
    if (!On(e)) throw new Error('Uint8Array expected')
    if (t.length > 0 && !t.includes(e.length))
      throw new Error(`Uint8Array expected of length ${t}, not of length=${e.length}`)
  }
  function Ht(e, t = !0) {
    if (e.destroyed) throw new Error('Hash instance has been destroyed')
    if (t && e.finished) throw new Error('Hash#digest() has already been called')
  }
  function de(e, t) {
    O(e)
    let n = t.outputLen
    if (e.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var qe = e => new Uint8Array(e.buffer, e.byteOffset, e.byteLength)
  var P = e => new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4)),
    Mt = e => new DataView(e.buffer, e.byteOffset, e.byteLength),
    Oi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Oi) throw new Error('Non little-endian hardware is not supported')
  function Pi(e) {
    if (typeof e != 'string') throw new Error(`string expected, got ${typeof e}`)
    return new Uint8Array(new TextEncoder().encode(e))
  }
  function yt(e) {
    if (typeof e == 'string') e = Pi(e)
    else if (On(e)) e = e.slice()
    else throw new Error(`Uint8Array expected, got ${typeof e}`)
    return e
  }
  function co(e, t) {
    if (t == null || typeof t != 'object') throw new Error('options must be defined')
    return Object.assign(e, t)
  }
  function Kt(e, t) {
    if (e.length !== t.length) return !1
    let n = 0
    for (let r = 0; r < e.length; r++) n |= e[r] ^ t[r]
    return n === 0
  }
  var wt = (e, t) => (Object.assign(t, e), t)
  function Zt(e, t, n, r) {
    if (typeof e.setBigUint64 == 'function') return e.setBigUint64(t, n, r)
    let o = BigInt(32),
      s = BigInt(4294967295),
      i = Number((n >> o) & s),
      a = Number(n & s),
      c = r ? 4 : 0,
      l = r ? 0 : 4
    ;(e.setUint32(t + c, i, r), e.setUint32(t + l, a, r))
  }
  var kt = 16,
    $n = new Uint8Array(16),
    bt = P($n),
    $i = 225,
    Hi = (e, t, n, r) => {
      let o = r & 1
      return {
        s3: (n << 31) | (r >>> 1),
        s2: (t << 31) | (n >>> 1),
        s1: (e << 31) | (t >>> 1),
        s0: (e >>> 1) ^ (($i << 24) & -(o & 1)),
      }
    },
    at = e =>
      (((e >>> 0) & 255) << 24) |
      (((e >>> 8) & 255) << 16) |
      (((e >>> 16) & 255) << 8) |
      ((e >>> 24) & 255) |
      0
  function Mi(e) {
    e.reverse()
    let t = e[15] & 1,
      n = 0
    for (let r = 0; r < e.length; r++) {
      let o = e[r]
      ;((e[r] = (o >>> 1) | n), (n = (o & 1) << 7))
    }
    return ((e[0] ^= -t & 225), e)
  }
  var qi = e => (e > 64 * 1024 ? 8 : e > 1024 ? 4 : 2),
    Ve = class {
      constructor(t, n) {
        ;((this.blockLen = kt),
          (this.outputLen = kt),
          (this.s0 = 0),
          (this.s1 = 0),
          (this.s2 = 0),
          (this.s3 = 0),
          (this.finished = !1),
          (t = yt(t)),
          O(t, 16))
        let r = Mt(t),
          o = r.getUint32(0, !1),
          s = r.getUint32(4, !1),
          i = r.getUint32(8, !1),
          a = r.getUint32(12, !1),
          c = []
        for (let p = 0; p < 128; p++)
          (c.push({ s0: at(o), s1: at(s), s2: at(i), s3: at(a) }),
            ({ s0: o, s1: s, s2: i, s3: a } = Hi(o, s, i, a)))
        let l = qi(n || 1024)
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
              x = 0
            for (let A = 0; A < l; A++) {
              if (!((d >>> (l - A - 1)) & 1)) continue
              let { s0: T, s1: B, s2: L, s3: C } = c[l * p + A]
              ;((h ^= T), (w ^= B), (b ^= L), (x ^= C))
            }
            y.push({ s0: h, s1: w, s2: b, s3: x })
          }
        this.t = y
      }
      _updateBlock(t, n, r, o) {
        ;((t ^= this.s0), (n ^= this.s1), (r ^= this.s2), (o ^= this.s3))
        let { W: s, t: i, windowSize: a } = this,
          c = 0,
          l = 0,
          f = 0,
          u = 0,
          g = (1 << s) - 1,
          y = 0
        for (let p of [t, n, r, o])
          for (let d = 0; d < 4; d++) {
            let h = (p >>> (8 * d)) & 255
            for (let w = 8 / s - 1; w >= 0; w--) {
              let b = (h >>> (s * w)) & g,
                { s0: x, s1: A, s2: k, s3: T } = i[y * a + b]
              ;((c ^= x), (l ^= A), (f ^= k), (u ^= T), (y += 1))
            }
          }
        ;((this.s0 = c), (this.s1 = l), (this.s2 = f), (this.s3 = u))
      }
      update(t) {
        ;((t = yt(t)), Ht(this))
        let n = P(t),
          r = Math.floor(t.length / kt),
          o = t.length % kt
        for (let s = 0; s < r; s++)
          this._updateBlock(n[s * 4 + 0], n[s * 4 + 1], n[s * 4 + 2], n[s * 4 + 3])
        return (
          o &&
            ($n.set(t.subarray(r * kt)), this._updateBlock(bt[0], bt[1], bt[2], bt[3]), bt.fill(0)),
          this
        )
      }
      destroy() {
        let { t } = this
        for (let n of t) ((n.s0 = 0), (n.s1 = 0), (n.s2 = 0), (n.s3 = 0))
      }
      digestInto(t) {
        ;(Ht(this), de(t, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(t)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), t)
      }
      digest() {
        let t = new Uint8Array(kt)
        return (this.digestInto(t), this.destroy(), t)
      }
    },
    Pn = class extends Ve {
      constructor(t, n) {
        t = yt(t)
        let r = Mi(t.slice())
        ;(super(r, n), r.fill(0))
      }
      update(t) {
        ;((t = yt(t)), Ht(this))
        let n = P(t),
          r = t.length % kt,
          o = Math.floor(t.length / kt)
        for (let s = 0; s < o; s++)
          this._updateBlock(at(n[s * 4 + 3]), at(n[s * 4 + 2]), at(n[s * 4 + 1]), at(n[s * 4 + 0]))
        return (
          r &&
            ($n.set(t.subarray(o * kt)),
            this._updateBlock(at(bt[3]), at(bt[2]), at(bt[1]), at(bt[0])),
            bt.fill(0)),
          this
        )
      }
      digestInto(t) {
        ;(Ht(this), de(t, this), (this.finished = !0))
        let { s0: n, s1: r, s2: o, s3: s } = this,
          i = P(t)
        return ((i[0] = n), (i[1] = r), (i[2] = o), (i[3] = s), t.reverse())
      }
    }
  function lo(e) {
    let t = (r, o) => e(o, r.length).update(yt(r)).digest(),
      n = e(new Uint8Array(16), 0)
    return (
      (t.outputLen = n.outputLen),
      (t.blockLen = n.blockLen),
      (t.create = (r, o) => e(r, o)),
      t
    )
  }
  var Hn = lo((e, t) => new Ve(e, t)),
    fo = lo((e, t) => new Pn(e, t))
  var F = 16,
    Vn = 4,
    We = new Uint8Array(F),
    Vi = 283
  function Wn(e) {
    return (e << 1) ^ (Vi & -(e >> 7))
  }
  function oe(e, t) {
    let n = 0
    for (; t > 0; t >>= 1) ((n ^= e & -(t & 1)), (e = Wn(e)))
    return n
  }
  var qn = (() => {
      let e = new Uint8Array(256)
      for (let n = 0, r = 1; n < 256; n++, r ^= Wn(r)) e[n] = r
      let t = new Uint8Array(256)
      t[0] = 99
      for (let n = 0; n < 255; n++) {
        let r = e[255 - n]
        ;((r |= r << 8), (t[e[n]] = (r ^ (r >> 4) ^ (r >> 5) ^ (r >> 6) ^ (r >> 7) ^ 99) & 255))
      }
      return t
    })(),
    Wi = qn.map((e, t) => qn.indexOf(t)),
    Di = e => (e << 24) | (e >>> 8),
    Mn = e => (e << 8) | (e >>> 24)
  function uo(e, t) {
    if (e.length !== 256) throw new Error('Wrong sbox length')
    let n = new Uint32Array(256).map((l, f) => t(e[f])),
      r = n.map(Mn),
      o = r.map(Mn),
      s = o.map(Mn),
      i = new Uint32Array(256 * 256),
      a = new Uint32Array(256 * 256),
      c = new Uint16Array(256 * 256)
    for (let l = 0; l < 256; l++)
      for (let f = 0; f < 256; f++) {
        let u = l * 256 + f
        ;((i[u] = n[l] ^ r[f]), (a[u] = o[l] ^ s[f]), (c[u] = (e[l] << 8) | e[f]))
      }
    return { sbox: e, sbox2: c, T0: n, T1: r, T2: o, T3: s, T01: i, T23: a }
  }
  var Dn = uo(qn, e => (oe(e, 3) << 24) | (e << 16) | (e << 8) | oe(e, 2)),
    ho = uo(Wi, e => (oe(e, 11) << 24) | (oe(e, 13) << 16) | (oe(e, 9) << 8) | oe(e, 14)),
    ji = (() => {
      let e = new Uint8Array(16)
      for (let t = 0, n = 1; t < 16; t++, n = Wn(n)) e[t] = n
      return e
    })()
  function Vt(e) {
    O(e)
    let t = e.length
    if (![16, 24, 32].includes(t))
      throw new Error(`aes: wrong key size: should be 16, 24 or 32, got: ${t}`)
    let { sbox2: n } = Dn,
      r = P(e),
      o = r.length,
      s = a => mt(n, a, a, a, a),
      i = new Uint32Array(t + 28)
    i.set(r)
    for (let a = o; a < i.length; a++) {
      let c = i[a - 1]
      ;(a % o === 0 ? (c = s(Di(c)) ^ ji[a / o - 1]) : o > 6 && a % o === 4 && (c = s(c)),
        (i[a] = i[a - o] ^ c))
    }
    return i
  }
  function po(e) {
    let t = Vt(e),
      n = t.slice(),
      r = t.length,
      { sbox2: o } = Dn,
      { T0: s, T1: i, T2: a, T3: c } = ho
    for (let l = 0; l < r; l += 4) for (let f = 0; f < 4; f++) n[l + f] = t[r - l - 4 + f]
    t.fill(0)
    for (let l = 4; l < r - 4; l++) {
      let f = n[l],
        u = mt(o, f, f, f, f)
      n[l] = s[u & 255] ^ i[(u >>> 8) & 255] ^ a[(u >>> 16) & 255] ^ c[u >>> 24]
    }
    return n
  }
  function qt(e, t, n, r, o, s) {
    return e[((n << 8) & 65280) | ((r >>> 8) & 255)] ^ t[((o >>> 8) & 65280) | ((s >>> 24) & 255)]
  }
  function mt(e, t, n, r, o) {
    return e[(t & 255) | (n & 65280)] | (e[((r >>> 16) & 255) | ((o >>> 16) & 65280)] << 16)
  }
  function ct(e, t, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = Dn,
      c = 0
    ;((t ^= e[c++]), (n ^= e[c++]), (r ^= e[c++]), (o ^= e[c++]))
    let l = e.length / 4 - 2
    for (let p = 0; p < l; p++) {
      let d = e[c++] ^ qt(i, a, t, n, r, o),
        h = e[c++] ^ qt(i, a, n, r, o, t),
        w = e[c++] ^ qt(i, a, r, o, t, n),
        b = e[c++] ^ qt(i, a, o, t, n, r)
      ;((t = d), (n = h), (r = w), (o = b))
    }
    let f = e[c++] ^ mt(s, t, n, r, o),
      u = e[c++] ^ mt(s, n, r, o, t),
      g = e[c++] ^ mt(s, r, o, t, n),
      y = e[c++] ^ mt(s, o, t, n, r)
    return { s0: f, s1: u, s2: g, s3: y }
  }
  function go(e, t, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = ho,
      c = 0
    ;((t ^= e[c++]), (n ^= e[c++]), (r ^= e[c++]), (o ^= e[c++]))
    let l = e.length / 4 - 2
    for (let p = 0; p < l; p++) {
      let d = e[c++] ^ qt(i, a, t, o, r, n),
        h = e[c++] ^ qt(i, a, n, t, o, r),
        w = e[c++] ^ qt(i, a, r, n, t, o),
        b = e[c++] ^ qt(i, a, o, r, n, t)
      ;((t = d), (n = h), (r = w), (o = b))
    }
    let f = e[c++] ^ mt(s, t, o, r, n),
      u = e[c++] ^ mt(s, n, t, o, r),
      g = e[c++] ^ mt(s, r, n, t, o),
      y = e[c++] ^ mt(s, o, r, n, t)
    return { s0: f, s1: u, s2: g, s3: y }
  }
  function se(e, t) {
    if (!t) return new Uint8Array(e)
    if ((O(t), t.length < e))
      throw new Error(`aes: wrong destination length, expected at least ${e}, got: ${t.length}`)
    return t
  }
  function zi(e, t, n, r) {
    ;(O(t, F), O(n))
    let o = n.length
    r = se(o, r)
    let s = t,
      i = P(s),
      { s0: a, s1: c, s2: l, s3: f } = ct(e, i[0], i[1], i[2], i[3]),
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
      ;({ s0: a, s1: c, s2: l, s3: f } = ct(e, i[0], i[1], i[2], i[3]))
    }
    let y = F * Math.floor(u.length / Vn)
    if (y < o) {
      let p = new Uint32Array([a, c, l, f]),
        d = qe(p)
      for (let h = y, w = 0; h < o; h++, w++) r[h] = n[h] ^ d[w]
    }
    return r
  }
  function he(e, t, n, r, o) {
    ;(O(n, F), O(r), (o = se(r.length, o)))
    let s = n,
      i = P(s),
      a = Mt(s),
      c = P(r),
      l = P(o),
      f = t ? 0 : 12,
      u = r.length,
      g = a.getUint32(f, t),
      { s0: y, s1: p, s2: d, s3: h } = ct(e, i[0], i[1], i[2], i[3])
    for (let b = 0; b + 4 <= c.length; b += 4)
      ((l[b + 0] = c[b + 0] ^ y),
        (l[b + 1] = c[b + 1] ^ p),
        (l[b + 2] = c[b + 2] ^ d),
        (l[b + 3] = c[b + 3] ^ h),
        (g = (g + 1) >>> 0),
        a.setUint32(f, g, t),
        ({ s0: y, s1: p, s2: d, s3: h } = ct(e, i[0], i[1], i[2], i[3])))
    let w = F * Math.floor(c.length / Vn)
    if (w < u) {
      let b = new Uint32Array([y, p, d, h]),
        x = qe(b)
      for (let A = w, k = 0; A < u; A++, k++) o[A] = r[A] ^ x[k]
    }
    return o
  }
  var gu = wt({ blockSize: 16, nonceLength: 16 }, function (t, n) {
    ;(O(t), O(n, F))
    function r(o, s) {
      let i = Vt(t),
        a = n.slice(),
        c = zi(i, a, o, s)
      return (i.fill(0), a.fill(0), c)
    }
    return { encrypt: (o, s) => r(o, s), decrypt: (o, s) => r(o, s) }
  })
  function yo(e) {
    if ((O(e), e.length % F !== 0))
      throw new Error(`aes/(cbc-ecb).decrypt ciphertext should consist of blocks with size ${F}`)
  }
  function wo(e, t, n) {
    let r = e.length,
      o = r % F
    if (!t && o !== 0) throw new Error('aec/(cbc-ecb): unpadded plaintext with disabled padding')
    let s = P(e)
    if (t) {
      let c = F - o
      ;(c || (c = F), (r = r + c))
    }
    let i = se(r, n),
      a = P(i)
    return { b: s, o: a, out: i }
  }
  function bo(e, t) {
    if (!t) return e
    let n = e.length
    if (!n) throw new Error('aes/pcks5: empty ciphertext not allowed')
    let r = e[n - 1]
    if (r <= 0 || r > 16) throw new Error(`aes/pcks5: wrong padding byte: ${r}`)
    let o = e.subarray(0, -r)
    for (let s = 0; s < r; s++) if (e[n - s - 1] !== r) throw new Error('aes/pcks5: wrong padding')
    return o
  }
  function mo(e) {
    let t = new Uint8Array(16),
      n = P(t)
    t.set(e)
    let r = F - e.length
    for (let o = F - r; o < F; o++) t[o] = r
    return n
  }
  var yu = wt({ blockSize: 16 }, function (t, n = {}) {
      O(t)
      let r = !n.disablePadding
      return {
        encrypt: (o, s) => {
          O(o)
          let { b: i, o: a, out: c } = wo(o, r, s),
            l = Vt(t),
            f = 0
          for (; f + 4 <= i.length; ) {
            let { s0: u, s1: g, s2: y, s3: p } = ct(l, i[f + 0], i[f + 1], i[f + 2], i[f + 3])
            ;((a[f++] = u), (a[f++] = g), (a[f++] = y), (a[f++] = p))
          }
          if (r) {
            let u = mo(o.subarray(f * 4)),
              { s0: g, s1: y, s2: p, s3: d } = ct(l, u[0], u[1], u[2], u[3])
            ;((a[f++] = g), (a[f++] = y), (a[f++] = p), (a[f++] = d))
          }
          return (l.fill(0), c)
        },
        decrypt: (o, s) => {
          yo(o)
          let i = po(t),
            a = se(o.length, s),
            c = P(o),
            l = P(a)
          for (let f = 0; f + 4 <= c.length; ) {
            let { s0: u, s1: g, s2: y, s3: p } = go(i, c[f + 0], c[f + 1], c[f + 2], c[f + 3])
            ;((l[f++] = u), (l[f++] = g), (l[f++] = y), (l[f++] = p))
          }
          return (i.fill(0), bo(a, r))
        },
      }
    }),
    jn = wt({ blockSize: 16, nonceLength: 16 }, function (t, n, r = {}) {
      ;(O(t), O(n, 16))
      let o = !r.disablePadding
      return {
        encrypt: (s, i) => {
          let a = Vt(t),
            { b: c, o: l, out: f } = wo(s, o, i),
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
              ({ s0: g, s1: y, s2: p, s3: d } = ct(a, g, y, p, d)),
              (l[h++] = g),
              (l[h++] = y),
              (l[h++] = p),
              (l[h++] = d))
          if (o) {
            let w = mo(s.subarray(h * 4))
            ;((g ^= w[0]),
              (y ^= w[1]),
              (p ^= w[2]),
              (d ^= w[3]),
              ({ s0: g, s1: y, s2: p, s3: d } = ct(a, g, y, p, d)),
              (l[h++] = g),
              (l[h++] = y),
              (l[h++] = p),
              (l[h++] = d))
          }
          return (a.fill(0), f)
        },
        decrypt: (s, i) => {
          yo(s)
          let a = po(t),
            c = P(n),
            l = se(s.length, i),
            f = P(s),
            u = P(l),
            g = c[0],
            y = c[1],
            p = c[2],
            d = c[3]
          for (let h = 0; h + 4 <= f.length; ) {
            let w = g,
              b = y,
              x = p,
              A = d
            ;((g = f[h + 0]), (y = f[h + 1]), (p = f[h + 2]), (d = f[h + 3]))
            let { s0: k, s1: T, s2: B, s3: L } = go(a, g, y, p, d)
            ;((u[h++] = k ^ w), (u[h++] = T ^ b), (u[h++] = B ^ x), (u[h++] = L ^ A))
          }
          return (a.fill(0), bo(l, o))
        },
      }
    }),
    wu = wt({ blockSize: 16, nonceLength: 16 }, function (t, n) {
      ;(O(t), O(n, 16))
      function r(o, s, i) {
        let a = Vt(t),
          c = o.length
        i = se(c, i)
        let l = P(o),
          f = P(i),
          u = s ? f : l,
          g = P(n),
          y = g[0],
          p = g[1],
          d = g[2],
          h = g[3]
        for (let b = 0; b + 4 <= l.length; ) {
          let { s0: x, s1: A, s2: k, s3: T } = ct(a, y, p, d, h)
          ;((f[b + 0] = l[b + 0] ^ x),
            (f[b + 1] = l[b + 1] ^ A),
            (f[b + 2] = l[b + 2] ^ k),
            (f[b + 3] = l[b + 3] ^ T),
            (y = u[b++]),
            (p = u[b++]),
            (d = u[b++]),
            (h = u[b++]))
        }
        let w = F * Math.floor(l.length / Vn)
        if (w < c) {
          ;({ s0: y, s1: p, s2: d, s3: h } = ct(a, y, p, d, h))
          let b = qe(new Uint32Array([y, p, d, h]))
          for (let x = w, A = 0; x < c; x++, A++) i[x] = o[x] ^ b[A]
          b.fill(0)
        }
        return (a.fill(0), i)
      }
      return { encrypt: (o, s) => r(o, !0, s), decrypt: (o, s) => r(o, !1, s) }
    })
  function xo(e, t, n, r, o) {
    let s = e.create(n, r.length + (o?.length || 0))
    ;(o && s.update(o), s.update(r))
    let i = new Uint8Array(16),
      a = Mt(i)
    return (
      o && Zt(a, 0, BigInt(o.length * 8), t),
      Zt(a, 8, BigInt(r.length * 8), t),
      s.update(i),
      s.digest()
    )
  }
  var bu = wt({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (t, n, r) {
      if ((O(n), n.length === 0)) throw new Error('aes/gcm: empty nonce')
      let o = 16
      function s(a, c, l) {
        let f = xo(Hn, !1, a, l, r)
        for (let u = 0; u < c.length; u++) f[u] ^= c[u]
        return f
      }
      function i() {
        let a = Vt(t),
          c = We.slice(),
          l = We.slice()
        if ((he(a, !1, l, l, c), n.length === 12)) l.set(n)
        else {
          let u = We.slice(),
            g = Mt(u)
          ;(Zt(g, 8, BigInt(n.length * 8), !1), Hn.create(c).update(n).update(u).digestInto(l))
        }
        let f = he(a, !1, l, We)
        return { xk: a, authKey: c, counter: l, tagMask: f }
      }
      return {
        encrypt: a => {
          O(a)
          let { xk: c, authKey: l, counter: f, tagMask: u } = i(),
            g = new Uint8Array(a.length + o)
          he(c, !1, f, a, g)
          let y = s(l, u, g.subarray(0, g.length - o))
          return (g.set(y, a.length), c.fill(0), g)
        },
        decrypt: a => {
          if ((O(a), a.length < o)) throw new Error(`aes/gcm: ciphertext less than tagLen (${o})`)
          let { xk: c, authKey: l, counter: f, tagMask: u } = i(),
            g = a.subarray(0, -o),
            y = a.subarray(-o),
            p = s(l, u, g)
          if (!Kt(p, y)) throw new Error('aes/gcm: invalid ghash tag')
          let d = he(c, !1, f, g)
          return (l.fill(0), u.fill(0), c.fill(0), d)
        },
      }
    }),
    De = (e, t, n) => r => {
      if (!Number.isSafeInteger(r) || t > r || r > n)
        throw new Error(`${e}: invalid value=${r}, must be [${t}..${n}]`)
    },
    mu = wt({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (t, n, r) {
      let s = De('AAD', 0, 68719476736),
        i = De('plaintext', 0, 2 ** 36),
        a = De('nonce', 12, 12),
        c = De('ciphertext', 16, 2 ** 36 + 16)
      ;(O(n), a(n.length), r && (O(r), s(r.length)))
      function l() {
        let g = t.length
        if (g !== 16 && g !== 24 && g !== 32)
          throw new Error(`key length must be 16, 24 or 32 bytes, got: ${g} bytes`)
        let y = Vt(t),
          p = new Uint8Array(g),
          d = new Uint8Array(16),
          h = P(n),
          w = 0,
          b = h[0],
          x = h[1],
          A = h[2],
          k = 0
        for (let T of [d, p].map(P)) {
          let B = P(T)
          for (let L = 0; L < B.length; L += 2) {
            let { s0: C, s1: U } = ct(y, w, b, x, A)
            ;((B[L + 0] = C), (B[L + 1] = U), (w = ++k))
          }
        }
        return (y.fill(0), { authKey: d, encKey: Vt(p) })
      }
      function f(g, y, p) {
        let d = xo(fo, !0, y, p, r)
        for (let k = 0; k < 12; k++) d[k] ^= n[k]
        d[15] &= 127
        let h = P(d),
          w = h[0],
          b = h[1],
          x = h[2],
          A = h[3]
        return (
          ({ s0: w, s1: b, s2: x, s3: A } = ct(g, w, b, x, A)),
          (h[0] = w),
          (h[1] = b),
          (h[2] = x),
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
          if ((p.fill(0), d.fill(0), !Kt(y, w))) throw new Error('invalid polyval tag')
          return h
        },
      }
    })
  var Y = (e, t) => (e[t++] & 255) | ((e[t++] & 255) << 8),
    zn = class {
      constructor(t) {
        ;((this.blockLen = 16),
          (this.outputLen = 16),
          (this.buffer = new Uint8Array(16)),
          (this.r = new Uint16Array(10)),
          (this.h = new Uint16Array(10)),
          (this.pad = new Uint16Array(8)),
          (this.pos = 0),
          (this.finished = !1),
          (t = yt(t)),
          O(t, 32))
        let n = Y(t, 0),
          r = Y(t, 2),
          o = Y(t, 4),
          s = Y(t, 6),
          i = Y(t, 8),
          a = Y(t, 10),
          c = Y(t, 12),
          l = Y(t, 14)
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
        for (let f = 0; f < 8; f++) this.pad[f] = Y(t, 16 + 2 * f)
      }
      process(t, n, r = !1) {
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
          w = Y(t, n + 0),
          b = Y(t, n + 2),
          x = Y(t, n + 4),
          A = Y(t, n + 6),
          k = Y(t, n + 8),
          T = Y(t, n + 10),
          B = Y(t, n + 12),
          L = Y(t, n + 14),
          C = s[0] + (w & 8191),
          U = s[1] + (((w >>> 13) | (b << 3)) & 8191),
          I = s[2] + (((b >>> 10) | (x << 6)) & 8191),
          $ = s[3] + (((x >>> 7) | (A << 9)) & 8191),
          H = s[4] + (((A >>> 4) | (k << 12)) & 8191),
          V = s[5] + ((k >>> 1) & 8191),
          m = s[6] + (((k >>> 14) | (T << 2)) & 8191),
          v = s[7] + (((T >>> 11) | (B << 5)) & 8191),
          _ = s[8] + (((B >>> 8) | (L << 8)) & 8191),
          R = s[9] + ((L >>> 5) | o),
          E = 0,
          N = E + C * a + U * (5 * h) + I * (5 * d) + $ * (5 * p) + H * (5 * y)
        ;((E = N >>> 13),
          (N &= 8191),
          (N += V * (5 * g) + m * (5 * u) + v * (5 * f) + _ * (5 * l) + R * (5 * c)),
          (E += N >>> 13),
          (N &= 8191))
        let q = E + C * c + U * a + I * (5 * h) + $ * (5 * d) + H * (5 * p)
        ;((E = q >>> 13),
          (q &= 8191),
          (q += V * (5 * y) + m * (5 * g) + v * (5 * u) + _ * (5 * f) + R * (5 * l)),
          (E += q >>> 13),
          (q &= 8191))
        let M = E + C * l + U * c + I * a + $ * (5 * h) + H * (5 * d)
        ;((E = M >>> 13),
          (M &= 8191),
          (M += V * (5 * p) + m * (5 * y) + v * (5 * g) + _ * (5 * u) + R * (5 * f)),
          (E += M >>> 13),
          (M &= 8191))
        let G = E + C * f + U * l + I * c + $ * a + H * (5 * h)
        ;((E = G >>> 13),
          (G &= 8191),
          (G += V * (5 * d) + m * (5 * p) + v * (5 * y) + _ * (5 * g) + R * (5 * u)),
          (E += G >>> 13),
          (G &= 8191))
        let X = E + C * u + U * f + I * l + $ * c + H * a
        ;((E = X >>> 13),
          (X &= 8191),
          (X += V * (5 * h) + m * (5 * d) + v * (5 * p) + _ * (5 * y) + R * (5 * g)),
          (E += X >>> 13),
          (X &= 8191))
        let et = E + C * g + U * u + I * f + $ * l + H * c
        ;((E = et >>> 13),
          (et &= 8191),
          (et += V * a + m * (5 * h) + v * (5 * d) + _ * (5 * p) + R * (5 * y)),
          (E += et >>> 13),
          (et &= 8191))
        let ot = E + C * y + U * g + I * u + $ * f + H * l
        ;((E = ot >>> 13),
          (ot &= 8191),
          (ot += V * c + m * a + v * (5 * h) + _ * (5 * d) + R * (5 * p)),
          (E += ot >>> 13),
          (ot &= 8191))
        let Q = E + C * p + U * y + I * g + $ * u + H * f
        ;((E = Q >>> 13),
          (Q &= 8191),
          (Q += V * l + m * c + v * a + _ * (5 * h) + R * (5 * d)),
          (E += Q >>> 13),
          (Q &= 8191))
        let ht = E + C * d + U * p + I * y + $ * g + H * u
        ;((E = ht >>> 13),
          (ht &= 8191),
          (ht += V * f + m * l + v * c + _ * a + R * (5 * h)),
          (E += ht >>> 13),
          (ht &= 8191))
        let tt = E + C * h + U * d + I * p + $ * y + H * g
        ;((E = tt >>> 13),
          (tt &= 8191),
          (tt += V * u + m * f + v * l + _ * c + R * a),
          (E += tt >>> 13),
          (tt &= 8191),
          (E = ((E << 2) + E) | 0),
          (E = (E + N) | 0),
          (N = E & 8191),
          (E = E >>> 13),
          (q += E),
          (s[0] = N),
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
        let { h: t, pad: n } = this,
          r = new Uint16Array(10),
          o = t[1] >>> 13
        t[1] &= 8191
        for (let a = 2; a < 10; a++) ((t[a] += o), (o = t[a] >>> 13), (t[a] &= 8191))
        ;((t[0] += o * 5),
          (o = t[0] >>> 13),
          (t[0] &= 8191),
          (t[1] += o),
          (o = t[1] >>> 13),
          (t[1] &= 8191),
          (t[2] += o),
          (r[0] = t[0] + 5),
          (o = r[0] >>> 13),
          (r[0] &= 8191))
        for (let a = 1; a < 10; a++) ((r[a] = t[a] + o), (o = r[a] >>> 13), (r[a] &= 8191))
        r[9] -= 8192
        let s = (o ^ 1) - 1
        for (let a = 0; a < 10; a++) r[a] &= s
        s = ~s
        for (let a = 0; a < 10; a++) t[a] = (t[a] & s) | r[a]
        ;((t[0] = (t[0] | (t[1] << 13)) & 65535),
          (t[1] = ((t[1] >>> 3) | (t[2] << 10)) & 65535),
          (t[2] = ((t[2] >>> 6) | (t[3] << 7)) & 65535),
          (t[3] = ((t[3] >>> 9) | (t[4] << 4)) & 65535),
          (t[4] = ((t[4] >>> 12) | (t[5] << 1) | (t[6] << 14)) & 65535),
          (t[5] = ((t[6] >>> 2) | (t[7] << 11)) & 65535),
          (t[6] = ((t[7] >>> 5) | (t[8] << 8)) & 65535),
          (t[7] = ((t[8] >>> 8) | (t[9] << 5)) & 65535))
        let i = t[0] + n[0]
        t[0] = i & 65535
        for (let a = 1; a < 8; a++)
          ((i = (((t[a] + n[a]) | 0) + (i >>> 16)) | 0), (t[a] = i & 65535))
      }
      update(t) {
        Ht(this)
        let { buffer: n, blockLen: r } = this
        t = yt(t)
        let o = t.length
        for (let s = 0; s < o; ) {
          let i = Math.min(r - this.pos, o - s)
          if (i === r) {
            for (; r <= o - s; s += r) this.process(t, s)
            continue
          }
          ;(n.set(t.subarray(s, s + i), this.pos),
            (this.pos += i),
            (s += i),
            this.pos === r && (this.process(n, 0, !1), (this.pos = 0)))
        }
        return this
      }
      destroy() {
        ;(this.h.fill(0), this.r.fill(0), this.buffer.fill(0), this.pad.fill(0))
      }
      digestInto(t) {
        ;(Ht(this), de(t, this), (this.finished = !0))
        let { buffer: n, h: r } = this,
          { pos: o } = this
        if (o) {
          for (n[o++] = 1; o < 16; o++) n[o] = 0
          this.process(n, 0, !0)
        }
        this.finalize()
        let s = 0
        for (let i = 0; i < 8; i++) ((t[s++] = r[i] >>> 0), (t[s++] = r[i] >>> 8))
        return t
      }
      digest() {
        let { buffer: t, outputLen: n } = this
        this.digestInto(t)
        let r = t.slice(0, n)
        return (this.destroy(), r)
      }
    }
  function Ki(e) {
    let t = (r, o) => e(o).update(yt(r)).digest(),
      n = e(new Uint8Array(32))
    return ((t.outputLen = n.outputLen), (t.blockLen = n.blockLen), (t.create = r => e(r)), t)
  }
  var vo = Ki(e => new zn(e))
  var Ao = e => Uint8Array.from(e.split('').map(t => t.charCodeAt(0))),
    Zi = Ao('expand 16-byte k'),
    Gi = Ao('expand 32-byte k'),
    Ji = P(Zi),
    To = P(Gi),
    Su = To.slice()
  function S(e, t) {
    return (e << t) | (e >>> (32 - t))
  }
  function Kn(e) {
    return e.byteOffset % 4 === 0
  }
  var je = 64,
    Yi = 16,
    Bo = 2 ** 32 - 1,
    Eo = new Uint32Array()
  function Xi(e, t, n, r, o, s, i, a) {
    let c = o.length,
      l = new Uint8Array(je),
      f = P(l),
      u = Kn(o) && Kn(s),
      g = u ? P(o) : Eo,
      y = u ? P(s) : Eo
    for (let p = 0; p < c; i++) {
      if ((e(t, n, r, f, i, a), i >= Bo)) throw new Error('arx: counter overflow')
      let d = Math.min(je, c - p)
      if (u && d === je) {
        let h = p / 4
        if (p % 4 !== 0) throw new Error('arx: invalid block position')
        for (let w = 0, b; w < Yi; w++) ((b = h + w), (y[b] = g[b] ^ f[w]))
        p += je
        continue
      }
      for (let h = 0, w; h < d; h++) ((w = p + h), (s[w] = o[w] ^ l[h]))
      p += d
    }
  }
  function Zn(e, t) {
    let {
      allowShortKeys: n,
      extendNonceFn: r,
      counterLength: o,
      counterRight: s,
      rounds: i,
    } = co({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, t)
    if (typeof e != 'function') throw new Error('core must be a function')
    return (
      Me(o),
      Me(i),
      Nn(s),
      Nn(n),
      (a, c, l, f, u = 0) => {
        ;(O(a), O(c), O(l))
        let g = l.length
        if ((f || (f = new Uint8Array(g)), O(f), Me(u), u < 0 || u >= Bo))
          throw new Error('arx: counter overflow')
        if (f.length < g) throw new Error(`arx: output (${f.length}) is shorter than data (${g})`)
        let y = [],
          p = a.length,
          d,
          h
        if (p === 32) ((d = a.slice()), y.push(d), (h = To))
        else if (p === 16 && n)
          ((d = new Uint8Array(32)), d.set(a), d.set(a, 16), (h = Ji), y.push(d))
        else throw new Error(`arx: invalid 32-byte key, got length=${p}`)
        Kn(c) || ((c = c.slice()), y.push(c))
        let w = P(d)
        if (r) {
          if (c.length !== 24) throw new Error('arx: extended nonce must be 24 bytes')
          ;(r(h, w, P(c.subarray(0, 16)), w), (c = c.subarray(16)))
        }
        let b = 16 - o
        if (b !== c.length) throw new Error(`arx: nonce must be ${b} or 16 bytes`)
        if (b !== 12) {
          let A = new Uint8Array(12)
          ;(A.set(c, s ? 0 : 12 - c.length), (c = A), y.push(c))
        }
        let x = P(c)
        for (Xi(e, h, w, x, l, f, u, i); y.length > 0; ) y.pop().fill(0)
        return f
      }
    )
  }
  function Lo(e, t, n, r, o, s = 20) {
    let i = e[0],
      a = e[1],
      c = e[2],
      l = e[3],
      f = t[0],
      u = t[1],
      g = t[2],
      y = t[3],
      p = t[4],
      d = t[5],
      h = t[6],
      w = t[7],
      b = o,
      x = n[0],
      A = n[1],
      k = n[2],
      T = i,
      B = a,
      L = c,
      C = l,
      U = f,
      I = u,
      $ = g,
      H = y,
      V = p,
      m = d,
      v = h,
      _ = w,
      R = b,
      E = x,
      N = A,
      q = k
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
        (E = S(E ^ B, 16)),
        (m = (m + E) | 0),
        (I = S(I ^ m, 12)),
        (B = (B + I) | 0),
        (E = S(E ^ B, 8)),
        (m = (m + E) | 0),
        (I = S(I ^ m, 7)),
        (L = (L + $) | 0),
        (N = S(N ^ L, 16)),
        (v = (v + N) | 0),
        ($ = S($ ^ v, 12)),
        (L = (L + $) | 0),
        (N = S(N ^ L, 8)),
        (v = (v + N) | 0),
        ($ = S($ ^ v, 7)),
        (C = (C + H) | 0),
        (q = S(q ^ C, 16)),
        (_ = (_ + q) | 0),
        (H = S(H ^ _, 12)),
        (C = (C + H) | 0),
        (q = S(q ^ C, 8)),
        (_ = (_ + q) | 0),
        (H = S(H ^ _, 7)),
        (T = (T + I) | 0),
        (q = S(q ^ T, 16)),
        (v = (v + q) | 0),
        (I = S(I ^ v, 12)),
        (T = (T + I) | 0),
        (q = S(q ^ T, 8)),
        (v = (v + q) | 0),
        (I = S(I ^ v, 7)),
        (B = (B + $) | 0),
        (R = S(R ^ B, 16)),
        (_ = (_ + R) | 0),
        ($ = S($ ^ _, 12)),
        (B = (B + $) | 0),
        (R = S(R ^ B, 8)),
        (_ = (_ + R) | 0),
        ($ = S($ ^ _, 7)),
        (L = (L + H) | 0),
        (E = S(E ^ L, 16)),
        (V = (V + E) | 0),
        (H = S(H ^ V, 12)),
        (L = (L + H) | 0),
        (E = S(E ^ L, 8)),
        (V = (V + E) | 0),
        (H = S(H ^ V, 7)),
        (C = (C + U) | 0),
        (N = S(N ^ C, 16)),
        (m = (m + N) | 0),
        (U = S(U ^ m, 12)),
        (C = (C + U) | 0),
        (N = S(N ^ C, 8)),
        (m = (m + N) | 0),
        (U = S(U ^ m, 7)))
    let M = 0
    ;((r[M++] = (i + T) | 0),
      (r[M++] = (a + B) | 0),
      (r[M++] = (c + L) | 0),
      (r[M++] = (l + C) | 0),
      (r[M++] = (f + U) | 0),
      (r[M++] = (u + I) | 0),
      (r[M++] = (g + $) | 0),
      (r[M++] = (y + H) | 0),
      (r[M++] = (p + V) | 0),
      (r[M++] = (d + m) | 0),
      (r[M++] = (h + v) | 0),
      (r[M++] = (w + _) | 0),
      (r[M++] = (b + R) | 0),
      (r[M++] = (x + E) | 0),
      (r[M++] = (A + N) | 0),
      (r[M++] = (k + q) | 0))
  }
  function Qi(e, t, n, r) {
    let o = e[0],
      s = e[1],
      i = e[2],
      a = e[3],
      c = t[0],
      l = t[1],
      f = t[2],
      u = t[3],
      g = t[4],
      y = t[5],
      p = t[6],
      d = t[7],
      h = n[0],
      w = n[1],
      b = n[2],
      x = n[3]
    for (let k = 0; k < 20; k += 2)
      ((o = (o + c) | 0),
        (h = S(h ^ o, 16)),
        (g = (g + h) | 0),
        (c = S(c ^ g, 12)),
        (o = (o + c) | 0),
        (h = S(h ^ o, 8)),
        (g = (g + h) | 0),
        (c = S(c ^ g, 7)),
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
        (a = (a + u) | 0),
        (x = S(x ^ a, 16)),
        (d = (d + x) | 0),
        (u = S(u ^ d, 12)),
        (a = (a + u) | 0),
        (x = S(x ^ a, 8)),
        (d = (d + x) | 0),
        (u = S(u ^ d, 7)),
        (o = (o + l) | 0),
        (x = S(x ^ o, 16)),
        (p = (p + x) | 0),
        (l = S(l ^ p, 12)),
        (o = (o + l) | 0),
        (x = S(x ^ o, 8)),
        (p = (p + x) | 0),
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
        (a = (a + c) | 0),
        (b = S(b ^ a, 16)),
        (y = (y + b) | 0),
        (c = S(c ^ y, 12)),
        (a = (a + c) | 0),
        (b = S(b ^ a, 8)),
        (y = (y + b) | 0),
        (c = S(c ^ y, 7)))
    let A = 0
    ;((r[A++] = o),
      (r[A++] = s),
      (r[A++] = i),
      (r[A++] = a),
      (r[A++] = h),
      (r[A++] = w),
      (r[A++] = b),
      (r[A++] = x))
  }
  var ze = Zn(Lo, { counterRight: !1, counterLength: 4, allowShortKeys: !1 }),
    Fi = Zn(Lo, { counterRight: !1, counterLength: 8, extendNonceFn: Qi, allowShortKeys: !1 })
  var ta = new Uint8Array(16),
    So = (e, t) => {
      e.update(t)
      let n = t.length % 16
      n && e.update(ta.subarray(n))
    },
    ea = new Uint8Array(32)
  function ko(e, t, n, r, o) {
    let s = e(t, n, ea),
      i = vo.create(s)
    ;(o && So(i, o), So(i, r))
    let a = new Uint8Array(16),
      c = Mt(a)
    ;(Zt(c, 0, BigInt(o ? o.length : 0), !0), Zt(c, 8, BigInt(r.length), !0), i.update(a))
    let l = i.digest()
    return (s.fill(0), l)
  }
  var _o = e => (t, n, r) => (
      O(t, 32),
      O(n),
      {
        encrypt: (s, i) => {
          let a = s.length,
            c = a + 16
          ;(i ? O(i, c) : (i = new Uint8Array(c)), e(t, n, s, i, 1))
          let l = ko(e, t, n, i.subarray(0, -16), r)
          return (i.set(l, a), i)
        },
        decrypt: (s, i) => {
          let a = s.length,
            c = a - 16
          if (a < 16) throw new Error('encrypted data must be at least 16 bytes')
          i ? O(i, c) : (i = new Uint8Array(c))
          let l = s.subarray(0, -16),
            f = s.subarray(-16),
            u = ko(e, t, n, l, r)
          if (!Kt(f, u)) throw new Error('invalid tag')
          return (e(t, n, l, i, 1), i)
        },
      }
    ),
    Ru = wt({ blockSize: 64, nonceLength: 12, tagLength: 16 }, _o(ze)),
    Cu = wt({ blockSize: 64, nonceLength: 24, tagLength: 16 }, _o(Fi))
  var Ke = class extends ee {
      constructor(t, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), rt.hash(t))
        let r = Ct(n)
        if (((this.iHash = t.create()), typeof this.iHash.update != 'function'))
          throw new Error('Expected instance of class which extends utils.Hash')
        ;((this.blockLen = this.iHash.blockLen), (this.outputLen = this.iHash.outputLen))
        let o = this.blockLen,
          s = new Uint8Array(o)
        s.set(r.length > o ? t.create().update(r).digest() : r)
        for (let i = 0; i < s.length; i++) s[i] ^= 54
        ;(this.iHash.update(s), (this.oHash = t.create()))
        for (let i = 0; i < s.length; i++) s[i] ^= 106
        ;(this.oHash.update(s), s.fill(0))
      }
      update(t) {
        return (rt.exists(this), this.iHash.update(t), this)
      }
      digestInto(t) {
        ;(rt.exists(this),
          rt.bytes(t, this.outputLen),
          (this.finished = !0),
          this.iHash.digestInto(t),
          this.oHash.update(t),
          this.oHash.digestInto(t),
          this.destroy())
      }
      digest() {
        let t = new Uint8Array(this.oHash.outputLen)
        return (this.digestInto(t), t)
      }
      _cloneInto(t) {
        t || (t = Object.create(Object.getPrototypeOf(this), {}))
        let { oHash: n, iHash: r, finished: o, destroyed: s, blockLen: i, outputLen: a } = this
        return (
          (t = t),
          (t.finished = o),
          (t.destroyed = s),
          (t.blockLen = i),
          (t.outputLen = a),
          (t.oHash = n._cloneInto(t.oHash)),
          (t.iHash = r._cloneInto(t.iHash)),
          t
        )
      }
      destroy() {
        ;((this.destroyed = !0), this.oHash.destroy(), this.iHash.destroy())
      }
    },
    ie = (e, t, n) => new Ke(e, t).update(n).digest()
  ie.create = (e, t) => new Ke(e, t)
  function Uo(e, t, n) {
    return (rt.hash(e), n === void 0 && (n = new Uint8Array(e.outputLen)), ie(e, Ct(n), Ct(t)))
  }
  var Gn = new Uint8Array([0]),
    Io = new Uint8Array()
  function Ro(e, t, n, r = 32) {
    if ((rt.hash(e), rt.number(r), r > 255 * e.outputLen))
      throw new Error('Length should be <= 255*HashLen')
    let o = Math.ceil(r / e.outputLen)
    n === void 0 && (n = Io)
    let s = new Uint8Array(o * e.outputLen),
      i = ie.create(e, t),
      a = i._cloneInto(),
      c = new Uint8Array(i.outputLen)
    for (let l = 0; l < o; l++)
      ((Gn[0] = l + 1),
        a
          .update(l === 0 ? Io : c)
          .update(n)
          .update(Gn)
          .digestInto(c),
        s.set(c, e.outputLen * l),
        i._cloneInto(a))
    return (i.destroy(), a.destroy(), c.fill(0), Gn.fill(0), s.slice(0, r))
  }
  var na = Object.defineProperty,
    W = (e, t) => {
      for (var n in t) na(e, n, { get: t[n], enumerable: !0 })
    },
    ae = Symbol('verified'),
    ra = e => e instanceof Object
  function Yn(e) {
    if (
      !ra(e) ||
      typeof e.kind != 'number' ||
      typeof e.content != 'string' ||
      typeof e.created_at != 'number' ||
      typeof e.pubkey != 'string' ||
      !e.pubkey.match(/^[a-f0-9]{64}$/) ||
      !Array.isArray(e.tags)
    )
      return !1
    for (let t = 0; t < e.tags.length; t++) {
      let n = e.tags[t]
      if (!Array.isArray(n)) return !1
      for (let r = 0; r < n.length; r++) if (typeof n[r] != 'string') return !1
    }
    return !0
  }
  var oa = {}
  W(oa, {
    Queue: () => ca,
    QueueNode: () => Oo,
    binarySearch: () => Xn,
    bytesToHex: () => j,
    hexToBytes: () => At,
    insertEventIntoAscendingList: () => aa,
    insertEventIntoDescendingList: () => ia,
    normalizeURL: () => sa,
    utf8Decoder: () => Lt,
    utf8Encoder: () => dt,
  })
  var Lt = new TextDecoder('utf-8'),
    dt = new TextEncoder()
  function sa(e) {
    try {
      e.indexOf('://') === -1 && (e = 'wss://' + e)
      let t = new URL(e)
      return (
        (t.pathname = t.pathname.replace(/\/+/g, '/')),
        t.pathname.endsWith('/') && (t.pathname = t.pathname.slice(0, -1)),
        ((t.port === '80' && t.protocol === 'ws:') ||
          (t.port === '443' && t.protocol === 'wss:')) &&
          (t.port = ''),
        t.searchParams.sort(),
        (t.hash = ''),
        t.toString()
      )
    } catch {
      throw new Error(`Invalid URL: ${e}`)
    }
  }
  function ia(e, t) {
    let [n, r] = Xn(e, o =>
      t.id === o.id ? 0 : t.created_at === o.created_at ? -1 : o.created_at - t.created_at
    )
    return (r || e.splice(n, 0, t), e)
  }
  function aa(e, t) {
    let [n, r] = Xn(e, o =>
      t.id === o.id ? 0 : t.created_at === o.created_at ? -1 : t.created_at - o.created_at
    )
    return (r || e.splice(n, 0, t), e)
  }
  function Xn(e, t) {
    let n = 0,
      r = e.length - 1
    for (; n <= r; ) {
      let o = Math.floor((n + r) / 2),
        s = t(e[o])
      if (s === 0) return [o, !0]
      s < 0 ? (r = o - 1) : (n = o + 1)
    }
    return [n, !1]
  }
  var Oo = class {
      constructor(e) {
        Xt(this, 'value')
        Xt(this, 'next', null)
        Xt(this, 'prev', null)
        this.value = e
      }
    },
    ca = class {
      constructor() {
        Xt(this, 'first')
        Xt(this, 'last')
        ;((this.first = null), (this.last = null))
      }
      enqueue(e) {
        let t = new Oo(e)
        return (
          this.last
            ? this.last === this.first
              ? ((this.last = t), (this.last.prev = this.first), (this.first.next = t))
              : ((t.prev = this.last), (this.last.next = t), (this.last = t))
            : ((this.first = t), (this.last = t)),
          !0
        )
      }
      dequeue() {
        if (!this.first) return null
        if (this.first === this.last) {
          let t = this.first
          return ((this.first = null), (this.last = null), t.value)
        }
        let e = this.first
        return ((this.first = e.next), this.first && (this.first.prev = null), e.value)
      }
    },
    la = class {
      generateSecretKey() {
        return te.utils.randomPrivateKey()
      }
      getPublicKey(e) {
        return j(te.getPublicKey(e))
      }
      finalizeEvent(e, t) {
        let n = e
        return (
          (n.pubkey = j(te.getPublicKey(t))),
          (n.id = Ze(n)),
          (n.sig = j(te.sign(Ze(n), t))),
          (n[ae] = !0),
          n
        )
      }
      verifyEvent(e) {
        if (typeof e[ae] == 'boolean') return e[ae]
        let t = Ze(e)
        if (t !== e.id) return ((e[ae] = !1), !1)
        try {
          let n = te.verify(e.sig, t, e.pubkey)
          return ((e[ae] = n), n)
        } catch {
          return ((e[ae] = !1), !1)
        }
      }
    }
  function fa(e) {
    if (!Yn(e)) throw new Error("can't serialize event with wrong or missing properties")
    return JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])
  }
  function Ze(e) {
    let t = gt(dt.encode(fa(e)))
    return j(t)
  }
  var Je = new la(),
    ua = Je.generateSecretKey,
    Qn = Je.getPublicKey,
    xt = Je.finalizeEvent,
    Fn = Je.verifyEvent,
    da = {}
  W(da, {
    Application: () => uc,
    BadgeAward: () => xa,
    BadgeDefinition: () => oc,
    BlockedRelaysList: () => Wa,
    BookmarkList: () => Ma,
    Bookmarksets: () => ec,
    Calendar: () => bc,
    CalendarEventRSVP: () => mc,
    ChannelCreation: () => Vo,
    ChannelHideMessage: () => jo,
    ChannelMessage: () => Do,
    ChannelMetadata: () => Wo,
    ChannelMuteUser: () => zo,
    ClassifiedListing: () => pc,
    ClientAuth: () => Zo,
    CommunitiesList: () => qa,
    CommunityDefinition: () => Ec,
    CommunityPostApproval: () => La,
    Contacts: () => wa,
    CreateOrUpdateProduct: () => ac,
    CreateOrUpdateStall: () => ic,
    Curationsets: () => nc,
    Date: () => yc,
    DirectMessageRelaysList: () => Ka,
    DraftClassifiedListing: () => gc,
    DraftLong: () => lc,
    Emojisets: () => fc,
    EncryptedDirectMessage: () => ba,
    EventDeletion: () => ma,
    FileMetadata: () => Ea,
    FileServerPreference: () => Za,
    Followsets: () => Qa,
    GenericRepost: () => or,
    Genericlists: () => Fa,
    GiftWrap: () => Ko,
    HTTPAuth: () => sr,
    Handlerinformation: () => vc,
    Handlerrecommendation: () => xc,
    Highlights: () => Oa,
    InterestsList: () => ja,
    Interestsets: () => sc,
    JobFeedback: () => Ua,
    JobRequest: () => _a,
    JobResult: () => Ia,
    Label: () => ka,
    LightningPubRPC: () => Ja,
    LiveChatMessage: () => Aa,
    LiveEvent: () => dc,
    LongFormArticle: () => cc,
    Metadata: () => ga,
    Mutelist: () => Pa,
    NWCWalletInfo: () => Ga,
    NWCWalletRequest: () => Go,
    NWCWalletResponse: () => Ya,
    NostrConnect: () => Xa,
    OpenTimestamps: () => va,
    Pinlist: () => $a,
    PrivateDirectMessage: () => qo,
    ProblemTracker: () => Ta,
    ProfileBadges: () => rc,
    PublicChatsList: () => Va,
    Reaction: () => rr,
    RecommendRelay: () => ya,
    RelayList: () => Ha,
    Relaysets: () => tc,
    Report: () => Ba,
    Reporting: () => Sa,
    Repost: () => nr,
    Seal: () => Mo,
    SearchRelaysList: () => Da,
    ShortTextNote: () => Ho,
    Time: () => wc,
    UserEmojiList: () => za,
    UserStatuses: () => hc,
    Zap: () => Na,
    ZapGoal: () => Ra,
    ZapRequest: () => Ca,
    classifyKind: () => ha,
    isAddressableKind: () => er,
    isEphemeralKind: () => $o,
    isKind: () => pa,
    isRegularKind: () => Po,
    isReplaceableKind: () => tr,
  })
  function Po(e) {
    return (1e3 <= e && e < 1e4) || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(e)
  }
  function tr(e) {
    return [0, 3].includes(e) || (1e4 <= e && e < 2e4)
  }
  function $o(e) {
    return 2e4 <= e && e < 3e4
  }
  function er(e) {
    return 3e4 <= e && e < 4e4
  }
  function ha(e) {
    return Po(e)
      ? 'regular'
      : tr(e)
        ? 'replaceable'
        : $o(e)
          ? 'ephemeral'
          : er(e)
            ? 'parameterized'
            : 'unknown'
  }
  function pa(e, t) {
    let n = t instanceof Array ? t : [t]
    return (Yn(e) && n.includes(e.kind)) || !1
  }
  var ga = 0,
    Ho = 1,
    ya = 2,
    wa = 3,
    ba = 4,
    ma = 5,
    nr = 6,
    rr = 7,
    xa = 8,
    Mo = 13,
    qo = 14,
    or = 16,
    Vo = 40,
    Wo = 41,
    Do = 42,
    jo = 43,
    zo = 44,
    va = 1040,
    Ko = 1059,
    Ea = 1063,
    Aa = 1311,
    Ta = 1971,
    Ba = 1984,
    Sa = 1984,
    ka = 1985,
    La = 4550,
    _a = 5999,
    Ia = 6999,
    Ua = 7e3,
    Ra = 9041,
    Ca = 9734,
    Na = 9735,
    Oa = 9802,
    Pa = 1e4,
    $a = 10001,
    Ha = 10002,
    Ma = 10003,
    qa = 10004,
    Va = 10005,
    Wa = 10006,
    Da = 10007,
    ja = 10015,
    za = 10030,
    Ka = 10050,
    Za = 10096,
    Ga = 13194,
    Ja = 21e3,
    Zo = 22242,
    Go = 23194,
    Ya = 23195,
    Xa = 24133,
    sr = 27235,
    Qa = 3e4,
    Fa = 30001,
    tc = 30002,
    ec = 30003,
    nc = 30004,
    rc = 30008,
    oc = 30009,
    sc = 30015,
    ic = 30017,
    ac = 30018,
    cc = 30023,
    lc = 30024,
    fc = 30030,
    uc = 30078,
    dc = 30311,
    hc = 30315,
    pc = 30402,
    gc = 30403,
    yc = 31922,
    wc = 31923,
    bc = 31924,
    mc = 31925,
    xc = 31989,
    vc = 31990,
    Ec = 34550
  var Ac = {}
  W(Ac, {
    getHex64: () => ir,
    getInt: () => Jo,
    getSubscriptionId: () => Tc,
    matchEventId: () => Bc,
    matchEventKind: () => kc,
    matchEventPubkey: () => Sc,
  })
  function ir(e, t) {
    let n = t.length + 3,
      r = e.indexOf(`"${t}":`) + n,
      o = e.slice(r).indexOf('"') + r + 1
    return e.slice(o, o + 64)
  }
  function Jo(e, t) {
    let n = t.length,
      r = e.indexOf(`"${t}":`) + n + 3,
      o = e.slice(r),
      s = Math.min(o.indexOf(','), o.indexOf('}'))
    return parseInt(o.slice(0, s), 10)
  }
  function Tc(e) {
    let t = e.slice(0, 22).indexOf('"EVENT"')
    if (t === -1) return null
    let n = e.slice(t + 7 + 1).indexOf('"')
    if (n === -1) return null
    let r = t + 7 + 1 + n,
      o = e.slice(r + 1, 80).indexOf('"')
    if (o === -1) return null
    let s = r + 1 + o
    return e.slice(r + 1, s)
  }
  function Bc(e, t) {
    return t === ir(e, 'id')
  }
  function Sc(e, t) {
    return t === ir(e, 'pubkey')
  }
  function kc(e, t) {
    return t === Jo(e, 'kind')
  }
  var Lc = {}
  W(Lc, { makeAuthEvent: () => _c })
  function _c(e, t) {
    return {
      kind: Zo,
      created_at: Math.floor(Date.now() / 1e3),
      tags: [
        ['relay', e],
        ['challenge', t],
      ],
      content: '',
    }
  }
  var Ic
  try {
    Ic = WebSocket
  } catch {}
  var Uc
  try {
    Uc = WebSocket
  } catch {}
  var ar = {}
  W(ar, {
    BECH32_REGEX: () => Yo,
    Bech32MaxSize: () => cr,
    NostrTypeGuard: () => Rc,
    decode: () => Ye,
    decodeNostrURI: () => Nc,
    encodeBytes: () => Qe,
    naddrEncode: () => qc,
    neventEncode: () => Mc,
    noteEncode: () => $c,
    nprofileEncode: () => Hc,
    npubEncode: () => Pc,
    nsecEncode: () => Oc,
  })
  var Rc = {
      isNProfile: e => /^nprofile1[a-z\d]+$/.test(e || ''),
      isNEvent: e => /^nevent1[a-z\d]+$/.test(e || ''),
      isNAddr: e => /^naddr1[a-z\d]+$/.test(e || ''),
      isNSec: e => /^nsec1[a-z\d]{58}$/.test(e || ''),
      isNPub: e => /^npub1[a-z\d]{58}$/.test(e || ''),
      isNote: e => /^note1[a-z\d]+$/.test(e || ''),
      isNcryptsec: e => /^ncryptsec1[a-z\d]+$/.test(e || ''),
    },
    cr = 5e3,
    Yo = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/
  function Cc(e) {
    let t = new Uint8Array(4)
    return (
      (t[0] = (e >> 24) & 255),
      (t[1] = (e >> 16) & 255),
      (t[2] = (e >> 8) & 255),
      (t[3] = e & 255),
      t
    )
  }
  function Nc(e) {
    try {
      return (e.startsWith('nostr:') && (e = e.substring(6)), Ye(e))
    } catch {
      return { type: 'invalid', data: null }
    }
  }
  function Ye(e) {
    let { prefix: t, words: n } = $t.decode(e, cr),
      r = new Uint8Array($t.fromWords(n))
    switch (t) {
      case 'nprofile': {
        let o = Jn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        return {
          type: 'nprofile',
          data: { pubkey: j(o[0][0]), relays: o[1] ? o[1].map(s => Lt.decode(s)) : [] },
        }
      }
      case 'nevent': {
        let o = Jn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nevent')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        if (o[2] && o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (o[3] && o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'nevent',
          data: {
            id: j(o[0][0]),
            relays: o[1] ? o[1].map(s => Lt.decode(s)) : [],
            author: o[2]?.[0] ? j(o[2][0]) : void 0,
            kind: o[3]?.[0] ? parseInt(j(o[3][0]), 16) : void 0,
          },
        }
      }
      case 'naddr': {
        let o = Jn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for naddr')
        if (!o[2]?.[0]) throw new Error('missing TLV 2 for naddr')
        if (o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (!o[3]?.[0]) throw new Error('missing TLV 3 for naddr')
        if (o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'naddr',
          data: {
            identifier: Lt.decode(o[0][0]),
            pubkey: j(o[2][0]),
            kind: parseInt(j(o[3][0]), 16),
            relays: o[1] ? o[1].map(s => Lt.decode(s)) : [],
          },
        }
      }
      case 'nsec':
        return { type: t, data: r }
      case 'npub':
      case 'note':
        return { type: t, data: j(r) }
      default:
        throw new Error(`unknown prefix ${t}`)
    }
  }
  function Jn(e) {
    let t = {},
      n = e
    for (; n.length > 0; ) {
      let r = n[0],
        o = n[1],
        s = n.slice(2, 2 + o)
      if (((n = n.slice(2 + o)), s.length < o))
        throw new Error(`not enough data to read on TLV ${r}`)
      ;((t[r] = t[r] || []), t[r].push(s))
    }
    return t
  }
  function Oc(e) {
    return Qe('nsec', e)
  }
  function Pc(e) {
    return Qe('npub', At(e))
  }
  function $c(e) {
    return Qe('note', At(e))
  }
  function Xe(e, t) {
    let n = $t.toWords(t)
    return $t.encode(e, n, cr)
  }
  function Qe(e, t) {
    return Xe(e, t)
  }
  function Hc(e) {
    let t = lr({ 0: [At(e.pubkey)], 1: (e.relays || []).map(n => dt.encode(n)) })
    return Xe('nprofile', t)
  }
  function Mc(e) {
    let t
    e.kind !== void 0 && (t = Cc(e.kind))
    let n = lr({
      0: [At(e.id)],
      1: (e.relays || []).map(r => dt.encode(r)),
      2: e.author ? [At(e.author)] : [],
      3: t ? [new Uint8Array(t)] : [],
    })
    return Xe('nevent', n)
  }
  function qc(e) {
    let t = new ArrayBuffer(4)
    new DataView(t).setUint32(0, e.kind, !1)
    let n = lr({
      0: [dt.encode(e.identifier)],
      1: (e.relays || []).map(r => dt.encode(r)),
      2: [At(e.pubkey)],
      3: [new Uint8Array(t)],
    })
    return Xe('naddr', n)
  }
  function lr(e) {
    let t = []
    return (
      Object.entries(e)
        .reverse()
        .forEach(([n, r]) => {
          r.forEach(o => {
            let s = new Uint8Array(o.length + 2)
            ;(s.set([parseInt(n)], 0), s.set([o.length], 1), s.set(o, 2), t.push(s))
          })
        }),
      ne(...t)
    )
  }
  var Vc = {}
  W(Vc, { decrypt: () => Wc, encrypt: () => Xo })
  function Xo(e, t, n) {
    let r = e instanceof Uint8Array ? j(e) : e,
      o = Rt.getSharedSecret(r, '02' + t),
      s = Qo(o),
      i = Uint8Array.from(Ne(16)),
      a = dt.encode(n),
      c = jn(s, i).encrypt(a),
      l = it.encode(new Uint8Array(c)),
      f = it.encode(new Uint8Array(i.buffer))
    return `${l}?iv=${f}`
  }
  function Wc(e, t, n) {
    let r = e instanceof Uint8Array ? j(e) : e,
      [o, s] = n.split('?iv='),
      i = Rt.getSharedSecret(r, '02' + t),
      a = Qo(i),
      c = it.decode(s),
      l = it.decode(o),
      f = jn(a, c).decrypt(l)
    return Lt.decode(f)
  }
  function Qo(e) {
    return e.slice(1, 33)
  }
  var Dc = {}
  W(Dc, {
    NIP05_REGEX: () => fr,
    isNip05: () => jc,
    isValid: () => Zc,
    queryProfile: () => Fo,
    searchDomain: () => Kc,
    useFetchImplementation: () => zc,
  })
  var fr = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/,
    jc = e => fr.test(e || ''),
    Fe
  try {
    Fe = fetch
  } catch {}
  function zc(e) {
    Fe = e
  }
  async function Kc(e, t = '') {
    try {
      let n = `https://${e}/.well-known/nostr.json?name=${t}`,
        r = await Fe(n, { redirect: 'manual' })
      if (r.status !== 200) throw Error('Wrong response code')
      return (await r.json()).names
    } catch {
      return {}
    }
  }
  async function Fo(e) {
    let t = e.match(fr)
    if (!t) return null
    let [, n = '_', r] = t
    try {
      let o = `https://${r}/.well-known/nostr.json?name=${n}`,
        s = await Fe(o, { redirect: 'manual' })
      if (s.status !== 200) throw Error('Wrong response code')
      let i = await s.json(),
        a = i.names[n]
      return a ? { pubkey: a, relays: i.relays?.[a] } : null
    } catch {
      return null
    }
  }
  async function Zc(e, t) {
    let n = await Fo(t)
    return n ? n.pubkey === e : !1
  }
  var Gc = {}
  W(Gc, { parse: () => Jc })
  function Jc(e) {
    let t = { reply: void 0, root: void 0, mentions: [], profiles: [], quotes: [] },
      n,
      r
    for (let o = e.tags.length - 1; o >= 0; o--) {
      let s = e.tags[o]
      if (s[0] === 'e' && s[1]) {
        let [i, a, c, l, f] = s,
          u = { id: a, relays: c ? [c] : [], author: f }
        if (l === 'root') {
          t.root = u
          continue
        }
        if (l === 'reply') {
          t.reply = u
          continue
        }
        if (l === 'mention') {
          t.mentions.push(u)
          continue
        }
        ;(n ? (r = u) : (n = u), t.mentions.push(u))
        continue
      }
      if (s[0] === 'q' && s[1]) {
        let [i, a, c] = s
        t.quotes.push({ id: a, relays: c ? [c] : [] })
      }
      if (s[0] === 'p' && s[1]) {
        t.profiles.push({ pubkey: s[1], relays: s[2] ? [s[2]] : [] })
        continue
      }
    }
    return (
      t.root || (t.root = r || n || t.reply),
      t.reply || (t.reply = n || t.root),
      [t.reply, t.root].forEach(o => {
        if (!o) return
        let s = t.mentions.indexOf(o)
        if ((s !== -1 && t.mentions.splice(s, 1), o.author)) {
          let i = t.profiles.find(a => a.pubkey === o.author)
          i &&
            i.relays &&
            (o.relays || (o.relays = []),
            i.relays.forEach(a => {
              o.relays?.indexOf(a) === -1 && o.relays.push(a)
            }),
            (i.relays = o.relays))
        }
      }),
      t.mentions.forEach(o => {
        if (o.author) {
          let s = t.profiles.find(i => i.pubkey === o.author)
          s &&
            s.relays &&
            (o.relays || (o.relays = []),
            s.relays.forEach(i => {
              o.relays.indexOf(i) === -1 && o.relays.push(i)
            }),
            (s.relays = o.relays))
        }
      }),
      t
    )
  }
  var Yc = {}
  W(Yc, { fetchRelayInformation: () => Qc, useFetchImplementation: () => Xc })
  var ts
  try {
    ts = fetch
  } catch {}
  function Xc(e) {
    ts = e
  }
  async function Qc(e) {
    return await (
      await fetch(e.replace('ws://', 'http://').replace('wss://', 'https://'), {
        headers: { Accept: 'application/nostr+json' },
      })
    ).json()
  }
  var Fc = {}
  W(Fc, { fastEventHash: () => ns, getPow: () => es, minePow: () => tl })
  function es(e) {
    let t = 0
    for (let n = 0; n < 64; n += 8) {
      let r = parseInt(e.substring(n, n + 8), 16)
      if (r === 0) t += 32
      else {
        t += Math.clz32(r)
        break
      }
    }
    return t
  }
  function tl(e, t) {
    let n = 0,
      r = e,
      o = ['nonce', n.toString(), t.toString()]
    for (r.tags.push(o); ; ) {
      let s = Math.floor(new Date().getTime() / 1e3)
      if (
        (s !== r.created_at && ((n = 0), (r.created_at = s)),
        (o[1] = (++n).toString()),
        (r.id = ns(r)),
        es(r.id) >= t)
      )
        break
    }
    return r
  }
  function ns(e) {
    return j(gt(dt.encode(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]))))
  }
  var el = {}
  W(el, {
    unwrapEvent: () => hl,
    unwrapManyEvents: () => pl,
    wrapEvent: () => gs,
    wrapManyEvents: () => dl,
  })
  var nl = {}
  W(nl, {
    createRumor: () => us,
    createSeal: () => ds,
    createWrap: () => hs,
    unwrapEvent: () => gr,
    unwrapManyEvents: () => ps,
    wrapEvent: () => Ge,
    wrapManyEvents: () => fl,
  })
  var rl = {}
  W(rl, { decrypt: () => pr, encrypt: () => hr, getConversationKey: () => ur, v2: () => cl })
  var rs = 1,
    os = 65535
  function ur(e, t) {
    let n = Rt.getSharedSecret(e, '02' + t).subarray(1, 33)
    return Uo(gt, n, 'nip44-v2')
  }
  function ss(e, t) {
    let n = Ro(gt, e, t, 76)
    return {
      chacha_key: n.subarray(0, 32),
      chacha_nonce: n.subarray(32, 44),
      hmac_key: n.subarray(44, 76),
    }
  }
  function dr(e) {
    if (!Number.isSafeInteger(e) || e < 1) throw new Error('expected positive integer')
    if (e <= 32) return 32
    let t = 1 << (Math.floor(Math.log2(e - 1)) + 1),
      n = t <= 256 ? 32 : t / 8
    return n * (Math.floor((e - 1) / n) + 1)
  }
  function ol(e) {
    if (!Number.isSafeInteger(e) || e < rs || e > os)
      throw new Error('invalid plaintext size: must be between 1 and 65535 bytes')
    let t = new Uint8Array(2)
    return (new DataView(t.buffer).setUint16(0, e, !1), t)
  }
  function sl(e) {
    let t = dt.encode(e),
      n = t.length,
      r = ol(n),
      o = new Uint8Array(dr(n) - n)
    return ne(r, t, o)
  }
  function il(e) {
    let t = new DataView(e.buffer).getUint16(0),
      n = e.subarray(2, 2 + t)
    if (t < rs || t > os || n.length !== t || e.length !== 2 + dr(t))
      throw new Error('invalid padding')
    return Lt.decode(n)
  }
  function is(e, t, n) {
    if (n.length !== 32) throw new Error('AAD associated data must be 32 bytes')
    let r = ne(n, t)
    return ie(gt, e, r)
  }
  function al(e) {
    if (typeof e != 'string') throw new Error('payload must be a valid string')
    let t = e.length
    if (t < 132 || t > 87472) throw new Error('invalid payload length: ' + t)
    if (e[0] === '#') throw new Error('unknown encryption version')
    let n
    try {
      n = it.decode(e)
    } catch (s) {
      throw new Error('invalid base64: ' + s.message)
    }
    let r = n.length
    if (r < 99 || r > 65603) throw new Error('invalid data length: ' + r)
    let o = n[0]
    if (o !== 2) throw new Error('unknown encryption version ' + o)
    return { nonce: n.subarray(1, 33), ciphertext: n.subarray(33, -32), mac: n.subarray(-32) }
  }
  function hr(e, t, n = Ne(32)) {
    let { chacha_key: r, chacha_nonce: o, hmac_key: s } = ss(t, n),
      i = sl(e),
      a = ze(r, o, i),
      c = is(s, a, n)
    return it.encode(ne(new Uint8Array([2]), n, a, c))
  }
  function pr(e, t) {
    let { nonce: n, ciphertext: r, mac: o } = al(e),
      { chacha_key: s, chacha_nonce: i, hmac_key: a } = ss(t, n),
      c = is(a, r, n)
    if (!Kt(c, o)) throw new Error('invalid MAC')
    let l = ze(s, i, r)
    return il(l)
  }
  var cl = { utils: { getConversationKey: ur, calcPaddedLen: dr }, encrypt: hr, decrypt: pr },
    ll = 2880 * 60,
    as = () => Math.round(Date.now() / 1e3),
    cs = () => Math.round(as() - Math.random() * ll),
    ls = (e, t) => ur(e, t),
    fs = (e, t, n) => hr(JSON.stringify(e), ls(t, n)),
    Co = (e, t) => JSON.parse(pr(e.content, ls(t, e.pubkey)))
  function us(e, t) {
    let n = { created_at: as(), content: '', tags: [], ...e, pubkey: Qn(t) }
    return ((n.id = Ze(n)), n)
  }
  function ds(e, t, n) {
    return xt({ kind: Mo, content: fs(e, t, n), created_at: cs(), tags: [] }, t)
  }
  function hs(e, t) {
    let n = ua()
    return xt({ kind: Ko, content: fs(e, n, t), created_at: cs(), tags: [['p', t]] }, n)
  }
  function Ge(e, t, n) {
    let r = us(e, t),
      o = ds(r, t, n)
    return hs(o, n)
  }
  function fl(e, t, n) {
    if (!n || n.length === 0) throw new Error('At least one recipient is required.')
    let r = Qn(t),
      o = [Ge(e, t, r)]
    return (
      n.forEach(s => {
        o.push(Ge(e, t, s))
      }),
      o
    )
  }
  function gr(e, t) {
    let n = Co(e, t)
    return Co(n, t)
  }
  function ps(e, t) {
    let n = []
    return (
      e.forEach(r => {
        n.push(gr(r, t))
      }),
      n.sort((r, o) => r.created_at - o.created_at),
      n
    )
  }
  function ul(e, t, n, r) {
    let o = { created_at: Math.ceil(Date.now() / 1e3), kind: qo, tags: [], content: t }
    return (
      (Array.isArray(e) ? e : [e]).forEach(({ publicKey: i, relayUrl: a }) => {
        o.tags.push(a ? ['p', i, a] : ['p', i])
      }),
      r && o.tags.push(['e', r.eventId, r.relayUrl || '', 'reply']),
      n && o.tags.push(['subject', n]),
      o
    )
  }
  function gs(e, t, n, r, o) {
    let s = ul(t, n, r, o)
    return Ge(s, e, t.publicKey)
  }
  function dl(e, t, n, r, o) {
    if (!t || t.length === 0) throw new Error('At least one recipient is required.')
    return [{ publicKey: Qn(e) }, ...t].map(i => gs(e, i, n, r, o))
  }
  var hl = gr,
    pl = ps,
    gl = {}
  W(gl, {
    finishRepostEvent: () => yl,
    getRepostedEvent: () => wl,
    getRepostedEventPointer: () => ys,
  })
  function yl(e, t, n, r) {
    let o,
      s = [...(e.tags ?? []), ['e', t.id, n], ['p', t.pubkey]]
    return (
      t.kind === Ho ? (o = nr) : ((o = or), s.push(['k', String(t.kind)])),
      xt(
        {
          kind: o,
          tags: s,
          content: e.content === '' || t.tags?.find(i => i[0] === '-') ? '' : JSON.stringify(t),
          created_at: e.created_at,
        },
        r
      )
    )
  }
  function ys(e) {
    if (![nr, or].includes(e.kind)) return
    let t, n
    for (let r = e.tags.length - 1; r >= 0 && (t === void 0 || n === void 0); r--) {
      let o = e.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && t === void 0 ? (t = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (t !== void 0)
      return { id: t[1], relays: [t[2], n?.[2]].filter(r => typeof r == 'string'), author: n?.[1] }
  }
  function wl(e, { skipVerification: t } = {}) {
    let n = ys(e)
    if (n === void 0 || e.content === '') return
    let r
    try {
      r = JSON.parse(e.content)
    } catch {
      return
    }
    if (r.id === n.id && !(!t && !Fn(r))) return r
  }
  var bl = {}
  W(bl, { NOSTR_URI_REGEX: () => yr, parse: () => xl, test: () => ml })
  var yr = new RegExp(`nostr:(${Yo.source})`)
  function ml(e) {
    return typeof e == 'string' && new RegExp(`^${yr.source}$`).test(e)
  }
  function xl(e) {
    let t = e.match(new RegExp(`^${yr.source}$`))
    if (!t) throw new Error(`Invalid Nostr URI: ${e}`)
    return { uri: t[0], value: t[1], decoded: Ye(t[1]) }
  }
  var vl = {}
  W(vl, { finishReactionEvent: () => El, getReactedEventPointer: () => Al })
  function El(e, t, n) {
    let r = t.tags.filter(o => o.length >= 2 && (o[0] === 'e' || o[0] === 'p'))
    return xt(
      {
        ...e,
        kind: rr,
        tags: [...(e.tags ?? []), ...r, ['e', t.id], ['p', t.pubkey]],
        content: e.content ?? '+',
      },
      n
    )
  }
  function Al(e) {
    if (e.kind !== rr) return
    let t, n
    for (let r = e.tags.length - 1; r >= 0 && (t === void 0 || n === void 0); r--) {
      let o = e.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && t === void 0 ? (t = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (!(t === void 0 || n === void 0))
      return { id: t[1], relays: [t[2], n[2]].filter(r => r !== void 0), author: n[1] }
  }
  var Tl = {}
  W(Tl, { parse: () => Sl })
  var Bl = /\W/m,
    No = /\W |\W$|$|,| /m
  function* Sl(e) {
    let t = e.length,
      n = 0,
      r = 0
    for (; r < t; ) {
      let o = e.indexOf(':', r)
      if (o === -1) break
      if (e.substring(o - 5, o) === 'nostr') {
        let s = e.substring(o + 60).match(Bl),
          i = s ? o + 60 + s.index : t
        try {
          let a,
            { data: c, type: l } = Ye(e.substring(o + 1, i))
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
          ;(n !== o - 5 && (yield { type: 'text', text: e.substring(n, o - 5) }),
            yield { type: 'reference', pointer: a },
            (r = i),
            (n = r))
          continue
        } catch {
          r = o + 1
          continue
        }
      } else if (e.substring(o - 5, o) === 'https' || e.substring(o - 4, o) === 'http') {
        let s = e.substring(o + 4).match(No),
          i = s ? o + 4 + s.index : t,
          a = e[o - 1] === 's' ? 5 : 4
        try {
          let c = new URL(e.substring(o - a, i))
          if (c.hostname.indexOf('.') === -1) throw new Error('invalid url')
          if (
            (n !== o - a && (yield { type: 'text', text: e.substring(n, o - a) }),
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
      } else if (e.substring(o - 3, o) === 'wss' || e.substring(o - 2, o) === 'ws') {
        let s = e.substring(o + 4).match(No),
          i = s ? o + 4 + s.index : t,
          a = e[o - 1] === 's' ? 3 : 2
        try {
          let c = new URL(e.substring(o - a, i))
          if (c.hostname.indexOf('.') === -1) throw new Error('invalid ws url')
          ;(n !== o - a && (yield { type: 'text', text: e.substring(n, o - a) }),
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
    n !== t && (yield { type: 'text', text: e.substring(n) })
  }
  var kl = {}
  W(kl, {
    channelCreateEvent: () => Ll,
    channelHideMessageEvent: () => Ul,
    channelMessageEvent: () => Il,
    channelMetadataEvent: () => _l,
    channelMuteUserEvent: () => Rl,
  })
  var Ll = (e, t) => {
      let n
      if (typeof e.content == 'object') n = JSON.stringify(e.content)
      else if (typeof e.content == 'string') n = e.content
      else return
      return xt({ kind: Vo, tags: [...(e.tags ?? [])], content: n, created_at: e.created_at }, t)
    },
    _l = (e, t) => {
      let n
      if (typeof e.content == 'object') n = JSON.stringify(e.content)
      else if (typeof e.content == 'string') n = e.content
      else return
      return xt(
        {
          kind: Wo,
          tags: [['e', e.channel_create_event_id], ...(e.tags ?? [])],
          content: n,
          created_at: e.created_at,
        },
        t
      )
    },
    Il = (e, t) => {
      let n = [['e', e.channel_create_event_id, e.relay_url, 'root']]
      return (
        e.reply_to_channel_message_event_id &&
          n.push(['e', e.reply_to_channel_message_event_id, e.relay_url, 'reply']),
        xt(
          {
            kind: Do,
            tags: [...n, ...(e.tags ?? [])],
            content: e.content,
            created_at: e.created_at,
          },
          t
        )
      )
    },
    Ul = (e, t) => {
      let n
      if (typeof e.content == 'object') n = JSON.stringify(e.content)
      else if (typeof e.content == 'string') n = e.content
      else return
      return xt(
        {
          kind: jo,
          tags: [['e', e.channel_message_event_id], ...(e.tags ?? [])],
          content: n,
          created_at: e.created_at,
        },
        t
      )
    },
    Rl = (e, t) => {
      let n
      if (typeof e.content == 'object') n = JSON.stringify(e.content)
      else if (typeof e.content == 'string') n = e.content
      else return
      return xt(
        {
          kind: zo,
          tags: [['p', e.pubkey_to_mute], ...(e.tags ?? [])],
          content: n,
          created_at: e.created_at,
        },
        t
      )
    },
    Cl = {}
  W(Cl, {
    EMOJI_SHORTCODE_REGEX: () => ws,
    matchAll: () => Nl,
    regex: () => wr,
    replaceAll: () => Ol,
  })
  var ws = /:(\w+):/,
    wr = () => new RegExp(`\\B${ws.source}\\B`, 'g')
  function* Nl(e) {
    let t = e.matchAll(wr())
    for (let n of t)
      try {
        let [r, o] = n
        yield { shortcode: r, name: o, start: n.index, end: n.index + r.length }
      } catch {}
  }
  function Ol(e, t) {
    return e.replaceAll(wr(), (n, r) => t({ shortcode: n, name: r }))
  }
  var Pl = {}
  W(Pl, { useFetchImplementation: () => $l, validateGithub: () => Hl })
  var br
  try {
    br = fetch
  } catch {}
  function $l(e) {
    br = e
  }
  async function Hl(e, t, n) {
    try {
      return (
        (await (await br(`https://gist.github.com/${t}/${n}/raw`)).text()) ===
        `Verifying that I control the following Nostr public key: ${e}`
      )
    } catch {
      return !1
    }
  }
  var Ml = {}
  W(Ml, { makeNwcRequestEvent: () => Vl, parseConnectionString: () => ql })
  function ql(e) {
    let { host: t, pathname: n, searchParams: r } = new URL(e),
      o = n || t,
      s = r.get('relay'),
      i = r.get('secret')
    if (!o || !s || !i) throw new Error('invalid connection string')
    return { pubkey: o, relay: s, secret: i }
  }
  async function Vl(e, t, n) {
    let o = Xo(t, e, JSON.stringify({ method: 'pay_invoice', params: { invoice: n } })),
      s = { kind: Go, created_at: Math.round(Date.now() / 1e3), content: o, tags: [['p', e]] }
    return xt(s, t)
  }
  var Wl = {}
  W(Wl, { normalizeIdentifier: () => Dl })
  function Dl(e) {
    return (
      (e = e.trim().toLowerCase()),
      (e = e.normalize('NFKC')),
      Array.from(e)
        .map(t => (/\p{Letter}/u.test(t) || /\p{Number}/u.test(t) ? t : '-'))
        .join('')
    )
  }
  var jl = {}
  W(jl, {
    getSatoshisAmountFromBolt11: () => Yl,
    getZapEndpoint: () => Kl,
    makeZapReceipt: () => Jl,
    makeZapRequest: () => Zl,
    useFetchImplementation: () => zl,
    validateZapRequest: () => Gl,
  })
  var mr
  try {
    mr = fetch
  } catch {}
  function zl(e) {
    mr = e
  }
  async function Kl(e) {
    try {
      let t = '',
        { lud06: n, lud16: r } = JSON.parse(e.content)
      if (r) {
        let [i, a] = r.split('@')
        t = new URL(`/.well-known/lnurlp/${i}`, `https://${a}`).toString()
      } else if (n) {
        let { words: i } = $t.decode(n, 1e3),
          a = $t.fromWords(i)
        t = Lt.decode(a)
      } else return null
      let s = await (await mr(t)).json()
      if (s.allowsNostr && s.nostrPubkey) return s.callback
    } catch {}
    return null
  }
  function Zl(e) {
    let t = {
      kind: 9734,
      created_at: Math.round(Date.now() / 1e3),
      content: e.comment || '',
      tags: [
        ['p', 'pubkey' in e ? e.pubkey : e.event.pubkey],
        ['amount', e.amount.toString()],
        ['relays', ...e.relays],
      ],
    }
    if ('event' in e) {
      if ((t.tags.push(['e', e.event.id]), tr(e.event.kind))) {
        let n = ['a', `${e.event.kind}:${e.event.pubkey}:`]
        t.tags.push(n)
      } else if (er(e.event.kind)) {
        let n = e.event.tags.find(([o, s]) => o === 'd' && s)
        if (!n) throw new Error('d tag not found or is empty')
        let r = ['a', `${e.event.kind}:${e.event.pubkey}:${n[1]}`]
        t.tags.push(r)
      }
      t.tags.push(['k', e.event.kind.toString()])
    }
    return t
  }
  function Gl(e) {
    let t
    try {
      t = JSON.parse(e)
    } catch {
      return 'Invalid zap request JSON.'
    }
    if (!Yn(t)) return 'Zap request is not a valid Nostr event.'
    if (!Fn(t)) return 'Invalid signature on zap request.'
    let n = t.tags.find(([s, i]) => s === 'p' && i)
    if (!n) return "Zap request doesn't have a 'p' tag."
    if (!n[1].match(/^[a-f0-9]{64}$/)) return "Zap request 'p' tag is not valid hex."
    let r = t.tags.find(([s, i]) => s === 'e' && i)
    return r && !r[1].match(/^[a-f0-9]{64}$/)
      ? "Zap request 'e' tag is not valid hex."
      : t.tags.find(([s, i]) => s === 'relays' && i)
        ? null
        : "Zap request doesn't have a 'relays' tag."
  }
  function Jl({ zapRequest: e, preimage: t, bolt11: n, paidAt: r }) {
    let o = JSON.parse(e),
      s = o.tags.filter(([a]) => a === 'e' || a === 'p' || a === 'a'),
      i = {
        kind: 9735,
        created_at: Math.round(r.getTime() / 1e3),
        content: '',
        tags: [...s, ['P', o.pubkey], ['bolt11', n], ['description', e]],
      }
    return (t && i.tags.push(['preimage', t]), i)
  }
  function Yl(e) {
    if (e.length < 50) return 0
    e = e.substring(0, 50)
    let t = e.lastIndexOf('1')
    if (t === -1) return 0
    let n = e.substring(0, t)
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
  var Xl = {}
  W(Xl, {
    getToken: () => Ql,
    hashPayload: () => xr,
    unpackEventFromToken: () => ms,
    validateEvent: () => Bs,
    validateEventKind: () => vs,
    validateEventMethodTag: () => As,
    validateEventPayloadTag: () => Ts,
    validateEventTimestamp: () => xs,
    validateEventUrlTag: () => Es,
    validateToken: () => Fl,
  })
  var bs = 'Nostr '
  async function Ql(e, t, n, r = !1, o) {
    let s = {
      kind: sr,
      tags: [
        ['u', e],
        ['method', t],
      ],
      created_at: Math.round(new Date().getTime() / 1e3),
      content: '',
    }
    o && s.tags.push(['payload', xr(o)])
    let i = await n(s)
    return (r ? bs : '') + it.encode(dt.encode(JSON.stringify(i)))
  }
  async function Fl(e, t, n) {
    let r = await ms(e).catch(s => {
      throw s
    })
    return await Bs(r, t, n).catch(s => {
      throw s
    })
  }
  async function ms(e) {
    if (!e) throw new Error('Missing token')
    e = e.replace(bs, '')
    let t = Lt.decode(it.decode(e))
    if (!t || t.length === 0 || !t.startsWith('{')) throw new Error('Invalid token')
    return JSON.parse(t)
  }
  function xs(e) {
    return e.created_at ? Math.round(new Date().getTime() / 1e3) - e.created_at < 60 : !1
  }
  function vs(e) {
    return e.kind === sr
  }
  function Es(e, t) {
    let n = e.tags.find(r => r[0] === 'u')
    return n ? n.length > 0 && n[1] === t : !1
  }
  function As(e, t) {
    let n = e.tags.find(r => r[0] === 'method')
    return n ? n.length > 0 && n[1].toLowerCase() === t.toLowerCase() : !1
  }
  function xr(e) {
    let t = gt(dt.encode(JSON.stringify(e)))
    return j(t)
  }
  function Ts(e, t) {
    let n = e.tags.find(o => o[0] === 'payload')
    if (!n) return !1
    let r = xr(t)
    return n.length > 0 && n[1] === r
  }
  async function Bs(e, t, n, r) {
    if (!Fn(e)) throw new Error('Invalid nostr event, signature invalid')
    if (!vs(e)) throw new Error('Invalid nostr event, kind invalid')
    if (!xs(e)) throw new Error('Invalid nostr event, created_at timestamp invalid')
    if (!Es(e, t)) throw new Error('Invalid nostr event, url tag invalid')
    if (!As(e, n)) throw new Error('Invalid nostr event, method tag invalid')
    if (r && typeof r == 'object' && Object.keys(r).length > 0 && !Ts(e, r))
      throw new Error('Invalid nostr event, payload tag does not match request body hash')
    return !0
  }
  function Ss(e) {
    try {
      let t = ar.decode(e)
      return t.type === 'nevent'
        ? { type: 'event', data: { id: t.data.id, relays: t.data.relays || [] } }
        : t.type === 'note'
          ? { type: 'event', data: { id: t.data, relays: [] } }
          : t.type === 'naddr'
            ? {
                type: 'address',
                data: {
                  kind: t.data.kind,
                  pubkey: t.data.pubkey,
                  identifier: t.data.identifier,
                  relays: t.data.relays || [],
                },
              }
            : null
    } catch (t) {
      return (console.error('[Nostr Decoder] Failed to decode identifier:', t), null)
    }
  }
  function tf() {
    return ['wss://relay.divine.video', 'wss://relay.nostr.band', 'wss://relay.damus.io']
  }
  function ks(e = [], t = []) {
    let n = [...t, ...e, ...tf()]
    return [...new Set(n)]
  }
  var tn = class {
    constructor(t) {
      ;((this.relays = t), (this.connections = new Map()), (this.subscriptions = new Map()))
    }
    async connectRelay(t) {
      return new Promise((n, r) => {
        let o = setTimeout(() => {
          r(new Error(`Connection timeout: ${t}`))
        }, 1e4)
        try {
          let s = new WebSocket(t)
          ;((s.onopen = () => {
            ;(clearTimeout(o),
              console.log(`[Nostr Client] Connected to ${t}`),
              this.connections.set(t, s),
              n(s))
          }),
            (s.onerror = i => {
              ;(clearTimeout(o), console.error(`[Nostr Client] Connection error ${t}:`, i), r(i))
            }),
            (s.onclose = () => {
              ;(console.log(`[Nostr Client] Disconnected from ${t}`), this.connections.delete(t))
            }))
        } catch (s) {
          ;(clearTimeout(o), r(s))
        }
      })
    }
    async fetchEvent(t) {
      let n = `embed-${Date.now()}`,
        r
      if (t.type === 'event') r = { ids: [t.data.id] }
      else if (t.type === 'address')
        r = { kinds: [t.data.kind], authors: [t.data.pubkey], '#d': [t.data.identifier] }
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
            l = t.type === 'address',
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
                let b = JSON.parse(w.data)
                if (b[0] === 'EVENT' && b[1] === n) {
                  let x = b[2]
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
                  b[0] === 'EOSE' &&
                  b[1] === n &&
                  (u++, console.log(`[Nostr Client] EOSE received (${u}/${g})`), l && u === g && !c)
                )
                  if (((c = !0), clearTimeout(y), this.closeSubscription(n), f.length > 0)) {
                    let x = f.reduce((A, k) => (k.created_at > A.created_at ? k : A))
                    ;(console.log(
                      `[Nostr Client] All relays responded, returning newest event (created_at: ${x.created_at})`
                    ),
                      i(x))
                  } else a(new Error('Addressable event not found on any relay'))
              } catch (b) {
                console.error('[Nostr Client] Failed to parse message:', b)
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
    closeSubscription(t) {
      let n = this.subscriptions.get(t)
      n &&
        (n.forEach(({ ws: r, handler: o }) => {
          try {
            ;(r.send(JSON.stringify(['CLOSE', t])), r.removeEventListener('message', o))
          } catch {}
        }),
        this.subscriptions.delete(t),
        console.log(`[Nostr Client] Closed subscription ${t}`))
    }
    closeAll() {
      ;(this.subscriptions.forEach((t, n) => {
        this.closeSubscription(n)
      }),
        this.connections.forEach((t, n) => {
          try {
            t.close()
          } catch {}
        }),
        this.connections.clear(),
        console.log('[Nostr Client] All connections closed'))
    }
  }
  function Ls(e) {
    let t = e.tags.filter(n => n[0] === 'imeta')
    return t.length > 0 ? ef(e, t) : nf(e)
  }
  function ef(e, t) {
    let n = t.map(f => rf(f)).filter(Boolean),
      r = n.filter(f => f.mimeType?.startsWith('video/')),
      o = n.filter(f => f.mimeType?.startsWith('image/'))
    ;(t.forEach(f => {
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
        e.tags.find(f => f[0] === 'title')?.[1] ||
        e.tags.find(f => f[0] === 'alt')?.[1] ||
        e.content ||
        'Untitled Video',
      i = e.content || '',
      a = parseInt(e.tags.find(f => f[0] === 'duration')?.[1] || '0', 10),
      c = e.tags.find(f => f[0] === 'content-warning')?.[1],
      l = e.pubkey
    return {
      id: e.id,
      kind: e.kind,
      title: s,
      description: i,
      author: l,
      createdAt: e.created_at,
      duration: a,
      contentWarning: c,
      videoVariants: r,
      thumbnails: o,
    }
  }
  function nf(e) {
    let t = e.tags.find(u => u[0] === 'url')?.[1] || '',
      n = e.tags.find(u => u[0] === 'm')?.[1] || 'video/mp4',
      r = e.tags.find(u => u[0] === 'thumb')?.[1] || '',
      o = e.tags.find(u => u[0] === 'title')?.[1] || e.content || 'Untitled Video',
      s = e.tags.find(u => u[0] === 'description')?.[1] || e.content || '',
      i = parseInt(e.tags.find(u => u[0] === 'duration')?.[1] || '0', 10),
      a = e.tags.find(u => u[0] === 'content-warning')?.[1],
      c = e.tags.find(u => u[0] === 'dim')?.[1],
      l = t ? [{ url: t, mimeType: n, dimensions: c, fallbackUrls: [] }] : [],
      f = r ? [{ url: r, fallbackUrls: [] }] : []
    return {
      id: e.id,
      kind: e.kind,
      title: o,
      description: s,
      author: e.pubkey,
      createdAt: e.created_at,
      duration: i,
      contentWarning: a,
      videoVariants: l,
      thumbnails: f,
    }
  }
  function rf(e) {
    let t = {}
    for (let n = 1; n < e.length; n++) {
      let r = e[n],
        o = r.indexOf(' ')
      if (o === -1) continue
      let s = r.substring(0, o),
        i = r.substring(o + 1).trim()
      s === 'url'
        ? (t.url = i)
        : s === 'm'
          ? (t.mimeType = i)
          : s === 'dim'
            ? (t.dimensions = i)
            : s === 'size'
              ? (t.size = parseInt(i, 10))
              : s === 'x'
                ? (t.hash = i)
                : (s === 'fallback' || s === 'mirror') &&
                  (t.fallbackUrls || (t.fallbackUrls = []), t.fallbackUrls.push(i))
    }
    return t.url ? (t.fallbackUrls || (t.fallbackUrls = []), t) : null
  }
  function en(e) {
    if (e.dimensions) {
      let t = e.dimensions.match(/x(\d+)/)
      if (t) return parseInt(t[1], 10)
    }
    return 0
  }
  function _s(e, t = 'auto') {
    if (!e || e.length === 0) return null
    if (t === 'auto') return e[0]
    let n = parseInt(t, 10)
    if (isNaN(n)) return e[0]
    let r = e[0],
      o = Math.abs(en(r) - n)
    for (let s of e) {
      let i = en(s),
        a = Math.abs(i - n)
      a < o && ((r = s), (o = a))
    }
    return r
  }
  var pe = class {
    static buildVideoPlayer(t, n) {
      console.log('[PlayerUI] Building video player with params:', n)
      let r = this.createVideoElement(n)
      return (
        this.addVideoSources(r, t.videoVariants),
        this.setPoster(r, t.thumbnails),
        n.startTime > 0 && this.setStartTime(r, n.startTime),
        this.addErrorHandling(r),
        console.log('[PlayerUI] Video player built successfully'),
        r
      )
    }
    static createVideoElement(t) {
      let n = document.createElement('video')
      return (
        (n.className = 'nostube-video'),
        (n.preload = 'metadata'),
        t.autoplay && ((n.autoplay = !0), (n.muted = !0)),
        t.muted && (n.muted = !0),
        t.loop && (n.loop = !0),
        t.controls && (n.controls = !0),
        n.setAttribute('playsinline', ''),
        n.setAttribute('webkit-playsinline', ''),
        n
      )
    }
    static addVideoSources(t, n) {
      if (!n || n.length === 0) throw new Error('No video sources available')
      ;(console.log(`[PlayerUI] Adding ${n.length} video variants as sources`),
        n.forEach((o, s) => {
          let i = document.createElement('source')
          ;((i.src = o.url),
            o.mimeType && (i.type = o.mimeType),
            t.appendChild(i),
            console.log(`[PlayerUI] Added source ${s + 1}: ${o.url}`),
            o.fallbackUrls &&
              o.fallbackUrls.length > 0 &&
              o.fallbackUrls.forEach((a, c) => {
                let l = document.createElement('source')
                ;((l.src = a),
                  o.mimeType && (l.type = o.mimeType),
                  t.appendChild(l),
                  console.log(`[PlayerUI] Added fallback ${c + 1} for variant ${s + 1}: ${a}`))
              }))
        }))
      let r = document.createElement('p')
      ;((r.textContent = 'Your browser does not support the video tag.'),
        (r.style.color = '#999'),
        (r.style.textAlign = 'center'),
        (r.style.padding = '20px'),
        t.appendChild(r))
    }
    static setPoster(t, n) {
      if (!n || n.length === 0) {
        console.log('[PlayerUI] No thumbnail available')
        return
      }
      let r = n[0]
      r.url && ((t.poster = r.url), console.log('[PlayerUI] Set poster:', r.url))
    }
    static setStartTime(t, n) {
      console.log(`[PlayerUI] Setting start time: ${n}s`)
      let r = () => {
        ;(t.duration >= n
          ? ((t.currentTime = n), console.log(`[PlayerUI] Seeked to ${n}s`))
          : console.warn(`[PlayerUI] Start time ${n}s exceeds video duration ${t.duration}s`),
          t.removeEventListener('loadedmetadata', r))
      }
      t.readyState >= 1 ? r() : t.addEventListener('loadedmetadata', r)
    }
    static addErrorHandling(t) {
      ;(t.addEventListener('error', n => {
        let r = t.error,
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
        t.addEventListener('loadeddata', () => {
          console.log('[PlayerUI] Video loaded successfully')
        }),
        t.addEventListener('canplay', () => {
          console.log('[PlayerUI] Video ready to play')
        }))
    }
    static createPlayerContainer(t) {
      let n = document.createElement('div')
      return ((n.className = 'nostube-player-container'), n.appendChild(t), n)
    }
  }
  var nn = class e {
    static getWarningMessage(t) {
      return t?.contentWarning
        ? t.contentWarning
        : (t?.event?.tags || []).find(o => o[0] === 'content-warning')?.[1] || null
    }
    static createOverlay(t, n) {
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
        (l.textContent = t || 'This video may contain sensitive content'))
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
    static applyToPlayer(t, n, r) {
      let o = e.getWarningMessage(r)
      if (!o) return
      console.log('[ContentWarning] Applying content warning:', o)
      let s = n.poster || r.thumbnails?.[0]?.url || '',
        i = e.createOverlay(o, s)
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
        t.appendChild(i),
        console.log('[ContentWarning] Overlay applied successfully'))
    }
  }
  var rn = class e {
    static createOverlay(t) {
      let n = document.createElement('div')
      ;((n.className = 'title-overlay'), n.setAttribute('aria-hidden', 'true'))
      let r = document.createElement('div')
      r.className = 'title-section'
      let o = document.createElement('h1')
      ;((o.className = 'video-title'),
        (o.textContent = e.truncateTitle(t.title || 'Untitled Video')),
        r.appendChild(o))
      let s = document.createElement('div')
      s.className = 'author-section'
      let i = document.createElement('img')
      ;((i.className = 'author-avatar'),
        (i.src = t.authorAvatar || e.getDefaultAvatar()),
        (i.alt = t.authorName || 'Author'),
        (i.onerror = () => {
          i.src = e.getDefaultAvatar()
        }))
      let a = document.createElement('p')
      return (
        (a.className = 'author-name'),
        (a.textContent = t.authorName || e.formatPubkey(t.author)),
        s.appendChild(i),
        s.appendChild(a),
        n.appendChild(r),
        n.appendChild(s),
        n
      )
    }
    static applyToPlayer(t, n, r, o) {
      if (!o.showTitle) {
        console.log('[TitleOverlay] Title overlay disabled via title=0 parameter')
        return
      }
      console.log('[TitleOverlay] Applying title overlay')
      let s = e.createOverlay(r)
      t.appendChild(s)
      let i = null,
        a = () => {
          ;(clearTimeout(i),
            (i = setTimeout(() => {
              n.paused || e.hide(s)
            }, 3e3)))
        }
      ;(t.addEventListener('mouseenter', () => {
        ;(clearTimeout(i), e.show(s))
      }),
        t.addEventListener('mouseleave', () => {
          n.paused || e.hide(s)
        }),
        n.addEventListener('pause', () => {
          ;(clearTimeout(i), e.show(s))
        }),
        n.addEventListener('play', () => {
          ;(clearTimeout(i), e.hide(s))
        }),
        a(),
        console.log('[TitleOverlay] Overlay applied successfully'))
    }
    static show(t) {
      t.classList.remove('hidden')
    }
    static hide(t) {
      t.classList.add('hidden')
    }
    static truncateTitle(t, n = 70) {
      return t ? (t.length <= n ? t : t.substring(0, n) + '...') : 'Untitled Video'
    }
    static formatPubkey(t) {
      return !t || t.length < 12
        ? 'Anonymous'
        : `${t.substring(0, 8)}...${t.substring(t.length - 4)}`
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
  }
  var on = class e {
    static generateVideoUrl(t) {
      return `https://nostube.com/video/${t}`
    }
    static createExternalIcon() {
      let t = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      ;(t.setAttribute('class', 'branding-icon'),
        t.setAttribute('viewBox', '0 0 24 24'),
        t.setAttribute('fill', 'none'),
        t.setAttribute('stroke', 'currentColor'),
        t.setAttribute('stroke-width', '2'),
        t.setAttribute('stroke-linecap', 'round'),
        t.setAttribute('stroke-linejoin', 'round'))
      let n = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      return (
        n.setAttribute(
          'd',
          'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3'
        ),
        t.appendChild(n),
        t
      )
    }
    static createLink(t, n = '8b5cf6') {
      let r = document.createElement('a')
      ;((r.className = 'branding-link'),
        (r.href = e.generateVideoUrl(t)),
        (r.target = '_blank'),
        (r.rel = 'noopener noreferrer'),
        r.setAttribute('aria-label', 'Watch on Nostube'),
        r.style.setProperty('--accent-color', `#${n}`))
      let o = document.createElement('span')
      ;((o.className = 'branding-text'), (o.textContent = 'Watch on Nostube'))
      let s = e.createExternalIcon()
      return (r.appendChild(o), r.appendChild(s), r)
    }
    static applyToPlayer(t, n, r) {
      if (!r.showBranding) {
        console.log('[BrandingLink] Branding link disabled via branding=0 parameter')
        return
      }
      console.log('[BrandingLink] Applying branding link')
      let o = e.createLink(n, r.accentColor)
      ;(t.appendChild(o), console.log('[BrandingLink] Branding link applied successfully'))
    }
  }
  var sn = null
  async function Is() {
    console.log('[Nostube Embed] Initializing player...')
    try {
      let e = Br(),
        t = Sr(e)
      if (!t.valid) {
        Gt(t.error)
        return
      }
      of('Loading video...')
      let n = Ss(e.videoId)
      if (!n) {
        Gt('Failed to decode video identifier')
        return
      }
      let r = ks(n.data.relays, e.customRelays)
      sn = new tn(r)
      let o = await sn.fetchEvent(n),
        s = Ls(o)
      console.log('[Nostube Embed] Parsed video:', s)
      let i = _s(s.videoVariants, e.preferredQuality)
      if (!i) {
        Gt('No video URLs found in event')
        return
      }
      console.log('[Nostube Embed] Selected variant:', i)
      try {
        let a = pe.buildVideoPlayer(s, e),
          c = pe.createPlayerContainer(a)
        ;(nn.applyToPlayer(c, a, s),
          rn.applyToPlayer(c, a, s, e),
          on.applyToPlayer(c, e.videoId, e),
          (document.body.innerHTML = ''),
          document.body.appendChild(c),
          a.addEventListener(
            'canplay',
            () => {
              console.log('[Nostube Embed] Player ready')
            },
            { once: !0 }
          ))
      } catch (a) {
        ;(console.error('[Nostube Embed] Player error:', a),
          Gt(`Failed to initialize player: ${a.message}`))
        return
      }
    } catch (e) {
      ;(console.error('[Nostube Embed] Error:', e),
        e.message.includes('timeout')
          ? Gt('Connection failed. Unable to fetch video.')
          : e.message.includes('not found')
            ? Gt('Video not found')
            : Gt(e.message))
    }
  }
  function of(e) {
    document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px; animation: spin 1s linear infinite;">
          \u23F3
        </div>
        <div style="font-size: 14px; color: #999;">${e}</div>
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
  function Gt(e) {
    document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px;">\u26A0\uFE0F</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Error</div>
        <div style="font-size: 14px; color: #999;">${e}</div>
      </div>
    </div>
  `
  }
  window.addEventListener('beforeunload', () => {
    sn && sn.closeAll()
  })
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', Is) : Is()
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
