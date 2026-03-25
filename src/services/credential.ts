import * as vc from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { documentLoader } from '../lib/documentLoader.js';
import { hashEmail } from '../lib/crypto.js';

const APP_DOMAIN = process.env.APP_DOMAIN || 'localhost:3000';

interface IssueCredentialParams {
  assertionId: string;
  tenant: {
    id: string;
    name: string;
    url: string;
    publicKeyMultibase: string;
    privateKeyMultibase: string;
  };
  badgeClass: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    criteria: string;
  };
  recipientEmail: string;
  recipientName: string;
  issuedOn: Date;
}

export async function issueCredential(params: IssueCredentialParams): Promise<object> {
  const { assertionId, tenant, badgeClass, recipientEmail, recipientName, issuedOn } = params;

  const verificationUrl = `https://${APP_DOMAIN}/verify/${assertionId}`;
  const keyUrl = `https://${APP_DOMAIN}/keys/${tenant.id}#key-0`;

  // Build the unsigned credential
  const credential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://purl.imsglobal.org/spec/ob/v3p0/context.json',
    ],
    id: verificationUrl,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: tenant.url,
      type: 'Profile',
      name: tenant.name,
    },
    issuanceDate: issuedOn.toISOString(),
    credentialSubject: {
      type: 'AchievementSubject',
      identifier: {
        type: 'IdentityObject',
        identityHash: hashEmail(recipientEmail),
        identityType: 'emailAddress',
        hashed: true,
      },
      achievement: {
        id: `urn:uuid:${badgeClass.id}`,
        type: 'Achievement',
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

  // Load the key pair
  const keyPair = await Ed25519VerificationKey2020.from({
    id: keyUrl,
    type: 'Ed25519VerificationKey2020',
    controller: tenant.url,
    publicKeyMultibase: tenant.publicKeyMultibase,
    privateKeyMultibase: tenant.privateKeyMultibase,
  });

  // Create the signing suite
  const suite = new Ed25519Signature2020({ key: keyPair });

  // Issue (sign) the credential
  const signedCredential = await vc.issue({
    credential,
    suite,
    documentLoader,
  });

  return signedCredential;
}
