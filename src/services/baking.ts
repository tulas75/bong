import extract from 'png-chunks-extract';
import encode from 'png-chunks-encode';
import { logger } from '../lib/logger.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Build a PNG iTXt chunk per IMS Global Sec 5.3.1.1.
 * keyword: "openbadgecredential", compression: 0 (uncompressed)
 */
function createItxtChunk(credentialJson: string): { name: string; data: Uint8Array } {
  const keyword = Buffer.from('openbadgecredential\0', 'utf-8'); // keyword + null separator
  const compressionFlag = Buffer.from([0]); // no compression
  const compressionMethod = Buffer.from([0]);
  const languageTag = Buffer.from('\0', 'utf-8'); // empty language tag + null
  const translatedKeyword = Buffer.from('\0', 'utf-8'); // empty translated keyword + null
  const text = Buffer.from(credentialJson, 'utf-8');

  const data = Buffer.concat([
    keyword,
    compressionFlag,
    compressionMethod,
    languageTag,
    translatedKeyword,
    text,
  ]);

  return { name: 'iTXt', data: new Uint8Array(data) };
}

/**
 * Bake a signed credential into a PNG image via iTXt chunk.
 */
export function bakePng(imageBuffer: Buffer, credentialJson: string): Buffer {
  const chunks = extract(new Uint8Array(imageBuffer));
  const itxtChunk = createItxtChunk(credentialJson);

  // Insert iTXt before IEND (last chunk)
  const iendIndex = chunks.findIndex((c) => c.name === 'IEND');
  chunks.splice(iendIndex, 0, itxtChunk);

  return Buffer.from(encode(chunks));
}

/**
 * Bake a signed credential into an SVG image per IMS Global Sec 5.3.2.1.
 */
export function bakeSvg(svgString: string, credentialJson: string): string {
  // Add namespace to root <svg> if not already present
  let result = svgString;
  if (!result.includes('xmlns:openbadges')) {
    result = result.replace(
      /<svg(\s)/,
      '<svg xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0"$1',
    );
  }

  // Inject credential element before closing </svg>
  const credentialElement = `<openbadges:credential><![CDATA[${credentialJson}]]></openbadges:credential>`;
  result = result.replace('</svg>', `${credentialElement}\n</svg>`);

  return result;
}

/**
 * Fetch badge image and bake the credential into it.
 * Returns the baked buffer and file extension, or null if baking fails.
 */
export async function bakeCredentialImage(
  imageUrl: string,
  credentialJson: string,
): Promise<{ buffer: Buffer; extension: string } | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      logger.warn({ imageUrl, status: response.status }, 'baking_image_fetch_failed');
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Detect format
    if (imageBuffer.subarray(0, 4).equals(PNG_MAGIC)) {
      const baked = bakePng(imageBuffer, credentialJson);
      return { buffer: baked, extension: 'png' };
    }

    const asString = imageBuffer.toString('utf-8');
    if (asString.includes('<svg')) {
      const baked = bakeSvg(asString, credentialJson);
      return { buffer: Buffer.from(baked, 'utf-8'), extension: 'svg' };
    }

    logger.warn({ imageUrl }, 'baking_unsupported_format');
    return null;
  } catch (err) {
    logger.warn({ imageUrl, err }, 'baking_failed');
    return null;
  }
}
