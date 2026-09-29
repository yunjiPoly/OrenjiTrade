package com.orenjitrade.api.meta.api;

import com.orenjitrade.api.common.TimeProvider;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.info.BuildProperties;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/meta}: public build and environment metadata. */
@RestController
@RequestMapping(path = "/api/v1/meta", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "meta", description = "Build and environment metadata")
public class MetaController {

    public static final String API_NAME = "OrenjiTrade API";
    static final String FALLBACK_VERSION = "dev";

    private final String version;
    private final String environment;
    private final TimeProvider timeProvider;

    public MetaController(
            ObjectProvider<BuildProperties> buildProperties,
            @Value("${orenji.environment:local}") String environment,
            TimeProvider timeProvider) {
        @Nullable BuildProperties build = buildProperties.getIfAvailable();
        this.version = build != null && build.getVersion() != null ? build.getVersion() : FALLBACK_VERSION;
        this.environment = environment;
        this.timeProvider = timeProvider;
    }

    @GetMapping
    @Operation(operationId = "getMeta", summary = "Build and environment metadata (public)")
    @SecurityRequirements
    public MetaResponse getMeta() {
        return new MetaResponse(API_NAME, version, environment, timeProvider.now());
    }
}
