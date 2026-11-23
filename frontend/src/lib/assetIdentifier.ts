import { StrKey } from '@stellar/stellar-sdk';

export interface AssetIdentifier {
  code: string;
  issuer: string;
}

const QUALIFIED_ASSET = /^([A-Za-z0-9]{1,12})\.(G[A-Z2-7]{55})$/;

/**
 * Serialize an issued Stellar asset as a URL path segment or query value.
 * Invalid assets return null so callers can fall back to the asset list.
 */
export function encodeAssetIdentifier(asset: AssetIdentifier): string | null {
  const value = `${asset.code}.${asset.issuer}`;
  return decodeAssetIdentifier(value) ? value : null;
}

/**
 * Read an identifier from a route parameter. Missing or malformed identifiers
 * return null. The code keeps its original case and always includes its issuer.
 */
export function decodeAssetIdentifier(value: string | null | undefined): AssetIdentifier | null {
  if (!value || value.length > 69) return null;

  const match = QUALIFIED_ASSET.exec(value);
  if (!match || match[0] !== value) return null;
  const [, code, issuer] = match;
  if (!StrKey.isValidEd25519PublicKey(issuer)) return null;

  return { code, issuer };
}
