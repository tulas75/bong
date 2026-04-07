/**
 * @module services/baking
 * Badge image baking. Embeds a signed Verifiable Credential into
 * a PNG image (via iTXt chunk per IMS Global §5.3.1.1) or an SVG image
 * (via `openbadges:credential` element per IMS Global §5.3.2.1).
 */

import extract from 'png-chunks-extract';
import encode from 'png-chunks-encode';
import { logger } from '../lib/logger.js';
import { safeFetch } from '../lib/safeFetch.js';

/** PNG magic bytes used for format detection. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Build a PNG iTXt chunk with keyword `openbadgecredential` per IMS Global §5.3.1.1.
 * @param credentialJson - JSON string of the signed credential.
 * @returns An iTXt chunk object suitable for `png-chunks-encode`.
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
 * Bake a signed credential into a PNG image by injecting an `openbadgecredential`
 * iTXt chunk before the IEND chunk.
 *
 * @param imageBuffer - Original PNG image buffer.
 * @param credentialJson - JSON string of the signed credential.
 * @returns Baked PNG buffer.
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
 * Bake a signed credential into an SVG image by adding the `openbadges`
 * namespace and a `<![CDATA[...]]>` credential element before `</svg>`.
 *
 * @param svgString - Original SVG source.
 * @param credentialJson - JSON string of the signed credential.
 * @returns Modified SVG string with embedded credential.
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
 * Fetch a badge image from the given URL (SSRF-safe) and bake the credential
 * into it. Supports PNG and SVG formats.
 *
 * @param imageUrl - HTTPS URL of the original badge image.
 * @param credentialJson - JSON string of the signed credential.
 * @returns Object with the baked `buffer` and file `extension`, or `null` on failure.
 */
export async function bakeCredentialImage(
  imageUrl: string,
  credentialJson: string,
): Promise<{ buffer: Buffer; extension: string } | null> {
  try {
    const response = await safeFetch(imageUrl);
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
