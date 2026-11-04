import { thumbnailTiers } from '../platform/pictureThumbnails';
export type ThumbnailTier = typeof thumbnailTiers[number];
/** Gallery envelope across both orientations; not a whole-screen thumbnail. */
export function galleryThumbnailTier(width = window.innerWidth, height = window.innerHeight, dpr = window.devicePixelRatio || 1): ThumbnailTier {
  const required = Math.min(480, .3 * Math.max(width, height)) * Math.max(1, dpr);
  return thumbnailTiers.find(tier => tier >= required) ?? 1024;
}
