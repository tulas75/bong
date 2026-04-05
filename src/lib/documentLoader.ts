import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import credentialsV1 from '../contexts/credentials-v1.json';
import credentialsV2 from '../contexts/credentials-v2.json';
import ob3Context from '../contexts/ob3-context.json';
import ob3Context303 from '../contexts/ob3-context-3.0.3.json';
import ed25519Context from '../contexts/ed25519-2020-v1.json';
import statusListContext from '../contexts/status-list-2021-v1.json';
import multikeyContext from '../contexts/multikey-v1.json';

const CACHED_CONTEXTS: Record<string, object> = {
  'https://www.w3.org/2018/credentials/v1': credentialsV1,
  'https://www.w3.org/ns/credentials/v2': credentialsV2,
  'https://purl.imsglobal.org/spec/ob/v3p0/context.json': ob3Context,
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json': ob3Context303,
  'https://w3id.org/security/suites/ed25519-2020/v1': ed25519Context,
  'https://www.w3.org/ns/credentials/status/v1': statusListContext,
  'https://w3id.org/security/multikey/v1': multikeyContext,
};

/**
 * Resolve a did:key: URI to a verification method document.
 * Supports Ed25519 Multikey (z6Mk prefix).
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
