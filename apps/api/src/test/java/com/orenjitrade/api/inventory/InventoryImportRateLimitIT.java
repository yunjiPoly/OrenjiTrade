package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.ImportTestSupport.IMPORTS;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.ratelimit.RateLimitFilter;
import com.orenjitrade.api.inventory.ImportTestSupport.TestCard;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * The Redis rate limiter on the two expensive routes of the inventory import: the upload and the
 * commit each have their own policy per collector ({@code inventory-import-upload}, {@code
 * inventory-import-commit} in application.yml, 30 an hour each). The policies are the real ones;
 * only their numbers are lowered here so the third call is the one refused. Separate context
 * because the properties differ from the shared test profile.
 */
@TestPropertySource(
        properties = {
            "orenji.ratelimit.enabled=true",
            "RATE_LIMIT_IMPORT_UPLOADS_PER_HOUR=2",
            "RATE_LIMIT_IMPORT_COMMITS_PER_HOUR=2"
        })
class InventoryImportRateLimitIT extends AbstractIntegrationTest {

    @Test
    void uploadsAndCommitsAreRateLimitedPerCollector() {
        String uid = uniqueUid("import-rate");
        provisionCompliant(uid);
        TestCard card = ImportTestSupport.card(testUsers, "yugioh", ImportTestSupport.passcode());
        ImportTestSupport.printing(
                testUsers,
                card,
                ImportTestSupport.set(testUsers, "yugioh", LocalDate.of(2025, 1, 1)),
                "EN001",
                "Rare");
        String deck = "#main\n" + card.passcode() + "\n";

        // Two uploads pass; the third is refused before it is read.
        EntityExchangeResult<byte[]> first = upload(uid, deck);
        assertThat(first.getStatus().value()).isEqualTo(201);
        assertThat(first.getResponseHeaders().getFirst(RateLimitFilter.HEADER_LIMIT))
                .isEqualTo("2");
        assertThat(first.getResponseHeaders().getFirst(RateLimitFilter.HEADER_REMAINING))
                .isEqualTo("1");
        String id = json(upload(uid, deck)).path("id").asString();
        EntityExchangeResult<byte[]> third = upload(uid, deck);
        assertThat(third.getStatus().value()).isEqualTo(429);
        JsonNode limited = json(third);
        assertThat(limited.path("errorCode").asString()).isEqualTo("RATE_LIMITED");
        assertThat(limited.path("limit").asInt()).isEqualTo(2);
        assertThat(limited.path("windowSeconds").asInt()).isEqualTo(3600);
        assertThat(limited.path("retryAfterSeconds").asInt()).isBetween(1, 3600);
        assertThat(third.getResponseHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isNotNull();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_import i JOIN user_account u ON"
                                        + " u.id = i.owner_id WHERE u.provider_uid = ?",
                                uid))
                .as("the refused upload stored nothing: the second preview replaced the first")
                .isEqualTo(1);

        // The commit has a counter of its own: two commits pass (the second answers the same
        // result), the third is refused; reading and editing the import is not counted here.
        String commit = IMPORTS + "/" + id + "/commit";
        JsonNode done = callJson(HttpMethod.POST, commit, uid, null, 200);
        assertThat(done.path("status").asString()).isEqualTo("COMMITTED");
        assertThat(callJson(HttpMethod.POST, commit, uid, null, 200).path("result"))
                .isEqualTo(done.path("result"));
        JsonNode refused = callJson(HttpMethod.POST, commit, uid, null, 429);
        assertThat(refused.path("errorCode").asString()).isEqualTo("RATE_LIMITED");
        assertThat(refused.path("limit").asInt()).isEqualTo(2);
        callJson(HttpMethod.GET, IMPORTS + "/" + id, uid, null, 200);
        callJson(HttpMethod.GET, IMPORTS + "/" + id + "/rows", uid, null, 200);

        // Another collector has their own counters.
        String other = uniqueUid("import-rate-other");
        provisionCompliant(other);
        EntityExchangeResult<byte[]> theirs = upload(other, deck);
        assertThat(theirs.getStatus().value()).isEqualTo(201);
        assertThat(theirs.getResponseHeaders().getFirst(RateLimitFilter.HEADER_REMAINING))
                .isEqualTo("1");
    }

    private EntityExchangeResult<byte[]> upload(String uid, String deck) {
        return ImportTestSupport.upload(
                http, bearer(uid), "YDK", deck.getBytes(StandardCharsets.UTF_8));
    }
}
