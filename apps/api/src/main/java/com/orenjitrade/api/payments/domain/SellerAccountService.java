package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentProvider.PaymentProviderException;
import com.orenjitrade.api.payments.domain.PaymentProvider.SellerAccountStatus;
import com.orenjitrade.api.payments.domain.PaymentProvider.SellerOnboarding;
import com.orenjitrade.api.payments.domain.PaymentRows.SellerAccountRow;
import com.orenjitrade.api.payments.infra.SellerAccountRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seller payout accounts (Phase 9 contract: {@code GET /me/seller-account}, {@code POST
 * /me/seller-account/onboarding}). The provider hosts the onboarding; the fake provider completes
 * it at once (ACTIVE, payouts enabled). Only the provider's account id is stored; bank details
 * never reach the platform.
 */
@Service
public class SellerAccountService {

    /** Where the web app shows the payout settings. */
    public static final String DEFAULT_RETURN_URL = "/settings/payouts";

    /** A web path: one leading slash, no scheme, no protocol-relative {@code //}. */
    static final Pattern WEB_PATH = Pattern.compile("^/(?!/)[A-Za-z0-9/_.?=&%-]{0,300}$");

    private static final Logger log = LoggerFactory.getLogger(SellerAccountService.class);

    private final SellerAccountRepository accounts;
    private final PaymentProvider provider;
    private final PaymentFeature feature;
    private final TimeProvider timeProvider;

    public SellerAccountService(
            SellerAccountRepository accounts,
            PaymentProvider provider,
            PaymentFeature feature,
            TimeProvider timeProvider) {
        this.accounts = accounts;
        this.provider = provider;
        this.feature = feature;
        this.timeProvider = timeProvider;
    }

    /**
     * A seller's payout account as they see it.
     *
     * @param provider active provider id
     * @param status account status (NOT_STARTED without an account)
     * @param payoutsEnabled whether payouts can be released
     * @param ready ACTIVE with payouts enabled at the active provider (buyers can pay)
     * @param updatedAt last change, {@code null} without an account
     */
    public record SellerAccountView(
            String provider,
            SellerAccountState status,
            boolean payoutsEnabled,
            boolean ready,
            @Nullable Instant updatedAt) {}

    /**
     * Result of an onboarding step.
     *
     * @param url where the seller continues (a provider page, or the return path when done)
     * @param account the account after this step
     */
    public record OnboardingView(String url, SellerAccountView account) {}

    /** {@code GET /me/seller-account}; refreshes a PENDING account from the provider. */
    @Transactional
    public SellerAccountView get(UUID me) {
        feature.requireFor(me);
        Optional<SellerAccountRow> row = accounts.find(me);
        if (row.isEmpty()) {
            return new SellerAccountView(
                    provider.providerId(), SellerAccountState.NOT_STARTED, false, false, null);
        }
        SellerAccountRow account = row.get();
        if (account.status() == SellerAccountState.PENDING
                && account.providerAccountId() != null
                && account.provider().equals(provider.providerId())) {
            try {
                SellerAccountStatus status = provider.sellerStatus(account.providerAccountId());
                if (status.status() != account.status()
                        || status.payoutsEnabled() != account.payoutsEnabled()) {
                    accounts.upsert(
                            me,
                            account.provider(),
                            account.providerAccountId(),
                            status.status(),
                            status.payoutsEnabled(),
                            now());
                    account = accounts.find(me).orElse(account);
                }
            } catch (PaymentProviderException e) {
                log.warn("Seller account refresh failed: {}", e.getMessage());
            }
        }
        return view(account);
    }

    /**
     * {@code POST /me/seller-account/onboarding}: starts or resumes the provider onboarding; an
     * ACTIVE account answers the return path at once. {@code returnUrl} must be a web path (400).
     */
    @Transactional
    public OnboardingView onboard(UUID me, @Nullable String rawReturnUrl) {
        feature.requireFor(me);
        String returnUrl =
                rawReturnUrl == null || rawReturnUrl.isBlank()
                        ? DEFAULT_RETURN_URL
                        : rawReturnUrl.trim();
        if (!WEB_PATH.matcher(returnUrl).matches()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "returnUrl", "must be a path of the web app, e.g. /settings")));
        }
        Optional<SellerAccountRow> existing = accounts.find(me);
        if (existing.isPresent() && existing.get().ready(provider.providerId())) {
            return new OnboardingView(returnUrl, view(existing.get()));
        }
        @Nullable String accountRef =
                existing.filter(row -> row.provider().equals(provider.providerId()))
                        .map(SellerAccountRow::providerAccountId)
                        .orElse(null);
        SellerOnboarding onboarding;
        try {
            onboarding = provider.onboardSeller(me, accountRef, returnUrl);
        } catch (PaymentProviderException e) {
            throw new ApiException(
                    ErrorCode.SERVICE_UNAVAILABLE,
                    "The payment provider is not reachable; try again later");
        }
        accounts.upsert(
                me,
                provider.providerId(),
                onboarding.accountRef(),
                onboarding.status(),
                onboarding.payoutsEnabled(),
                now());
        log.info("Seller onboarding for {}: {}", me, onboarding.status());
        return new OnboardingView(
                onboarding.url(),
                view(accounts.find(me).orElseThrow(() -> new IllegalStateException("upsert"))));
    }

    /** Whether payouts can be released to {@code sellerId} (buyers may pay). */
    @Transactional(readOnly = true)
    public boolean ready(UUID sellerId) {
        return accounts.find(sellerId).map(row -> row.ready(provider.providerId())).orElse(false);
    }

    /** The seller's account reference at the active provider, when ready. */
    @Transactional(readOnly = true)
    public Optional<String> readyAccountRef(UUID sellerId) {
        return accounts.find(sellerId)
                .filter(row -> row.ready(provider.providerId()))
                .map(SellerAccountRow::providerAccountId);
    }

    /** The provider reported a change of an account (webhook); false when unknown. */
    @Transactional
    public boolean providerUpdate(String accountRef, SellerAccountStatus status) {
        return accounts.updateByAccount(
                provider.providerId(), accountRef, status.status(), status.payoutsEnabled(), now());
    }

    /** The stored account of a seller (admin views, export). */
    @Transactional(readOnly = true)
    public Optional<SellerAccountRow> find(UUID userId) {
        return accounts.find(userId);
    }

    private SellerAccountView view(SellerAccountRow row) {
        return new SellerAccountView(
                row.provider(),
                row.status(),
                row.payoutsEnabled(),
                row.ready(provider.providerId()),
                row.updatedAt());
    }

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }
}
