package com.orenjitrade.api.credits.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.credits.domain.CreditLedger.Append;
import com.orenjitrade.api.credits.domain.CreditRows.Redemption;
import com.orenjitrade.api.credits.infra.ReferralRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Referral codes (Phase 10 contract "OriEnji credits"): every account gets one shareable code on
 * first request; a new account may redeem one other account's code within {@code
 * credits.referral_max_account_age_days} of its creation, and both parties earn credits (EARN,
 * reason REFERRAL; {@code credits.referral_referrer_reward} / {@code
 * credits.referral_referee_reward}) once. Refusals are 409 REFERRAL_NOT_ALLOWED with a {@code
 * reason}; unknown codes 404.
 */
@Service
public class ReferralService {

    public static final String REASON_REFERRAL = "REFERRAL";
    public static final String REFERENCE_REFERRAL = "REFERRAL";

    static final int CODE_ATTEMPTS = 8;

    private final ReferralRepository repository;
    private final CreditLedger ledger;
    private final CreditSettings settings;
    private final UserAccountService accounts;
    private final TimeProvider timeProvider;

    public ReferralService(
            ReferralRepository repository,
            CreditLedger ledger,
            CreditSettings settings,
            UserAccountService accounts,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.ledger = ledger;
        this.settings = settings;
        this.accounts = accounts;
        this.timeProvider = timeProvider;
    }

    /**
     * The caller's referral programme state.
     *
     * @param code the caller's code
     * @param redemptions how many accounts redeemed it
     * @param referrerReward credits the caller earns per redemption
     * @param refereeReward credits a new account earns by redeeming a code
     * @param redeemed whether the caller already redeemed somebody's code
     * @param canRedeem whether the caller may still redeem a code (not redeemed, account young
     *     enough)
     * @param redeemBefore end of the caller's redemption window
     */
    public record ReferralView(
            String code,
            int redemptions,
            int referrerReward,
            int refereeReward,
            boolean redeemed,
            boolean canRedeem,
            Instant redeemBefore) {}

    /**
     * A redemption.
     *
     * @param redemptionId the redemption
     * @param reward credits the caller earned
     * @param referrerReward credits the code owner earned
     * @param balance the caller's balance afterwards
     */
    public record RedeemResult(UUID redemptionId, int reward, int referrerReward, long balance) {}

    @Transactional
    public ReferralView mine(UUID userId) {
        ledger.requireEnabled(userId);
        UserAccountSnapshot account = accounts.requireActive(userId);
        String code = repository.codeOf(userId).orElseGet(() -> create(userId));
        CreditSettings.Values values = settings.current();
        boolean redeemed = repository.redemptionOf(userId).isPresent();
        Instant redeemBefore = redeemBefore(account, values);
        return new ReferralView(
                code,
                repository.countRedemptions(userId),
                values.referrerReward(),
                values.refereeReward(),
                redeemed,
                !redeemed && timeProvider.now().isBefore(redeemBefore),
                redeemBefore);
    }

    /** Redeems another account's code for the caller (see the class comment for the rules). */
    @Transactional
    public RedeemResult redeem(AuthenticatedUser caller, String rawCode) {
        UUID userId = caller.userId();
        ledger.requireEnabled(userId);
        UserAccountSnapshot referee = accounts.requireActive(userId);
        String code =
                ReferralCodes.normalise(rawCode)
                        .orElseThrow(() -> ApiException.notFound("Unknown referral code"));
        UUID referrerId =
                repository
                        .ownerOf(code)
                        .orElseThrow(() -> ApiException.notFound("Unknown referral code"));
        if (referrerId.equals(userId)) {
            throw refused("SELF", "You cannot redeem your own referral code");
        }
        Optional<UserAccountSnapshot> referrer = accounts.findSnapshot(referrerId);
        if (referrer.isEmpty() || referrer.get().status() != AccountStatus.ACTIVE) {
            throw ApiException.notFound("Unknown referral code");
        }
        // Lock both ledgers in a stable order (no deadlock between concurrent redemptions).
        List<UUID> ordered =
                userId.compareTo(referrerId) < 0
                        ? List.of(userId, referrerId)
                        : List.of(referrerId, userId);
        ordered.forEach(ledger::lockAccount);
        if (repository.redemptionOf(userId).isPresent()) {
            throw refused("ALREADY_REDEEMED", "You already redeemed a referral code");
        }
        CreditSettings.Values values = settings.current();
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        if (!now.isBefore(redeemBefore(referee, values))) {
            throw refused(
                    "ACCOUNT_TOO_OLD",
                    "Referral codes can only be redeemed by new accounts within "
                            + values.maxAccountAgeDays()
                            + " days");
        }
        if (repository.countRedemptions(referrerId) >= values.maxPerReferrer()) {
            throw refused("REFERRER_LIMIT", "This referral code cannot be redeemed any more");
        }
        Redemption redemption =
                new Redemption(
                        UUID.randomUUID(),
                        referrerId,
                        userId,
                        code,
                        values.referrerReward(),
                        values.refereeReward(),
                        now);
        if (!repository.insertRedemption(redemption)) {
            throw refused("ALREADY_REDEEMED", "You already redeemed a referral code");
        }
        if (values.refereeReward() > 0) {
            ledger.append(entry(redemption, userId, values.refereeReward(), "referee"));
        }
        if (values.referrerReward() > 0) {
            ledger.append(entry(redemption, referrerId, values.referrerReward(), "referrer"));
        }
        return new RedeemResult(
                redemption.id(),
                values.refereeReward(),
                values.referrerReward(),
                ledger.balanceNow(userId));
    }

    /** Purge: the code stops working (redemptions stay for the other party's ledger). */
    @Transactional
    public void purge(UUID userId) {
        repository.deleteCode(userId);
    }

    /** Redemptions involving an account (export). */
    @Transactional(readOnly = true)
    public List<Redemption> involving(UUID userId) {
        return repository.involving(userId);
    }

    /** The account's code, if it has one (export). */
    @Transactional(readOnly = true)
    public Optional<String> codeOf(UUID userId) {
        return repository.codeOf(userId);
    }

    private String create(UUID userId) {
        Instant now = timeProvider.now();
        for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
            if (repository.insertCode(userId, ReferralCodes.generate(), now)) {
                break;
            }
            Optional<String> existing = repository.codeOf(userId);
            if (existing.isPresent()) {
                return existing.get();
            }
        }
        return repository
                .codeOf(userId)
                .orElseThrow(() -> new IllegalStateException("No referral code could be created"));
    }

    private static Append entry(Redemption redemption, UUID userId, int amount, String role) {
        return new Append(
                userId,
                amount,
                CreditEntryType.EARN,
                REASON_REFERRAL,
                REFERENCE_REFERRAL,
                redemption.id().toString(),
                "referral:" + redemption.id() + ":" + role,
                Map.of("role", role.toUpperCase(java.util.Locale.ROOT)),
                null,
                null);
    }

    private static Instant redeemBefore(UserAccountSnapshot account, CreditSettings.Values values) {
        return account.createdAt().plus(Duration.ofDays(values.maxAccountAgeDays()));
    }

    private static ApiException refused(String reason, String message) {
        return new ApiException(ErrorCode.REFERRAL_NOT_ALLOWED, message)
                .withProperty("reason", reason);
    }
}
