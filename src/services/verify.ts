import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import { createVerifyCryptosuite as createEcdsaSd2023VerifySuite } from '@digitalbazaar/ecdsa-sd-2023-cryptosuite';
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import * as vc from '@digitalbazaar/vc';
import { documentLoader } from '../lib/documentLoader.js';
import { logger } from '../lib/logger.js';

/**
 * Cryptographically verify a signed credential using its embedded proof.
 * Supports both eddsa-rdfc-2022 and ecdsa-sd-2023 cryptosuites.
 * Returns { verified: true } on success, or { verified: false, error } on failure.
 */
export async function verifyCredentialProof(
  credential: object,
): Promise<{ verified: boolean; error?: string }> {
  try {
    // Detect cryptosuite from the proof
    const proof = (credential as any).proof;
    const cryptosuiteName = proof?.cryptosuite;

    let suite: DataIntegrityProof;
    if (cryptosuiteName === 'ecdsa-sd-2023') {
      suite = new DataIntegrityProof({
        cryptosuite: createEcdsaSd2023VerifySuite(),
      });
    } else {
      suite = new DataIntegrityProof({
        cryptosuite: eddsaRdfc2022CryptoSuite,
      });
    }

    const result = await vc.verifyCredential({
      credential,
      suite,
      documentLoader,
      // Status (revocation/expiration) is checked separately via the database.
      // This function only verifies the cryptographic proof.
      checkStatus: async () => ({ verified: true }),
    });

    if (result.verified) {
      return { verified: true };
    }

    const errorMsg =
      result.error?.message || result.error?.errors?.[0]?.message || 'Proof verification failed';
    logger.warn({ error: errorMsg }, 'credential_proof_verification_failed');
    return { verified: false, error: errorMsg };
  } catch (err: any) {
    logger.warn({ err: err.message }, 'credential_proof_verification_error');
    return { verified: false, error: err.message };
  }
}
