package com.orenjitrade.api.ads.infra;

import com.orenjitrade.api.ads.domain.AdEnums.AdvertiserStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CampaignStatus;
import com.orenjitrade.api.ads.domain.AdEnums.ConversionKind;
import com.orenjitrade.api.ads.domain.AdEnums.CreativeStatus;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import com.orenjitrade.api.ads.domain.AdPacing;
import com.orenjitrade.api.ads.domain.AdProvider.Delivery;
import com.orenjitrade.api.ads.domain.AdRows.AdvertiserRow;
import com.orenjitrade.api.ads.domain.AdRows.CampaignRow;
import com.orenjitrade.api.ads.domain.AdRows.Candidate;
import com.orenjitrade.api.ads.domain.AdRows.CreativeRow;
import com.orenjitrade.api.ads.domain.AdRows.DailyRow;
import com.orenjitrade.api.ads.domain.AdRows.PlacementRow;
import com.orenjitrade.api.ads.domain.Targeting.Rule;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Advertising tables access (explicit SQL; ads only). Never reads any location table. */
@Repository
public class AdRepository {

    private static final String CAMPAIGN_SELECT =
            """
            SELECT c.id, c.advertiser_id, a.name AS advertiser_name, c.name, c.status, c.start_at,
                   c.end_at, c.budget_total, c.budget_daily, c.spent, c.currency, c.pricing,
                   c.bid_amount, c.priority, c.frequency_cap_per_day, c.created_at, c.updated_at
              FROM ad_campaign c JOIN advertiser a ON a.id = c.advertiser_id
            """;

    private static final String CREATIVE_SELECT =
            """
            SELECT cr.id, cr.campaign_id, p.key AS placement_key, cr.headline, cr.body,
                   cr.image_url, cr.cta_label, cr.landing_url, cr.status, cr.created_at,
                   cr.updated_at
              FROM ad_creative cr JOIN ad_placement p ON p.id = cr.placement_id
            """;

    private final JdbcClient jdbc;

    public AdRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // Serving
    // ---------------------------------------------------------------------------------------

    public Optional<PlacementRow> placement(PlacementKey key) {
        return jdbc.sql(
                        "SELECT id, key, name, active, max_ads, updated_by, updated_at FROM"
                                + " ad_placement WHERE key = :key")
                .param("key", key.name())
                .query(AdRepository::placement)
                .optional();
    }

    /** Active creatives of a placement whose campaign and advertiser serve at {@code now}. */
    public List<Candidate> candidates(PlacementKey placement, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        return jdbc.sql(
                        """
                        SELECT cr.id AS creative_id, c.id AS campaign_id, a.name AS advertiser_name,
                               cr.headline, cr.body, cr.image_url, cr.cta_label, c.pricing,
                               c.bid_amount, c.budget_total, c.budget_daily, c.end_at, c.priority,
                               c.frequency_cap_per_day,
                               COALESCE(total.impressions, 0) AS total_impressions,
                               COALESCE(total.clicks, 0) AS total_clicks,
                               COALESCE(d.impressions, 0) AS today_impressions,
                               COALESCE(d.clicks, 0) AS today_clicks
                          FROM ad_creative cr
                          JOIN ad_placement p ON p.id = cr.placement_id AND p.key = :placement
                          JOIN ad_campaign c ON c.id = cr.campaign_id
                          JOIN advertiser a ON a.id = c.advertiser_id
                          LEFT JOIN LATERAL (SELECT sum(x.impressions) AS impressions,
                                                    sum(x.clicks) AS clicks
                                               FROM ad_campaign_daily x
                                              WHERE x.campaign_id = c.id) total ON true
                          LEFT JOIN ad_campaign_daily d ON d.campaign_id = c.id AND d.day = :today
                         WHERE cr.status = 'ACTIVE' AND c.status = 'ACTIVE'
                           AND a.status = 'ACTIVE' AND p.active
                           AND c.start_at <= :now AND (c.end_at IS NULL OR c.end_at > :now)
                        """)
                .param("placement", placement.name())
                .param("now", Timestamp.from(now))
                .param("today", Date.valueOf(today))
                .query(
                        (rs, rowNum) ->
                                new Candidate(
                                        rs.getObject("creative_id", UUID.class),
                                        rs.getObject("campaign_id", UUID.class),
                                        rs.getString("advertiser_name"),
                                        rs.getString("headline"),
                                        rs.getString("body"),
                                        rs.getString("image_url"),
                                        rs.getString("cta_label"),
                                        new AdPacing.Budget(
                                                PricingModel.valueOf(rs.getString("pricing")),
                                                rs.getBigDecimal("bid_amount"),
                                                rs.getBigDecimal("budget_total"),
                                                rs.getBigDecimal("budget_daily"),
                                                instant(rs, "end_at")),
                                        new AdPacing.Delivery(
                                                rs.getLong("total_impressions"),
                                                rs.getLong("total_clicks"),
                                                rs.getLong("today_impressions"),
                                                rs.getLong("today_clicks")),
                                        rs.getInt("priority"),
                                        (Integer) rs.getObject("frequency_cap_per_day")))
                .list();
    }

