/**
 * Base58 (Bitcoin alphabet) encode/decode. Kept dependency-free on purpose so
 * the whole tool installs with one package. Used for signatures and keys.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAP = (() => {
  const m = {};
  for (let i = 0; i < ALPHABET.length; i++) m[ALPHABET[i]] = i;
  return m;
})();

function encode(buffer) {
  const bytes = Uint8Array.from(buffer);
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

function decode(str) {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const bytes = [0];
  for (let i = zeros; i < str.length; i++) {
    const value = MAP[str[i]];
    if (value === undefined) throw new Error("bad base58 char: " + str[i]);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Array(zeros).fill(0).concat(bytes.reverse());
  return Uint8Array.from(out);
}

module.exports = { encode, decode };
