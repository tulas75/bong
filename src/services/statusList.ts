import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import * as vc from '@digitalbazaar/vc';
import { documentLoader } from '../lib/documentLoader.js';

const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';

interface SignStatusListParams {
  tenantId: string;
  publicKeyMultibase: string;
  privateKeyMultibase: string;
  createdAt: Date;
  nextStatusIndex: number;
  revokedIndices: { statusListIndex: number }[];
}

export async function signStatusListCredential(params: SignStatusListParams): Promise<object> {
  const {
    tenantId,
    publicKeyMultibase,
    privateKeyMultibase,
    createdAt,
    nextStatusIndex,
    revokedIndices,
  } = params;

  const didKey = `did:key:${publicKeyMultibase}`;

  const MINIMUM_BITSTRING_SIZE = 131072;
  const bitstringLength = Math.max(MINIMUM_BITSTRING_SIZE, nextStatusIndex);
  const byteLength = Math.ceil(bitstringLength / 8);
  const buffer = Buffer.alloc(byteLength);
  for (const { statusListIndex } of revokedIndices) {
    const byteIndex = Math.floor(statusListIndex / 8);
    const bitIndex = 7 - (statusListIndex % 8);
    buffer[byteIndex] |= 1 << bitIndex;
  }

  const { gzipSync } = await import('zlib');
  const compressed = gzipSync(buffer);
  const encodedList = compressed.toString('base64url');

  const credential = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://www.w3.org/ns/credentials/status/v1',
    ],
    id: `https://${APP_DOMAIN}/status/list/${tenantId}`,
    type: ['VerifiableCredential', 'BitstringStatusListCredential'],
    issuer: didKey,
    validFrom: createdAt.toISOString(),
    credentialSubject: {
      id: `https://${APP_DOMAIN}/status/list/${tenantId}#list`,
      type: 'BitstringStatusList',
      statusPurpose: 'revocation',
      encodedList,
    },
  };

  const keyId = `${didKey}#${publicKeyMultibase}`;
  const keyPair = await Ed25519Multikey.from({
    id: keyId,
    type: 'Multikey',
    controller: didKey,
    publicKeyMultibase,
    secretKeyMultibase: privateKeyMultibase,
  });

  const suite = new DataIntegrityProof({
    cryptosuite: eddsaRdfc2022CryptoSuite,
    signer: keyPair.signer(),
  });

  return vc.issue({ credential, suite, documentLoader });
}
