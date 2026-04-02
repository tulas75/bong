import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import * as vc from '@digitalbazaar/vc';
import { documentLoader } from '../lib/documentLoader.js';
import { hashEmail } from '../lib/crypto.js';

const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';

interface IssueCredentialParams {
  assertionId: string;
  tenant: {
    id: string;
    name: string;
    url: string;
    imageUrl?: string | null;
    publicKeyMultibase: string;
    privateKeyMultibase: string;
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

export interface IssueCredentialResult {
  credential: object;
  salt: string;
}

export async function issueCredential(
  params: IssueCredentialParams,
): Promise<IssueCredentialResult> {
  const {
    assertionId,
    tenant,
    badgeClass,
    recipientEmail,
    recipientName,
    issuedOn,
    expiresAt,
    statusListIndex,
    recipientSalt,
  } = params;

  const verificationUrl = `https://${APP_DOMAIN}/verify/${assertionId}`;
  const didKey = `did:key:${tenant.publicKeyMultibase}`;
  const keyId = `${didKey}#${tenant.publicKeyMultibase}`;

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
        id: `https://${APP_DOMAIN}/badges/${badgeClass.id}`,
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

  const keyPair = await Ed25519Multikey.from({
    id: keyId,
    type: 'Multikey',
    controller: didKey,
    publicKeyMultibase: tenant.publicKeyMultibase,
    secretKeyMultibase: tenant.privateKeyMultibase,
  });

  const suite = new DataIntegrityProof({
    cryptosuite: eddsaRdfc2022CryptoSuite,
    signer: keyPair.signer(),
  });

  const signedCredential = await vc.issue({
    credential,
    suite,
    documentLoader,
  });

  return { credential: signedCredential, salt };
}
