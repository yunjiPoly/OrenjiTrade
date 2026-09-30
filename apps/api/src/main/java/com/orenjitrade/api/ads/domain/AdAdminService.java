package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.AdvertiserStatus;
import com.orenjitrade.api.ads.domain.AdEnums.ConversionKind;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import com.orenjitrade.api.ads.domain.AdRows.AdvertiserRow;
import com.orenjitrade.api.ads.domain.AdRows.CampaignRow;
import com.orenjitrade.api.ads.domain.AdRows.CreativeRow;
import com.orenjitrade.api.ads.domain.AdRows.DailyRow;
import com.orenjitrade.api.ads.domain.AdRows.PlacementRow;
import com.orenjitrade.api.ads.domain.Targeting.Rule;
import com.orenjitrade.api.ads.infra.AdRepository;
import com.orenjitrade.api.ads.infra.AdRepository.CampaignValues;
import com.orenjitrade.api.ads.infra.AdRepository.ClickRow;
import com.orenjitrade.api.ads.infra.AdRepository.CreativeValues;
import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The advertising admin console ({@code /api/v1/admin/ads/**}, ADMIN; Phase 10 contract "Admin CRUD
 * + stats"): advertisers, placements, campaigns with budgets and pacing settings, creatives,
 * targeting rules and delivery statistics. Every write is validated and audited ({@code
 * ads.advertiser.*}, {@code ads.campaign.*}, {@code ads.creative.*}, {@code ads.targeting.update},
 * {@code ads.placement.update}); conversions come from the internal route.
 */
@Service
public class AdAdminService {

    public static final String TARGET_ADVERTISER = "AD_ADVERTISER";
    public static final String TARGET_CAMPAIGN = "AD_CAMPAIGN";
    public static final String TARGET_CREATIVE = "AD_CREATIVE";
    public static final String TARGET_PLACEMENT = "AD_PLACEMENT";

    static final int MAX_RULES = 50;
    static final BigDecimal MAX_BUDGET = new BigDecimal("1000000");
    static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");
    static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]{1,189}\\.[^@\\s]{2,}$");

    private final AdRepository repository;
    private final PlanService plans;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public AdAdminService(
            AdRepository repository,
            PlanService plans,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.plans = plans;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /**
     * A campaign with its advertiser, creatives, targeting and all-time totals.
     *
     * @param campaign the campaign
     * @param creatives its creatives
     * @param targeting its rules
     * @param totals all-time counters
     */
    public record CampaignDetail(
            CampaignRow campaign,
            List<CreativeRow> creatives,
            List<Rule> targeting,
            DailyRow totals) {}

    /**
     * Delivery statistics of a campaign.
     *
     * @param campaign the campaign
     * @param totals all-time counters
     * @param daily counters per day of the requested range
     * @param from first day
     * @param to last day
     */
    public record CampaignStats(
            CampaignRow campaign,
            DailyRow totals,
            List<DailyRow> daily,
            LocalDate from,
            LocalDate to) {

        /**
         * Spend of one day's counters under the campaign's pricing (two decimals; FLAT campaigns
         * have no per-day spend, their {@code spent} is the flat fee once served).
         */
        public BigDecimal spend(DailyRow row) {
            if (campaign.pricing() == PricingModel.FLAT) {
                return BigDecimal.ZERO.setScale(2);
            }
            return AdPacing.spend(
                            campaign.pricing(),
                            campaign.bidAmount(),
                            row.impressions(),
                            row.clicks())
                    .setScale(2, RoundingMode.HALF_UP);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Advertisers
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<AdvertiserRow> advertisers() {
        return repository.advertisers();
    }

    @Transactional
    public AdvertiserRow createAdvertiser(
            AuthenticatedUser actor,
            String name,
            @Nullable String contactEmail,
            @Nullable AdvertiserStatus status) {
        @Nullable String email = email(contactEmail);
        UUID id = UUID.randomUUID();
        repository.insertAdvertiser(
                id,
                name.trim(),
                email,
                status == null ? AdvertiserStatus.ACTIVE : status,
                actor.userId(),
                now());
        audit(actor, "ads.advertiser.create", TARGET_ADVERTISER, id, Map.of("name", name.trim()));
        return repository.advertiser(id).orElseThrow();
    }

    @Transactional
    public AdvertiserRow updateAdvertiser(
            AuthenticatedUser actor,
            UUID id,
            String name,
            @Nullable String contactEmail,
            AdvertiserStatus status) {
        AdvertiserRow current =
                repository
                        .advertiser(id)
                        .orElseThrow(() -> ApiException.notFound("Advertiser not found"));
        repository.updateAdvertiser(id, name.trim(), email(contactEmail), status, now());
        audit(
                actor,
                "ads.advertiser.update",
                TARGET_ADVERTISER,
                id,
                Map.of("previousStatus", current.status().name(), "status", status.name()));
        return repository.advertiser(id).orElseThrow();
    }

    // ---------------------------------------------------------------------------------------
    // Placements
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PlacementRow> placements() {
        return repository.placements();
    }

    @Transactional
    public PlacementRow updatePlacement(
            AuthenticatedUser actor, PlacementKey key, String name, boolean active, int maxAds) {
        PlacementRow current =
                repository
                        .placement(key)
                        .orElseThrow(() -> ApiException.notFound("Placement not found"));
        repository.updatePlacement(key, name.trim(), active, maxAds, actor.userId(), now());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousActive", current.active());
        details.put("active", active);
        details.put("previousMaxAds", current.maxAds());
        details.put("maxAds", maxAds);
        audit(actor, "ads.placement.update", TARGET_PLACEMENT, key.name(), details);
        return repository.placement(key).orElseThrow();
    }

    // ---------------------------------------------------------------------------------------
    // Campaigns
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<CampaignRow> campaigns(
            AdEnums.@Nullable CampaignStatus status,
            @Nullable UUID advertiserId,
            int page,
            int size) {
        return PageResponse.of(
                repository.campaigns(status, advertiserId, page, size),
                page,
                size,
                repository.countCampaigns(status, advertiserId));
    }

    @Transactional(readOnly = true)
    public CampaignDetail campaign(UUID id) {
        CampaignRow campaign = requireCampaign(id);
        return new CampaignDetail(
                campaign,
                repository.creativesOf(id),
                repository.rulesOf(id),
                repository.totals(id));
    }

    @Transactional
    public CampaignDetail createCampaign(AuthenticatedUser actor, CampaignValues values) {
        CampaignValues valid = validate(values);
        UUID id = UUID.randomUUID();
        repository.insertCampaign(id, valid, actor.userId(), now());
        audit(actor, "ads.campaign.create", TARGET_CAMPAIGN, id, campaignDetails(valid));
        return campaign(id);
    }

    @Transactional
    public CampaignDetail updateCampaign(AuthenticatedUser actor, UUID id, CampaignValues values) {
        CampaignRow current =
                repository
                        .lockCampaign(id)
                        .orElseThrow(() -> ApiException.notFound("Campaign not found"));
        CampaignValues valid = validate(values);
        repository.updateCampaign(id, valid, now());
        repository.refreshSpent(id, now());
        Map<String, Object> details = campaignDetails(valid);
        details.put("previousStatus", current.status().name());
        details.put("previousBudgetTotal", current.budgetTotal().toPlainString());
        audit(actor, "ads.campaign.update", TARGET_CAMPAIGN, id, details);
        return campaign(id);
    }

    /** Replaces the targeting rules of a campaign. */
    @Transactional
    public CampaignDetail replaceTargeting(AuthenticatedUser actor, UUID id, List<Rule> rules) {
        repository.lockCampaign(id).orElseThrow(() -> ApiException.notFound("Campaign not found"));
        List<Rule> valid = validateRules(rules);
        repository.replaceRules(id, valid, now());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("rules", valid.stream().map(rule -> rule.kind() + "=" + rule.value()).toList());
        audit(actor, "ads.targeting.update", TARGET_CAMPAIGN, id, details);
        return campaign(id);
    }

    // ---------------------------------------------------------------------------------------
    // Creatives
    // ---------------------------------------------------------------------------------------

    @Transactional
    public CreativeRow createCreative(
            AuthenticatedUser actor, UUID campaignId, CreativeValues values) {
        requireCampaign(campaignId);
        CreativeValues valid = validate(values);
        UUID id = UUID.randomUUID();
        repository.insertCreative(id, campaignId, valid, now());
        audit(
                actor,
                "ads.creative.create",
                TARGET_CREATIVE,
                id,
                Map.of(
                        "campaignId", campaignId.toString(),
                        "placement", valid.placement().name(),
                        "status", valid.status().name()));
        return repository.creative(id).orElseThrow();
    }

    @Transactional
    public CreativeRow updateCreative(AuthenticatedUser actor, UUID id, CreativeValues values) {
        CreativeRow current =
                repository.creative(id).orElseThrow(() -> ApiException.notFound("Ad not found"));
        CreativeValues valid = validate(values);
        repository.updateCreative(id, valid, now());
        audit(
                actor,
                "ads.creative.update",
                TARGET_CREATIVE,
                id,
                Map.of(
                        "previousStatus", current.status().name(),
                        "status", valid.status().name(),
                        "placement", valid.placement().name()));
        return repository.creative(id).orElseThrow();
    }

    // ---------------------------------------------------------------------------------------
    // Statistics and conversions
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CampaignStats stats(UUID id, @Nullable LocalDate from, @Nullable LocalDate to) {
        CampaignRow campaign = requireCampaign(id);
        LocalDate last = to != null ? to : LocalDate.now(ZoneOffset.UTC);
        LocalDate first = from != null ? from : last.minusDays(29);
        if (first.isAfter(last) || ChronoUnit.DAYS.between(first, last) > 366) {
            throw invalid("from", "must be before to and at most 366 days earlier");
        }
        return new CampaignStats(
                campaign, repository.totals(id), repository.daily(id, first, last), first, last);
    }

    /**
     * Records a conversion of a click (internal route): 404 for unknown clicks; once per click and
     * kind (a repeat answers the stored state without a second count).
     */
    @Transactional
    public boolean recordConversion(
            UUID clickId,
            ConversionKind kind,
            @Nullable BigDecimal value,
            @Nullable String currency) {
        if ((value == null) != (currency == null)) {
            throw invalid("currency", "value and currency go together");
        }
        if (value != null && value.signum() < 0) {
            throw invalid("value", "must not be negative");
        }
        @Nullable String code = currency == null ? null : currency.trim().toUpperCase(Locale.ROOT);
        if (code != null && !CURRENCY.matcher(code).matches()) {
            throw invalid("currency", "must be an ISO 4217 code");
        }
        ClickRow click =
                repository
                        .click(clickId)
                        .orElseThrow(() -> ApiException.notFound("Click not found"));
        Instant now = now();
        Optional<UUID> id = repository.insertConversion(click, kind, value, code, now);
        if (id.isPresent()) {
            repository.bumpDaily(
                    click.campaignId(), LocalDate.ofInstant(now, ZoneOffset.UTC), 0, 0, 1);
        }
        return id.isPresent();
    }

    // ---------------------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------------------

    private CampaignValues validate(CampaignValues values) {
        List<ProblemFieldError> errors = new ArrayList<>();
        Optional<AdvertiserRow> advertiser = repository.advertiser(values.advertiserId());
        if (advertiser.isEmpty()) {
            errors.add(new ProblemFieldError("advertiserId", "unknown advertiser"));
        }
        String name = values.name().trim();
        if (name.isEmpty() || name.length() > 120) {
            errors.add(new ProblemFieldError("name", "must be 1 to 120 characters"));
        }
        if (values.endAt() != null && !values.endAt().isAfter(values.startAt())) {
            errors.add(new ProblemFieldError("endAt", "must be after startAt"));
        }
        if (values.budgetTotal().signum() < 0 || values.budgetTotal().compareTo(MAX_BUDGET) > 0) {
            errors.add(new ProblemFieldError("budgetTotal", "must be between 0 and 1000000"));
        }
        if (values.budgetDaily() != null
                && (values.budgetDaily().signum() <= 0
                        || values.budgetDaily().compareTo(values.budgetTotal()) > 0)) {
            errors.add(
                    new ProblemFieldError("budgetDaily", "must be positive and at most the total"));
        }
        String currency = values.currency().trim().toUpperCase(Locale.ROOT);
        if (!CURRENCY.matcher(currency).matches()) {
            errors.add(new ProblemFieldError("currency", "must be an ISO 4217 code"));
        }
        BigDecimal bid =
                values.pricing() == PricingModel.FLAT ? BigDecimal.ZERO : values.bidAmount();
        if (values.pricing() != PricingModel.FLAT
                && (bid.signum() <= 0 || bid.compareTo(MAX_BUDGET) > 0)) {
            errors.add(new ProblemFieldError("bidAmount", "must be positive for CPM and CPC"));
        }
        if (values.priority() < 0 || values.priority() > 100) {
            errors.add(new ProblemFieldError("priority", "must be between 0 and 100"));
        }
        if (values.frequencyCapPerDay() != null
                && (values.frequencyCapPerDay() < 1 || values.frequencyCapPerDay() > 100)) {
            errors.add(new ProblemFieldError("frequencyCapPerDay", "must be between 1 and 100"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return new CampaignValues(
                values.advertiserId(),
                name,
                values.status(),
                values.startAt().truncatedTo(ChronoUnit.MICROS),
                values.endAt() == null ? null : values.endAt().truncatedTo(ChronoUnit.MICROS),
                values.budgetTotal().setScale(2, RoundingMode.HALF_UP),
                values.budgetDaily() == null
                        ? null
                        : values.budgetDaily().setScale(2, RoundingMode.HALF_UP),
                currency,
                values.pricing(),
                bid.setScale(2, RoundingMode.HALF_UP),
                values.priority(),
                values.frequencyCapPerDay());
    }

    private static CreativeValues validate(CreativeValues values) {
        List<ProblemFieldError> errors = new ArrayList<>();
        String headline = values.headline().trim();
        if (headline.isEmpty() || headline.length() > 80) {
            errors.add(new ProblemFieldError("headline", "must be 1 to 80 characters"));
        }
        String body = values.body().trim();
        if (body.length() > 200) {
            errors.add(new ProblemFieldError("body", "must be at most 200 characters"));
        }
        String cta = values.ctaLabel().trim();
        if (cta.isEmpty() || cta.length() > 30) {
            errors.add(new ProblemFieldError("ctaLabel", "must be 1 to 30 characters"));
        }
        @Nullable String image =
                values.imageUrl() == null || values.imageUrl().isBlank()
                        ? null
                        : values.imageUrl().trim();
        if (image != null && !url(image)) {
            errors.add(new ProblemFieldError("imageUrl", "must be an https URL or a site path"));
        }
        String landing = values.landingUrl().trim();
        if (!url(landing)) {
            errors.add(new ProblemFieldError("landingUrl", "must be an https URL or a site path"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return new CreativeValues(
                values.placement(), headline, body, image, cta, landing, values.status());
    }

    private List<Rule> validateRules(List<Rule> rules) {
        if (rules.size() > MAX_RULES) {
            throw invalid("rules", "at most " + MAX_RULES + " rules");
        }
        Set<String> planCodes = new LinkedHashSet<>();
        plans.all().forEach(plan -> planCodes.add(plan.code()));
        planCodes.add(AdContext.ANONYMOUS);
        List<ProblemFieldError> errors = new ArrayList<>();
        List<Rule> result = new ArrayList<>();
        for (int i = 0; i < rules.size(); i++) {
            Rule rule = rules.get(i);
            String field = "rules[" + i + "].value";
            String value = rule.value().trim();
            TargetingKind kind = rule.kind();
            String normalised =
                    switch (kind) {
                        case GAME, TAG -> value.toLowerCase(Locale.ROOT);
                        case GEO_CELL -> value.toLowerCase(Locale.ROOT);
                        case PLAN -> value.toUpperCase(Locale.ROOT);
                        case REGION_LABEL -> value;
                    };
            boolean ok =
                    switch (kind) {
                        case GAME, TAG -> Targeting.SLUG.matcher(normalised).matches();
                        case GEO_CELL -> Targeting.GEO_CELL.matcher(normalised).matches();
                        case PLAN -> planCodes.contains(normalised);
                        case REGION_LABEL ->
                                normalised.length() <= 120
                                        && Targeting.acceptableRegionLabel(normalised);
                    };
            if (!ok) {
                errors.add(new ProblemFieldError(field, "not a valid " + kind + " value"));
            } else {
                result.add(new Rule(kind, normalised));
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return result;
    }

    private static boolean url(String value) {
        return value.length() <= 500
                && (value.startsWith("https://") && value.length() > 8
                        || value.startsWith("/") && !value.startsWith("//"));
    }

    private static @Nullable String email(@Nullable String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String email = value.trim();
        if (email.length() > 254 || !EMAIL.matcher(email).matches()) {
            throw invalid("contactEmail", "must be an e-mail address");
        }
        return email;
    }

    private static Map<String, Object> campaignDetails(CampaignValues values) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("advertiserId", values.advertiserId().toString());
        details.put("status", values.status().name());
        details.put("pricing", values.pricing().name());
        details.put("budgetTotal", values.budgetTotal().toPlainString());
        details.put("currency", values.currency());
        return details;
    }

    private CampaignRow requireCampaign(UUID id) {
        return repository
                .campaign(id)
                .orElseThrow(() -> ApiException.notFound("Campaign not found"));
    }

    private void audit(
            AuthenticatedUser actor,
            String action,
            String targetType,
            Object targetId,
            Map<String, ?> details) {
        auditService.record(
                ActorType.ADMIN, actor.userId(), action, targetType, targetId.toString(), details);
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }
}
