package com.orenjitrade.api.config;

import com.orenjitrade.api.common.ErrorCode;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import java.util.Arrays;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI document metadata. Active only when {@code orenji.openapi.enabled=true} (local, dev,
 * test); the springdoc endpoints themselves are switched with the same property in {@code
 * application.yml}, so staging and production never serve {@code /v3/api-docs} or Swagger UI.
 *
 * <p>The generated document is exported to {@code docs/api/openapi.json} by {@code ./gradlew
 * exportOpenApi} and consumed by {@code packages/api-client} and {@code packages/shared-types}.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "orenji.openapi.enabled", havingValue = "true")
public class OpenApiConfig {

    public static final String BEARER_SCHEME = "bearerAuth";
    public static final String PROBLEM_DETAIL_SCHEMA = "ProblemDetail";
    static final String FALLBACK_VERSION = "dev";

    @Bean
    OpenAPI orenjiOpenApi(ObjectProvider<BuildProperties> buildProperties) {
        @Nullable BuildProperties build = buildProperties.getIfAvailable();
        String version =
                build != null && build.getVersion() != null ? build.getVersion() : FALLBACK_VERSION;
        return new OpenAPI()
                .info(
                        new Info()
                                .title("OrenjiTrade API")
                                .version(version)
                                .description(
                                        "REST API of OrenjiTrade, the geographic discovery network"
                                            + " for trading cards. Generated from the Spring Boot"
                                            + " application by `./gradlew exportOpenApi`"
                                            + " (apps/api). Do not edit by hand.")
                                .license(new License().name("Proprietary")))
                .servers(
                        List.of(
                                new Server().url("http://localhost:8080").description("local"),
                                new Server()
                                        .url("https://api.orenjitrade.com")
                                        .description("production")))
                .components(
                        new Components()
                                .addSecuritySchemes(
                                        BEARER_SCHEME,
                                        new SecurityScheme()
                                                .type(SecurityScheme.Type.HTTP)
                                                .scheme("bearer")
                                                .bearerFormat("JWT")
                                                .description("Firebase Authentication ID token"))
                                .addSchemas(PROBLEM_DETAIL_SCHEMA, problemDetailSchema()))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
    }

    /** RFC 9457 problem with OrenjiTrade extensions; mirrors {@code ProblemDetailFactory}. */
    static Schema<?> problemDetailSchema() {
        ObjectSchema fieldError = new ObjectSchema();
        fieldError.addProperty("field", new StringSchema());
        fieldError.addProperty("message", new StringSchema());

        ObjectSchema schema = new ObjectSchema();
        schema.description("RFC 9457 problem details with OrenjiTrade extensions");
        schema.addProperty("type", new StringSchema().format("uri"));
        schema.addProperty("title", new StringSchema());
        schema.addProperty("status", new IntegerSchema());
        schema.addProperty("detail", new StringSchema());
        schema.addProperty("instance", new StringSchema());
        StringSchema errorCode = new StringSchema();
        errorCode.setEnum(Arrays.stream(ErrorCode.values()).map(Enum::name).toList());
        errorCode.example(ErrorCode.VALIDATION_FAILED.name());
        schema.addProperty("errorCode", errorCode);
        schema.addProperty("message", new StringSchema());
        schema.addProperty("requestId", new StringSchema());
        schema.addProperty("timestamp", new StringSchema().format("date-time"));
        schema.addProperty("errors", new ArraySchema().items(fieldError));
        schema.required(
                List.of(
                        "type",
                        "title",
                        "status",
                        "errorCode",
                        "message",
                        "requestId",
                        "timestamp"));
        return schema;
    }
}
