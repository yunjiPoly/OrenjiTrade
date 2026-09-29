/**
 * Cross-cutting building blocks shared by every module: RFC 9457 problem details, error codes,
 * the request-id filter, time access, pagination envelopes and MDC propagation.
 *
 * <p>This module is {@link org.springframework.modulith.ApplicationModule.Type#OPEN OPEN}: every
 * other module may depend on any of its types. It must never depend on a business module.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Common",
        type = org.springframework.modulith.ApplicationModule.Type.OPEN)
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.common;
