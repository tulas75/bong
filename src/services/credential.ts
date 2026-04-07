/**
 * @module services/credential
 * Verifiable Credential signing. Builds an OpenBadgeCredential
 * payload compliant with OBv3 (IMS Global) and signs it using either
 * `eddsa-rdfc-2022` (Ed25519) or `ecdsa-sd-2023` (P-256 selective disclosure).
 */

import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import { createSignCryptosuite as createEcdsaSd2023SignSuite } from '@digitalbazaar/ecdsa-sd-2023-cryptosuite';
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import * as vc from '@digitalbazaar/vc';
import { documentLoader } from '../lib/documentLoader.js';
import { hashEmail } from '../lib/crypto.js';

/** Supported Data-Integrity cryptosuite identifiers. */
export type Cryptosuite = 'eddsa-rdfc-2022' | 'ecdsa-sd-2023';

const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';

/** Parameters for the {@link issueCredential} function. */
export interface IssueCredentialParams {
  assertionId: string;
  cryptosuite?: Cryptosuite;
  tenant: {
    id: string;
    name: string;
    url: string;
    imageUrl?: string | null;
    publicKeyMultibase: string;
    privateKeyMultibase: string;
    p256PublicKeyMultibase?: string | null;
    p256PrivateKeyMultibase?: string | null;
  };
  badgeClass: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    criteria: string;
    achievementType?: string;
  };
  recipientEmail: string;
  recipientName: string;
  issuedOn: Date;
  expiresAt?: Date;
  statusListIndex?: number;
  recipientSalt?: string;
}

/** Result of {@link issueCredential}: the signed credential and the salt used for identity hashing. */
export interface IssueCredentialResult {
  credential: object;
  salt: string;
}

/**
 * Build and sign an OpenBadgeCredential (OBv3 / W3C VC v2).
 *
 * @param params - See {@link IssueCredentialParams}.
 * @returns The signed credential object and the salt used for the recipient identity hash.
 * @throws If `ecdsa-sd-2023` is requested but the tenant has no P-256 keys.
 */
export async function issueCredential(
  params: IssueCredentialParams,
): Promise<IssueCredentialResult> {
  const {
    assertionId,
    cryptosuite: requestedSuite = 'eddsa-rdfc-2022',
    tenant,
    badgeClass,
    recipientEmail,
    recipientName,
    issuedOn,
    expiresAt,
    statusListIndex,
    recipientSalt,
  } = params;

  // Select key material based on cryptosuite
  const useEcdsa = requestedSuite === 'ecdsa-sd-2023';
  const pubKey = useEcdsa ? tenant.p256PublicKeyMultibase : tenant.publicKeyMultibase;
  const privKey = useEcdsa ? tenant.p256PrivateKeyMultibase : tenant.privateKeyMultibase;

  if (useEcdsa && (!pubKey || !privKey)) {
    throw new Error('Tenant has no P-256 keys. Regenerate keys or use eddsa-rdfc-2022.');
  }

  const verificationUrl = `https://${APP_DOMAIN}/api/v1/assertions/${assertionId}`;
  const didKey = `did:key:${pubKey}`;
  const keyId = `${didKey}#${pubKey}`;

  const { identityHash, salt } = hashEmail(recipientEmail, recipientSalt);

  const credential = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      {
        '1EdTechJsonSchemaValidator2019':
          'https://purl.imsglobal.org/spec/vc/ob/vocab.html#1EdTechJsonSchemaValidator2019',
      },
    ],
    id: verificationUrl,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    credentialSchema: [
      {
        id: 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json',
        type: '1EdTechJsonSchemaValidator2019',
      },
    ],
    issuer: {
      id: didKey,
      type: 'Profile',
      name: tenant.name,
      url: tenant.url,
      ...(tenant.imageUrl ? { image: { id: tenant.imageUrl, type: 'Image' } } : {}),
    },
    validFrom: issuedOn.toISOString(),
    ...(expiresAt ? { validUntil: expiresAt.toISOString() } : {}),
    ...(statusListIndex !== undefined
      ? {
          credentialStatus: {
            id: `https://${APP_DOMAIN}/status/list/${tenant.id}#${statusListIndex}`,
            type: 'BitstringStatusListEntry',
            statusPurpose: 'revocation',
            statusListIndex: String(statusListIndex),
            statusListCredential: `https://${APP_DOMAIN}/status/list/${tenant.id}`,
          },
        }
      : {}),
    credentialSubject: {
      type: 'AchievementSubject',
      identifier: [
        {
          type: 'IdentityObject',
          identityHash,
          identityType: 'emailAddress',
          hashed: true,
          salt,
        },
      ],
      achievement: {
        id: `https://${APP_DOMAIN}/achievements/${badgeClass.id}`,
        type: 'Achievement',
        achievementType: badgeClass.achievementType || 'Badge',
        name: badgeClass.name,
        description: badgeClass.description,
        image: {
          id: badgeClass.imageUrl,
          type: 'Image',
        },
        criteria: {
          narrative: badgeClass.criteria,
        },
      },
    },
    name: badgeClass.name,
  };

  let suite: DataIntegrityProof;

  if (useEcdsa) {
    const keyPair = await EcdsaMultikey.from({
      id: keyId,
      type: 'Multikey',
      controller: didKey,
      publicKeyMultibase: pubKey!,
      secretKeyMultibase: privKey!,
    });
    suite = new DataIntegrityProof({
      cryptosuite: createEcdsaSd2023SignSuite({
        // No mandatory pointers — all fields disclosed by default
        mandatoryPointers: [
          '/issuer',
          '/validFrom',
          '/credentialSubject/achievement',
          '/credentialSubject/type',
        ],
      }),
      signer: keyPair.signer(),
    });
  } else {
    const keyPair = await Ed25519Multikey.from({
      id: keyId,
      type: 'Multikey',
      controller: didKey,
      publicKeyMultibase: pubKey!,
      secretKeyMultibase: privKey!,
    });
    suite = new DataIntegrityProof({
      cryptosuite: eddsaRdfc2022CryptoSuite,
      signer: keyPair.signer(),
    });
  }

  const signedCredential = await vc.issue({
    credential,
    suite,
    documentLoader,
  });

  return { credential: signedCredential, salt };
}
