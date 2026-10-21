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
  // Stage R9: the phone leaves chats out of its bell (`excludeTypes=MESSAGE`).
  getUnreadNotificationCount: ['excludeTypes'],
};

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