    /** Targeting rules of campaigns, by campaign. */
    public Map<UUID, List<Rule>> rules(Collection<UUID> campaignIds) {
        Map<UUID, List<Rule>> result = new LinkedHashMap<>();
        if (campaignIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT campaign_id, kind, value FROM ad_targeting_rule WHERE campaign_id"
                                + " IN (:ids) ORDER BY kind, value")
                .param("ids", campaignIds)
                .query(
                        rs -> {
                            result.computeIfAbsent(
                                            rs.getObject("campaign_id", UUID.class),
                                            id -> new ArrayList<>())
                                    .add(
                                            new Rule(
                                                    TargetingKind.valueOf(rs.getString("kind")),
                                                    rs.getString("value")));
                        });
        return result;
    }

    /** Today's impressions of a viewer per campaign (frequency caps). */
    public Map<UUID, Long> impressionsSince(
            Collection<UUID> campaignIds, String userHash, Instant since) {
        Map<UUID, Long> result = new LinkedHashMap<>();
        if (campaignIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        """
                        SELECT campaign_id, count(*) AS impressions FROM ad_impression
                         WHERE campaign_id IN (:ids) AND user_hash = :hash AND created_at >= :since
                         GROUP BY campaign_id
                        """)
                .param("ids", campaignIds)
                .param("hash", userHash)
                .param("since", Timestamp.from(since))
                .query(
                        rs -> {
                            result.put(
                                    rs.getObject("campaign_id", UUID.class),
                                    rs.getLong("impressions"));
                        });
        return result;
    }

    public Optional<UUID> campaignOfCreative(UUID creativeId) {
        return jdbc.sql("SELECT campaign_id FROM ad_creative WHERE id = :id")
                .param("id", creativeId)
                .query(UUID.class)
                .optional();
    }

    public Optional<String> landingUrl(UUID creativeId) {
        return jdbc.sql("SELECT landing_url FROM ad_creative WHERE id = :id")
                .param("id", creativeId)
                .query(String.class)
                .optional();
    }

    /** Stores an impression once per serve; returns whether it was new. */
    public boolean insertImpression(Delivery delivery, UUID campaignId) {
        return jdbc.sql(
                                """
                                INSERT INTO ad_impression (serve_id, creative_id, campaign_id,
                                    placement_key, user_hash, region_code, subdivision_code,
                                    created_at)
                                VALUES (:serveId, :creativeId, :campaignId, :placement, :hash,
                                    :region, :subdivision, :at)
                                ON CONFLICT (serve_id) DO NOTHING
                                """)
                        .param("serveId", delivery.serveId())
                        .param("creativeId", delivery.creativeId())
                        .param("campaignId", campaignId)
                        .param("placement", delivery.placement().name())
                        .param("hash", delivery.userHash(), Types.VARCHAR)
                        .param("region", delivery.regionCode(), Types.VARCHAR)
                        .param("subdivision", delivery.subdivisionCode(), Types.VARCHAR)
                        .param("at", Timestamp.from(delivery.at()))
                        .update()
                > 0;
    }

    /** Stores a click once per serve (linked to its impression when recorded). */
    public boolean insertClick(Delivery delivery, UUID campaignId) {
        return jdbc.sql(
                                """
                                INSERT INTO ad_click (serve_id, creative_id, campaign_id,
                                    impression_id, placement_key, user_hash, region_code,
                                    subdivision_code, created_at)
                                VALUES (:serveId, :creativeId, :campaignId,
                                    (SELECT id FROM ad_impression WHERE serve_id = :serveId),
                                    :placement, :hash, :region, :subdivision, :at)
                                ON CONFLICT (serve_id) DO NOTHING
                                """)
                        .param("serveId", delivery.serveId())
                        .param("creativeId", delivery.creativeId())
                        .param("campaignId", campaignId)
                        .param("placement", delivery.placement().name())
                        .param("hash", delivery.userHash(), Types.VARCHAR)
                        .param("region", delivery.regionCode(), Types.VARCHAR)
                        .param("subdivision", delivery.subdivisionCode(), Types.VARCHAR)
                        .param("at", Timestamp.from(delivery.at()))
                        .update()
                > 0;
    }

