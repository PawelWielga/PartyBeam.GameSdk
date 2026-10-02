export const PACKAGE_SCHEMA_VERSION: 1;
export const SIGNATURE_ALGORITHM: "ecdsa-p256-sha256-p1363";
export interface DescriptorComponent {
  kind: "tv" | "androidController" | "browserController";
  artifactPath: string;
  sha256: string;
}
export interface UnsignedIntegrityEnvelope {
  schemaVersion: 1;
  manifestSha256: string;
  packageSha256: string;
}
export function sha256(bytes: string | Uint8Array): string;
export function hashEquals(expected: unknown, actual: unknown): boolean;
export function assertSafeArtifactPath(value: unknown): string;
export function buildPackageDescriptor(manifestSha256: string, components: readonly DescriptorComponent[]): Uint8Array;
export function computePackageSha256(manifestSha256: string, components: readonly DescriptorComponent[]): string;
export function createUnsignedIntegrityEnvelope(manifestBytes: string | Uint8Array, components: readonly DescriptorComponent[]): UnsignedIntegrityEnvelope;
