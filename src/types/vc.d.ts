declare module '@digitalbazaar/vc' {
  export function issue(options: {
    credential: object;
    suite: any;
    documentLoader: (url: string) => Promise<any>;
  }): Promise<object>;

  export function verifyCredential(options: {
    credential: object;
    suite: any;
    documentLoader: (url: string) => Promise<any>;
  }): Promise<{ verified: boolean; error?: any }>;
}

declare module '@digitalbazaar/ed25519-multikey' {
  interface MultikeyPair {
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase: string;
    secretKeyMultibase?: string;
    signer(): any;
    verifier(): any;
    export(options: { publicKey?: boolean; secretKey?: boolean }): Promise<{
      id?: string;
      type: string;
      publicKeyMultibase?: string;
      secretKeyMultibase?: string;
    }>;
  }

  export function generate(): Promise<MultikeyPair>;
  export function from(options: {
    id?: string;
    type?: string;
    controller?: string;
    publicKeyMultibase: string;
    secretKeyMultibase?: string;
  }): Promise<MultikeyPair>;
}

declare module '@digitalbazaar/eddsa-rdfc-2022-cryptosuite' {
  export const cryptosuite: any;
}

declare module '@digitalbazaar/data-integrity' {
  export class DataIntegrityProof {
    constructor(options: { cryptosuite: any; signer?: any; verifier?: any });
  }
}