    /** Adds to the counters of a campaign and UTC day. */
    public void bumpDaily(
            UUID campaignId, LocalDate day, long impressions, long clicks, long conversions) {
        jdbc.sql(
                        """
                        INSERT INTO ad_campaign_daily (campaign_id, day, impressions, clicks,
                            conversions)
                        VALUES (:id, :day, :impressions, :clicks, :conversions)
                        ON CONFLICT (campaign_id, day) DO UPDATE
                           SET impressions = ad_campaign_daily.impressions + EXCLUDED.impressions,
                               clicks = ad_campaign_daily.clicks + EXCLUDED.clicks,
                               conversions = ad_campaign_daily.conversions
                                   + EXCLUDED.conversions
                        """)
                .param("id", campaignId)
                .param("day", Date.valueOf(day))
                .param("impressions", impressions)
                .param("clicks", clicks)
                .param("conversions", conversions)
                .update();
    }

    /** Recomputes {@code ad_campaign.spent} from the counters (rounded half up to the cent). */
    public void refreshSpent(UUID campaignId, Instant now) {
        jdbc.sql(
                        """
                        UPDATE ad_campaign c
                           SET spent = LEAST(c.budget_total, CASE c.pricing
                                   WHEN 'CPM' THEN round(s.impressions * c.bid_amount / 1000, 2)
                                   WHEN 'CPC' THEN round(s.clicks * c.bid_amount, 2)
                                   ELSE CASE WHEN s.impressions > 0 THEN c.budget_total ELSE 0 END
                               END),
                               updated_at = :now
                          FROM (SELECT COALESCE(sum(impressions), 0) AS impressions,
                                       COALESCE(sum(clicks), 0) AS clicks
                                  FROM ad_campaign_daily WHERE campaign_id = :id) s
                         WHERE c.id = :id
                        """)
                .param("id", campaignId)
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * A recorded click.
     *
     * @param id click id
     * @param creativeId creative
     * @param campaignId campaign
     * @param userHash viewer hash
     */
    public record ClickRow(UUID id, UUID creativeId, UUID campaignId, @Nullable String userHash) {}

    public Optional<ClickRow> click(UUID clickId) {
        return jdbc.sql(
                        "SELECT id, creative_id, campaign_id, user_hash FROM ad_click WHERE id ="
                                + " :id")
                .param("id", clickId)
                .query(
                        (rs, rowNum) ->
                                new ClickRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("creative_id", UUID.class),
                                        rs.getObject("campaign_id", UUID.class),
                                        rs.getString("user_hash")))
                .optional();
    }

