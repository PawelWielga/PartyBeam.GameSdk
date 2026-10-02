export interface PackageComponent {
  id: string;
  kind: "tv" | "androidController" | "browserController";
  releaseVersion: string;
  artifactPath: string;
  entryPoint: string;
  runtimeLocales: readonly string[];
  sha256?: string;
}
export interface PackageManifest {
  schemaVersion: 1;
  gameId: string;
  version: string;
  publisher: { id: string; displayName: string };
  gameContract: { minimumVersion: string; maximumVersionExclusive: string };
  players: { minimum: number; maximum: number };
  controllerTopology: "onePhonePerPlayer" | "sharedPhone";
  components: readonly PackageComponent[];
  catalogLocales: readonly string[];
  catalog: { canonicalTitle: string; localized: Readonly<Record<string, { shortDescription: string; title?: string | null; longDescription?: string | null; instructions?: string | null }>>;
    supportUrl?: string | null; artwork?: readonly { id: string; kind: string; artifactPath: string; sha256?: string }[] };
  capabilities: { required: readonly string[]; optional: readonly string[] };
  network: { outboundAllowlist: readonly string[] };
  supportsStandbyResume: boolean;
}
export interface PackageLimits { maxArchiveBytes?: number; maxEntries?: number; maxEntryBytes?: number; maxTotalBytes?: number }
export interface CheckOptions { allowUnsigned?: boolean; publicKeys?: Readonly<Record<string, string>>; limits?: PackageLimits }
export interface PackageCheckResult {
  manifest: PackageManifest & { components: readonly (PackageComponent & { sha256: string })[] };
  envelope: { schemaVersion: 1; manifestSha256: string; packageSha256: string; signature?: { algorithm: "ecdsa-p256-sha256-p1363"; keyId: string; valueBase64: string } };
  profile: "signed" | "unsigned";
  signatureVerified: boolean;
  warnings: string[];
  outerSha256: string;
}
export class PackageError extends Error { readonly code: string; constructor(code: string, message: string) }
export function validateManifest(manifest: unknown): string[];
export function checkPackage(bytes: Uint8Array, options?: CheckOptions): PackageCheckResult;
export function buildPackage(input: { manifest: PackageManifest;
  components: Readonly<Record<string, Readonly<Record<string, Uint8Array>>>>;
  artwork?: Readonly<Record<string, Uint8Array>>;
  signing?: { keyId: string; privateKeyPem: string }; limits?: PackageLimits }): PackageCheckResult & { bytes: Uint8Array };
