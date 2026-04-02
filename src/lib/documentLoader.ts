import * as vc from '@digitalcredentials/vc';
import credentialsV1 from '../contexts/credentials-v1.json';
import credentialsV2 from '../contexts/credentials-v2.json';
import ob3Context from '../contexts/ob3-context.json';
import ed25519Context from '../contexts/ed25519-2020-v1.json';
import statusList2021Context from '../contexts/status-list-2021-v1.json';

const CACHED_CONTEXTS: Record<string, object> = {
  'https://www.w3.org/2018/credentials/v1': credentialsV1,
  'https://www.w3.org/ns/credentials/v2': credentialsV2,
  'https://purl.imsglobal.org/spec/ob/v3p0/context.json': ob3Context,
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json': ob3Context,
  'https://w3id.org/security/suites/ed25519-2020/v1': ed25519Context,
  'https://www.w3.org/ns/credentials/status/v1': statusList2021Context,
};

export async function documentLoader(url: string) {
  if (CACHED_CONTEXTS[url]) {
    return {
      contextUrl: null,
      documentUrl: url,
      document: CACHED_CONTEXTS[url],
    };
  }

  // Fall back to default loader for anything else (e.g., DID documents, key documents)
  return vc.defaultDocumentLoader(url);
}