    /** Stores a conversion once per click and kind; the new id, empty when already recorded. */
    public Optional<UUID> insertConversion(
            ClickRow click,
            ConversionKind kind,
            @Nullable BigDecimal value,
            @Nullable String currency,
            Instant now) {
        return jdbc.sql(
                        """
                        INSERT INTO ad_conversion (click_id, creative_id, campaign_id, kind, value,
                            currency, user_hash, created_at)
                        VALUES (:clickId, :creativeId, :campaignId, :kind, :value, :currency,
                            :hash, :now)
                        ON CONFLICT (click_id, kind) DO NOTHING
                        RETURNING id
                        """)
                .param("clickId", click.id())
                .param("creativeId", click.creativeId())
                .param("campaignId", click.campaignId())
                .param("kind", kind.name())
                .param("value", value, Types.NUMERIC)
                .param("currency", currency, Types.CHAR)
                .param("hash", click.userHash(), Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .optional();
    }

    // ---------------------------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------------------------

    public List<PlacementRow> placements() {
        return jdbc.sql(
                        "SELECT id, key, name, active, max_ads, updated_by, updated_at FROM"
                                + " ad_placement ORDER BY key")
                .query(AdRepository::placement)
                .list();
    }

    public void updatePlacement(
            PlacementKey key, String name, boolean active, int maxAds, UUID actor, Instant now) {
        jdbc.sql(
                        """
                        UPDATE ad_placement SET name = :name, active = :active, max_ads = :maxAds,
                               updated_by = :actor, updated_at = :now
                         WHERE key = :key
                        """)
                .param("key", key.name())
                .param("name", name)
                .param("active", active)
                .param("maxAds", maxAds)
                .param("actor", actor)
                .param("now", Timestamp.from(now))
                .update();
    }

    public List<AdvertiserRow> advertisers() {
        return jdbc.sql(
                        "SELECT id, name, contact_email, status, created_at, updated_at FROM"
                                + " advertiser ORDER BY name, id")
                .query(AdRepository::advertiser)
                .list();
    }

    public Optional<AdvertiserRow> advertiser(UUID id) {
        return jdbc.sql(
                        "SELECT id, name, contact_email, status, created_at, updated_at FROM"
                                + " advertiser WHERE id = :id")
                .param("id", id)
                .query(AdRepository::advertiser)
                .optional();
    }

    /** Inserts an advertiser unless its id exists (seed); returns whether it did. */
    public boolean insertAdvertiser(
            UUID id,
            String name,
            @Nullable String contactEmail,
            AdvertiserStatus status,
            @Nullable UUID actor,
            Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO advertiser (id, name, contact_email, status, created_by,
                                    created_at, updated_at)
                                VALUES (:id, :name, :email, :status, :actor, :now, :now)
                                ON CONFLICT (id) DO NOTHING
                                """)
                        .param("id", id)
                        .param("name", name)
                        .param("email", contactEmail, Types.VARCHAR)
                        .param("status", status.name())
                        .param("actor", actor, Types.OTHER)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void updateAdvertiser(
            UUID id,
            String name,
            @Nullable String contactEmail,
            AdvertiserStatus status,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE advertiser SET name = :name, contact_email = :email,
                               status = :status, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("name", name)
                .param("email", contactEmail, Types.VARCHAR)
                .param("status", status.name())
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * Editable attributes of a campaign.
     *
     * @param advertiserId advertiser
     * @param name name
     * @param status status
     * @param startAt start
     * @param endAt end
     * @param budgetTotal total budget
     * @param budgetDaily daily budget
     * @param currency ISO 4217 code
     * @param pricing pricing model
     * @param bidAmount CPM/CPC price
     * @param priority priority
     * @param frequencyCapPerDay impressions per viewer and day
     */
    public record CampaignValues(
            UUID advertiserId,
            String name,
            CampaignStatus status,
            Instant startAt,
            @Nullable Instant endAt,
            BigDecimal budgetTotal,
            @Nullable BigDecimal budgetDaily,
            String currency,
            PricingModel pricing,
            BigDecimal bidAmount,
            int priority,
            @Nullable Integer frequencyCapPerDay) {}

    /** Inserts a campaign unless its id exists (seed); returns whether it did. */
    public boolean insertCampaign(
            UUID id, CampaignValues values, @Nullable UUID actor, Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO ad_campaign (id, advertiser_id, name, status, start_at,
                                    end_at, budget_total, budget_daily, currency, pricing,
                                    bid_amount, priority, frequency_cap_per_day, created_by,
                                    created_at, updated_at)
                                VALUES (:id, :advertiserId, :name, :status, :startAt, :endAt,
                                    :budgetTotal, :budgetDaily, :currency, :pricing, :bid,
                                    :priority, :cap, :actor, :now, :now)
                                ON CONFLICT (id) DO NOTHING
                                """)
                        .params(campaignParams(id, values, now))
                        .param("actor", actor, Types.OTHER)
                        .update()
                > 0;
    }

