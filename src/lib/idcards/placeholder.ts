/** A generic silhouette avatar, used only as a stand-in in the Studio's live
 *  preview — never printed on a real card (real records carry a real photo
 *  or nothing). Without it, the "Fill" vs "Fit" photo option had no visible
 *  effect while editing (IdCardFace shows initials, not the photo box, when
 *  there's no photo at all), which is exactly why adjusting it required
 *  someone who'd already tested it with a real photo rather than a school
 *  admin editing on their own. */
export const PLACEHOLDER_PHOTO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + '<rect width="100" height="100" fill="#cbd5e1"/>'
  + '<circle cx="50" cy="38" r="18" fill="#94a3b8"/>'
  + '<path d="M20 92c0-24 14-36 30-36s30 12 30 36" fill="#94a3b8"/>'
  + '</svg>',
)}`;
