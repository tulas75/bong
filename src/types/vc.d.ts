declare module "@digitalcredentials/vc" {
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

  export function defaultDocumentLoader(
    url: string
  ): Promise<{ contextUrl: string | null; documentUrl: string; document: any }>;

  export class CredentialIssuancePurpose {
    constructor(options?: any);
  }
}

declare module "@digitalcredentials/ed25519-signature-2020" {
  export class Ed25519Signature2020 {
    constructor(options?: { key?: any; signer?: any; verifier?: any });
  }
  export const suiteContext: {
    contexts: Map<string, object>;
    CONTEXT_URL: string;
    CONTEXT: object;
  };
}

declare module "@digitalcredentials/ed25519-verification-key-2020" {
  export class Ed25519VerificationKey2020 {
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase: string;
    privateKeyMultibase?: string;

    static generate(): Promise<Ed25519VerificationKey2020>;
    static from(options: {
      id?: string;
      type?: string;
      controller?: string;
      publicKeyMultibase: string;
      privateKeyMultibase?: string;
    }): Promise<Ed25519VerificationKey2020>;

    export(options: {
      publicKey?: boolean;
      privateKey?: boolean;
    }): {
      id: string;
      type: string;
      publicKeyMultibase: string;
      privateKeyMultibase?: string;
    };
  }
}