    public void updateCampaign(UUID id, CampaignValues values, Instant now) {
        jdbc.sql(
                        """
                        UPDATE ad_campaign SET advertiser_id = :advertiserId, name = :name,
                               status = :status, start_at = :startAt, end_at = :endAt,
                               budget_total = :budgetTotal, budget_daily = :budgetDaily,
                               currency = :currency, pricing = :pricing, bid_amount = :bid,
                               priority = :priority, frequency_cap_per_day = :cap,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .params(campaignParams(id, values, now))
                .update();
    }

    private static Map<String, Object> campaignParams(UUID id, CampaignValues values, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("id", id);
        params.put("advertiserId", values.advertiserId());
        params.put("name", values.name());
        params.put("status", values.status().name());
        params.put("startAt", Timestamp.from(values.startAt()));
        params.put("endAt", values.endAt() == null ? null : Timestamp.from(values.endAt()));
        params.put("budgetTotal", values.budgetTotal());
        params.put("budgetDaily", values.budgetDaily());
        params.put("currency", values.currency());
        params.put("pricing", values.pricing().name());
        params.put("bid", values.bidAmount());
        params.put("priority", values.priority());
        params.put("cap", values.frequencyCapPerDay());
        params.put("now", Timestamp.from(now));
        return params;
    }

    public Optional<CampaignRow> campaign(UUID id) {
        return jdbc.sql(CAMPAIGN_SELECT + " WHERE c.id = :id")
                .param("id", id)
                .query(AdRepository::campaign)
                .optional();
    }

    public Optional<CampaignRow> lockCampaign(UUID id) {
        return jdbc.sql(CAMPAIGN_SELECT + " WHERE c.id = :id FOR UPDATE OF c")
                .param("id", id)
                .query(AdRepository::campaign)
                .optional();
    }

    public List<CampaignRow> campaigns(
            @Nullable CampaignStatus status, @Nullable UUID advertiserId, int page, int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = campaignWhere(status, advertiserId, params);
        params.put("limit", size);
        params.put("offset", (long) page * size);
        return jdbc.sql(
                        CAMPAIGN_SELECT
                                + where
                                + " ORDER BY c.updated_at DESC, c.id DESC LIMIT :limit OFFSET"
                                + " :offset")
                .params(params)
                .query(AdRepository::campaign)
                .list();
    }

    public long countCampaigns(@Nullable CampaignStatus status, @Nullable UUID advertiserId) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = campaignWhere(status, advertiserId, params);
        return jdbc.sql(
                        "SELECT count(*) FROM ad_campaign c JOIN advertiser a ON a.id ="
                                + " c.advertiser_id"
                                + where)
                .params(params)
                .query(Long.class)
                .single();
    }

    private static String campaignWhere(
            @Nullable CampaignStatus status,
            @Nullable UUID advertiserId,
            Map<String, Object> params) {
        StringBuilder where = new StringBuilder(" WHERE true");
        if (status != null) {
            where.append(" AND c.status = :status");
            params.put("status", status.name());
        }
        if (advertiserId != null) {
            where.append(" AND c.advertiser_id = :advertiserId");
            params.put("advertiserId", advertiserId);
        }
        return where.toString();
    }

    public List<Rule> rulesOf(UUID campaignId) {
        return rules(List.of(campaignId)).getOrDefault(campaignId, List.of());
    }

    public void replaceRules(UUID campaignId, List<Rule> rules, Instant now) {
        jdbc.sql("DELETE FROM ad_targeting_rule WHERE campaign_id = :id")
                .param("id", campaignId)
                .update();
        for (Rule rule : rules) {
            jdbc.sql(
                            """
                            INSERT INTO ad_targeting_rule (campaign_id, kind, value, created_at)
                            VALUES (:id, :kind, :value, :now)
                            ON CONFLICT (campaign_id, kind, value) DO NOTHING
                            """)
                    .param("id", campaignId)
                    .param("kind", rule.kind().name())
                    .param("value", rule.value())
                    .param("now", Timestamp.from(now))
                    .update();
        }
    }

    /**
     * Editable attributes of a creative.
     *
     * @param placement placement
     * @param headline headline
     * @param body text
     * @param imageUrl image
     * @param ctaLabel call to action
     * @param landingUrl landing page
     * @param status status
     */
    public record CreativeValues(
            PlacementKey placement,
            String headline,
            String body,
            @Nullable String imageUrl,
            String ctaLabel,
            String landingUrl,
            CreativeStatus status) {}

    /** Inserts a creative unless its id exists (seed); returns whether it did. */
    public boolean insertCreative(UUID id, UUID campaignId, CreativeValues values, Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO ad_creative (id, campaign_id, placement_id, headline,
                                    body, image_url, cta_label, landing_url, status, created_at,
                                    updated_at)
                                VALUES (:id, :campaignId,
                                    (SELECT id FROM ad_placement WHERE key = :placement),
                                    :headline, :body, :image, :cta, :landing, :status, :now,
                                    :now)
                                ON CONFLICT (id) DO NOTHING
                                """)
                        .params(creativeParams(id, values, now))
                        .param("campaignId", campaignId)
                        .update()
                > 0;
    }

    public void updateCreative(UUID id, CreativeValues values, Instant now) {
        jdbc.sql(
                        """
                        UPDATE ad_creative
                           SET placement_id = (SELECT id FROM ad_placement WHERE key = :placement),
                               headline = :headline, body = :body, image_url = :image,
                               cta_label = :cta, landing_url = :landing, status = :status,
                               updated_at = :now
                         WHERE id = :id
                        """)
                .params(creativeParams(id, values, now))
                .update();
    }

