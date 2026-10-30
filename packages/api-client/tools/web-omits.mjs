/**
 * Optional parameters left out of the paused web's Angular client, by operation id.
 *
 * The web app is paused (owner order of 2026-10-12) and must build unchanged against the
 * regenerated client. An operation that had no parameter at all is called there as
 * `op('body', false, options)`; a first optional parameter would turn its generated signature into
 * `op(requestParameters?, observe?, ...)` and break those calls. The phone's types
 * (packages/shared-types) keep every parameter of docs/api/openapi.json; the web never sends these.
 */
export const WEB_CLIENT_OMITS = {
  // Stage R9 omitted `excludeTypes` of `getUnreadNotificationCount` here; web stage WE (spec 12)
  // sends it (`excludeTypes=MESSAGE`, the bell leaves chats out), so nothing is omitted now.
};

/**
 * Fields the paused web's Angular client keeps typed as they were before they became nullable, by
 * schema name.
 *
 * Stage R15 ("Browse without an account", owner prompt of 2026-10-20) made who a collector is
 * nullable: a signed-out caller never reads a collector's id, handle or display name (the API
 * sends `null`, `PrivacyPolicyService#canSeeWho`). The web is paused (owner order of 2026-10-12)
 * and must build unchanged; it reads these fields as strings. Its client keeps them as strings, so
 * it builds; at run time a signed-out web visitor reads `null` there (an owner follow-up of stage
 * R15: the web's guest pages would need the phone's "A collector" rows when it resumes). The
 * phone's types (packages/shared-types) keep the nullable fields of docs/api/openapi.json.
 */
export const WEB_CLIENT_NOT_NULL = {
  CollectorMarker: ['id', 'handle', 'displayName'],
  // FeedCollector is typed nullable on the web since stage WE: Home shows a guest "A collector".
  PublicBinderOwner: ['id', 'handle', 'displayName'],
};

/** The OpenAPI document (changed in place) without the null of the fields of `fields`. */
export function withoutWebNulls(document, fields = WEB_CLIENT_NOT_NULL) {
  const schemas = document.components?.schemas ?? {};
  for (const [name, keys] of Object.entries(fields)) {
    const properties = schemas[name]?.properties ?? {};
    for (const key of keys) {
      const property = properties[key];
      if (property && Array.isArray(property.type)) {
        const types = property.type.filter((type) => type !== 'null');
        property.type = types.length === 1 ? types[0] : types;
      }
    }
  }
  return document;
}

/** The OpenAPI document (changed in place) without the parameters of `omits`. */
export function withoutWebOmits(document, omits = WEB_CLIENT_OMITS) {
  for (const item of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(item ?? {})) {
      const names = omits[operation?.operationId];
      if (!names || !Array.isArray(operation.parameters)) {
        continue;
      }
      operation.parameters = operation.parameters.filter((p) => !names.includes(p.name));
      if (operation.parameters.length === 0) {
        delete operation.parameters;
      }
    }
  }
  return document;
}
