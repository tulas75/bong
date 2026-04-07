/**
 * @module documentLoader
 * JSON-LD document loader for Verifiable Credential operations.
 * Resolves well-known context URIs from a local cache (avoiding network hits),
 * resolves `did:key:` URIs by deriving the key document inline, and falls back
 * to network fetch for any other URI.
 */

import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import credentialsV1 from '../contexts/credentials-v1.json';
import credentialsV2 from '../contexts/credentials-v2.json';
import ob3Context from '../contexts/ob3-context.json';
import ob3Context303 from '../contexts/ob3-context-3.0.3.json';
import ed25519Context from '../contexts/ed25519-2020-v1.json';
import statusListContext from '../contexts/status-list-2021-v1.json';
import multikeyContext from '../contexts/multikey-v1.json';
import didV1Context from '../contexts/did-v1.json';

/** Pre-loaded JSON-LD contexts keyed by their URI. */
const CACHED_CONTEXTS: Record<string, object> = {
  'https://www.w3.org/2018/credentials/v1': credentialsV1,
  'https://www.w3.org/ns/credentials/v2': credentialsV2,
  'https://purl.imsglobal.org/spec/ob/v3p0/context.json': ob3Context,
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json': ob3Context303,
  'https://w3id.org/security/suites/ed25519-2020/v1': ed25519Context,
  'https://www.w3.org/ns/credentials/status/v1': statusListContext,
  'https://w3id.org/security/multikey/v1': multikeyContext,
  'https://www.w3.org/ns/did/v1': didV1Context,
};

/**
 * Resolve a `did:key:` URI to a verification-method or DID document.
 * Supports Ed25519 Multikey (`z6Mk` prefix) and P-256 Multikey (`zDn` prefix).
 *
 * @param url - A `did:key:` URI, optionally with a `#fragment`.
 * @returns A document-loader result with the resolved document.
 */
async function resolveDidKey(url: string) {
  // did:key:z6Mk... or did:key:z6Mk...#z6Mk...
  const [did, fragment] = url.split('#');
  const publicKeyMultibase = did.replace('did:key:', '');

  // P-256 keys start with 'zDn', Ed25519 keys start with 'z6Mk'
  const isP256 = publicKeyMultibase.startsWith('zDn');
  const MultikeyModule = isP256 ? EcdsaMultikey : Ed25519Multikey;

  const keyPair = await MultikeyModule.from({
    type: 'Multikey',
    controller: did,
    publicKeyMultibase,
  });
  const exported = await keyPair.export({ publicKey: true });

  const keyId = `${did}#${publicKeyMultibase}`;
  const keyDocument = {
    '@context': 'https://w3id.org/security/multikey/v1',
    id: keyId,
    type: 'Multikey',
    controller: did,
    publicKeyMultibase: exported.publicKeyMultibase,
  };

  // If the URL is the DID itself (no fragment), return a DID document
  if (!fragment) {
    const didDocument = {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
      id: did,
      verificationMethod: [keyDocument],
      authentication: [keyId],
      assertionMethod: [keyId],
      capabilityDelegation: [keyId],
      capabilityInvocation: [keyId],
    };
    return { contextUrl: null, documentUrl: url, document: didDocument };
  }

  // Fragment URL — return the key document directly
  return { contextUrl: null, documentUrl: url, document: keyDocument };
}

/**
 * JSON-LD document loader used by `@digitalbazaar/vc`.
 * Tries the local context cache first, then `did:key:` resolution,
 * then falls back to a network fetch.
 *
 * @param url - The URI to resolve.
 * @returns A `{ contextUrl, documentUrl, document }` tuple.
 */
export async function documentLoader(url: string) {
  if (CACHED_CONTEXTS[url]) {
    return {
      contextUrl: null,
      documentUrl: url,
      document: CACHED_CONTEXTS[url],
    };
  }

  // Resolve did:key: URIs locally
  if (url.startsWith('did:key:')) {
    return resolveDidKey(url);
  }

  // Fall back to network fetch for anything else (e.g., DID documents, data-integrity context)
  const response = await fetch(url);
  const document = await response.json();
  return { contextUrl: null, documentUrl: url, document };
}
