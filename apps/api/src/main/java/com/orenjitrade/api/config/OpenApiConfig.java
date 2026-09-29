package com.orenjitrade.api.config;

import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.common.ErrorCode;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import java.util.Arrays;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;

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
    public static final String SERVICE_TOKEN_SCHEME = "serviceToken";
    public static final String PROBLEM_DETAIL_SCHEMA = "ProblemDetail";
    public static final String LICENSE_URL = "https://www.orenjitrade.com/legal/terms";
    static final String PROBLEM_DETAIL_REF = "#/components/schemas/" + PROBLEM_DETAIL_SCHEMA;
    static final String DEFAULT_RESPONSE = "default";
    static final String FALLBACK_VERSION = "dev";
    static final String INTERNAL_PREFIX = "/internal/";

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
                                .license(new License().name("Proprietary").url(LICENSE_URL)))
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
                                .addSecuritySchemes(
                                        SERVICE_TOKEN_SCHEME,
                                        new SecurityScheme()
                                                .type(SecurityScheme.Type.APIKEY)
                                                .in(SecurityScheme.In.HEADER)
                                                .name(ServiceAuthFilter.SERVICE_TOKEN_HEADER)
                                                .description(
                                                        "Shared service token for /internal/**"
                                                                + " (alternative: a Google OIDC"
                                                                + " bearer token)")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
    }

    /**
     * Runs after springdoc has scanned the controllers (which is when {@code components.schemas} is
     * rebuilt): registers the {@code ProblemDetail} schema and documents the problem responses
     * every operation may answer with: {@code default}, {@code 429} everywhere, {@code 401}, {@code
     * 403} and {@code 428} on authenticated routes. {@code /internal/**} operations accept the
     * service token or an OIDC bearer token.
     */
    @Bean
    OpenApiCustomizer problemDetailOpenApiCustomizer() {
        return openApi -> {
            Components components =
                    openApi.getComponents() != null ? openApi.getComponents() : new Components();
            components.addSchemas(PROBLEM_DETAIL_SCHEMA, problemDetailSchema());
            openApi.setComponents(components);
            if (openApi.getPaths() == null) {
                return;
            }
            openApi.getPaths()
                    .forEach(
                            (path, pathItem) ->
                                    pathItem.readOperations()
                                            .forEach(operation -> document(path, operation)));
        };
    }

    private static void document(String path, Operation operation) {
        ApiResponses responses =
                operation.getResponses() != null ? operation.getResponses() : new ApiResponses();
        boolean internal = path.startsWith(INTERNAL_PREFIX);
        if (internal) {
            operation.setSecurity(
                    List.of(
                            new SecurityRequirement().addList(SERVICE_TOKEN_SCHEME),
                            new SecurityRequirement().addList(BEARER_SCHEME)));
        }
        boolean secured = operation.getSecurity() == null || !operation.getSecurity().isEmpty();
        if (secured) {
            responses.putIfAbsent(
                    "401", problemResponse("Unauthenticated (missing or invalid token)"));
            responses.putIfAbsent("403", problemResponse("Forbidden (role, MFA or account state)"));
            if (!internal) {
                responses.putIfAbsent(
                        "428",
                        problemResponse(
                                "Terms acceptance required (extension `requiredConsents[]`)"));
            }
        }
        if (!internal) {
            responses.putIfAbsent("429", problemResponse("Rate limited (`Retry-After` header)"));
        }
        responses.putIfAbsent(
                DEFAULT_RESPONSE, problemResponse("Error (RFC 9457 problem details)"));
        operation.setResponses(responses);
    }

    private static ApiResponse problemResponse(String description) {
        return new ApiResponse()
                .description(description)
                .content(
                        new Content()
                                .addMediaType(
                                        MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                                        new io.swagger.v3.oas.models.media.MediaType()
                                                .schema(new Schema<>().$ref(PROBLEM_DETAIL_REF))));
    }

    /** RFC 9457 problem with OrenjiTrade extensions; mirrors {@code ProblemDetailFactory}. */
    static Schema<?> problemDetailSchema() {
        ObjectSchema fieldError = new ObjectSchema();
        fieldError.addProperty("field", new StringSchema());
        fieldError.addProperty("message", new StringSchema());

        ObjectSchema requiredConsent = new ObjectSchema();
        requiredConsent.addProperty("documentType", new StringSchema());
        requiredConsent.addProperty("version", new StringSchema());

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
        schema.addProperty(
                "errors",
                new ArraySchema()
                        .items(fieldError)
                        .description("Per-field errors of VALIDATION_FAILED problems"));
        schema.addProperty(
                "requiredConsents",
                new ArraySchema()
                        .items(requiredConsent)
                        .description("Documents to accept (TERMS_ACCEPTANCE_REQUIRED problems)"));
        schema.addProperty(
                "suspendedUntil",
                new StringSchema()
                        .format("date-time")
                        .description("End of a temporary suspension (ACCOUNT_SUSPENDED)"));
        schema.addProperty(
                "retryAfterSeconds",
                new IntegerSchema().description("Seconds to wait (RATE_LIMITED problems)"));
        schema.addProperty(
                "blockers",
                new ArraySchema()
                        .items(new StringSchema())
                        .description(
                                "Open obligations preventing an account deletion"
                                        + " (DELETION_BLOCKED), e.g. OPEN_DISPUTE"));
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
