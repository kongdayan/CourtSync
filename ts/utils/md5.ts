const S: number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = (() => {
  const table = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  }
  return table;
})();

const encoder = new TextEncoder();

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function md5Hex(input: string): string {
  const message = encoder.encode(input);
  const msgLength = message.length;
  const bitLength = msgLength * 8;
  const paddedLength = (msgLength + 9 + 63) & ~63;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(message);
  buffer[msgLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, bitLength, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let offset = 0; offset < buffer.length; offset += 64) {
    const chunk = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      const index = offset + i * 4;
      chunk[i] =
        buffer[index] |
        (buffer[index + 1] << 8) |
        (buffer[index + 2] << 16) |
        (buffer[index + 3] << 24);
    }

    let aa = a;
    let bb = b;
    let cc = c;
    let dd = d;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (bb & cc) | (~bb & dd);
        g = i;
      } else if (i < 32) {
        f = (dd & bb) | (~dd & cc);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = bb ^ cc ^ dd;
        g = (3 * i + 5) % 16;
      } else {
        f = cc ^ (bb | ~dd);
        g = (7 * i) % 16;
      }

      const temp = dd;
      dd = cc;
      cc = bb;
      const sum = (aa + f + K[i] + chunk[g]) >>> 0;
      bb = (bb + rotateLeft(sum, S[i])) >>> 0;
      aa = temp;
    }

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const words = [a, b, c, d];
  let output = "";
  for (const word of words) {
    for (let i = 0; i < 4; i++) {
      const byte = (word >>> (8 * i)) & 0xff;
      output += byte.toString(16).padStart(2, "0");
    }
  }

  return output;
}
