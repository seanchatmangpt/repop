/**
 * Table-driven CRC-32/ISO-HDLC (IEEE 802.3), the WIR0 slot checksum.
 * Gate vectors: "123456789" -> 0xCBF43926, empty -> 0x00000000.
 */

const TABLE: readonly number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of a byte range, table-driven, standard init/final-xor. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffff_ffff;
  for (let i = start; i < end; i++) {
    crc = TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}
