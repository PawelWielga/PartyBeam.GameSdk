export class PackageError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.name = "PackageError"; this.code = code; }
}
export function requirePackage(condition, code, message) {
  if (!condition) throw new PackageError(code, message);
}
