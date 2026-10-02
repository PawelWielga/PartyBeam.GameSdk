// Classic ZIP support for package-v1 producers. Never extracts onto a filesystem.
import { inflateRawSync } from "node:zlib";
import { assertSafeArtifactPath } from "../package-v1.js";
import { requirePackage as need } from "./errors.js";

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
// Match the descriptor's single-character ordinal case folding.
export const pathKey = path => Array.from(path, character => {
  const upper = character.toUpperCase();
  return upper.length === character.length ? upper : character;
}).join("");
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function checkFilePrefixes(names) {
  const folded = new Set(names.map(pathKey));
  for (const name of names) {
    const segments = name.split("/");
    for (let count = 1; count < segments.length; count++) {
      need(!folded.has(pathKey(segments.slice(0, count).join("/"))), "zip.collision", `File/directory prefix collision: ${name}`);
    }
  }
}
export const ZIP_LIMITS = Object.freeze({ maxArchiveBytes: 256 * 1024 * 1024,
  maxEntries: 10000, maxEntryBytes: 64 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024 });
export function zipLimits(overrides = {}) {
  need(overrides && typeof overrides === "object" && !Array.isArray(overrides), "zip.limits", "Limits must be an object.");
  const limits = { ...ZIP_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    need(Object.hasOwn(ZIP_LIMITS, name) && Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff,
      "zip.limits", `Invalid ${name}.`);
  }
  return limits;
}

