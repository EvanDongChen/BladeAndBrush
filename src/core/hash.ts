/** FNV-1a over the bytes of typed arrays. Used for determinism tests and replay checks. */
export class Hasher {
  h = 0x811c9dc5;

  byte(v: number): this {
    this.h = Math.imul(this.h ^ (v & 0xff), 0x01000193);
    return this;
  }

  int(v: number): this {
    return this.byte(v).byte(v >>> 8).byte(v >>> 16).byte(v >>> 24);
  }

  bytes(a: Uint8Array | Int8Array, mask = 0xff): this {
    let h = this.h;
    for (let i = 0; i < a.length; i++) h = Math.imul(h ^ (a[i] & mask), 0x01000193);
    this.h = h;
    return this;
  }

  u16(a: Uint16Array): this {
    let h = this.h;
    for (let i = 0; i < a.length; i++) {
      h = Math.imul(h ^ (a[i] & 0xff), 0x01000193);
      h = Math.imul(h ^ (a[i] >>> 8), 0x01000193);
    }
    this.h = h;
    return this;
  }

  digest(): number {
    return this.h >>> 0;
  }
}