    private static Map<String, Object> creativeParams(UUID id, CreativeValues values, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("id", id);
        params.put("placement", values.placement().name());
        params.put("headline", values.headline());
        params.put("body", values.body());
        params.put("image", values.imageUrl());
        params.put("cta", values.ctaLabel());
        params.put("landing", values.landingUrl());
        params.put("status", values.status().name());
        params.put("now", Timestamp.from(now));
        return params;
    }

    public Optional<CreativeRow> creative(UUID id) {
        return jdbc.sql(CREATIVE_SELECT + " WHERE cr.id = :id")
                .param("id", id)
                .query(AdRepository::creative)
                .optional();
    }

    public List<CreativeRow> creativesOf(UUID campaignId) {
        return jdbc.sql(
                        CREATIVE_SELECT
                                + " WHERE cr.campaign_id = :id ORDER BY cr.created_at, cr.id")
                .param("id", campaignId)
                .query(AdRepository::creative)
                .list();
    }

    /** Counters of a campaign per day between {@code from} and {@code to} (inclusive). */
    public List<DailyRow> daily(UUID campaignId, LocalDate from, LocalDate to) {
        return jdbc.sql(
                        """
                        SELECT day, impressions, clicks, conversions FROM ad_campaign_daily
                         WHERE campaign_id = :id AND day BETWEEN :from AND :to ORDER BY day
                        """)
                .param("id", campaignId)
                .param("from", Date.valueOf(from))
                .param("to", Date.valueOf(to))
                .query(
                        (rs, rowNum) ->
                                new DailyRow(
                                        rs.getDate("day").toLocalDate(),
                                        rs.getLong("impressions"),
                                        rs.getLong("clicks"),
                                        rs.getLong("conversions")))
                .list();
    }

    /** All-time counters of a campaign (day = today). */
    public DailyRow totals(UUID campaignId) {
        return jdbc.sql(
                        """
                        SELECT COALESCE(sum(impressions), 0) AS impressions,
                               COALESCE(sum(clicks), 0) AS clicks,
                               COALESCE(sum(conversions), 0) AS conversions
                          FROM ad_campaign_daily WHERE campaign_id = :id
                        """)
                .param("id", campaignId)
                .query(
                        (rs, rowNum) ->
                                new DailyRow(
                                        LocalDate.now(ZoneOffset.UTC),
                                        rs.getLong("impressions"),
                                        rs.getLong("clicks"),
                                        rs.getLong("conversions")))
                .single();
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    static PlacementRow placement(ResultSet rs, int rowNum) throws SQLException {
        return new PlacementRow(
                rs.getObject("id", UUID.class),
                PlacementKey.valueOf(rs.getString("key")),
                rs.getString("name"),
                rs.getBoolean("active"),
                rs.getInt("max_ads"),
                rs.getObject("updated_by", UUID.class),
                rs.getTimestamp("updated_at").toInstant());
    }

    static AdvertiserRow advertiser(ResultSet rs, int rowNum) throws SQLException {
        return new AdvertiserRow(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("contact_email"),
                AdvertiserStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    static CampaignRow campaign(ResultSet rs, int rowNum) throws SQLException {
        return new CampaignRow(
                rs.getObject("id", UUID.class),
                rs.getObject("advertiser_id", UUID.class),
                rs.getString("advertiser_name"),
                rs.getString("name"),
                CampaignStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("start_at").toInstant(),
                instant(rs, "end_at"),
                rs.getBigDecimal("budget_total"),
                rs.getBigDecimal("budget_daily"),
                rs.getBigDecimal("spent"),
                rs.getString("currency").trim(),
                PricingModel.valueOf(rs.getString("pricing")),
                rs.getBigDecimal("bid_amount"),
                rs.getInt("priority"),
                (Integer) rs.getObject("frequency_cap_per_day"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    static CreativeRow creative(ResultSet rs, int rowNum) throws SQLException {
        return new CreativeRow(
                rs.getObject("id", UUID.class),
                rs.getObject("campaign_id", UUID.class),
                PlacementKey.valueOf(rs.getString("placement_key")),
                rs.getString("headline"),
                rs.getString("body"),
                rs.getString("image_url"),
                rs.getString("cta_label"),
                rs.getString("landing_url"),
                CreativeStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    static @Nullable Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
