/**
 * Framework wiring: Spring Security filter chain, CORS, OpenAPI, async executor and MVC defaults.
 * Contains no business logic. Open so any module may reference its property records.
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Configuration",
        type = org.springframework.modulith.ApplicationModule.Type.OPEN)
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.config;