export function createZip(entries, overrides) {
  const limits = zipLimits(overrides);
  const list = [...entries].sort(([a], [b]) => ordinal(a, b));
  need(list.length > 0 && list.length < 65535 && list.length <= limits.maxEntries, "zip.entries", "Invalid entry count.");
  checkFilePrefixes(list.map(([name]) => name));
  const seen = new Set(), locals = [], central = [];
  let offset = 0, total = 0;
  for (const [path, input] of list) {
    assertSafeArtifactPath(path);
    need(!seen.has(pathKey(path)), "zip.collision", `Entry paths collide: ${path}`);
    seen.add(pathKey(path));
    need(input instanceof Uint8Array, "zip.bytes", `Expected bytes for ${path}.`);
    const bytes = Buffer.from(input), name = Buffer.from(path, "utf8"), crc = crc32(bytes);
    need(name.length < 65536 && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(name) === path,
      "zip.name", "Invalid UTF-8 entry name.");
    total += bytes.length;
    need(bytes.length <= limits.maxEntryBytes && total <= limits.maxTotalBytes, "zip.limit", "Uncompressed size limit exceeded.");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    // STORED entries, fixed DOS 1980-01-01 timestamp: independent of OS/timezone/zlib version.
    header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    locals.push(header, name, bytes);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8); record.writeUInt16LE(0x21, 14); record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42); central.push(record, name);
    offset += header.length + name.length + bytes.length;
    need(offset <= limits.maxArchiveBytes, "zip.limit", "Archive size limit exceeded.");
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  need(offset + directory.length + 22 <= limits.maxArchiveBytes, "zip.limit", "Archive size limit exceeded.");
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export function readZip(input, overrides) {
  const limits = zipLimits(overrides);
  need(input instanceof Uint8Array, "zip.bytes", "Expected archive bytes.");
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  need(bytes.length >= 22 && bytes.length <= limits.maxArchiveBytes, "zip.limit", "Invalid archive size.");
  const span = (start, count) => need(Number.isSafeInteger(start) && start >= 0 && start + count <= bytes.length,
    "zip.truncated", "ZIP record extends past the archive.");
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (bytes.readUInt32LE(p) === 0x06054b50 && p + 22 + bytes.readUInt16LE(p + 20) === bytes.length) { end = p; break; }
  }
  need(end >= 0, "zip.end", "Missing ZIP end record.");
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  need(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0
    && bytes.readUInt16LE(end + 8) === count, "zip.disks", "Multi-disk ZIP is unsupported.");
  need(count > 0 && count < 65535 && count <= limits.maxEntries && size !== 0xffffffff && start !== 0xffffffff,
    "zip.entries", "ZIP64 or excessive entry count is unsupported.");
  need(start + size === end, "zip.directory", "Invalid central directory bounds.");
  let cursor = start, total = 0;
  const records = [], seen = new Set();
  for (let i = 0; i < count; i++) {
    span(cursor, 46);
    need(bytes.readUInt32LE(cursor) === 0x02014b50, "zip.directory", "Invalid central record.");
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), length = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42), attributes = bytes.readUInt32LE(cursor + 38);
    need((flags & ~0x808) === 0 && (method === 0 || method === 8), "zip.method", "Encrypted or unsupported ZIP entry.");
    need(bytes.readUInt16LE(cursor + 34) === 0 && compressed !== 0xffffffff && length !== 0xffffffff && local !== 0xffffffff,
      "zip.entry", "Multi-disk/ZIP64 entry is unsupported.");
    span(cursor + 46, nameLength + extra + comment);
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    need((flags & 0x800) !== 0 || rawName.every(byte => byte < 128), "zip.name", "Non-ASCII names require UTF-8 flag.");
    const name = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(rawName);
    assertSafeArtifactPath(name);
    const unixType = (attributes >>> 16) & 0xf000;
    need((unixType === 0 || unixType === 0x8000) && (attributes & 0x10) === 0,
      "zip.link", "Only regular file entries are allowed.");
    need(!seen.has(pathKey(name)), "zip.collision", `Entry paths collide: ${name}`); seen.add(pathKey(name));
    total += length;
    need(length <= limits.maxEntryBytes && total <= limits.maxTotalBytes, "zip.limit", "Decompression size limit exceeded.");
    span(local, 30);
    need(local < start && bytes.readUInt32LE(local) === 0x04034b50
      && bytes.readUInt16LE(local + 6) === flags && bytes.readUInt16LE(local + 8) === method,
      "zip.local", "Central/local entry disagreement.");
    const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    span(local + 30, localName + localExtra);
    need(rawName.equals(bytes.subarray(local + 30, local + 30 + localName)), "zip.local", "Central/local name disagreement.");
    const dataStart = local + 30 + localName + localExtra, dataEnd = dataStart + compressed;
    need(dataEnd <= start, "zip.local", "Entry overlaps central directory.");
    let entryEnd = dataEnd;
    if (flags & 8) {
      need([[14, crc], [18, compressed], [22, length]].every(([field, expected]) =>
        bytes.readUInt32LE(local + field) === 0 || bytes.readUInt32LE(local + field) === expected),
        "zip.local", "Invalid local data-descriptor placeholder.");
      span(dataEnd, 4);
      const descriptor = dataEnd + (bytes.readUInt32LE(dataEnd) === 0x08074b50 ? 4 : 0);
      span(descriptor, 12); entryEnd = descriptor + 12;
      need(entryEnd <= start && bytes.readUInt32LE(descriptor) === crc
        && bytes.readUInt32LE(descriptor + 4) === compressed && bytes.readUInt32LE(descriptor + 8) === length,
        "zip.descriptor", "Invalid data descriptor.");
    } else {
      need(bytes.readUInt32LE(local + 14) === crc && bytes.readUInt32LE(local + 18) === compressed
        && bytes.readUInt32LE(local + 22) === length, "zip.local", "Central/local size or CRC disagreement.");
    }
    records.push({ name, local, entryEnd, dataStart, dataEnd, method, length, crc });
    cursor += 46 + nameLength + extra + comment;
  }
  need(cursor === end, "zip.directory", "Unindexed central data.");
  checkFilePrefixes(records.map(record => record.name));
  let next = 0;
  for (const record of [...records].sort((a, b) => a.local - b.local)) {
    need(record.local === next, "zip.overlap", "Overlapping, prefixed or unindexed local data."); next = record.entryEnd;
  }
  need(next === start, "zip.overlap", "Unindexed local data before directory.");
  const result = new Map();
  for (const { name, dataStart, dataEnd, method, length, crc } of records) {
    const compressed = bytes.subarray(dataStart, dataEnd);
    const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: Math.max(1, length) });
    need(data.length === length && crc32(data) === crc, "zip.integrity", `Length or CRC mismatch: ${name}`);
    result.set(name, data);
  }
  return result;
}
