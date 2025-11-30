/* Nostube Embed Player v0.1.0 | https://nostu.be */
;(() => {
  var kr = Object.defineProperty
  var $s = (t, e, n) =>
    e in t ? kr(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (t[e] = n)
  var Hs = (t, e) => {
    for (var n in e) kr(t, n, { get: e[n], enumerable: !0 })
  }
  var Xe = (t, e, n) => $s(t, typeof e != 'symbol' ? e + '' : e, n)
  function Ir() {
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
  function _r(t) {
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
  function Ur(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function fn(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Nr(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(Ur(t.outputLen), Ur(t.blockLen))
  }
  function Qe(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Or(t, e) {
    fn(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var bt = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var Rr = t => t instanceof Uint8Array
  var xt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    le = (t, e) => (t << (32 - e)) | (t >>> e),
    Ms = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Ms) throw new Error('Non little-endian hardware is not supported')
  function qs(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function lt(t) {
    if ((typeof t == 'string' && (t = qs(t)), !Rr(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function Pr(...t) {
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
    yu = {}.toString
  function $r(t) {
    let e = r => t().update(lt(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function vt(t = 32) {
    if (bt && typeof bt.getRandomValues == 'function') return bt.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function Vs(t, e, n, r) {
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
      ;(Qe(this), Or(e, this), (this.finished = !0))
      let { buffer: n, view: r, blockLen: o, isLE: s } = this,
        { pos: i } = this
      ;((n[i++] = 128),
        this.buffer.subarray(i).fill(0),
        this.padOffset > o - i && (this.process(r, 0), (i = 0)))
      for (let f = i; f < o; f++) n[f] = 0
      ;(Vs(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = xt(e),
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
  var Ws = (t, e, n) => (t & e) ^ (~t & n),
    Ds = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    zs = new Uint32Array([
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
    ke = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Ie = new Uint32Array(64),
    dn = class extends Et {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = ke[0] | 0),
          (this.B = ke[1] | 0),
          (this.C = ke[2] | 0),
          (this.D = ke[3] | 0),
          (this.E = ke[4] | 0),
          (this.F = ke[5] | 0),
          (this.G = ke[6] | 0),
          (this.H = ke[7] | 0))
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
        for (let f = 0; f < 16; f++, n += 4) Ie[f] = e.getUint32(n, !1)
        for (let f = 16; f < 64; f++) {
          let p = Ie[f - 15],
            y = Ie[f - 2],
            g = le(p, 7) ^ le(p, 18) ^ (p >>> 3),
            d = le(y, 17) ^ le(y, 19) ^ (y >>> 10)
          Ie[f] = (d + Ie[f - 7] + g + Ie[f - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: u } = this
        for (let f = 0; f < 64; f++) {
          let p = le(a, 6) ^ le(a, 11) ^ le(a, 25),
            y = (u + p + Ws(a, c, l) + zs[f] + Ie[f]) | 0,
            d = ((le(r, 2) ^ le(r, 13) ^ le(r, 22)) + Ds(r, o, s)) | 0
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
        Ie.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    }
  var Tt = $r(() => new dn())
  var yn = {}
  Hs(yn, {
    bitGet: () => Ys,
    bitLen: () => Js,
    bitMask: () => ut,
    bitSet: () => Xs,
    bytesToHex: () => De,
    bytesToNumberBE: () => F,
    bytesToNumberLE: () => Bt,
    concatBytes: () => ve,
    createHmacDrbg: () => gn,
    ensureBytes: () => j,
    equalBytes: () => Gs,
    hexToBytes: () => ze,
    hexToNumber: () => pn,
    numberToBytesBE: () => ue,
    numberToBytesLE: () => Lt,
    numberToHexUnpadded: () => qr,
    numberToVarBytesBE: () => Zs,
    utf8ToBytes: () => Fs,
    validateObject: () => _e,
  })
  var Mr = BigInt(0),
    At = BigInt(1),
    js = BigInt(2),
    St = t => t instanceof Uint8Array,
    Ks = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function De(t) {
    if (!St(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += Ks[t[n]]
    return e
  }
  function qr(t) {
    let e = t.toString(16)
    return e.length & 1 ? `0${e}` : e
  }
  function pn(t) {
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
  function F(t) {
    return pn(De(t))
  }
  function Bt(t) {
    if (!St(t)) throw new Error('Uint8Array expected')
    return pn(De(Uint8Array.from(t).reverse()))
  }
  function ue(t, e) {
    return ze(t.toString(16).padStart(e * 2, '0'))
  }
  function Lt(t, e) {
    return ue(t, e).reverse()
  }
  function Zs(t) {
    return ze(qr(t))
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
  function Gs(t, e) {
    if (t.length !== e.length) return !1
    for (let n = 0; n < t.length; n++) if (t[n] !== e[n]) return !1
    return !0
  }
  function Fs(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Js(t) {
    let e
    for (e = 0; t > Mr; t >>= At, e += 1);
    return e
  }
  function Ys(t, e) {
    return (t >> BigInt(e)) & At
  }
  var Xs = (t, e, n) => t | ((n ? At : Mr) << BigInt(e)),
    ut = t => (js << BigInt(t - 1)) - At,
    hn = t => new Uint8Array(t),
    Hr = t => Uint8Array.from(t)
  function gn(t, e, n) {
    if (typeof t != 'number' || t < 2) throw new Error('hashLen must be a number')
    if (typeof e != 'number' || e < 2) throw new Error('qByteLen must be a number')
    if (typeof n != 'function') throw new Error('hmacFn must be a function')
    let r = hn(t),
      o = hn(t),
      s = 0,
      i = () => {
        ;(r.fill(1), o.fill(0), (s = 0))
      },
      a = (...f) => n(o, r, ...f),
      c = (f = hn()) => {
        ;((o = a(Hr([0]), f)), (r = a()), f.length !== 0 && ((o = a(Hr([1]), f)), (r = a())))
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
        return ve(...p)
      }
    return (f, p) => {
      ;(i(), c(f))
      let y
      for (; !(y = p(l())); ) c()
      return (i(), y)
    }
  }
  var Qs = {
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
      let a = Qs[s]
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
    ei = BigInt(3),
    mn = BigInt(4),
    Vr = BigInt(5),
    Wr = BigInt(8),
    ti = BigInt(9),
    ni = BigInt(16)
  function K(t, e) {
    let n = t % e
    return n >= Z ? n : e + n
  }
  function ri(t, e, n) {
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
  function Ct(t, e) {
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
        u = r % n,
        f = o - i * l,
        p = s - a * l
      ;((r = n), (n = u), (o = i), (s = a), (i = f), (a = p))
    }
    if (r !== D) throw new Error('invert: does not exist')
    return K(o, e)
  }
  function oi(t) {
    let e = (t - D) / je,
      n,
      r,
      o
    for (n = t - D, r = 0; n % je === Z; n /= je, r++);
    for (o = je; o < t && ri(o, e, t) !== t - D; o++);
    if (r === 1) {
      let i = (t + D) / mn
      return function (c, l) {
        let u = c.pow(l, i)
        if (!c.eql(c.sqr(u), l)) throw new Error('Cannot find square root')
        return u
      }
    }
    let s = (n + D) / je
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
        let g = a.pow(u, D << BigInt(l - y - 1))
        ;((u = a.sqr(g)), (f = a.mul(f, g)), (p = a.mul(p, u)), (l = y))
      }
      return f
    }
  }
  function si(t) {
    if (t % mn === ei) {
      let e = (t + D) / mn
      return function (r, o) {
        let s = r.pow(o, e)
        if (!r.eql(r.sqr(s), o)) throw new Error('Cannot find square root')
        return s
      }
    }
    if (t % Wr === Vr) {
      let e = (t - Vr) / Wr
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
    return (t % ni, oi(t))
  }
  var ii = [
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
      n = ii.reduce((r, o) => ((r[o] = 'function'), r), e)
    return _e(t, n)
  }
  function ai(t, e, n) {
    if (n < Z) throw new Error('Expected power > 0')
    if (n === Z) return t.ONE
    if (n === D) return e
    let r = t.ONE,
      o = e
    for (; n > Z; ) (n & D && (r = t.mul(r, o)), (o = t.sqr(o)), (n >>= D))
    return r
  }
  function ci(t, e) {
    let n = new Array(e.length),
      r = e.reduce((s, i, a) => (t.is0(i) ? s : ((n[a] = s), t.mul(s, i))), t.ONE),
      o = t.inv(r)
    return (
      e.reduceRight((s, i, a) => (t.is0(i) ? s : ((n[a] = t.mul(s, n[a])), t.mul(s, i))), o),
      n
    )
  }
  function bn(t, e) {
    let n = e !== void 0 ? e : t.toString(2).length,
      r = Math.ceil(n / 8)
    return { nBitLength: n, nByteLength: r }
  }
  function Dr(t, e, n = !1, r = {}) {
    if (t <= Z) throw new Error(`Expected Field ORDER > 0, got ${t}`)
    let { nBitLength: o, nByteLength: s } = bn(t, e)
    if (s > 2048) throw new Error('Field lengths over 2048 bytes are not supported')
    let i = si(t),
      a = Object.freeze({
        ORDER: t,
        BITS: o,
        BYTES: s,
        MASK: ut(o),
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
        pow: (c, l) => ai(a, c, l),
        div: (c, l) => K(c * Ct(l, t), t),
        sqrN: c => c * c,
        addN: (c, l) => c + l,
        subN: (c, l) => c - l,
        mulN: (c, l) => c * l,
        inv: c => Ct(c, t),
        sqrt: r.sqrt || (c => i(a, c)),
        invertBatch: c => ci(a, c),
        cmov: (c, l, u) => (u ? l : c),
        toBytes: c => (n ? Lt(c, s) : ue(c, s)),
        fromBytes: c => {
          if (c.length !== s) throw new Error(`Fp.fromBytes: expected ${s}, got ${c.length}`)
          return n ? Bt(c) : F(c)
        },
      })
    return Object.freeze(a)
  }
  function zr(t) {
    if (typeof t != 'bigint') throw new Error('field order must be bigint')
    let e = t.toString(2).length
    return Math.ceil(e / 8)
  }
  function xn(t) {
    let e = zr(t)
    return e + Math.ceil(e / 2)
  }
  function jr(t, e, n = !1) {
    let r = t.length,
      o = zr(e),
      s = xn(e)
    if (r < 16 || r < s || r > 1024) throw new Error(`expected ${s}-1024 bytes of input, got ${r}`)
    let i = n ? F(t) : Bt(t),
      a = K(i, e - D) + D
    return n ? Lt(a, o) : ue(a, o)
  }
  var ui = BigInt(0),
    vn = BigInt(1)
  function Kr(t, e) {
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
        for (; s > ui; ) (s & vn && (i = i.add(a)), (a = a.double()), (s >>= vn))
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
          ;((i >>= y), h > c && ((h -= p), (i += vn)))
          let m = d,
            w = d + Math.abs(h) - 1,
            x = g % 2 !== 0,
            T = h < 0
          h === 0 ? (u = u.add(n(x, s[m]))) : (l = l.add(n(T, s[w])))
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
  function En(t) {
    return (
      wn(t.Fp),
      _e(
        t,
        { n: 'bigint', h: 'bigint', Gx: 'field', Gy: 'field' },
        { nBitLength: 'isSafeInteger', nByteLength: 'isSafeInteger' }
      ),
      Object.freeze({ ...bn(t.n, t.nBitLength), ...t, p: t.Fp.ORDER })
    )
  }
  function fi(t) {
    let e = En(t)
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
  var { bytesToNumberBE: di, hexToBytes: hi } = yn,
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
        return { d: di(r), l: t.subarray(n + 2) }
      },
      toSig(t) {
        let { Err: e } = Ke,
          n = typeof t == 'string' ? hi(t) : t
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
    Ee = BigInt(0),
    se = BigInt(1),
    _u = BigInt(2),
    Zr = BigInt(3),
    Uu = BigInt(4)
  function pi(t) {
    let e = fi(t),
      { Fp: n } = e,
      r =
        e.toBytes ||
        ((g, d, h) => {
          let m = d.toAffine()
          return ve(Uint8Array.from([4]), n.toBytes(m.x), n.toBytes(m.y))
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
      return typeof g == 'bigint' && Ee < g && g < e.n
    }
    function a(g) {
      if (!i(g)) throw new Error('Expected valid bigint: 0 < bigint < curve.n')
    }
    function c(g) {
      let { allowedPrivateKeyLengths: d, nByteLength: h, wrapPrivateKey: m, n: w } = e
      if (d && typeof g != 'bigint') {
        if ((g instanceof Uint8Array && (g = De(g)), typeof g != 'string' || !d.includes(g.length)))
          throw new Error('Invalid key')
        g = g.padStart(h * 2, '0')
      }
      let x
      try {
        x = typeof g == 'bigint' ? g : F(j('private key', g, h))
      } catch {
        throw new Error(`private key must be ${h} bytes, hex or bigint, not ${typeof g}`)
      }
      return (m && (x = K(x, w)), a(x), x)
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
        let w = x => n.eql(x, n.ZERO)
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
        let h = f.fromAffine(o(j('pointHex', d)))
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
          { px: x, py: T, pz: S } = d,
          A = n.eql(n.mul(h, S), n.mul(x, w)),
          B = n.eql(n.mul(m, S), n.mul(T, w))
        return A && B
      }
      negate() {
        return new f(this.px, n.neg(this.py), this.pz)
      }
      double() {
        let { a: d, b: h } = e,
          m = n.mul(h, Zr),
          { px: w, py: x, pz: T } = this,
          S = n.ZERO,
          A = n.ZERO,
          B = n.ZERO,
          C = n.mul(w, w),
          N = n.mul(x, x),
          _ = n.mul(T, T),
          I = n.mul(w, x)
        return (
          (I = n.add(I, I)),
          (B = n.mul(w, T)),
          (B = n.add(B, B)),
          (S = n.mul(d, B)),
          (A = n.mul(m, _)),
          (A = n.add(S, A)),
          (S = n.sub(N, A)),
          (A = n.add(N, A)),
          (A = n.mul(S, A)),
          (S = n.mul(I, S)),
          (B = n.mul(m, B)),
          (_ = n.mul(d, _)),
          (I = n.sub(C, _)),
          (I = n.mul(d, I)),
          (I = n.add(I, B)),
          (B = n.add(C, C)),
          (C = n.add(B, C)),
          (C = n.add(C, _)),
          (C = n.mul(C, I)),
          (A = n.add(A, C)),
          (_ = n.mul(x, T)),
          (_ = n.add(_, _)),
          (C = n.mul(_, I)),
          (S = n.sub(S, C)),
          (B = n.mul(_, N)),
          (B = n.add(B, B)),
          (B = n.add(B, B)),
          new f(S, A, B)
        )
      }
      add(d) {
        u(d)
        let { px: h, py: m, pz: w } = this,
          { px: x, py: T, pz: S } = d,
          A = n.ZERO,
          B = n.ZERO,
          C = n.ZERO,
          N = e.a,
          _ = n.mul(e.b, Zr),
          I = n.mul(h, x),
          $ = n.mul(m, T),
          H = n.mul(w, S),
          V = n.add(h, m),
          b = n.add(x, T)
        ;((V = n.mul(V, b)), (b = n.add(I, $)), (V = n.sub(V, b)), (b = n.add(h, w)))
        let v = n.add(x, S)
        return (
          (b = n.mul(b, v)),
          (v = n.add(I, H)),
          (b = n.sub(b, v)),
          (v = n.add(m, w)),
          (A = n.add(T, S)),
          (v = n.mul(v, A)),
          (A = n.add($, H)),
          (v = n.sub(v, A)),
          (C = n.mul(N, b)),
          (A = n.mul(_, H)),
          (C = n.add(A, C)),
          (A = n.sub($, C)),
          (C = n.add($, C)),
          (B = n.mul(A, C)),
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
          (A = n.mul(V, A)),
          (A = n.sub(A, I)),
          (I = n.mul(V, $)),
          (C = n.mul(v, C)),
          (C = n.add(C, I)),
          new f(A, B, C)
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
          return h.map((w, x) => w.toAffine(m[x])).map(f.fromAffine)
        })
      }
      multiplyUnsafe(d) {
        let h = f.ZERO
        if (d === Ee) return h
        if ((a(d), d === se)) return this
        let { endo: m } = e
        if (!m) return y.unsafeLadder(this, d)
        let { k1neg: w, k1: x, k2neg: T, k2: S } = m.splitScalar(d),
          A = h,
          B = h,
          C = this
        for (; x > Ee || S > Ee; )
          (x & se && (A = A.add(C)),
            S & se && (B = B.add(C)),
            (C = C.double()),
            (x >>= se),
            (S >>= se))
        return (
          w && (A = A.negate()),
          T && (B = B.negate()),
          (B = new f(n.mul(B.px, m.beta), B.py, B.pz)),
          A.add(B)
        )
      }
      multiply(d) {
        a(d)
        let h = d,
          m,
          w,
          { endo: x } = e
        if (x) {
          let { k1neg: T, k1: S, k2neg: A, k2: B } = x.splitScalar(h),
            { p: C, f: N } = this.wNAF(S),
            { p: _, f: I } = this.wNAF(B)
          ;((C = y.constTimeNegate(T, C)),
            (_ = y.constTimeNegate(A, _)),
            (_ = new f(n.mul(_.px, x.beta), _.py, _.pz)),
            (m = C.add(_)),
            (w = N.add(I)))
        } else {
          let { p: T, f: S } = this.wNAF(h)
          ;((m = T), (w = S))
        }
        return f.normalizeZ([m, w])[0]
      }
      multiplyAndAddUnsafe(d, h, m) {
        let w = f.BASE,
          x = (S, A) =>
            A === Ee || A === se || !S.equals(w) ? S.multiplyUnsafe(A) : S.multiply(A),
          T = x(this, h).add(x(d, m))
        return T.is0() ? void 0 : T
      }
      toAffine(d) {
        let { px: h, py: m, pz: w } = this,
          x = this.is0()
        d == null && (d = x ? n.ONE : n.inv(w))
        let T = n.mul(h, d),
          S = n.mul(m, d),
          A = n.mul(w, d)
        if (x) return { x: n.ZERO, y: n.ZERO }
        if (!n.eql(A, n.ONE)) throw new Error('invZ was invalid')
        return { x: T, y: S }
      }
      isTorsionFree() {
        let { h: d, isTorsionFree: h } = e
        if (d === se) return !0
        if (h) return h(f, this)
        throw new Error('isTorsionFree() has not been declared for the elliptic curve')
      }
      clearCofactor() {
        let { h: d, clearCofactor: h } = e
        return d === se ? this : h ? h(f, this) : this.multiplyUnsafe(e.h)
      }
      toRawBytes(d = !0) {
        return (this.assertValidity(), r(f, this, d))
      }
      toHex(d = !0) {
        return De(this.toRawBytes(d))
      }
    }
    ;((f.BASE = new f(e.Gx, e.Gy, n.ONE)), (f.ZERO = new f(n.ZERO, n.ONE, n.ZERO)))
    let p = e.nBitLength,
      y = Kr(f, e.endo ? Math.ceil(p / 2) : p)
    return {
      CURVE: e,
      ProjectivePoint: f,
      normPrivateKeyToScalar: c,
      weierstrassEquation: s,
      isWithinCurveOrder: i,
    }
  }
  function gi(t) {
    let e = En(t)
    return (
      _e(
        e,
        { hash: 'hash', hmac: 'function', randomBytes: 'function' },
        { bits2int: 'function', bits2int_modN: 'function', lowS: 'boolean' }
      ),
      Object.freeze({ lowS: !0, ...e })
    )
  }
  function Gr(t) {
    let e = gi(t),
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
      return Ct(b, r)
    }
    let {
        ProjectivePoint: l,
        normPrivateKeyToScalar: u,
        weierstrassEquation: f,
        isWithinCurveOrder: p,
      } = pi({
        ...e,
        toBytes(b, v, k) {
          let U = v.toAffine(),
            E = n.toBytes(U.x),
            O = ve
          return k
            ? O(Uint8Array.from([v.hasEvenY() ? 2 : 3]), E)
            : O(Uint8Array.from([4]), E, n.toBytes(U.y))
        },
        fromBytes(b) {
          let v = b.length,
            k = b[0],
            U = b.subarray(1)
          if (v === o && (k === 2 || k === 3)) {
            let E = F(U)
            if (!i(E)) throw new Error('Point is not on curve')
            let O = f(E),
              q = n.sqrt(O),
              M = (q & se) === se
            return (((k & 1) === 1) !== M && (q = n.neg(q)), { x: E, y: q })
          } else if (v === s && k === 4) {
            let E = n.fromBytes(U.subarray(0, n.BYTES)),
              O = n.fromBytes(U.subarray(n.BYTES, 2 * n.BYTES))
            return { x: E, y: O }
          } else
            throw new Error(
              `Point of length ${v} was invalid. Expected ${o} compressed bytes or ${s} uncompressed bytes`
            )
        },
      }),
      y = b => De(ue(b, e.nByteLength))
    function g(b) {
      let v = r >> se
      return b > v
    }
    function d(b) {
      return g(b) ? a(-b) : b
    }
    let h = (b, v, k) => F(b.slice(v, k))
    class m {
      constructor(v, k, U) {
        ;((this.r = v), (this.s = k), (this.recovery = U), this.assertValidity())
      }
      static fromCompact(v) {
        let k = e.nByteLength
        return ((v = j('compactSignature', v, k * 2)), new m(h(v, 0, k), h(v, k, 2 * k)))
      }
      static fromDER(v) {
        let { r: k, s: U } = Ke.toSig(j('DER', v))
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
        let { r: k, s: U, recovery: E } = this,
          O = B(j('msgHash', v))
        if (E == null || ![0, 1, 2, 3].includes(E)) throw new Error('recovery id invalid')
        let q = E === 2 || E === 3 ? k + e.n : k
        if (q >= n.ORDER) throw new Error('recovery id 2 or 3 invalid')
        let M = (E & 1) === 0 ? '02' : '03',
          G = l.fromHex(M + y(q)),
          Y = c(q),
          te = a(-O * Y),
          oe = a(U * Y),
          X = l.BASE.multiplyAndAddUnsafe(G, te, oe)
        if (!X) throw new Error('point at infinify')
        return (X.assertValidity(), X)
      }
      hasHighS() {
        return g(this.s)
      }
      normalizeS() {
        return this.hasHighS() ? new m(this.r, a(-this.s), this.recovery) : this
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
    let w = {
      isValidPrivateKey(b) {
        try {
          return (u(b), !0)
        } catch {
          return !1
        }
      },
      normPrivateKeyToScalar: u,
      randomPrivateKey: () => {
        let b = xn(e.n)
        return jr(e.randomBytes(b), e.n)
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
        k = typeof b == 'string',
        U = (v || k) && b.length
      return v ? U === o || U === s : k ? U === 2 * o || U === 2 * s : b instanceof l
    }
    function S(b, v, k = !0) {
      if (T(b)) throw new Error('first arg must be private key')
      if (!T(v)) throw new Error('second arg must be public key')
      return l.fromHex(v).multiply(u(b)).toRawBytes(k)
    }
    let A =
        e.bits2int ||
        function (b) {
          let v = F(b),
            k = b.length * 8 - e.nBitLength
          return k > 0 ? v >> BigInt(k) : v
        },
      B =
        e.bits2int_modN ||
        function (b) {
          return a(A(b))
        },
      C = ut(e.nBitLength)
    function N(b) {
      if (typeof b != 'bigint') throw new Error('bigint expected')
      if (!(Ee <= b && b < C)) throw new Error(`bigint expected < 2^${e.nBitLength}`)
      return ue(b, e.nByteLength)
    }
    function _(b, v, k = I) {
      if (['recovered', 'canonical'].some(ee => ee in k))
        throw new Error('sign() legacy options not supported')
      let { hash: U, randomBytes: E } = e,
        { lowS: O, prehash: q, extraEntropy: M } = k
      ;(O == null && (O = !0), (b = j('msgHash', b)), q && (b = j('prehashed msgHash', U(b))))
      let G = B(b),
        Y = u(v),
        te = [N(Y), N(G)]
      if (M != null) {
        let ee = M === !0 ? E(n.BYTES) : M
        te.push(j('extraEntropy', ee))
      }
      let oe = ve(...te),
        X = G
      function he(ee) {
        let Je = A(ee)
        if (!p(Je)) return
        let Br = c(Je),
          pe = l.BASE.multiply(Je).toAffine(),
          Ye = a(pe.x)
        if (Ye === Ee) return
        let wt = a(Br * a(X + Ye * Y))
        if (wt === Ee) return
        let Lr = (pe.x === Ye ? 0 : 2) | Number(pe.y & se),
          Cr = wt
        return (O && g(wt) && ((Cr = d(wt)), (Lr ^= 1)), new m(Ye, Cr, Lr))
      }
      return { seed: oe, k2sig: he }
    }
    let I = { lowS: e.lowS, prehash: !1 },
      $ = { lowS: e.lowS, prehash: !1 }
    function H(b, v, k = I) {
      let { seed: U, k2sig: E } = _(b, v, k),
        O = e
      return gn(O.hash.outputLen, O.nByteLength, O.hmac)(U, E)
    }
    l.BASE._setWindowSize(8)
    function V(b, v, k, U = $) {
      let E = b
      if (((v = j('msgHash', v)), (k = j('publicKey', k)), 'strict' in U))
        throw new Error('options.strict was renamed to lowS')
      let { lowS: O, prehash: q } = U,
        M,
        G
      try {
        if (typeof E == 'string' || E instanceof Uint8Array)
          try {
            M = m.fromDER(E)
          } catch (pe) {
            if (!(pe instanceof Ke.Err)) throw pe
            M = m.fromCompact(E)
          }
        else if (typeof E == 'object' && typeof E.r == 'bigint' && typeof E.s == 'bigint') {
          let { r: pe, s: Ye } = E
          M = new m(pe, Ye)
        } else throw new Error('PARSE')
        G = l.fromHex(k)
      } catch (pe) {
        if (pe.message === 'PARSE')
          throw new Error('signature must be Signature instance, Uint8Array or hex string')
        return !1
      }
      if (O && M.hasHighS()) return !1
      q && (v = e.hash(v))
      let { r: Y, s: te } = M,
        oe = B(v),
        X = c(te),
        he = a(oe * X),
        ee = a(Y * X),
        Je = l.BASE.multiplyAndAddUnsafe(G, he, ee)?.toAffine()
      return Je ? a(Je.x) === Y : !1
    }
    return {
      CURVE: e,
      getPublicKey: x,
      getSharedSecret: S,
      sign: H,
      verify: V,
      ProjectivePoint: l,
      Signature: m,
      utils: w,
    }
  }
  var kt = class extends et {
      constructor(e, n) {
        ;(super(), (this.finished = !1), (this.destroyed = !1), Nr(e))
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
    Tn = (t, e, n) => new kt(t, e).update(n).digest()
  Tn.create = (t, e) => new kt(t, e)
  function yi(t) {
    return { hash: t, hmac: (e, ...n) => Tn(t, e, Pr(...n)), randomBytes: vt }
  }
  function Fr(t, e) {
    let n = r => Gr({ ...t, ...yi(r) })
    return Object.freeze({ ...n(e), create: n })
  }
  var Nt = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'),
    It = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
    Xr = BigInt(1),
    _t = BigInt(2),
    Jr = (t, e) => (t + e / _t) / e
  function Qr(t) {
    let e = Nt,
      n = BigInt(3),
      r = BigInt(6),
      o = BigInt(11),
      s = BigInt(22),
      i = BigInt(23),
      a = BigInt(44),
      c = BigInt(88),
      l = (t * t * t) % e,
      u = (l * l * t) % e,
      f = (ne(u, n, e) * u) % e,
      p = (ne(f, n, e) * u) % e,
      y = (ne(p, _t, e) * l) % e,
      g = (ne(y, o, e) * y) % e,
      d = (ne(g, s, e) * g) % e,
      h = (ne(d, a, e) * d) % e,
      m = (ne(h, c, e) * h) % e,
      w = (ne(m, a, e) * d) % e,
      x = (ne(w, n, e) * u) % e,
      T = (ne(x, i, e) * g) % e,
      S = (ne(T, r, e) * l) % e,
      A = ne(S, _t, e)
    if (!Sn.eql(Sn.sqr(A), t)) throw new Error('Cannot find square root')
    return A
  }
  var Sn = Dr(Nt, void 0, void 0, { sqrt: Qr }),
    Ue = Fr(
      {
        a: BigInt(0),
        b: BigInt(7),
        Fp: Sn,
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
              r = -Xr * BigInt('0xe4437ed6010e88286f547fa90abfe4c3'),
              o = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8'),
              s = n,
              i = BigInt('0x100000000000000000000000000000000'),
              a = Jr(s * t, e),
              c = Jr(-r * t, e),
              l = K(t - a * n - c * o, e),
              u = K(-a * r - c * s, e),
              f = l > i,
              p = u > i
            if ((f && (l = e - l), p && (u = e - u), l > i || u > i))
              throw new Error('splitScalar: Endomorphism failed, k=' + t)
            return { k1neg: f, k1: l, k2neg: p, k2: u }
          },
        },
      },
      Tt
    ),
    Ot = BigInt(0),
    eo = t => typeof t == 'bigint' && Ot < t && t < Nt,
    mi = t => typeof t == 'bigint' && Ot < t && t < It,
    Yr = {}
  function Ut(t, ...e) {
    let n = Yr[t]
    if (n === void 0) {
      let r = Tt(Uint8Array.from(t, o => o.charCodeAt(0)))
      ;((n = ve(r, r)), (Yr[t] = n))
    }
    return Tt(ve(n, ...e))
  }
  var Cn = t => t.toRawBytes(!0).slice(1),
    Bn = t => ue(t, 32),
    An = t => K(t, Nt),
    ft = t => K(t, It),
    kn = Ue.ProjectivePoint,
    wi = (t, e, n) => kn.BASE.multiplyAndAddUnsafe(t, e, n)
  function Ln(t) {
    let e = Ue.utils.normPrivateKeyToScalar(t),
      n = kn.fromPrivateKey(e)
    return { scalar: n.hasEvenY() ? e : ft(-e), bytes: Cn(n) }
  }
  function to(t) {
    if (!eo(t)) throw new Error('bad x: need 0 < x < p')
    let e = An(t * t),
      n = An(e * t + BigInt(7)),
      r = Qr(n)
    r % _t !== Ot && (r = An(-r))
    let o = new kn(t, r, Xr)
    return (o.assertValidity(), o)
  }
  function no(...t) {
    return ft(F(Ut('BIP0340/challenge', ...t)))
  }
  function bi(t) {
    return Ln(t).bytes
  }
  function xi(t, e, n = vt(32)) {
    let r = j('message', t),
      { bytes: o, scalar: s } = Ln(e),
      i = j('auxRand', n, 32),
      a = Bn(s ^ F(Ut('BIP0340/aux', i))),
      c = Ut('BIP0340/nonce', a, o, r),
      l = ft(F(c))
    if (l === Ot) throw new Error('sign failed: k is zero')
    let { bytes: u, scalar: f } = Ln(l),
      p = no(u, o, r),
      y = new Uint8Array(64)
    if ((y.set(u, 0), y.set(Bn(ft(f + p * s)), 32), !ro(y, r, o)))
      throw new Error('sign: Invalid signature produced')
    return y
  }
  function ro(t, e, n) {
    let r = j('signature', t, 64),
      o = j('message', e),
      s = j('publicKey', n, 32)
    try {
      let i = to(F(s)),
        a = F(r.subarray(0, 32))
      if (!eo(a)) return !1
      let c = F(r.subarray(32, 64))
      if (!mi(c)) return !1
      let l = no(Bn(a), Cn(i), o),
        u = wi(i, c, ft(-l))
      return !(!u || !u.hasEvenY() || u.toAffine().x !== a)
    } catch {
      return !1
    }
  }
  var tt = {
    getPublicKey: bi,
    sign: xi,
    verify: ro,
    utils: {
      randomPrivateKey: Ue.utils.randomPrivateKey,
      lift_x: to,
      pointToBytes: Cn,
      numberToBytesBE: ue,
      bytesToNumberBE: F,
      taggedHash: Ut,
      mod: K,
    },
  }
  var Rt = typeof globalThis == 'object' && 'crypto' in globalThis ? globalThis.crypto : void 0
  var In = t => t instanceof Uint8Array
  var Pt = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    fe = (t, e) => (t << (32 - e)) | (t >>> e),
    vi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!vi) throw new Error('Non little-endian hardware is not supported')
  var Ei = Array.from({ length: 256 }, (t, e) => e.toString(16).padStart(2, '0'))
  function z(t) {
    if (!In(t)) throw new Error('Uint8Array expected')
    let e = ''
    for (let n = 0; n < t.length; n++) e += Ei[t[n]]
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
  function Ti(t) {
    if (typeof t != 'string') throw new Error(`utf8ToBytes expected string, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function Ne(t) {
    if ((typeof t == 'string' && (t = Ti(t)), !In(t)))
      throw new Error(`expected Uint8Array, got ${typeof t}`)
    return t
  }
  function rt(...t) {
    let e = new Uint8Array(t.reduce((r, o) => r + o.length, 0)),
      n = 0
    return (
      t.forEach(r => {
        if (!In(r)) throw new Error('Uint8Array expected')
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
  function _n(t) {
    let e = r => t().update(Ne(r)).digest(),
      n = t()
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = () => t()), e)
  }
  function $t(t = 32) {
    if (Rt && typeof Rt.getRandomValues == 'function') return Rt.getRandomValues(new Uint8Array(t))
    throw new Error('crypto.getRandomValues must be defined')
  }
  function Un(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`Wrong positive integer: ${t}`)
  }
  function Ai(t) {
    if (typeof t != 'boolean') throw new Error(`Expected boolean, not ${t}`)
  }
  function oo(t, ...e) {
    if (!(t instanceof Uint8Array)) throw new Error('Expected Uint8Array')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Expected Uint8Array of length ${e}, not of length=${t.length}`)
  }
  function Si(t) {
    if (typeof t != 'function' || typeof t.create != 'function')
      throw new Error('Hash should be wrapped by utils.wrapConstructor')
    ;(Un(t.outputLen), Un(t.blockLen))
  }
  function Bi(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function Li(t, e) {
    oo(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Ci = { number: Un, bool: Ai, bytes: oo, hash: Si, exists: Bi, output: Li },
    re = Ci
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
      for (let f = i; f < o; f++) n[f] = 0
      ;(ki(r, o - 8, BigInt(this.length * 8), s), this.process(r, 0))
      let a = Pt(e),
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
  var Ii = (t, e, n) => (t & e) ^ (~t & n),
    _i = (t, e, n) => (t & e) ^ (t & n) ^ (e & n),
    Ui = new Uint32Array([
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
    Oe = new Uint32Array([
      1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225,
    ]),
    Re = new Uint32Array(64),
    Mt = class extends Ht {
      constructor() {
        ;(super(64, 32, 8, !1),
          (this.A = Oe[0] | 0),
          (this.B = Oe[1] | 0),
          (this.C = Oe[2] | 0),
          (this.D = Oe[3] | 0),
          (this.E = Oe[4] | 0),
          (this.F = Oe[5] | 0),
          (this.G = Oe[6] | 0),
          (this.H = Oe[7] | 0))
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
        for (let f = 0; f < 16; f++, n += 4) Re[f] = e.getUint32(n, !1)
        for (let f = 16; f < 64; f++) {
          let p = Re[f - 15],
            y = Re[f - 2],
            g = fe(p, 7) ^ fe(p, 18) ^ (p >>> 3),
            d = fe(y, 17) ^ fe(y, 19) ^ (y >>> 10)
          Re[f] = (d + Re[f - 7] + g + Re[f - 16]) | 0
        }
        let { A: r, B: o, C: s, D: i, E: a, F: c, G: l, H: u } = this
        for (let f = 0; f < 64; f++) {
          let p = fe(a, 6) ^ fe(a, 11) ^ fe(a, 25),
            y = (u + p + Ii(a, c, l) + Ui[f] + Re[f]) | 0,
            d = ((fe(r, 2) ^ fe(r, 13) ^ fe(r, 22)) + _i(r, o, s)) | 0
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
        Re.fill(0)
      }
      destroy() {
        ;(this.set(0, 0, 0, 0, 0, 0, 0, 0), this.buffer.fill(0))
      }
    },
    Nn = class extends Mt {
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
    ge = _n(() => new Mt()),
    nf = _n(() => new Nn())
  function ot(t) {
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
  function uo(t) {
    if (typeof t != 'function') throw new Error('normalize fn should be function')
    return { encode: e => e, decode: e => t(e) }
  }
  function so(t, e, n) {
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
  var fo = (t, e) => (e ? fo(e, t % e) : t),
    qt = (t, e) => t + (e - fo(t, e))
  function On(t, e, n, r) {
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
  function Ni(t) {
    return (
      ot(t),
      {
        encode: e => {
          if (!(e instanceof Uint8Array)) throw new Error('radix.encode input should be Uint8Array')
          return so(Array.from(e), 2 ** 8, t)
        },
        decode: e => {
          if (!Array.isArray(e) || (e.length && typeof e[0] != 'number'))
            throw new Error('radix.decode input should be array of strings')
          return Uint8Array.from(so(e, t, 2 ** 8))
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
        return On(Array.from(n), 8, t, !e)
      },
      decode: n => {
        if (!Array.isArray(n) || (n.length && typeof n[0] != 'number'))
          throw new Error('radix2.decode input should be array of strings')
        return Uint8Array.from(On(n, t, 8, e))
      },
    }
  }
  function io(t) {
    if (typeof t != 'function') throw new Error('unsafeWrapper fn should be function')
    return function (...e) {
      try {
        return t.apply(null, e)
      } catch {}
    }
  }
  var Oi = Ae(Pe(4), Se('0123456789ABCDEF'), Be('')),
    Ri = Ae(Pe(5), Se('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), Vt(5), Be('')),
    of = Ae(Pe(5), Se('0123456789ABCDEFGHIJKLMNOPQRSTUV'), Vt(5), Be('')),
    sf = Ae(
      Pe(5),
      Se('0123456789ABCDEFGHJKMNPQRSTVWXYZ'),
      Be(''),
      uo(t => t.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1'))
    ),
    ie = Ae(
      Pe(6),
      Se('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'),
      Vt(6),
      Be('')
    ),
    Pi = Ae(
      Pe(6),
      Se('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'),
      Vt(6),
      Be('')
    ),
    $n = t => Ae(Ni(58), Se(t), Be('')),
    Rn = $n('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'),
    af = $n('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'),
    cf = $n('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'),
    ao = [0, 2, 3, 5, 6, 7, 9, 10, 11],
    $i = {
      encode(t) {
        let e = ''
        for (let n = 0; n < t.length; n += 8) {
          let r = t.subarray(n, n + 8)
          e += Rn.encode(r).padStart(ao[r.length], '1')
        }
        return e
      },
      decode(t) {
        let e = []
        for (let n = 0; n < t.length; n += 11) {
          let r = t.slice(n, n + 11),
            o = ao.indexOf(r.length),
            s = Rn.decode(r)
          for (let i = 0; i < s.length - o; i++)
            if (s[i] !== 0) throw new Error('base58xmr: wrong padding')
          e = e.concat(Array.from(s.slice(s.length - o)))
        }
        return Uint8Array.from(e)
      },
    }
  var Pn = Ae(Se('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), Be('')),
    co = [996825010, 642813549, 513874426, 1027748829, 705979059]
  function dt(t) {
    let e = t >> 25,
      n = (t & 33554431) << 5
    for (let r = 0; r < co.length; r++) ((e >> r) & 1) === 1 && (n ^= co[r])
    return n
  }
  function lo(t, e, n = 1) {
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
    return ((o ^= n), Pn.encode(On([o % 2 ** 30], 30, 5, !1)))
  }
  function ho(t) {
    let e = t === 'bech32' ? 1 : 734539939,
      n = Pe(5),
      r = n.decode,
      o = n.encode,
      s = io(r)
    function i(u, f, p = 90) {
      if (typeof u != 'string')
        throw new Error(`bech32.encode prefix should be string, not ${typeof u}`)
      if (!Array.isArray(f) || (f.length && typeof f[0] != 'number'))
        throw new Error(`bech32.encode words should be array of numbers, not ${typeof f}`)
      let y = u.length + 7 + f.length
      if (p !== !1 && y > p) throw new TypeError(`Length ${y} exceeds limit ${p}`)
      return ((u = u.toLowerCase()), `${u}1${Pn.encode(f)}${lo(u, f, e)}`)
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
      let h = Pn.decode(d).slice(0, -6),
        m = lo(g, h, e)
      if (!d.endsWith(m)) throw new Error(`Invalid checksum in ${u}: expected "${m}"`)
      return { prefix: g, words: h }
    }
    let c = io(a)
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
  var $e = ho('bech32'),
    lf = ho('bech32m'),
    Hi = { encode: t => new TextDecoder().decode(t), decode: t => new TextEncoder().encode(t) },
    Mi = Ae(
      Pe(4),
      Se('0123456789abcdef'),
      Be(''),
      uo(t => {
        if (typeof t != 'string' || t.length % 2)
          throw new TypeError(
            `hex.decode: expected string, got ${typeof t} with length ${t.length}`
          )
        return t.toLowerCase()
      })
    ),
    qi = {
      utf8: Hi,
      hex: Mi,
      base16: Oi,
      base32: Ri,
      base64: ie,
      base64url: Pi,
      base58: Rn,
      base58xmr: $i,
    },
    uf = `Invalid encoding type. Available types: ${Object.keys(qi).join(', ')}`
  function Wt(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new Error(`positive integer expected, not ${t}`)
  }
  function Hn(t) {
    if (typeof t != 'boolean') throw new Error(`boolean expected, not ${t}`)
  }
  function Mn(t) {
    return (
      t instanceof Uint8Array ||
      (t != null && typeof t == 'object' && t.constructor.name === 'Uint8Array')
    )
  }
  function R(t, ...e) {
    if (!Mn(t)) throw new Error('Uint8Array expected')
    if (e.length > 0 && !e.includes(t.length))
      throw new Error(`Uint8Array expected of length ${e}, not of length=${t.length}`)
  }
  function He(t, e = !0) {
    if (t.destroyed) throw new Error('Hash instance has been destroyed')
    if (e && t.finished) throw new Error('Hash#digest() has already been called')
  }
  function ht(t, e) {
    R(t)
    let n = e.outputLen
    if (t.length < n) throw new Error(`digestInto() expects output buffer of length at least ${n}`)
  }
  var Dt = t => new Uint8Array(t.buffer, t.byteOffset, t.byteLength)
  var P = t => new Uint32Array(t.buffer, t.byteOffset, Math.floor(t.byteLength / 4)),
    Me = t => new DataView(t.buffer, t.byteOffset, t.byteLength),
    Vi = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68
  if (!Vi) throw new Error('Non little-endian hardware is not supported')
  function Wi(t) {
    if (typeof t != 'string') throw new Error(`string expected, got ${typeof t}`)
    return new Uint8Array(new TextEncoder().encode(t))
  }
  function ye(t) {
    if (typeof t == 'string') t = Wi(t)
    else if (Mn(t)) t = t.slice()
    else throw new Error(`Uint8Array expected, got ${typeof t}`)
    return t
  }
  function po(t, e) {
    if (e == null || typeof e != 'object') throw new Error('options must be defined')
    return Object.assign(t, e)
  }
  function Ze(t, e) {
    if (t.length !== e.length) return !1
    let n = 0
    for (let r = 0; r < t.length; r++) n |= t[r] ^ e[r]
    return n === 0
  }
  var me = (t, e) => (Object.assign(e, t), e)
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
    Vn = new Uint8Array(16),
    we = P(Vn),
    Di = 225,
    zi = (t, e, n, r) => {
      let o = r & 1
      return {
        s3: (n << 31) | (r >>> 1),
        s2: (e << 31) | (n >>> 1),
        s1: (t << 31) | (e >>> 1),
        s0: (t >>> 1) ^ ((Di << 24) & -(o & 1)),
      }
    },
    ae = t =>
      (((t >>> 0) & 255) << 24) |
      (((t >>> 8) & 255) << 16) |
      (((t >>> 16) & 255) << 8) |
      ((t >>> 24) & 255) |
      0
  function ji(t) {
    t.reverse()
    let e = t[15] & 1,
      n = 0
    for (let r = 0; r < t.length; r++) {
      let o = t[r]
      ;((t[r] = (o >>> 1) | n), (n = (o & 1) << 7))
    }
    return ((t[0] ^= -e & 225), t)
  }
  var Ki = t => (t > 64 * 1024 ? 8 : t > 1024 ? 4 : 2),
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
          R(e, 16))
        let r = Me(e),
          o = r.getUint32(0, !1),
          s = r.getUint32(4, !1),
          i = r.getUint32(8, !1),
          a = r.getUint32(12, !1),
          c = []
        for (let g = 0; g < 128; g++)
          (c.push({ s0: ae(o), s1: ae(s), s2: ae(i), s3: ae(a) }),
            ({ s0: o, s1: s, s2: i, s3: a } = zi(o, s, i, a)))
        let l = Ki(n || 1024)
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
              x = 0
            for (let T = 0; T < l; T++) {
              if (!((d >>> (l - T - 1)) & 1)) continue
              let { s0: A, s1: B, s2: C, s3: N } = c[l * g + T]
              ;((h ^= A), (m ^= B), (w ^= C), (x ^= N))
            }
            y.push({ s0: h, s1: m, s2: w, s3: x })
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
                { s0: x, s1: T, s2: S, s3: A } = i[y * a + w]
              ;((c ^= x), (l ^= T), (u ^= S), (f ^= A), (y += 1))
            }
          }
        ;((this.s0 = c), (this.s1 = l), (this.s2 = u), (this.s3 = f))
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
            (Vn.set(e.subarray(r * Le)), this._updateBlock(we[0], we[1], we[2], we[3]), we.fill(0)),
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
    qn = class extends zt {
      constructor(e, n) {
        e = ye(e)
        let r = ji(e.slice())
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
            (Vn.set(e.subarray(o * Le)),
            this._updateBlock(ae(we[3]), ae(we[2]), ae(we[1]), ae(we[0])),
            we.fill(0)),
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
  function go(t) {
    let e = (r, o) => t(o, r.length).update(ye(r)).digest(),
      n = t(new Uint8Array(16), 0)
    return (
      (e.outputLen = n.outputLen),
      (e.blockLen = n.blockLen),
      (e.create = (r, o) => t(r, o)),
      e
    )
  }
  var Wn = go((t, e) => new zt(t, e)),
    yo = go((t, e) => new qn(t, e))
  var Q = 16,
    jn = 4,
    jt = new Uint8Array(Q),
    Zi = 283
  function Kn(t) {
    return (t << 1) ^ (Zi & -(t >> 7))
  }
  function st(t, e) {
    let n = 0
    for (; e > 0; e >>= 1) ((n ^= t & -(e & 1)), (t = Kn(t)))
    return n
  }
  var zn = (() => {
      let t = new Uint8Array(256)
      for (let n = 0, r = 1; n < 256; n++, r ^= Kn(r)) t[n] = r
      let e = new Uint8Array(256)
      e[0] = 99
      for (let n = 0; n < 255; n++) {
        let r = t[255 - n]
        ;((r |= r << 8), (e[t[n]] = (r ^ (r >> 4) ^ (r >> 5) ^ (r >> 6) ^ (r >> 7) ^ 99) & 255))
      }
      return e
    })(),
    Gi = zn.map((t, e) => zn.indexOf(e)),
    Fi = t => (t << 24) | (t >>> 8),
    Dn = t => (t << 8) | (t >>> 24)
  function mo(t, e) {
    if (t.length !== 256) throw new Error('Wrong sbox length')
    let n = new Uint32Array(256).map((l, u) => e(t[u])),
      r = n.map(Dn),
      o = r.map(Dn),
      s = o.map(Dn),
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
  var Zn = mo(zn, t => (st(t, 3) << 24) | (t << 16) | (t << 8) | st(t, 2)),
    wo = mo(Gi, t => (st(t, 11) << 24) | (st(t, 13) << 16) | (st(t, 9) << 8) | st(t, 14)),
    Ji = (() => {
      let t = new Uint8Array(16)
      for (let e = 0, n = 1; e < 16; e++, n = Kn(n)) t[e] = n
      return t
    })()
  function Ve(t) {
    R(t)
    let e = t.length
    if (![16, 24, 32].includes(e))
      throw new Error(`aes: wrong key size: should be 16, 24 or 32, got: ${e}`)
    let { sbox2: n } = Zn,
      r = P(t),
      o = r.length,
      s = a => be(n, a, a, a, a),
      i = new Uint32Array(e + 28)
    i.set(r)
    for (let a = o; a < i.length; a++) {
      let c = i[a - 1]
      ;(a % o === 0 ? (c = s(Fi(c)) ^ Ji[a / o - 1]) : o > 6 && a % o === 4 && (c = s(c)),
        (i[a] = i[a - o] ^ c))
    }
    return i
  }
  function bo(t) {
    let e = Ve(t),
      n = e.slice(),
      r = e.length,
      { sbox2: o } = Zn,
      { T0: s, T1: i, T2: a, T3: c } = wo
    for (let l = 0; l < r; l += 4) for (let u = 0; u < 4; u++) n[l + u] = e[r - l - 4 + u]
    e.fill(0)
    for (let l = 4; l < r - 4; l++) {
      let u = n[l],
        f = be(o, u, u, u, u)
      n[l] = s[f & 255] ^ i[(f >>> 8) & 255] ^ a[(f >>> 16) & 255] ^ c[f >>> 24]
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
    let { sbox2: s, T01: i, T23: a } = Zn,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let g = 0; g < l; g++) {
      let d = t[c++] ^ qe(i, a, e, n, r, o),
        h = t[c++] ^ qe(i, a, n, r, o, e),
        m = t[c++] ^ qe(i, a, r, o, e, n),
        w = t[c++] ^ qe(i, a, o, e, n, r)
      ;((e = d), (n = h), (r = m), (o = w))
    }
    let u = t[c++] ^ be(s, e, n, r, o),
      f = t[c++] ^ be(s, n, r, o, e),
      p = t[c++] ^ be(s, r, o, e, n),
      y = t[c++] ^ be(s, o, e, n, r)
    return { s0: u, s1: f, s2: p, s3: y }
  }
  function xo(t, e, n, r, o) {
    let { sbox2: s, T01: i, T23: a } = wo,
      c = 0
    ;((e ^= t[c++]), (n ^= t[c++]), (r ^= t[c++]), (o ^= t[c++]))
    let l = t.length / 4 - 2
    for (let g = 0; g < l; g++) {
      let d = t[c++] ^ qe(i, a, e, o, r, n),
        h = t[c++] ^ qe(i, a, n, e, o, r),
        m = t[c++] ^ qe(i, a, r, n, e, o),
        w = t[c++] ^ qe(i, a, o, r, n, e)
      ;((e = d), (n = h), (r = m), (o = w))
    }
    let u = t[c++] ^ be(s, e, o, r, n),
      f = t[c++] ^ be(s, n, e, o, r),
      p = t[c++] ^ be(s, r, n, e, o),
      y = t[c++] ^ be(s, o, r, n, e)
    return { s0: u, s1: f, s2: p, s3: y }
  }
  function it(t, e) {
    if (!e) return new Uint8Array(t)
    if ((R(e), e.length < t))
      throw new Error(`aes: wrong destination length, expected at least ${t}, got: ${e.length}`)
    return e
  }
  function Yi(t, e, n, r) {
    ;(R(e, Q), R(n))
    let o = n.length
    r = it(o, r)
    let s = e,
      i = P(s),
      { s0: a, s1: c, s2: l, s3: u } = ce(t, i[0], i[1], i[2], i[3]),
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
      ;({ s0: a, s1: c, s2: l, s3: u } = ce(t, i[0], i[1], i[2], i[3]))
    }
    let y = Q * Math.floor(f.length / jn)
    if (y < o) {
      let g = new Uint32Array([a, c, l, u]),
        d = Dt(g)
      for (let h = y, m = 0; h < o; h++, m++) r[h] = n[h] ^ d[m]
    }
    return r
  }
  function pt(t, e, n, r, o) {
    ;(R(n, Q), R(r), (o = it(r.length, o)))
    let s = n,
      i = P(s),
      a = Me(s),
      c = P(r),
      l = P(o),
      u = e ? 0 : 12,
      f = r.length,
      p = a.getUint32(u, e),
      { s0: y, s1: g, s2: d, s3: h } = ce(t, i[0], i[1], i[2], i[3])
    for (let w = 0; w + 4 <= c.length; w += 4)
      ((l[w + 0] = c[w + 0] ^ y),
        (l[w + 1] = c[w + 1] ^ g),
        (l[w + 2] = c[w + 2] ^ d),
        (l[w + 3] = c[w + 3] ^ h),
        (p = (p + 1) >>> 0),
        a.setUint32(u, p, e),
        ({ s0: y, s1: g, s2: d, s3: h } = ce(t, i[0], i[1], i[2], i[3])))
    let m = Q * Math.floor(c.length / jn)
    if (m < f) {
      let w = new Uint32Array([y, g, d, h]),
        x = Dt(w)
      for (let T = m, S = 0; T < f; T++, S++) o[T] = r[T] ^ x[S]
    }
    return o
  }
  var vf = me({ blockSize: 16, nonceLength: 16 }, function (e, n) {
    ;(R(e), R(n, Q))
    function r(o, s) {
      let i = Ve(e),
        a = n.slice(),
        c = Yi(i, a, o, s)
      return (i.fill(0), a.fill(0), c)
    }
    return { encrypt: (o, s) => r(o, s), decrypt: (o, s) => r(o, s) }
  })
  function vo(t) {
    if ((R(t), t.length % Q !== 0))
      throw new Error(`aes/(cbc-ecb).decrypt ciphertext should consist of blocks with size ${Q}`)
  }
  function Eo(t, e, n) {
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
  function To(t, e) {
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
  var Ef = me({ blockSize: 16 }, function (e, n = {}) {
      R(e)
      let r = !n.disablePadding
      return {
        encrypt: (o, s) => {
          R(o)
          let { b: i, o: a, out: c } = Eo(o, r, s),
            l = Ve(e),
            u = 0
          for (; u + 4 <= i.length; ) {
            let { s0: f, s1: p, s2: y, s3: g } = ce(l, i[u + 0], i[u + 1], i[u + 2], i[u + 3])
            ;((a[u++] = f), (a[u++] = p), (a[u++] = y), (a[u++] = g))
          }
          if (r) {
            let f = Ao(o.subarray(u * 4)),
              { s0: p, s1: y, s2: g, s3: d } = ce(l, f[0], f[1], f[2], f[3])
            ;((a[u++] = p), (a[u++] = y), (a[u++] = g), (a[u++] = d))
          }
          return (l.fill(0), c)
        },
        decrypt: (o, s) => {
          vo(o)
          let i = bo(e),
            a = it(o.length, s),
            c = P(o),
            l = P(a)
          for (let u = 0; u + 4 <= c.length; ) {
            let { s0: f, s1: p, s2: y, s3: g } = xo(i, c[u + 0], c[u + 1], c[u + 2], c[u + 3])
            ;((l[u++] = f), (l[u++] = p), (l[u++] = y), (l[u++] = g))
          }
          return (i.fill(0), To(a, r))
        },
      }
    }),
    Gn = me({ blockSize: 16, nonceLength: 16 }, function (e, n, r = {}) {
      ;(R(e), R(n, 16))
      let o = !r.disablePadding
      return {
        encrypt: (s, i) => {
          let a = Ve(e),
            { b: c, o: l, out: u } = Eo(s, o, i),
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
              ({ s0: p, s1: y, s2: g, s3: d } = ce(a, p, y, g, d)),
              (l[h++] = p),
              (l[h++] = y),
              (l[h++] = g),
              (l[h++] = d))
          if (o) {
            let m = Ao(s.subarray(h * 4))
            ;((p ^= m[0]),
              (y ^= m[1]),
              (g ^= m[2]),
              (d ^= m[3]),
              ({ s0: p, s1: y, s2: g, s3: d } = ce(a, p, y, g, d)),
              (l[h++] = p),
              (l[h++] = y),
              (l[h++] = g),
              (l[h++] = d))
          }
          return (a.fill(0), u)
        },
        decrypt: (s, i) => {
          vo(s)
          let a = bo(e),
            c = P(n),
            l = it(s.length, i),
            u = P(s),
            f = P(l),
            p = c[0],
            y = c[1],
            g = c[2],
            d = c[3]
          for (let h = 0; h + 4 <= u.length; ) {
            let m = p,
              w = y,
              x = g,
              T = d
            ;((p = u[h + 0]), (y = u[h + 1]), (g = u[h + 2]), (d = u[h + 3]))
            let { s0: S, s1: A, s2: B, s3: C } = xo(a, p, y, g, d)
            ;((f[h++] = S ^ m), (f[h++] = A ^ w), (f[h++] = B ^ x), (f[h++] = C ^ T))
          }
          return (a.fill(0), To(l, o))
        },
      }
    }),
    Tf = me({ blockSize: 16, nonceLength: 16 }, function (e, n) {
      ;(R(e), R(n, 16))
      function r(o, s, i) {
        let a = Ve(e),
          c = o.length
        i = it(c, i)
        let l = P(o),
          u = P(i),
          f = s ? u : l,
          p = P(n),
          y = p[0],
          g = p[1],
          d = p[2],
          h = p[3]
        for (let w = 0; w + 4 <= l.length; ) {
          let { s0: x, s1: T, s2: S, s3: A } = ce(a, y, g, d, h)
          ;((u[w + 0] = l[w + 0] ^ x),
            (u[w + 1] = l[w + 1] ^ T),
            (u[w + 2] = l[w + 2] ^ S),
            (u[w + 3] = l[w + 3] ^ A),
            (y = f[w++]),
            (g = f[w++]),
            (d = f[w++]),
            (h = f[w++]))
        }
        let m = Q * Math.floor(l.length / jn)
        if (m < c) {
          ;({ s0: y, s1: g, s2: d, s3: h } = ce(a, y, g, d, h))
          let w = Dt(new Uint32Array([y, g, d, h]))
          for (let x = m, T = 0; x < c; x++, T++) i[x] = o[x] ^ w[T]
          w.fill(0)
        }
        return (a.fill(0), i)
      }
      return { encrypt: (o, s) => r(o, !0, s), decrypt: (o, s) => r(o, !1, s) }
    })
  function So(t, e, n, r, o) {
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
  var Af = me({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      if ((R(n), n.length === 0)) throw new Error('aes/gcm: empty nonce')
      let o = 16
      function s(a, c, l) {
        let u = So(Wn, !1, a, l, r)
        for (let f = 0; f < c.length; f++) u[f] ^= c[f]
        return u
      }
      function i() {
        let a = Ve(e),
          c = jt.slice(),
          l = jt.slice()
        if ((pt(a, !1, l, l, c), n.length === 12)) l.set(n)
        else {
          let f = jt.slice(),
            p = Me(f)
          ;(Ge(p, 8, BigInt(n.length * 8), !1), Wn.create(c).update(n).update(f).digestInto(l))
        }
        let u = pt(a, !1, l, jt)
        return { xk: a, authKey: c, counter: l, tagMask: u }
      }
      return {
        encrypt: a => {
          R(a)
          let { xk: c, authKey: l, counter: u, tagMask: f } = i(),
            p = new Uint8Array(a.length + o)
          pt(c, !1, u, a, p)
          let y = s(l, f, p.subarray(0, p.length - o))
          return (p.set(y, a.length), c.fill(0), p)
        },
        decrypt: a => {
          if ((R(a), a.length < o)) throw new Error(`aes/gcm: ciphertext less than tagLen (${o})`)
          let { xk: c, authKey: l, counter: u, tagMask: f } = i(),
            p = a.subarray(0, -o),
            y = a.subarray(-o),
            g = s(l, f, p)
          if (!Ze(g, y)) throw new Error('aes/gcm: invalid ghash tag')
          let d = pt(c, !1, u, p)
          return (l.fill(0), f.fill(0), c.fill(0), d)
        },
      }
    }),
    Kt = (t, e, n) => r => {
      if (!Number.isSafeInteger(r) || e > r || r > n)
        throw new Error(`${t}: invalid value=${r}, must be [${e}..${n}]`)
    },
    Sf = me({ blockSize: 16, nonceLength: 12, tagLength: 16 }, function (e, n, r) {
      let s = Kt('AAD', 0, 68719476736),
        i = Kt('plaintext', 0, 2 ** 36),
        a = Kt('nonce', 12, 12),
        c = Kt('ciphertext', 16, 2 ** 36 + 16)
      ;(R(n), a(n.length), r && (R(r), s(r.length)))
      function l() {
        let p = e.length
        if (p !== 16 && p !== 24 && p !== 32)
          throw new Error(`key length must be 16, 24 or 32 bytes, got: ${p} bytes`)
        let y = Ve(e),
          g = new Uint8Array(p),
          d = new Uint8Array(16),
          h = P(n),
          m = 0,
          w = h[0],
          x = h[1],
          T = h[2],
          S = 0
        for (let A of [d, g].map(P)) {
          let B = P(A)
          for (let C = 0; C < B.length; C += 2) {
            let { s0: N, s1: _ } = ce(y, m, w, x, T)
            ;((B[C + 0] = N), (B[C + 1] = _), (m = ++S))
          }
        }
        return (y.fill(0), { authKey: d, encKey: Ve(g) })
      }
      function u(p, y, g) {
        let d = So(yo, !0, y, g, r)
        for (let S = 0; S < 12; S++) d[S] ^= n[S]
        d[15] &= 127
        let h = P(d),
          m = h[0],
          w = h[1],
          x = h[2],
          T = h[3]
        return (
          ({ s0: m, s1: w, s2: x, s3: T } = ce(p, m, w, x, T)),
          (h[0] = m),
          (h[1] = w),
          (h[2] = x),
          (h[3] = T),
          d
        )
      }
      function f(p, y, g) {
        let d = y.slice()
        return ((d[15] |= 128), pt(p, !0, d, g))
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
          if ((g.fill(0), d.fill(0), !Ze(y, m))) throw new Error('invalid polyval tag')
          return h
        },
      }
    })
  var J = (t, e) => (t[e++] & 255) | ((t[e++] & 255) << 8),
    Fn = class {
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
          R(e, 32))
        let n = J(e, 0),
          r = J(e, 2),
          o = J(e, 4),
          s = J(e, 6),
          i = J(e, 8),
          a = J(e, 10),
          c = J(e, 12),
          l = J(e, 14)
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
        for (let u = 0; u < 8; u++) this.pad[u] = J(e, 16 + 2 * u)
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
          m = J(e, n + 0),
          w = J(e, n + 2),
          x = J(e, n + 4),
          T = J(e, n + 6),
          S = J(e, n + 8),
          A = J(e, n + 10),
          B = J(e, n + 12),
          C = J(e, n + 14),
          N = s[0] + (m & 8191),
          _ = s[1] + (((m >>> 13) | (w << 3)) & 8191),
          I = s[2] + (((w >>> 10) | (x << 6)) & 8191),
          $ = s[3] + (((x >>> 7) | (T << 9)) & 8191),
          H = s[4] + (((T >>> 4) | (S << 12)) & 8191),
          V = s[5] + ((S >>> 1) & 8191),
          b = s[6] + (((S >>> 14) | (A << 2)) & 8191),
          v = s[7] + (((A >>> 11) | (B << 5)) & 8191),
          k = s[8] + (((B >>> 8) | (C << 8)) & 8191),
          U = s[9] + ((C >>> 5) | o),
          E = 0,
          O = E + N * a + _ * (5 * h) + I * (5 * d) + $ * (5 * g) + H * (5 * y)
        ;((E = O >>> 13),
          (O &= 8191),
          (O += V * (5 * p) + b * (5 * f) + v * (5 * u) + k * (5 * l) + U * (5 * c)),
          (E += O >>> 13),
          (O &= 8191))
        let q = E + N * c + _ * a + I * (5 * h) + $ * (5 * d) + H * (5 * g)
        ;((E = q >>> 13),
          (q &= 8191),
          (q += V * (5 * y) + b * (5 * p) + v * (5 * f) + k * (5 * u) + U * (5 * l)),
          (E += q >>> 13),
          (q &= 8191))
        let M = E + N * l + _ * c + I * a + $ * (5 * h) + H * (5 * d)
        ;((E = M >>> 13),
          (M &= 8191),
          (M += V * (5 * g) + b * (5 * y) + v * (5 * p) + k * (5 * f) + U * (5 * u)),
          (E += M >>> 13),
          (M &= 8191))
        let G = E + N * u + _ * l + I * c + $ * a + H * (5 * h)
        ;((E = G >>> 13),
          (G &= 8191),
          (G += V * (5 * d) + b * (5 * g) + v * (5 * y) + k * (5 * p) + U * (5 * f)),
          (E += G >>> 13),
          (G &= 8191))
        let Y = E + N * f + _ * u + I * l + $ * c + H * a
        ;((E = Y >>> 13),
          (Y &= 8191),
          (Y += V * (5 * h) + b * (5 * d) + v * (5 * g) + k * (5 * y) + U * (5 * p)),
          (E += Y >>> 13),
          (Y &= 8191))
        let te = E + N * p + _ * f + I * u + $ * l + H * c
        ;((E = te >>> 13),
          (te &= 8191),
          (te += V * a + b * (5 * h) + v * (5 * d) + k * (5 * g) + U * (5 * y)),
          (E += te >>> 13),
          (te &= 8191))
        let oe = E + N * y + _ * p + I * f + $ * u + H * l
        ;((E = oe >>> 13),
          (oe &= 8191),
          (oe += V * c + b * a + v * (5 * h) + k * (5 * d) + U * (5 * g)),
          (E += oe >>> 13),
          (oe &= 8191))
        let X = E + N * g + _ * y + I * p + $ * f + H * u
        ;((E = X >>> 13),
          (X &= 8191),
          (X += V * l + b * c + v * a + k * (5 * h) + U * (5 * d)),
          (E += X >>> 13),
          (X &= 8191))
        let he = E + N * d + _ * g + I * y + $ * p + H * f
        ;((E = he >>> 13),
          (he &= 8191),
          (he += V * u + b * l + v * c + k * a + U * (5 * h)),
          (E += he >>> 13),
          (he &= 8191))
        let ee = E + N * h + _ * d + I * g + $ * y + H * p
        ;((E = ee >>> 13),
          (ee &= 8191),
          (ee += V * f + b * u + v * l + k * c + U * a),
          (E += ee >>> 13),
          (ee &= 8191),
          (E = ((E << 2) + E) | 0),
          (E = (E + O) | 0),
          (O = E & 8191),
          (E = E >>> 13),
          (q += E),
          (s[0] = O),
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
  function Xi(t) {
    let e = (r, o) => t(o).update(ye(r)).digest(),
      n = t(new Uint8Array(32))
    return ((e.outputLen = n.outputLen), (e.blockLen = n.blockLen), (e.create = r => t(r)), e)
  }
  var Bo = Xi(t => new Fn(t))
  var Co = t => Uint8Array.from(t.split('').map(e => e.charCodeAt(0))),
    Qi = Co('expand 16-byte k'),
    ea = Co('expand 32-byte k'),
    ta = P(Qi),
    ko = P(ea),
    Uf = ko.slice()
  function L(t, e) {
    return (t << e) | (t >>> (32 - e))
  }
  function Jn(t) {
    return t.byteOffset % 4 === 0
  }
  var Zt = 64,
    na = 16,
    Io = 2 ** 32 - 1,
    Lo = new Uint32Array()
  function ra(t, e, n, r, o, s, i, a) {
    let c = o.length,
      l = new Uint8Array(Zt),
      u = P(l),
      f = Jn(o) && Jn(s),
      p = f ? P(o) : Lo,
      y = f ? P(s) : Lo
    for (let g = 0; g < c; i++) {
      if ((t(e, n, r, u, i, a), i >= Io)) throw new Error('arx: counter overflow')
      let d = Math.min(Zt, c - g)
      if (f && d === Zt) {
        let h = g / 4
        if (g % 4 !== 0) throw new Error('arx: invalid block position')
        for (let m = 0, w; m < na; m++) ((w = h + m), (y[w] = p[w] ^ u[m]))
        g += Zt
        continue
      }
      for (let h = 0, m; h < d; h++) ((m = g + h), (s[m] = o[m] ^ l[h]))
      g += d
    }
  }
  function Yn(t, e) {
    let {
      allowShortKeys: n,
      extendNonceFn: r,
      counterLength: o,
      counterRight: s,
      rounds: i,
    } = po({ allowShortKeys: !1, counterLength: 8, counterRight: !1, rounds: 20 }, e)
    if (typeof t != 'function') throw new Error('core must be a function')
    return (
      Wt(o),
      Wt(i),
      Hn(s),
      Hn(n),
      (a, c, l, u, f = 0) => {
        ;(R(a), R(c), R(l))
        let p = l.length
        if ((u || (u = new Uint8Array(p)), R(u), Wt(f), f < 0 || f >= Io))
          throw new Error('arx: counter overflow')
        if (u.length < p) throw new Error(`arx: output (${u.length}) is shorter than data (${p})`)
        let y = [],
          g = a.length,
          d,
          h
        if (g === 32) ((d = a.slice()), y.push(d), (h = ko))
        else if (g === 16 && n)
          ((d = new Uint8Array(32)), d.set(a), d.set(a, 16), (h = ta), y.push(d))
        else throw new Error(`arx: invalid 32-byte key, got length=${g}`)
        Jn(c) || ((c = c.slice()), y.push(c))
        let m = P(d)
        if (r) {
          if (c.length !== 24) throw new Error('arx: extended nonce must be 24 bytes')
          ;(r(h, m, P(c.subarray(0, 16)), m), (c = c.subarray(16)))
        }
        let w = 16 - o
        if (w !== c.length) throw new Error(`arx: nonce must be ${w} or 16 bytes`)
        if (w !== 12) {
          let T = new Uint8Array(12)
          ;(T.set(c, s ? 0 : 12 - c.length), (c = T), y.push(c))
        }
        let x = P(c)
        for (ra(t, h, m, x, l, u, f, i); y.length > 0; ) y.pop().fill(0)
        return u
      }
    )
  }
  function No(t, e, n, r, o, s = 20) {
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
      x = n[0],
      T = n[1],
      S = n[2],
      A = i,
      B = a,
      C = c,
      N = l,
      _ = u,
      I = f,
      $ = p,
      H = y,
      V = g,
      b = d,
      v = h,
      k = m,
      U = w,
      E = x,
      O = T,
      q = S
    for (let G = 0; G < s; G += 2)
      ((A = (A + _) | 0),
        (U = L(U ^ A, 16)),
        (V = (V + U) | 0),
        (_ = L(_ ^ V, 12)),
        (A = (A + _) | 0),
        (U = L(U ^ A, 8)),
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
        (C = (C + $) | 0),
        (O = L(O ^ C, 16)),
        (v = (v + O) | 0),
        ($ = L($ ^ v, 12)),
        (C = (C + $) | 0),
        (O = L(O ^ C, 8)),
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
        (A = (A + I) | 0),
        (q = L(q ^ A, 16)),
        (v = (v + q) | 0),
        (I = L(I ^ v, 12)),
        (A = (A + I) | 0),
        (q = L(q ^ A, 8)),
        (v = (v + q) | 0),
        (I = L(I ^ v, 7)),
        (B = (B + $) | 0),
        (U = L(U ^ B, 16)),
        (k = (k + U) | 0),
        ($ = L($ ^ k, 12)),
        (B = (B + $) | 0),
        (U = L(U ^ B, 8)),
        (k = (k + U) | 0),
        ($ = L($ ^ k, 7)),
        (C = (C + H) | 0),
        (E = L(E ^ C, 16)),
        (V = (V + E) | 0),
        (H = L(H ^ V, 12)),
        (C = (C + H) | 0),
        (E = L(E ^ C, 8)),
        (V = (V + E) | 0),
        (H = L(H ^ V, 7)),
        (N = (N + _) | 0),
        (O = L(O ^ N, 16)),
        (b = (b + O) | 0),
        (_ = L(_ ^ b, 12)),
        (N = (N + _) | 0),
        (O = L(O ^ N, 8)),
        (b = (b + O) | 0),
        (_ = L(_ ^ b, 7)))
    let M = 0
    ;((r[M++] = (i + A) | 0),
      (r[M++] = (a + B) | 0),
      (r[M++] = (c + C) | 0),
      (r[M++] = (l + N) | 0),
      (r[M++] = (u + _) | 0),
      (r[M++] = (f + I) | 0),
      (r[M++] = (p + $) | 0),
      (r[M++] = (y + H) | 0),
      (r[M++] = (g + V) | 0),
      (r[M++] = (d + b) | 0),
      (r[M++] = (h + v) | 0),
      (r[M++] = (m + k) | 0),
      (r[M++] = (w + U) | 0),
      (r[M++] = (x + E) | 0),
      (r[M++] = (T + O) | 0),
      (r[M++] = (S + q) | 0))
  }
  function oa(t, e, n, r) {
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
        (x = L(x ^ a, 16)),
        (d = (d + x) | 0),
        (f = L(f ^ d, 12)),
        (a = (a + f) | 0),
        (x = L(x ^ a, 8)),
        (d = (d + x) | 0),
        (f = L(f ^ d, 7)),
        (o = (o + l) | 0),
        (x = L(x ^ o, 16)),
        (g = (g + x) | 0),
        (l = L(l ^ g, 12)),
        (o = (o + l) | 0),
        (x = L(x ^ o, 8)),
        (g = (g + x) | 0),
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
    let T = 0
    ;((r[T++] = o),
      (r[T++] = s),
      (r[T++] = i),
      (r[T++] = a),
      (r[T++] = h),
      (r[T++] = m),
      (r[T++] = w),
      (r[T++] = x))
  }
  var Gt = Yn(No, { counterRight: !1, counterLength: 4, allowShortKeys: !1 }),
    sa = Yn(No, { counterRight: !1, counterLength: 8, extendNonceFn: oa, allowShortKeys: !1 })
  var ia = new Uint8Array(16),
    _o = (t, e) => {
      t.update(e)
      let n = e.length % 16
      n && t.update(ia.subarray(n))
    },
    aa = new Uint8Array(32)
  function Uo(t, e, n, r, o) {
    let s = t(e, n, aa),
      i = Bo.create(s)
    ;(o && _o(i, o), _o(i, r))
    let a = new Uint8Array(16),
      c = Me(a)
    ;(Ge(c, 0, BigInt(o ? o.length : 0), !0), Ge(c, 8, BigInt(r.length), !0), i.update(a))
    let l = i.digest()
    return (s.fill(0), l)
  }
  var Oo = t => (e, n, r) => (
      R(e, 32),
      R(n),
      {
        encrypt: (s, i) => {
          let a = s.length,
            c = a + 16
          ;(i ? R(i, c) : (i = new Uint8Array(c)), t(e, n, s, i, 1))
          let l = Uo(t, e, n, i.subarray(0, -16), r)
          return (i.set(l, a), i)
        },
        decrypt: (s, i) => {
          let a = s.length,
            c = a - 16
          if (a < 16) throw new Error('encrypted data must be at least 16 bytes')
          i ? R(i, c) : (i = new Uint8Array(c))
          let l = s.subarray(0, -16),
            u = s.subarray(-16),
            f = Uo(t, e, n, l, r)
          if (!Ze(u, f)) throw new Error('invalid tag')
          return (t(e, n, l, i, 1), i)
        },
      }
    ),
    Hf = me({ blockSize: 64, nonceLength: 12, tagLength: 16 }, Oo(Gt)),
    Mf = me({ blockSize: 64, nonceLength: 24, tagLength: 16 }, Oo(sa))
  var Ft = class extends nt {
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
    at = (t, e, n) => new Ft(t, e).update(n).digest()
  at.create = (t, e) => new Ft(t, e)
  function Po(t, e, n) {
    return (re.hash(t), n === void 0 && (n = new Uint8Array(t.outputLen)), at(t, Ne(n), Ne(e)))
  }
  var Xn = new Uint8Array([0]),
    Ro = new Uint8Array()
  function $o(t, e, n, r = 32) {
    if ((re.hash(t), re.number(r), r > 255 * t.outputLen))
      throw new Error('Length should be <= 255*HashLen')
    let o = Math.ceil(r / t.outputLen)
    n === void 0 && (n = Ro)
    let s = new Uint8Array(o * t.outputLen),
      i = at.create(t, e),
      a = i._cloneInto(),
      c = new Uint8Array(i.outputLen)
    for (let l = 0; l < o; l++)
      ((Xn[0] = l + 1),
        a
          .update(l === 0 ? Ro : c)
          .update(n)
          .update(Xn)
          .digestInto(c),
        s.set(c, t.outputLen * l),
        i._cloneInto(a))
    return (i.destroy(), a.destroy(), c.fill(0), Xn.fill(0), s.slice(0, r))
  }
  var ca = Object.defineProperty,
    W = (t, e) => {
      for (var n in e) ca(t, n, { get: e[n], enumerable: !0 })
    },
    ct = Symbol('verified'),
    la = t => t instanceof Object
  function er(t) {
    if (
      !la(t) ||
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
  var ua = {}
  W(ua, {
    Queue: () => pa,
    QueueNode: () => qo,
    binarySearch: () => tr,
    bytesToHex: () => z,
    hexToBytes: () => Te,
    insertEventIntoAscendingList: () => ha,
    insertEventIntoDescendingList: () => da,
    normalizeURL: () => fa,
    utf8Decoder: () => Ce,
    utf8Encoder: () => de,
  })
  var Ce = new TextDecoder('utf-8'),
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
  function da(t, e) {
    let [n, r] = tr(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : o.created_at - e.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function ha(t, e) {
    let [n, r] = tr(t, o =>
      e.id === o.id ? 0 : e.created_at === o.created_at ? -1 : e.created_at - o.created_at
    )
    return (r || t.splice(n, 0, e), t)
  }
  function tr(t, e) {
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
  var qo = class {
      constructor(t) {
        Xe(this, 'value')
        Xe(this, 'next', null)
        Xe(this, 'prev', null)
        this.value = t
      }
    },
    pa = class {
      constructor() {
        Xe(this, 'first')
        Xe(this, 'last')
        ;((this.first = null), (this.last = null))
      }
      enqueue(t) {
        let e = new qo(t)
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
    ga = class {
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
          (n.id = Jt(n)),
          (n.sig = z(tt.sign(Jt(n), e))),
          (n[ct] = !0),
          n
        )
      }
      verifyEvent(t) {
        if (typeof t[ct] == 'boolean') return t[ct]
        let e = Jt(t)
        if (e !== t.id) return ((t[ct] = !1), !1)
        try {
          let n = tt.verify(t.sig, e, t.pubkey)
          return ((t[ct] = n), n)
        } catch {
          return ((t[ct] = !1), !1)
        }
      }
    }
  function ya(t) {
    if (!er(t)) throw new Error("can't serialize event with wrong or missing properties")
    return JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content])
  }
  function Jt(t) {
    let e = ge(de.encode(ya(t)))
    return z(e)
  }
  var Xt = new ga(),
    ma = Xt.generateSecretKey,
    nr = Xt.getPublicKey,
    xe = Xt.finalizeEvent,
    rr = Xt.verifyEvent,
    wa = {}
  W(wa, {
    Application: () => mc,
    BadgeAward: () => Ba,
    BadgeDefinition: () => uc,
    BlockedRelaysList: () => Ga,
    BookmarkList: () => ja,
    Bookmarksets: () => ac,
    Calendar: () => Ac,
    CalendarEventRSVP: () => Sc,
    ChannelCreation: () => Ko,
    ChannelHideMessage: () => Fo,
    ChannelMessage: () => Go,
    ChannelMetadata: () => Zo,
    ChannelMuteUser: () => Jo,
    ClassifiedListing: () => xc,
    ClientAuth: () => Xo,
    CommunitiesList: () => Ka,
    CommunityDefinition: () => Cc,
    CommunityPostApproval: () => Oa,
    Contacts: () => Ta,
    CreateOrUpdateProduct: () => hc,
    CreateOrUpdateStall: () => dc,
    Curationsets: () => cc,
    Date: () => Ec,
    DirectMessageRelaysList: () => Xa,
    DraftClassifiedListing: () => vc,
    DraftLong: () => gc,
    Emojisets: () => yc,
    EncryptedDirectMessage: () => Aa,
    EventDeletion: () => Sa,
    FileMetadata: () => Ca,
    FileServerPreference: () => Qa,
    Followsets: () => oc,
    GenericRepost: () => cr,
    Genericlists: () => sc,
    GiftWrap: () => Yo,
    HTTPAuth: () => lr,
    Handlerinformation: () => Lc,
    Handlerrecommendation: () => Bc,
    Highlights: () => Va,
    InterestsList: () => Ja,
    Interestsets: () => fc,
    JobFeedback: () => $a,
    JobRequest: () => Ra,
    JobResult: () => Pa,
    Label: () => Na,
    LightningPubRPC: () => tc,
    LiveChatMessage: () => ka,
    LiveEvent: () => wc,
    LongFormArticle: () => pc,
    Metadata: () => va,
    Mutelist: () => Wa,
    NWCWalletInfo: () => ec,
    NWCWalletRequest: () => Qo,
    NWCWalletResponse: () => nc,
    NostrConnect: () => rc,
    OpenTimestamps: () => La,
    Pinlist: () => Da,
    PrivateDirectMessage: () => jo,
    ProblemTracker: () => Ia,
    ProfileBadges: () => lc,
    PublicChatsList: () => Za,
    Reaction: () => ar,
    RecommendRelay: () => Ea,
    RelayList: () => za,
    Relaysets: () => ic,
    Report: () => _a,
    Reporting: () => Ua,
    Repost: () => ir,
    Seal: () => zo,
    SearchRelaysList: () => Fa,
    ShortTextNote: () => Do,
    Time: () => Tc,
    UserEmojiList: () => Ya,
    UserStatuses: () => bc,
    Zap: () => qa,
    ZapGoal: () => Ha,
    ZapRequest: () => Ma,
    classifyKind: () => ba,
    isAddressableKind: () => sr,
    isEphemeralKind: () => Wo,
    isKind: () => xa,
    isRegularKind: () => Vo,
    isReplaceableKind: () => or,
  })
  function Vo(t) {
    return (1e3 <= t && t < 1e4) || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(t)
  }
  function or(t) {
    return [0, 3].includes(t) || (1e4 <= t && t < 2e4)
  }
  function Wo(t) {
    return 2e4 <= t && t < 3e4
  }
  function sr(t) {
    return 3e4 <= t && t < 4e4
  }
  function ba(t) {
    return Vo(t)
      ? 'regular'
      : or(t)
        ? 'replaceable'
        : Wo(t)
          ? 'ephemeral'
          : sr(t)
            ? 'parameterized'
            : 'unknown'
  }
  function xa(t, e) {
    let n = e instanceof Array ? e : [e]
    return (er(t) && n.includes(t.kind)) || !1
  }
  var va = 0,
    Do = 1,
    Ea = 2,
    Ta = 3,
    Aa = 4,
    Sa = 5,
    ir = 6,
    ar = 7,
    Ba = 8,
    zo = 13,
    jo = 14,
    cr = 16,
    Ko = 40,
    Zo = 41,
    Go = 42,
    Fo = 43,
    Jo = 44,
    La = 1040,
    Yo = 1059,
    Ca = 1063,
    ka = 1311,
    Ia = 1971,
    _a = 1984,
    Ua = 1984,
    Na = 1985,
    Oa = 4550,
    Ra = 5999,
    Pa = 6999,
    $a = 7e3,
    Ha = 9041,
    Ma = 9734,
    qa = 9735,
    Va = 9802,
    Wa = 1e4,
    Da = 10001,
    za = 10002,
    ja = 10003,
    Ka = 10004,
    Za = 10005,
    Ga = 10006,
    Fa = 10007,
    Ja = 10015,
    Ya = 10030,
    Xa = 10050,
    Qa = 10096,
    ec = 13194,
    tc = 21e3,
    Xo = 22242,
    Qo = 23194,
    nc = 23195,
    rc = 24133,
    lr = 27235,
    oc = 3e4,
    sc = 30001,
    ic = 30002,
    ac = 30003,
    cc = 30004,
    lc = 30008,
    uc = 30009,
    fc = 30015,
    dc = 30017,
    hc = 30018,
    pc = 30023,
    gc = 30024,
    yc = 30030,
    mc = 30078,
    wc = 30311,
    bc = 30315,
    xc = 30402,
    vc = 30403,
    Ec = 31922,
    Tc = 31923,
    Ac = 31924,
    Sc = 31925,
    Bc = 31989,
    Lc = 31990,
    Cc = 34550
  var kc = {}
  W(kc, {
    getHex64: () => ur,
    getInt: () => es,
    getSubscriptionId: () => Ic,
    matchEventId: () => _c,
    matchEventKind: () => Nc,
    matchEventPubkey: () => Uc,
  })
  function ur(t, e) {
    let n = e.length + 3,
      r = t.indexOf(`"${e}":`) + n,
      o = t.slice(r).indexOf('"') + r + 1
    return t.slice(o, o + 64)
  }
  function es(t, e) {
    let n = e.length,
      r = t.indexOf(`"${e}":`) + n + 3,
      o = t.slice(r),
      s = Math.min(o.indexOf(','), o.indexOf('}'))
    return parseInt(o.slice(0, s), 10)
  }
  function Ic(t) {
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
  function _c(t, e) {
    return e === ur(t, 'id')
  }
  function Uc(t, e) {
    return e === ur(t, 'pubkey')
  }
  function Nc(t, e) {
    return e === es(t, 'kind')
  }
  var Oc = {}
  W(Oc, { makeAuthEvent: () => Rc })
  function Rc(t, e) {
    return {
      kind: Xo,
      created_at: Math.floor(Date.now() / 1e3),
      tags: [
        ['relay', t],
        ['challenge', e],
      ],
      content: '',
    }
  }
  var Pc
  try {
    Pc = WebSocket
  } catch {}
  var $c
  try {
    $c = WebSocket
  } catch {}
  var fr = {}
  W(fr, {
    BECH32_REGEX: () => ts,
    Bech32MaxSize: () => dr,
    NostrTypeGuard: () => Hc,
    decode: () => Qt,
    decodeNostrURI: () => qc,
    encodeBytes: () => tn,
    naddrEncode: () => Kc,
    neventEncode: () => jc,
    noteEncode: () => Dc,
    nprofileEncode: () => zc,
    npubEncode: () => Wc,
    nsecEncode: () => Vc,
  })
  var Hc = {
      isNProfile: t => /^nprofile1[a-z\d]+$/.test(t || ''),
      isNEvent: t => /^nevent1[a-z\d]+$/.test(t || ''),
      isNAddr: t => /^naddr1[a-z\d]+$/.test(t || ''),
      isNSec: t => /^nsec1[a-z\d]{58}$/.test(t || ''),
      isNPub: t => /^npub1[a-z\d]{58}$/.test(t || ''),
      isNote: t => /^note1[a-z\d]+$/.test(t || ''),
      isNcryptsec: t => /^ncryptsec1[a-z\d]+$/.test(t || ''),
    },
    dr = 5e3,
    ts = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/
  function Mc(t) {
    let e = new Uint8Array(4)
    return (
      (e[0] = (t >> 24) & 255),
      (e[1] = (t >> 16) & 255),
      (e[2] = (t >> 8) & 255),
      (e[3] = t & 255),
      e
    )
  }
  function qc(t) {
    try {
      return (t.startsWith('nostr:') && (t = t.substring(6)), Qt(t))
    } catch {
      return { type: 'invalid', data: null }
    }
  }
  function Qt(t) {
    let { prefix: e, words: n } = $e.decode(t, dr),
      r = new Uint8Array($e.fromWords(n))
    switch (e) {
      case 'nprofile': {
        let o = Qn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        return {
          type: 'nprofile',
          data: { pubkey: z(o[0][0]), relays: o[1] ? o[1].map(s => Ce.decode(s)) : [] },
        }
      }
      case 'nevent': {
        let o = Qn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for nevent')
        if (o[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
        if (o[2] && o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (o[3] && o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'nevent',
          data: {
            id: z(o[0][0]),
            relays: o[1] ? o[1].map(s => Ce.decode(s)) : [],
            author: o[2]?.[0] ? z(o[2][0]) : void 0,
            kind: o[3]?.[0] ? parseInt(z(o[3][0]), 16) : void 0,
          },
        }
      }
      case 'naddr': {
        let o = Qn(r)
        if (!o[0]?.[0]) throw new Error('missing TLV 0 for naddr')
        if (!o[2]?.[0]) throw new Error('missing TLV 2 for naddr')
        if (o[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
        if (!o[3]?.[0]) throw new Error('missing TLV 3 for naddr')
        if (o[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
        return {
          type: 'naddr',
          data: {
            identifier: Ce.decode(o[0][0]),
            pubkey: z(o[2][0]),
            kind: parseInt(z(o[3][0]), 16),
            relays: o[1] ? o[1].map(s => Ce.decode(s)) : [],
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
  function Qn(t) {
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
  function Vc(t) {
    return tn('nsec', t)
  }
  function Wc(t) {
    return tn('npub', Te(t))
  }
  function Dc(t) {
    return tn('note', Te(t))
  }
  function en(t, e) {
    let n = $e.toWords(e)
    return $e.encode(t, n, dr)
  }
  function tn(t, e) {
    return en(t, e)
  }
  function zc(t) {
    let e = hr({ 0: [Te(t.pubkey)], 1: (t.relays || []).map(n => de.encode(n)) })
    return en('nprofile', e)
  }
  function jc(t) {
    let e
    t.kind !== void 0 && (e = Mc(t.kind))
    let n = hr({
      0: [Te(t.id)],
      1: (t.relays || []).map(r => de.encode(r)),
      2: t.author ? [Te(t.author)] : [],
      3: e ? [new Uint8Array(e)] : [],
    })
    return en('nevent', n)
  }
  function Kc(t) {
    let e = new ArrayBuffer(4)
    new DataView(e).setUint32(0, t.kind, !1)
    let n = hr({
      0: [de.encode(t.identifier)],
      1: (t.relays || []).map(r => de.encode(r)),
      2: [Te(t.pubkey)],
      3: [new Uint8Array(e)],
    })
    return en('naddr', n)
  }
  function hr(t) {
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
  var Zc = {}
  W(Zc, { decrypt: () => Gc, encrypt: () => ns })
  function ns(t, e, n) {
    let r = t instanceof Uint8Array ? z(t) : t,
      o = Ue.getSharedSecret(r, '02' + e),
      s = rs(o),
      i = Uint8Array.from($t(16)),
      a = de.encode(n),
      c = Gn(s, i).encrypt(a),
      l = ie.encode(new Uint8Array(c)),
      u = ie.encode(new Uint8Array(i.buffer))
    return `${l}?iv=${u}`
  }
  function Gc(t, e, n) {
    let r = t instanceof Uint8Array ? z(t) : t,
      [o, s] = n.split('?iv='),
      i = Ue.getSharedSecret(r, '02' + e),
      a = rs(i),
      c = ie.decode(s),
      l = ie.decode(o),
      u = Gn(a, c).decrypt(l)
    return Ce.decode(u)
  }
  function rs(t) {
    return t.slice(1, 33)
  }
  var Fc = {}
  W(Fc, {
    NIP05_REGEX: () => pr,
    isNip05: () => Jc,
    isValid: () => Qc,
    queryProfile: () => os,
    searchDomain: () => Xc,
    useFetchImplementation: () => Yc,
  })
  var pr = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/,
    Jc = t => pr.test(t || ''),
    nn
  try {
    nn = fetch
  } catch {}
  function Yc(t) {
    nn = t
  }
  async function Xc(t, e = '') {
    try {
      let n = `https://${t}/.well-known/nostr.json?name=${e}`,
        r = await nn(n, { redirect: 'manual' })
      if (r.status !== 200) throw Error('Wrong response code')
      return (await r.json()).names
    } catch {
      return {}
    }
  }
  async function os(t) {
    let e = t.match(pr)
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
  async function Qc(t, e) {
    let n = await os(e)
    return n ? n.pubkey === t : !1
  }
  var el = {}
  W(el, { parse: () => tl })
  function tl(t) {
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
  var nl = {}
  W(nl, { fetchRelayInformation: () => ol, useFetchImplementation: () => rl })
  var ss
  try {
    ss = fetch
  } catch {}
  function rl(t) {
    ss = t
  }
  async function ol(t) {
    return await (
      await fetch(t.replace('ws://', 'http://').replace('wss://', 'https://'), {
        headers: { Accept: 'application/nostr+json' },
      })
    ).json()
  }
  var sl = {}
  W(sl, { fastEventHash: () => as, getPow: () => is, minePow: () => il })
  function is(t) {
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
  function il(t, e) {
    let n = 0,
      r = t,
      o = ['nonce', n.toString(), e.toString()]
    for (r.tags.push(o); ; ) {
      let s = Math.floor(new Date().getTime() / 1e3)
      if (
        (s !== r.created_at && ((n = 0), (r.created_at = s)),
        (o[1] = (++n).toString()),
        (r.id = as(r)),
        is(r.id) >= e)
      )
        break
    }
    return r
  }
  function as(t) {
    return z(ge(de.encode(JSON.stringify([0, t.pubkey, t.created_at, t.kind, t.tags, t.content]))))
  }
  var al = {}
  W(al, {
    unwrapEvent: () => bl,
    unwrapManyEvents: () => xl,
    wrapEvent: () => xs,
    wrapManyEvents: () => wl,
  })
  var cl = {}
  W(cl, {
    createRumor: () => ys,
    createSeal: () => ms,
    createWrap: () => ws,
    unwrapEvent: () => br,
    unwrapManyEvents: () => bs,
    wrapEvent: () => Yt,
    wrapManyEvents: () => yl,
  })
  var ll = {}
  W(ll, { decrypt: () => wr, encrypt: () => mr, getConversationKey: () => gr, v2: () => pl })
  var cs = 1,
    ls = 65535
  function gr(t, e) {
    let n = Ue.getSharedSecret(t, '02' + e).subarray(1, 33)
    return Po(ge, n, 'nip44-v2')
  }
  function us(t, e) {
    let n = $o(ge, t, e, 76)
    return {
      chacha_key: n.subarray(0, 32),
      chacha_nonce: n.subarray(32, 44),
      hmac_key: n.subarray(44, 76),
    }
  }
  function yr(t) {
    if (!Number.isSafeInteger(t) || t < 1) throw new Error('expected positive integer')
    if (t <= 32) return 32
    let e = 1 << (Math.floor(Math.log2(t - 1)) + 1),
      n = e <= 256 ? 32 : e / 8
    return n * (Math.floor((t - 1) / n) + 1)
  }
  function ul(t) {
    if (!Number.isSafeInteger(t) || t < cs || t > ls)
      throw new Error('invalid plaintext size: must be between 1 and 65535 bytes')
    let e = new Uint8Array(2)
    return (new DataView(e.buffer).setUint16(0, t, !1), e)
  }
  function fl(t) {
    let e = de.encode(t),
      n = e.length,
      r = ul(n),
      o = new Uint8Array(yr(n) - n)
    return rt(r, e, o)
  }
  function dl(t) {
    let e = new DataView(t.buffer).getUint16(0),
      n = t.subarray(2, 2 + e)
    if (e < cs || e > ls || n.length !== e || t.length !== 2 + yr(e))
      throw new Error('invalid padding')
    return Ce.decode(n)
  }
  function fs(t, e, n) {
    if (n.length !== 32) throw new Error('AAD associated data must be 32 bytes')
    let r = rt(n, e)
    return at(ge, t, r)
  }
  function hl(t) {
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
  function mr(t, e, n = $t(32)) {
    let { chacha_key: r, chacha_nonce: o, hmac_key: s } = us(e, n),
      i = fl(t),
      a = Gt(r, o, i),
      c = fs(s, a, n)
    return ie.encode(rt(new Uint8Array([2]), n, a, c))
  }
  function wr(t, e) {
    let { nonce: n, ciphertext: r, mac: o } = hl(t),
      { chacha_key: s, chacha_nonce: i, hmac_key: a } = us(e, n),
      c = fs(a, r, n)
    if (!Ze(c, o)) throw new Error('invalid MAC')
    let l = Gt(s, i, r)
    return dl(l)
  }
  var pl = { utils: { getConversationKey: gr, calcPaddedLen: yr }, encrypt: mr, decrypt: wr },
    gl = 2880 * 60,
    ds = () => Math.round(Date.now() / 1e3),
    hs = () => Math.round(ds() - Math.random() * gl),
    ps = (t, e) => gr(t, e),
    gs = (t, e, n) => mr(JSON.stringify(t), ps(e, n)),
    Ho = (t, e) => JSON.parse(wr(t.content, ps(e, t.pubkey)))
  function ys(t, e) {
    let n = { created_at: ds(), content: '', tags: [], ...t, pubkey: nr(e) }
    return ((n.id = Jt(n)), n)
  }
  function ms(t, e, n) {
    return xe({ kind: zo, content: gs(t, e, n), created_at: hs(), tags: [] }, e)
  }
  function ws(t, e) {
    let n = ma()
    return xe({ kind: Yo, content: gs(t, n, e), created_at: hs(), tags: [['p', e]] }, n)
  }
  function Yt(t, e, n) {
    let r = ys(t, e),
      o = ms(r, e, n)
    return ws(o, n)
  }
  function yl(t, e, n) {
    if (!n || n.length === 0) throw new Error('At least one recipient is required.')
    let r = nr(e),
      o = [Yt(t, e, r)]
    return (
      n.forEach(s => {
        o.push(Yt(t, e, s))
      }),
      o
    )
  }
  function br(t, e) {
    let n = Ho(t, e)
    return Ho(n, e)
  }
  function bs(t, e) {
    let n = []
    return (
      t.forEach(r => {
        n.push(br(r, e))
      }),
      n.sort((r, o) => r.created_at - o.created_at),
      n
    )
  }
  function ml(t, e, n, r) {
    let o = { created_at: Math.ceil(Date.now() / 1e3), kind: jo, tags: [], content: e }
    return (
      (Array.isArray(t) ? t : [t]).forEach(({ publicKey: i, relayUrl: a }) => {
        o.tags.push(a ? ['p', i, a] : ['p', i])
      }),
      r && o.tags.push(['e', r.eventId, r.relayUrl || '', 'reply']),
      n && o.tags.push(['subject', n]),
      o
    )
  }
  function xs(t, e, n, r, o) {
    let s = ml(e, n, r, o)
    return Yt(s, t, e.publicKey)
  }
  function wl(t, e, n, r, o) {
    if (!e || e.length === 0) throw new Error('At least one recipient is required.')
    return [{ publicKey: nr(t) }, ...e].map(i => xs(t, i, n, r, o))
  }
  var bl = br,
    xl = bs,
    vl = {}
  W(vl, {
    finishRepostEvent: () => El,
    getRepostedEvent: () => Tl,
    getRepostedEventPointer: () => vs,
  })
  function El(t, e, n, r) {
    let o,
      s = [...(t.tags ?? []), ['e', e.id, n], ['p', e.pubkey]]
    return (
      e.kind === Do ? (o = ir) : ((o = cr), s.push(['k', String(e.kind)])),
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
  function vs(t) {
    if (![ir, cr].includes(t.kind)) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (e !== void 0)
      return { id: e[1], relays: [e[2], n?.[2]].filter(r => typeof r == 'string'), author: n?.[1] }
  }
  function Tl(t, { skipVerification: e } = {}) {
    let n = vs(t)
    if (n === void 0 || t.content === '') return
    let r
    try {
      r = JSON.parse(t.content)
    } catch {
      return
    }
    if (r.id === n.id && !(!e && !rr(r))) return r
  }
  var Al = {}
  W(Al, { NOSTR_URI_REGEX: () => xr, parse: () => Bl, test: () => Sl })
  var xr = new RegExp(`nostr:(${ts.source})`)
  function Sl(t) {
    return typeof t == 'string' && new RegExp(`^${xr.source}$`).test(t)
  }
  function Bl(t) {
    let e = t.match(new RegExp(`^${xr.source}$`))
    if (!e) throw new Error(`Invalid Nostr URI: ${t}`)
    return { uri: e[0], value: e[1], decoded: Qt(e[1]) }
  }
  var Ll = {}
  W(Ll, { finishReactionEvent: () => Cl, getReactedEventPointer: () => kl })
  function Cl(t, e, n) {
    let r = e.tags.filter(o => o.length >= 2 && (o[0] === 'e' || o[0] === 'p'))
    return xe(
      {
        ...t,
        kind: ar,
        tags: [...(t.tags ?? []), ...r, ['e', e.id], ['p', e.pubkey]],
        content: t.content ?? '+',
      },
      n
    )
  }
  function kl(t) {
    if (t.kind !== ar) return
    let e, n
    for (let r = t.tags.length - 1; r >= 0 && (e === void 0 || n === void 0); r--) {
      let o = t.tags[r]
      o.length >= 2 &&
        (o[0] === 'e' && e === void 0 ? (e = o) : o[0] === 'p' && n === void 0 && (n = o))
    }
    if (!(e === void 0 || n === void 0))
      return { id: e[1], relays: [e[2], n[2]].filter(r => r !== void 0), author: n[1] }
  }
  var Il = {}
  W(Il, { parse: () => Ul })
  var _l = /\W/m,
    Mo = /\W |\W$|$|,| /m
  function* Ul(t) {
    let e = t.length,
      n = 0,
      r = 0
    for (; r < e; ) {
      let o = t.indexOf(':', r)
      if (o === -1) break
      if (t.substring(o - 5, o) === 'nostr') {
        let s = t.substring(o + 60).match(_l),
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
        let s = t.substring(o + 4).match(Mo),
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
        let s = t.substring(o + 4).match(Mo),
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
  var Nl = {}
  W(Nl, {
    channelCreateEvent: () => Ol,
    channelHideMessageEvent: () => $l,
    channelMessageEvent: () => Pl,
    channelMetadataEvent: () => Rl,
    channelMuteUserEvent: () => Hl,
  })
  var Ol = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe({ kind: Ko, tags: [...(t.tags ?? [])], content: n, created_at: t.created_at }, e)
    },
    Rl = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: Zo,
          tags: [['e', t.channel_create_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Pl = (t, e) => {
      let n = [['e', t.channel_create_event_id, t.relay_url, 'root']]
      return (
        t.reply_to_channel_message_event_id &&
          n.push(['e', t.reply_to_channel_message_event_id, t.relay_url, 'reply']),
        xe(
          {
            kind: Go,
            tags: [...n, ...(t.tags ?? [])],
            content: t.content,
            created_at: t.created_at,
          },
          e
        )
      )
    },
    $l = (t, e) => {
      let n
      if (typeof t.content == 'object') n = JSON.stringify(t.content)
      else if (typeof t.content == 'string') n = t.content
      else return
      return xe(
        {
          kind: Fo,
          tags: [['e', t.channel_message_event_id], ...(t.tags ?? [])],
          content: n,
          created_at: t.created_at,
        },
        e
      )
    },
    Hl = (t, e) => {
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
    Ml = {}
  W(Ml, {
    EMOJI_SHORTCODE_REGEX: () => Es,
    matchAll: () => ql,
    regex: () => vr,
    replaceAll: () => Vl,
  })
  var Es = /:(\w+):/,
    vr = () => new RegExp(`\\B${Es.source}\\B`, 'g')
  function* ql(t) {
    let e = t.matchAll(vr())
    for (let n of e)
      try {
        let [r, o] = n
        yield { shortcode: r, name: o, start: n.index, end: n.index + r.length }
      } catch {}
  }
  function Vl(t, e) {
    return t.replaceAll(vr(), (n, r) => e({ shortcode: n, name: r }))
  }
  var Wl = {}
  W(Wl, { useFetchImplementation: () => Dl, validateGithub: () => zl })
  var Er
  try {
    Er = fetch
  } catch {}
  function Dl(t) {
    Er = t
  }
  async function zl(t, e, n) {
    try {
      return (
        (await (await Er(`https://gist.github.com/${e}/${n}/raw`)).text()) ===
        `Verifying that I control the following Nostr public key: ${t}`
      )
    } catch {
      return !1
    }
  }
  var jl = {}
  W(jl, { makeNwcRequestEvent: () => Zl, parseConnectionString: () => Kl })
  function Kl(t) {
    let { host: e, pathname: n, searchParams: r } = new URL(t),
      o = n || e,
      s = r.get('relay'),
      i = r.get('secret')
    if (!o || !s || !i) throw new Error('invalid connection string')
    return { pubkey: o, relay: s, secret: i }
  }
  async function Zl(t, e, n) {
    let o = ns(e, t, JSON.stringify({ method: 'pay_invoice', params: { invoice: n } })),
      s = { kind: Qo, created_at: Math.round(Date.now() / 1e3), content: o, tags: [['p', t]] }
    return xe(s, e)
  }
  var Gl = {}
  W(Gl, { normalizeIdentifier: () => Fl })
  function Fl(t) {
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
    getSatoshisAmountFromBolt11: () => nu,
    getZapEndpoint: () => Xl,
    makeZapReceipt: () => tu,
    makeZapRequest: () => Ql,
    useFetchImplementation: () => Yl,
    validateZapRequest: () => eu,
  })
  var Tr
  try {
    Tr = fetch
  } catch {}
  function Yl(t) {
    Tr = t
  }
  async function Xl(t) {
    try {
      let e = '',
        { lud06: n, lud16: r } = JSON.parse(t.content)
      if (r) {
        let [i, a] = r.split('@')
        e = new URL(`/.well-known/lnurlp/${i}`, `https://${a}`).toString()
      } else if (n) {
        let { words: i } = $e.decode(n, 1e3),
          a = $e.fromWords(i)
        e = Ce.decode(a)
      } else return null
      let s = await (await Tr(e)).json()
      if (s.allowsNostr && s.nostrPubkey) return s.callback
    } catch {}
    return null
  }
  function Ql(t) {
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
      if ((e.tags.push(['e', t.event.id]), or(t.event.kind))) {
        let n = ['a', `${t.event.kind}:${t.event.pubkey}:`]
        e.tags.push(n)
      } else if (sr(t.event.kind)) {
        let n = t.event.tags.find(([o, s]) => o === 'd' && s)
        if (!n) throw new Error('d tag not found or is empty')
        let r = ['a', `${t.event.kind}:${t.event.pubkey}:${n[1]}`]
        e.tags.push(r)
      }
      e.tags.push(['k', t.event.kind.toString()])
    }
    return e
  }
  function eu(t) {
    let e
    try {
      e = JSON.parse(t)
    } catch {
      return 'Invalid zap request JSON.'
    }
    if (!er(e)) return 'Zap request is not a valid Nostr event.'
    if (!rr(e)) return 'Invalid signature on zap request.'
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
  function tu({ zapRequest: t, preimage: e, bolt11: n, paidAt: r }) {
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
  function nu(t) {
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
  var ru = {}
  W(ru, {
    getToken: () => ou,
    hashPayload: () => Ar,
    unpackEventFromToken: () => As,
    validateEvent: () => Is,
    validateEventKind: () => Bs,
    validateEventMethodTag: () => Cs,
    validateEventPayloadTag: () => ks,
    validateEventTimestamp: () => Ss,
    validateEventUrlTag: () => Ls,
    validateToken: () => su,
  })
  var Ts = 'Nostr '
  async function ou(t, e, n, r = !1, o) {
    let s = {
      kind: lr,
      tags: [
        ['u', t],
        ['method', e],
      ],
      created_at: Math.round(new Date().getTime() / 1e3),
      content: '',
    }
    o && s.tags.push(['payload', Ar(o)])
    let i = await n(s)
    return (r ? Ts : '') + ie.encode(de.encode(JSON.stringify(i)))
  }
  async function su(t, e, n) {
    let r = await As(t).catch(s => {
      throw s
    })
    return await Is(r, e, n).catch(s => {
      throw s
    })
  }
  async function As(t) {
    if (!t) throw new Error('Missing token')
    t = t.replace(Ts, '')
    let e = Ce.decode(ie.decode(t))
    if (!e || e.length === 0 || !e.startsWith('{')) throw new Error('Invalid token')
    return JSON.parse(e)
  }
  function Ss(t) {
    return t.created_at ? Math.round(new Date().getTime() / 1e3) - t.created_at < 60 : !1
  }
  function Bs(t) {
    return t.kind === lr
  }
  function Ls(t, e) {
    let n = t.tags.find(r => r[0] === 'u')
    return n ? n.length > 0 && n[1] === e : !1
  }
  function Cs(t, e) {
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
  async function Is(t, e, n, r) {
    if (!rr(t)) throw new Error('Invalid nostr event, signature invalid')
    if (!Bs(t)) throw new Error('Invalid nostr event, kind invalid')
    if (!Ss(t)) throw new Error('Invalid nostr event, created_at timestamp invalid')
    if (!Ls(t, e)) throw new Error('Invalid nostr event, url tag invalid')
    if (!Cs(t, n)) throw new Error('Invalid nostr event, method tag invalid')
    if (r && typeof r == 'object' && Object.keys(r).length > 0 && !ks(t, r))
      throw new Error('Invalid nostr event, payload tag does not match request body hash')
    return !0
  }
  function _s(t) {
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
  function iu() {
    return ['wss://relay.divine.video', 'wss://relay.nostr.band', 'wss://relay.damus.io']
  }
  function Us(t = [], e = []) {
    let n = [...e, ...t, ...iu()]
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
                    We.setCachedEvent(n, h),
                    c(h))
                } else l(new Error('Event not found (timeout)'))
            }, 1e4)
          a.forEach(h => {
            let m = x => {
              try {
                let T = JSON.parse(x.data)
                if (T[0] === 'EVENT' && T[1] === o) {
                  let S = T[2]
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
                      We.setCachedEvent(n, S),
                      c(S))
                }
                if (
                  T[0] === 'EOSE' &&
                  T[1] === o &&
                  (y++, console.log(`[Nostr Client] EOSE received (${y}/${g})`), f && y === g && !u)
                )
                  if (((u = !0), clearTimeout(d), this.closeSubscription(o), p.length > 0)) {
                    let S = p.reduce((A, B) => (B.created_at > A.created_at ? B : A))
                    ;(console.log(
                      `[Nostr Client] All relays responded, returning newest event (created_at: ${S.created_at})`
                    ),
                      We.setCachedEvent(n, S),
                      c(S))
                  } else l(new Error('Addressable event not found on any relay'))
              } catch (T) {
                console.error('[Nostr Client] Failed to parse message:', T)
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
  function Ns(t) {
    let e = t.tags.filter(n => n[0] === 'imeta')
    return e.length > 0 ? au(t, e) : cu(t)
  }
  function au(t, e) {
    let n = e.map(u => lu(u)).filter(Boolean),
      r = n.filter(u => u.mimeType?.startsWith('video/')),
      o = n.filter(u => u.mimeType?.startsWith('image/'))
    ;(e.forEach(u => {
      for (let f = 1; f < u.length; f++) {
        let p = u[f]
        if (p.startsWith('image ')) {
          let y = p.substring(6).trim()
          y && !o.some(g => g.url === y) && o.push({ url: y, fallbackUrls: [] })
        }
      }
    }),
      r.sort((u, f) => {
        let p = sn(u)
        return sn(f) - p
      }))
    let s =
        t.tags.find(u => u[0] === 'title')?.[1] ||
        t.tags.find(u => u[0] === 'alt')?.[1] ||
        t.content ||
        'Untitled Video',
      i = t.content || '',
      a = parseInt(t.tags.find(u => u[0] === 'duration')?.[1] || '0', 10),
      c = t.tags.find(u => u[0] === 'content-warning')?.[1],
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
  function cu(t) {
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
  function lu(t) {
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
  function Os(t, e = 'auto') {
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
                    let x = w[2]
                    ;(!u || x.created_at > u.created_at) &&
                      ((u = x),
                      console.log(
                        `[ProfileFetcher] Profile event received (created_at: ${x.created_at})`
                      ))
                  }
                  if (
                    w[0] === 'EOSE' &&
                    w[1] === r &&
                    (f++, console.log(`[ProfileFetcher] EOSE received (${f}/${p})`), f === p && !l)
                  )
                    if (((l = !0), clearTimeout(y), this.client.closeSubscription(r), u)) {
                      let x = t.parseProfileMetadata(u)
                      ;(console.log('[ProfileFetcher] All relays responded, returning profile'),
                        a(x))
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
  var un = class t {
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
  var mt = null,
    Sr = null
  async function Ps() {
    console.log('[Nostube Embed] Initializing player...')
    try {
      let t = Ir(),
        e = _r(t)
      if (!e.valid) {
        Fe(e.error)
        return
      }
      uu('Loading video...')
      let n = _s(t.videoId)
      if (!n) {
        Fe('Failed to decode video identifier')
        return
      }
      let r = Us(n.data.relays, t.customRelays)
      ;((mt = new on(r)), (Sr = new ln(mt)))
      let o = null
      n.type === 'address' &&
        n.data.pubkey &&
        (console.log('[Nostube Embed] Starting parallel profile fetch (naddr)'),
        (o = Sr.fetchProfile(n.data.pubkey, r)))
      let s = await mt.fetchEvent(n),
        i = Ns(s)
      ;(console.log('[Nostube Embed] Parsed video:', i),
        n.type === 'event' &&
          i.author &&
          (console.log('[Nostube Embed] Starting profile fetch (nevent)'),
          (o = Sr.fetchProfile(i.author, r))))
      let a = Os(i.videoVariants, t.preferredQuality)
      if (!a) {
        Fe('No video URLs found in event')
        return
      }
      console.log('[Nostube Embed] Selected variant:', a)
      try {
        let c = gt.buildVideoPlayer(i, t),
          l = gt.createPlayerContainer(c)
        an.applyToPlayer(l, c, i)
        let u = null
        ;(t.showTitle && (yt.applyToPlayer(l, c, i, t), (u = l.querySelector('.title-overlay'))),
          cn.applyToPlayer(l, c, t.videoId, t),
          un.applyToPlayer(l, c),
          (document.body.innerHTML = ''),
          document.body.appendChild(l),
          o &&
            u &&
            o
              .then(f => {
                f
                  ? (console.log('[Nostube Embed] Profile fetched, updating overlay'),
                    yt.updateProfile(u, f))
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
          Fe(`Failed to initialize player: ${c.message}`))
        return
      }
    } catch (t) {
      ;(console.error('[Nostube Embed] Error:', t),
        t.message.includes('timeout')
          ? Fe('Connection failed. Unable to fetch video.')
          : t.message.includes('not found')
            ? Fe('Video not found')
            : Fe(t.message))
    }
  }
  function uu(t) {
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
  function Fe(t) {
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
    mt && mt.closeAll()
  })
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', Ps) : Ps()
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
