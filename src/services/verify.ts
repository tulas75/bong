/**
 * @module services/verify
 * Cryptographic proof verification for Verifiable Credentials.
 * Supports both `eddsa-rdfc-2022` (Ed25519) and `ecdsa-sd-2023` (P-256)
 * Data Integrity cryptosuites. Revocation / expiration status is checked
 * separately via the database — this module only validates the proof.
 */

import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import { createVerifyCryptosuite as createEcdsaSd2023VerifySuite } from '@digitalbazaar/ecdsa-sd-2023-cryptosuite';
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import * as vc from '@digitalbazaar/vc';
import { documentLoader } from '../lib/documentLoader.js';
import { logger } from '../lib/logger.js';

/**
 * Verify the cryptographic proof embedded in a Verifiable Credential.
 *
 * @param credential - The signed credential object (must include a `proof` property).
 * @returns `{ verified: true }` on success, or `{ verified: false, error }` on failure.
 */
export async function verifyCredentialProof(
  credential: object,
): Promise<{ verified: boolean; error?: string }> {
  try {
    // Guard: credential must have a proof to verify
    const proof = (credential as any).proof;
    if (!proof || !proof.type) {
      return { verified: false, error: 'No cryptographic proof present' };
    }

    // Only DataIntegrityProof is supported (eddsa-rdfc-2022, ecdsa-sd-2023).
    // Legacy proof types (e.g. Ed25519Signature2020) cannot be re-verified.
    if (proof.type !== 'DataIntegrityProof') {
      return { verified: false, error: `Unsupported legacy proof type: ${proof.type}` };
    }

    const cryptosuiteName = proof.cryptosuite;

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

    const errors = result.error?.errors || [];
    const details = errors.map((e: any) => e.message || e.cause?.message || String(e)).join('; ');
    const errorMsg = details || result.error?.message || 'Proof verification failed';
    logger.warn({ error: errorMsg, details: errors }, 'credential_proof_verification_failed');
    return { verified: false, error: errorMsg };
  } catch (err: any) {
    logger.warn({ err: err.message }, 'credential_proof_verification_error');
    return { verified: false, error: err.message };
  }
}
