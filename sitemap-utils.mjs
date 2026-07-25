/**
 * sitemap-utils.mjs
 * Shared helper used by generate-articles.mjs and generate-projects.mjs so
 * each script can regenerate its own <url> entries inside sitemap.xml
 * without wiping out the other script's entries (they run independently,
 * in either order, from the same GitHub Action).
 *
 * Usage:
 *   const xml = upsertMarkerBlock(existingXml, "PROJECTS", projectUrlEntries);
 */
export function upsertMarkerBlock(xml, marker, blockInnerXml) {
  const startTag = `<!-- ${marker}:START -->`;
  const endTag = `<!-- ${marker}:END -->`;
  const block = `${startTag}\n${blockInnerXml}\n  ${endTag}`;
  const re = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, "m");

  if (re.test(xml)) {
    return xml.replace(re, block);
  }
  // Marker not present yet — insert just before </urlset>.
  return xml.replace(/<\/urlset>\s*$/, `${block}\n</urlset>`);
}

/** Read a marker block's current inner content from an existing sitemap.xml
 * string, or "" if the marker isn't present yet (first run). */
export function readMarkerBlock(xml, marker) {
  const startTag = `<!-- ${marker}:START -->`;
  const endTag = `<!-- ${marker}:END -->`;
  const re = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`, "m");
  const match = xml.match(re);
  return match ? match[1].trim() : "";
}
