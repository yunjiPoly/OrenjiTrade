package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.core.util.DefaultIndenter;
import tools.jackson.core.util.DefaultPrettyPrinter;
import tools.jackson.core.util.Separators;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Exports the OpenAPI contract to {@code docs/api/openapi.json}. Runs only through {@code ./gradlew
 * exportOpenApi} (tag {@code openapi}, excluded from the regular test task) because it writes into
 * the repository.
 */
@Tag("openapi")
class OpenApiExportTest extends AbstractIntegrationTest {

    /** Set by the exportOpenApi Gradle task; falls back to the path relative to apps/api. */
    static final String EXPORT_FILE_PROPERTY = "orenji.openapi.export.file";

    static final Path DEFAULT_EXPORT_FILE = Paths.get("..", "..", "docs", "api", "openapi.json");

    @Autowired private JsonMapper jsonMapper;

    @Test
    void exportsOpenApiDocument() throws IOException {
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/v3/api-docs")
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectHeader()
                        .contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                        .expectBody()
                        .returnResult();

        byte[] body = result.getResponseBody();
        assertThat(body).isNotNull();
        JsonNode document = jsonMapper.readTree(body);

        assertThat(document.path("openapi").asString()).startsWith("3.1");
        assertThat(document.path("info").path("title").asString()).isEqualTo("OrenjiTrade API");
        assertThat(document.path("info").path("version").asString()).isEqualTo("0.1.0");
        assertThat(document.path("info").path("license").path("url").asString())
                .isEqualTo("https://www.orenjitrade.com/legal/terms");

        JsonNode paths = document.path("paths");
        assertThat(paths.has("/api/v1/meta")).isTrue();
        assertThat(paths.path("/api/v1/meta").path("get").path("operationId").asString())
                .isEqualTo("getMeta");
        assertThat(paths.has("/api/v1/me")).isTrue();
        assertThat(paths.has("/api/v1/me/ping")).isTrue();
        assertThat(paths.has("/api/v1/me/consents")).isTrue();
        assertThat(paths.has("/api/v1/public/legal/documents")).isTrue();
        assertThat(paths.has("/api/v1/admin/users")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}/suspend")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}/unsuspend")).isTrue();
        assertThat(paths.has("/api/v1/admin/users/{id}/roles")).isTrue();
        assertThat(paths.has("/api/v1/admin/audit-logs")).isTrue();
        assertThat(paths.has("/internal/jobs/ping")).isTrue();
        // Phase 1-B (profiles, location, settings, deletion and export).
        for (String path :
                java.util.List.of(
                        "/api/v1/me/profile",
                        "/api/v1/me/profile/avatar",
                        "/api/v1/me/profile/tags",
                        "/api/v1/tags",
                        "/api/v1/collectors/{handle}",
                        "/api/v1/me/location",
                        "/api/v1/regions",
                        "/api/v1/regions/{region}/binder-counts",
                        "/api/v1/regions/{region}/subdivisions/{code}/binders",
                        "/api/v1/admin/regions",
                        "/api/v1/admin/regions/countries/{code}",
                        "/api/v1/me/settings/privacy",
                        "/api/v1/me/settings/notifications",
                        "/api/v1/me/export",
                        "/api/v1/me/deletion-requests",
                        "/api/v1/me/deletion-requests/{id}",
                        "/api/v1/public/media/{key}",
                        "/internal/jobs/account-deletion")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation ->
                                    assertThat(operation.getValue().path("summary").asString())
                                            .as("summary of %s %s", operation.getKey(), path)
                                            .isNotEmpty());
        }
        // Platform regions replaced the map radius and the coordinates (ADR 0017).
        for (String gone :
                java.util.List.of(
                        "/api/v1/me/location/trading-area",
                        "/api/v1/collectors/nearby",
                        "/api/v1/collectors/{handle}/preview")) {
            assertThat(paths.has(gone)).as(gone).isFalse();
        }
        String schemaText = document.path("components").path("schemas").toString();
        assertThat(schemaText)
                .doesNotContain("\"lat\"")
                .doesNotContain("\"lng\"")
                .doesNotContain("radiusKm")
                .doesNotContain("distanceBucket")
                .doesNotContain("showDistance");
        // Phase 2 (catalog, feature flags, plans and limits).
        for (String path :
                java.util.List.of(
                        "/api/v1/games",
                        "/api/v1/games/{slug}",
                        "/api/v1/sets",
                        "/api/v1/sets/{id}",
                        "/api/v1/cards",
                        "/api/v1/cards/suggest",
                        "/api/v1/cards/{id}",
                        "/api/v1/cards/{id}/printings",
                        "/api/v1/printings/{id}",
                        "/api/v1/public/placeholder-images/{game}/{file}",
                        "/api/v1/public/feature-flags",
                        "/api/v1/plans",
                        "/api/v1/me/plan",
                        "/api/v1/admin/feature-flags",
                        "/api/v1/admin/feature-flags/{key}",
                        "/api/v1/admin/plans",
                        "/api/v1/admin/plans/{code}",
                        "/api/v1/admin/usage-limits",
                        "/api/v1/admin/usage-limits/{id}",
                        "/api/v1/admin/users/{id}/entitlements",
                        "/api/v1/admin/users/{id}/entitlements/{entitlementId}",
                        "/api/v1/admin/games",
                        "/api/v1/admin/games/{slug}",
                        "/api/v1/admin/sets",
                        "/api/v1/admin/sets/{id}",
                        "/api/v1/admin/cards",
                        "/api/v1/admin/cards/{id}",
                        "/api/v1/admin/cards/{id}/printings",
                        "/api/v1/admin/printings/{id}",
                        "/api/v1/admin/catalog/sync",
                        "/api/v1/admin/catalog/sync-runs",
                        "/api/v1/admin/catalog/sync-runs/{id}",
                        "/api/v1/admin/catalog/providers")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation ->
                                    assertThat(operation.getValue().path("summary").asString())
                                            .as("summary of %s %s", operation.getKey(), path)
                                            .isNotEmpty());
        }
        // Phase 3 (inventory, binders, public binders, freshness, delisting).
        for (String path :
                java.util.List.of(
                        "/api/v1/inventory/items",
                        "/api/v1/inventory/items/{id}",
                        "/api/v1/inventory/items/{id}/confirm",
                        "/api/v1/inventory/items/{id}/images",
                        "/api/v1/inventory/items/{id}/images/{imageId}",
                        "/api/v1/inventory/items/bulk",
                        "/api/v1/inventory/summary",
                        "/api/v1/binders",
                        "/api/v1/binders/{id}",
                        "/api/v1/binders/{id}/publish",
                        "/api/v1/binders/{id}/unpublish",
                        "/api/v1/binders/{id}/confirm",
                        "/api/v1/binders/{id}/items",
                        "/api/v1/binders/reorder",
                        "/api/v1/collectors/{handle}/binders",
                        "/api/v1/collectors/{handle}/inventory",
                        "/api/v1/public/binders/{id}",
                        "/api/v1/public/binders/{id}/items",
                        "/api/v1/admin/delist-policies",
                        "/api/v1/admin/delist-policies/{id}",
                        "/internal/jobs/freshness",
                        "/internal/jobs/delist")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation ->
                                    assertThat(operation.getValue().path("summary").asString())
                                            .as("summary of %s %s", operation.getKey(), path)
                                            .isNotEmpty());
        }
        // Phase 5 (messaging, blocks, uploads, community, moderation).
        for (String path :
                java.util.List.of(
                        "/api/v1/conversations",
                        "/api/v1/conversations/{id}",
                        "/api/v1/conversations/{id}/messages",
                        "/api/v1/conversations/{id}/read",
                        "/api/v1/uploads/images",
                        "/api/v1/users/{id}/block",
                        "/api/v1/me/blocks",
                        "/api/v1/community/channels",
                        "/api/v1/community/channels/{slug}/posts",
                        "/api/v1/community/posts/{id}",
                        "/api/v1/community/posts/{id}/replies",
                        "/api/v1/community/replies/{id}",
                        "/api/v1/admin/community/channels",
                        "/api/v1/admin/community/channels/{id}",
                        "/api/v1/admin/community/posts/{id}/remove",
                        "/api/v1/admin/community/replies/{id}/remove",
                        "/api/v1/admin/moderation/flags",
                        "/api/v1/admin/moderation/flags/{id}/resolve",
                        "/internal/jobs/upload-cleanup")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation ->
                                    assertThat(operation.getValue().path("summary").asString())
                                            .as("summary of %s %s", operation.getKey(), path)
                                            .isNotEmpty());
        }
        // Phase 6 (wishlist, matches, notifications, push tokens).
        for (String path :
                java.util.List.of(
                        "/api/v1/wishlist",
                        "/api/v1/wishlist/{id}",
                        "/api/v1/wishlist/{id}/matches",
                        "/api/v1/wishlist/matches/{id}/dismiss",
                        "/api/v1/collectors/{handle}/wishlist",
                        "/api/v1/notifications",
                        "/api/v1/notifications/unread-count",
                        "/api/v1/notifications/{id}/read",
                        "/api/v1/notifications/read-all",
                        "/api/v1/me/push-tokens",
                        "/api/v1/me/push-tokens/{token}",
                        "/internal/jobs/wishlist-rematch")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation -> {
                                assertThat(operation.getValue().path("summary").asString())
                                        .as("summary of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                                assertThat(operation.getValue().path("tags"))
                                        .as("tags of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                            });
        }
        // Phase 7 (ratings, references, reports, moderation, delisting, admin console).
        for (String path :
                java.util.List.of(
                        "/api/v1/ratings/eligibility",
                        "/api/v1/ratings",
                        "/api/v1/ratings/{id}",
                        "/api/v1/references",
                        "/api/v1/collectors/{handle}/ratings",
                        "/api/v1/collectors/{handle}/references",
                        "/api/v1/admin/ratings",
                        "/api/v1/admin/ratings/{id}/hide",
                        "/api/v1/admin/ratings/{id}/unhide",
                        "/api/v1/admin/references/{id}/hide",
                        "/api/v1/admin/references/{id}/unhide",
                        "/api/v1/public/report-reasons",
                        "/api/v1/reports/collectors",
                        "/api/v1/me/reports",
                        "/api/v1/admin/reports",
                        "/api/v1/admin/reports/{id}",
                        "/api/v1/admin/reports/{id}/assign",
                        "/api/v1/admin/reports/{id}/notes",
                        "/api/v1/admin/reports/{id}/resolve",
                        "/api/v1/admin/users/{id}/history",
                        "/api/v1/admin/moderation/rules",
                        "/api/v1/admin/moderation/rules/{id}",
                        "/api/v1/admin/listings",
                        "/api/v1/admin/listings/stale",
                        "/api/v1/admin/listings/{itemId}/restore",
                        "/api/v1/admin/listings/{itemId}/hide",
                        "/api/v1/admin/binders",
                        "/api/v1/admin/binders/{id}/unpublish",
                        "/api/v1/admin/users/{id}/pause-listings",
                        "/api/v1/admin/users/{id}/resume-listings",
                        "/api/v1/admin/users/{id}/listing-status",
                        "/api/v1/me/listings/status",
                        "/api/v1/me/listings/resume",
                        "/api/v1/admin/dashboard",
                        "/api/v1/admin/notifications/stats",
                        "/api/v1/admin/notifications/broadcast",
                        "/api/v1/admin/analytics/summary",
                        "/api/v1/admin/system/health")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation -> {
                                assertThat(operation.getValue().path("summary").asString())
                                        .as("summary of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                                assertThat(operation.getValue().path("tags"))
                                        .as("tags of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                            });
        }
        // Phase 8 (offers and trades).
        for (String path :
                java.util.List.of(
                        "/api/v1/offers",
                        "/api/v1/offers/{id}",
                        "/api/v1/offers/{id}/counter",
                        "/api/v1/offers/{id}/accept",
                        "/api/v1/offers/{id}/decline",
                        "/api/v1/offers/{id}/cancel",
                        "/api/v1/me/settings/offers",
                        "/internal/jobs/offers-expire",
                        "/api/v1/trades",
                        "/api/v1/trades/{id}",
                        "/api/v1/trades/{id}/meetup",
                        "/api/v1/trades/{id}/complete",
                        "/api/v1/trades/{id}/cancel")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation -> {
                                assertThat(operation.getValue().path("summary").asString())
                                        .as("summary of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                                assertThat(operation.getValue().path("tags"))
                                        .as("tags of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                            });
        }
        // Card images (ADR 0015): serving, admin cache console, catalog import jobs.
        for (String path :
                java.util.List.of(
                        "/api/v1/public/card-images/{imageId}",
                        "/api/v1/admin/card-images/status",
                        "/api/v1/admin/card-images/clear",
                        "/api/v1/admin/card-images/reconcile",
                        "/api/v1/admin/card-images/{imageId}/cache",
                        "/api/v1/admin/catalog/sync-runs/{id}/report",
                        "/internal/jobs/catalog-import",
                        "/internal/jobs/catalog-import/{id}",
                        "/internal/jobs/card-images/status",
                        "/internal/jobs/card-images/clear",
                        "/internal/jobs/card-images/reconcile")) {
            assertThat(paths.has(path)).as(path).isTrue();
        }
        for (String schema :
                java.util.List.of(
                        "CardImageCacheStatus", "CatalogImportReport", "CatalogSyncRun")) {
            assertThat(document.path("components").path("schemas").has(schema)).as(schema).isTrue();
        }
        // Phase 10 (subscriptions, credits, referrals, ads, donations, admin).
        for (String path :
                java.util.List.of(
                        "/api/v1/me/plan",
                        "/api/v1/me/subscription/checkout",
                        "/api/v1/me/subscription/cancel",
                        "/api/v1/me/subscription/mobile-receipt",
                        "/api/v1/billing/fake/{ref}",
                        "/api/v1/billing/fake/{ref}/confirm",
                        "/api/v1/webhooks/billing/{provider}",
                        "/api/v1/admin/subscriptions",
                        "/api/v1/admin/subscriptions/{id}",
                        "/api/v1/admin/subscriptions/{id}/cancel",
                        "/internal/jobs/subscriptions-period",
                        "/api/v1/me/credits",
                        "/api/v1/me/credits/spend",
                        "/api/v1/me/referrals",
                        "/api/v1/me/referrals/redeem",
                        "/api/v1/admin/credits/grant",
                        "/api/v1/admin/credits/ledger",
                        "/api/v1/admin/credits/products",
                        "/api/v1/admin/credits/products/{key}",
                        "/api/v1/admin/credits/settings",
                        "/internal/jobs/credits-reconcile",
                        "/api/v1/ads",
                        "/api/v1/ads/{creativeId}/impression",
                        "/api/v1/ads/{creativeId}/click",
                        "/api/v1/admin/ads/advertisers",
                        "/api/v1/admin/ads/advertisers/{id}",
                        "/api/v1/admin/ads/placements",
                        "/api/v1/admin/ads/placements/{key}",
                        "/api/v1/admin/ads/campaigns",
                        "/api/v1/admin/ads/campaigns/{id}",
                        "/api/v1/admin/ads/campaigns/{id}/targeting",
                        "/api/v1/admin/ads/campaigns/{id}/creatives",
                        "/api/v1/admin/ads/campaigns/{id}/stats",
                        "/api/v1/admin/ads/creatives/{id}",
                        "/internal/ads/clicks/{clickId}/conversions",
                        "/api/v1/donations/checkout",
                        "/api/v1/me/donations",
                        "/api/v1/donations/fake/{ref}",
                        "/api/v1/donations/fake/{ref}/confirm",
                        "/api/v1/webhooks/donations/{provider}",
                        "/api/v1/public/donations/supporters",
                        "/api/v1/admin/donations",
                        "/api/v1/admin/donations/{id}",
                        "/api/v1/admin/donations/{id}/refund",
                        "/api/v1/admin/donations/settings")) {
            assertThat(paths.has(path)).as(path).isTrue();
            paths.path(path)
                    .properties()
                    .forEach(
                            operation -> {
                                assertThat(operation.getValue().path("summary").asString())
                                        .as("summary of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                                assertThat(operation.getValue().path("tags"))
                                        .as("tags of %s %s", operation.getKey(), path)
                                        .isNotEmpty();
                            });
        }
        assertThat(paths.path("/api/v1/ads").path("get").path("security")).isEmpty();
        assertThat(
                        paths.path("/api/v1/me/subscription/mobile-receipt")
                                .path("post")
                                .path("responses")
                                .has("501"))
                .isTrue();
        assertThat(paths.path("/api/v1/offers").path("post").path("responses").has("422")).isTrue();
        assertThat(paths.path("/api/v1/offers").path("post").path("responses").has("429")).isTrue();
        assertThat(paths.path("/api/v1/public/report-reasons").path("get").path("security"))
                .isEmpty();
        assertThat(
                        paths.path("/api/v1/reports/collectors")
                                .path("post")
                                .path("responses")
                                .has("409"))
                .isTrue();
        assertThat(
                        paths.path("/api/v1/wishlist/{id}")
                                .path("patch")
                                .path("requestBody")
                                .path("content")
                                .path("application/json")
                                .path("schema")
                                .path("$ref")
                                .asString())
                .isEqualTo("#/components/schemas/UpdateWishlistItemRequest");
        assertThat(paths.path("/api/v1/wishlist").path("post").path("responses").has("429"))
                .isTrue();
        assertThat(paths.has("/ws")).as("the STOMP endpoint is not a REST operation").isFalse();
        JsonNode publicBinder = paths.path("/api/v1/public/binders/{id}").path("get");
        assertThat(publicBinder.path("security")).isEmpty();
        assertThat(
                        paths.path("/api/v1/inventory/items/{id}")
                                .path("patch")
                                .path("requestBody")
                                .path("content")
                                .path("application/json")
                                .path("schema")
                                .path("$ref")
                                .asString())
                .isEqualTo("#/components/schemas/UpdateInventoryItemRequest");
        JsonNode searchCards = paths.path("/api/v1/cards").path("get");
        assertThat(searchCards.path("security")).isEmpty();
        assertThat(searchCards.path("responses").has("401")).isFalse();
        assertThat(paths.has("/api/v1/test-probes/limits/{key}/consume"))
                .as("test probes must not be exported")
                .isFalse();
        assertThat(paths.has("/error")).as("/error must not be exported").isFalse();

        JsonNode getMe = paths.path("/api/v1/me").path("get");
        assertThat(getMe.path("summary").asString()).isNotEmpty();
        assertThat(getMe.path("responses").has("401")).isTrue();
        assertThat(getMe.path("responses").has("403")).isTrue();
        assertThat(getMe.path("responses").has("428")).isTrue();
        assertThat(getMe.path("responses").has("429")).isTrue();
        assertThat(
                        getMe.path("responses")
                                .path("401")
                                .path("content")
                                .path("application/problem+json")
                                .path("schema")
                                .path("$ref")
                                .asString())
                .isEqualTo("#/components/schemas/ProblemDetail");
        JsonNode publicDocuments = paths.path("/api/v1/public/legal/documents").path("get");
        assertThat(publicDocuments.path("security").isArray()).isTrue();
        assertThat(publicDocuments.path("security")).isEmpty();
        assertThat(publicDocuments.path("responses").has("401")).isFalse();

        JsonNode schemas = document.path("components").path("schemas");
        assertThat(schemas.has("MetaResponse")).isTrue();
        assertThat(schemas.has("MeResponse")).isTrue();
        assertThat(schemas.has("AdminUserSummary")).isTrue();
        assertThat(schemas.has("AdminUserDetail")).isTrue();
        assertThat(schemas.has("AuditLogEntry")).isTrue();
        assertThat(schemas.has("ProblemDetail")).isTrue();
        assertThat(schemas.path("ProblemDetail").path("properties").path("errorCode").path("enum"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("ACCOUNT_SUSPENDED"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("MESSAGE_BLOCKED"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("DUPLICATE_POST"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("RATING_NOT_ELIGIBLE"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("ALREADY_RATED"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("REPORT_ALREADY_OPEN"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("CANNOT_REPORT_SELF"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("OFFERS_NOT_ACCEPTED"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("OFFER_ALREADY_OPEN"))
                .anySatisfy(code -> assertThat(code.asString()).isEqualTo("STALE_OFFER"));
        assertThat(schemas.path("ProblemDetail").path("properties").has("limitKey")).isTrue();
        assertThat(schemas.path("ProblemDetail").path("properties").has("upgradeUrl")).isTrue();
        for (String schema :
                java.util.List.of(
                        "CardSummary",
                        "CardDetail",
                        "PrintingSummary",
                        "PrintingDetail",
                        "SetSummary",
                        "SetDetail",
                        "CardSuggestion",
                        "GameResponse",
                        "GameSchema",
                        "Plan",
                        "MyPlan",
                        "LimitStatus",
                        "FeatureFlag",
                        "CatalogSyncRun",
                        "InventoryItemResponse",
                        "PublicInventoryItem",
                        "BinderResponse",
                        "PublicBinderSummary",
                        "PublicBinderResponse",
                        "InventorySummaryResponse",
                        "BulkInventoryResponse",
                        "Freshness",
                        "DelistPolicyResponse",
                        "ConversationSummary",
                        "MessageResponse",
                        "MessagePayload",
                        "CardLink",
                        "BinderLink",
                        "BlockedUser",
                        "ImageUploadResponse",
                        "CommunityChannel",
                        "PostResponse",
                        "ReplyResponse",
                        "ModerationFlag",
                        "RatingResponse",
                        "CollectorRatingsPage",
                        "RatingEligibility",
                        "ReferenceResponse",
                        "ReportConfirmation",
                        "ReportSummary",
                        "ReportDetail",
                        "ModerationHistory",
                        "ModerationRule",
                        "StaleListing",
                        "ListingStatus",
                        "AdminDashboard",
                        "NotificationStats",
                        "AnalyticsSummary",
                        "SystemHealth",
                        "OfferResponse",
                        "OfferSummary",
                        "OfferParty",
                        "OfferEvent",
                        "TradeResponse",
                        "TradeSummary",
                        "TradeNextAction",
                        "OfferLink")) {
            assertThat(schemas.has(schema)).as(schema).isTrue();
        }
        assertThat(document.path("components").path("securitySchemes").has("bearerAuth")).isTrue();
        assertThat(document.path("components").path("securitySchemes").has("serviceToken"))
                .isTrue();

        Path target = resolveExportFile();
        Files.createDirectories(target.getParent());
        Files.writeString(target, prettyPrint(document), StandardCharsets.UTF_8);

        assertThat(target).exists();
        assertThat(Files.readString(target)).contains("\"/api/v1/me\"");
    }

    private String prettyPrint(JsonNode document) {
        DefaultIndenter indenter = new DefaultIndenter("  ", "\n");
        DefaultPrettyPrinter printer =
                new DefaultPrettyPrinter(
                                Separators.createDefaultInstance()
                                        .withObjectNameValueSpacing(Separators.Spacing.AFTER)
                                        .withObjectEmptySeparator("")
                                        .withArrayEmptySeparator(""))
                        .withObjectIndenter(indenter)
                        .withArrayIndenter(indenter);
        return jsonMapper.writer().with(printer).writeValueAsString(document) + "\n";
    }

    private static Path resolveExportFile() {
        String configured = System.getProperty(EXPORT_FILE_PROPERTY);
        Path path =
                configured != null && !configured.isBlank()
                        ? Paths.get(configured)
                        : Paths.get(System.getProperty("user.dir")).resolve(DEFAULT_EXPORT_FILE);
        return path.toAbsolutePath().normalize();
    }
}
