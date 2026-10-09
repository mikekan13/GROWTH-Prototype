/**
 * Item PROPERTIES — the universal item descriptors (Sharp, Brittle, Strong,
 * Flexible, Flammable…; `GrowthWorldItem.properties`, item-fields canon
 * correction 2026-05-14 #9). Properties are freeform strings on items; there
 * is no property catalog, so this is the lookup for what a property carries.
 *
 * Perception (Mike 2026-10-09: "property carries its own tags"): each property
 * is its own aspect with its OWN head-domain tag set, same pattern as
 * materials (`Material.domains`). The aspect's base tag (Alteration) applies
 * to every property; the tags here are added on top.
 *
 * CONTENT IS EMPTY ON PURPOSE — which property carries which tags is Mike's /
 * Forge content work, not engine work. Add entries as `slug: ['force', …]`
 * (keys = `propertySlug(name)`, values = daya/domains.ts head keys).
 */

/** Extra head-domain tags per property, keyed by `propertySlug`. Empty until authored. */
export const ITEM_PROPERTY_DOMAINS: Readonly<Record<string, readonly string[]>> = {};

/** 'Heat Resistant' → 'heat-resistant'; '' → ''. Stable id for a property's aspect key. */
export function propertySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** The extra tags a property carries on its own definition ([] when none are authored). Raw — callers filter to head keys. */
export function getPropertyDomains(name: string | null | undefined): readonly string[] {
  if (!name) return [];
  return ITEM_PROPERTY_DOMAINS[propertySlug(name)] ?? [];
}
