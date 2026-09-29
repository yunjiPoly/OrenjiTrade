/**
 * Users module.
 *
 * <p>User accounts (provisioned on the first authenticated request), roles, suspension, legal
 * documents and consents, the {@code /me} endpoints, the terms-acceptance filter and the account
 * seed. Implements the auth module's {@code AccountResolver} SPI and the audit module's {@code
 * AuditActorResolver}. Extension points for later modules: {@code OnboardingCheck}, {@code
 * AvatarUrlProvider}, {@code SeedContributor} ordering constants.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, adapters, seed), {@code web/} (servlet
 * filters), {@code events/} (published domain events). Entities never leave the module; other
 * modules use {@code UserAccountService}/{@code ConsentService} or the events, never the
 * repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Users")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.users;
