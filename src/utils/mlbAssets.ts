// ===== Section =====
// mlbAssets.ts - MLB imagery URL builder (strict, no deps)
// ===== Section =====

/**
 * MLB imagery URL builder utilities.
 *
 * This module provides tiny, strongly-typed helpers to compose URLs for
 * team logos, player headshots, and player spot images using the verified
 * CDN endpoints described in the repository context.
 *
 * API surface (no runtime fetch, no cache): simply produce strings.
 *
 * Design notes (locked Behaviour):
 * - 24-32px inline logos in dense lists: teamLogoUrl(teamId, 'cap-on-light')
 * - 40-56px header logos: teamLogoUrl(teamId, 'primary-on-light')
 * - 32-40px circular headshots: playerHeadshotUrl(personId, 'sm')
 * - 96-140px portraits: playerHeadshotUrl(personId, 'lg') or 'xl'
 *
 * Do not throw on invalid IDs. If a non-finite or negative ID is supplied, a
 * well-formed URL is still produced. The CDN will handle 404/plain-text HTML
 * fallbacks as specified in the verification notes.
 */

// (a) Variant type for team logos
export type TeamLogoVariant = 'cap-on-light' | 'cap-on-dark' | 'primary-on-light' | 'primary-on-dark' | 'default';

/**
 * (b) Build a team logo URL for a given team and variant.
 *
 * - variant 'default' maps to /team-logos/{teamId}.svg
 * - other variants map to /team-logos/{variant}/{teamId}.svg
 *
 * Verified endpoints return 200 image/svg+xml when the teamId is valid.
 */
export function teamLogoUrl(teamId: number, variant: TeamLogoVariant = 'cap-on-light'): string {
  // Sanity: convert possible NaN to a string so the URL remains well-formed
  const teamIdStr = Number.isFinite(teamId) ? Math.floor(teamId).toString() : String(teamId);

  const base = 'https://www.mlbstatic.com';
  if (variant === 'default') {
    return `${base}/team-logos/${teamIdStr}.svg`;
  }

  const suffix = variant === 'cap-on-light'
    ? 'team-cap-on-light'
    : variant === 'cap-on-dark'
      ? 'team-cap-on-dark'
      : variant === 'primary-on-light'
        ? 'team-primary-on-light'
        : 'team-primary-on-dark';

  return `${base}/team-logos/${suffix}/${teamIdStr}.svg`;
}

/**
 * (c) Headshot sizes for players.
 *
 * Pixel mapping (documented):
 * - sm  -> 96
 * - md  -> 140
 * - lg  -> 213
 * - xl  -> 320
 *
 * These render targets are chosen to align with common UI sizes and retina
 * displays. The numbers here are the CSS-pixel values; the Cloudinary URL will
 * request w/h exactly these values. See usage notes for retina considerations.
 */
export type HeadshotSize = 'sm' | 'md' | 'lg' | 'xl';

const HEADSHOT_PX: Record<HeadshotSize, number> = {
  sm: 96,
  md: 140,
  lg: 213,
  xl: 320,
} as const;

/**
 * (d) Build a player headshot URL via Cloudinary.
 *
 * URL format (verified):
 * https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/
 *   c_fill,g_auto,w_{n},h_{n},f_auto,q_auto:best/v1/people/{personId}/headshot/67/current
 *
 * - personId: positive integer; if not finite, the URL still resolves to a valid string
 * - size: HeadshotSize; defaults to 'md'
 */
export function playerHeadshotUrl(personId: number, size: HeadshotSize = 'md'): string {
  const pid = Number.isFinite(personId) ? Math.floor(personId).toString() : String(personId);
  const w = HEADSHOT_PX[size];
  const h = w;
  // 67 is a constant in the CDN route as per the verified examples
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/c_fill,g_auto,w_${w},h_${h},f_auto,q_auto:best/v1/people/${pid}/headshot/67/current`;
}

/**
 * (e) Player spot image URL (alternate rendering).
 *
 * Sizes supported: 60, 120, 240, 436. This mirrors the verified CDN endpoint.
 */
export function playerSpotUrl(personId: number, size: 60 | 120 | 240 | 436): string {
  const pid = Number.isFinite(personId) ? Math.floor(personId).toString() : String(personId);
  return `https://midfield.mlbstatic.com/v1/people/${pid}/spots/${size}`;
}

/**
 * Fallback behaviour flags for consumers.
 *
 * TEAM_LOGO_ERRORS_ON_MISSING = true indicates that missing team logos may emit
 * HTTP 404 with text/html. Consumers can attach a real fallback UI (chip with
 * abbreviation) onError.
 */
/** (f) */
export const TEAM_LOGO_ERRORS_ON_MISSING = true;

/**
 * PLAYER_IMAGE_ERRORS_ON_MISSING = false because the generic silhouette is served
 * with HTTP 200 for missing players. No onError fallback to a different image is needed.
 */
/** (f) */
export const PLAYER_IMAGE_ERRORS_ON_MISSING = false;

// ===== Section: usage guidance =====
/**
 * Recommended usage (documentation-only):
 * - 24-32px inline logo in lists: teamLogoUrl(teamId, 'cap-on-light')
 * - 40-56px header logos: teamLogoUrl(teamId, 'primary-on-light')
 * - 32-40px circular headshots: playerHeadshotUrl(personId, 'sm')
 * - 96-140px portraits: playerHeadshotUrl(personId, 'lg') or 'xl'
 */
