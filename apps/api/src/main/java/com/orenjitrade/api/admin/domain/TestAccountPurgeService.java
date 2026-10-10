package com.orenjitrade.api.admin.domain;

import com.orenjitrade.api.admin.infra.TestAccountPurgeRepository;
import com.orenjitrade.api.admin.infra.TestAccountPurgeRepository.Dependents;
import com.orenjitrade.api.admin.infra.TestAccountPurgeRepository.OpenTrade;
import com.orenjitrade.api.admin.infra.TestAccountPurgeRepository.TestAccount;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.profiles.domain.PrivacySettingsService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.trades.domain.TradeService;
import com.orenjitrade.api.users.domain.AccountDeletionService;
import com.orenjitrade.api.users.domain.DeletionRequestView;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Removes the fictional web E2E test accounts ({@code ...@example.test}) from a LOCAL database
 * through the existing account-deletion path, exactly like a real deletion (Phase 1 contract,
 * "Account deletion"): for each account a deletion request ({@link AccountDeletionService#request}:
 * blockers checked, off the map, sessions revoked, audited), then that request is processed at once
 * ({@link AccountDeletionService#processNow}: every {@code DeletionParticipant} purges its rows,
 * the account row is anonymised, the identity deleted; consents and audit kept). Open trades
 * between two test accounts are cancelled first (either party may cancel while AGREED or
 * AWAITING_PAYMENT); an account whose deletion stays blocked is at least taken off the map.
 *
 * <p>Only run by {@code TestAccountPurgeCommand} ({@code npm run e2e:purge}), which refuses
 * anything but a local/dev profile on the local stack. Never touches another domain.
 */
@Service
public class TestAccountPurgeService {

    /** Reason stored on the deletion requests and trade cancellations. */
    public static final String REASON = "Fictional E2E test account removed by npm run e2e:purge";

    private static final Set<String> CANCELLABLE_TRADES = Set.of("AGREED", "AWAITING_PAYMENT");
    private static final Logger log = LoggerFactory.getLogger(TestAccountPurgeService.class);

    private final TestAccountPurgeRepository repository;
    private final AccountDeletionService deletions;
    private final TradeService trades;
    private final PrivacySettingsService privacy;
    private final TimeProvider timeProvider;

    public TestAccountPurgeService(
            TestAccountPurgeRepository repository,
            AccountDeletionService deletions,
            TradeService trades,
            PrivacySettingsService privacy,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.deletions = deletions;
        this.trades = trades;
        this.privacy = privacy;
        this.timeProvider = timeProvider;
    }

    /** True only for an address of the web suites' test domain. */
    public static boolean isTestAccountEmail(String email) {
        String value = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        int at = value.lastIndexOf('@');
        return at > 0
                && value.substring(at + 1).equals(TestAccountPurgeRepository.TEST_EMAIL_DOMAIN);
    }

    /** An account that could not be deleted, and why. */
    public record Problem(String email, String reason) {}

    /**
     * Outcome of a purge.
     *
     * @param found test accounts found (not deleted yet)
     * @param deleted accounts deleted (anonymised) by this run
     * @param cancelledTrades open trades between two test accounts cancelled first
     * @param before what the found accounts owned before
     * @param after what they still own afterwards
     * @param blocked accounts whose deletion stays blocked (taken off the map)
     * @param failed accounts whose deletion failed
     * @param remaining test accounts still not deleted afterwards
     */
    public record PurgeReport(
            int found,
            int deleted,
            int cancelledTrades,
            Dependents before,
            Dependents after,
            List<Problem> blocked,
            List<Problem> failed,
            int remaining) {}

    /** The test accounts that a purge would remove, and what they own. */
    public record PurgePlan(int found, Dependents dependents) {}

    public PurgePlan plan() {
        List<TestAccount> accounts = testAccounts();
        return new PurgePlan(
                accounts.size(),
                repository.dependents(accounts.stream().map(TestAccount::id).toList()));
    }

    public PurgeReport purge() {
        List<TestAccount> accounts = testAccounts();
        List<UUID> ids = accounts.stream().map(TestAccount::id).toList();
        Set<UUID> candidates = Set.copyOf(ids);
        Dependents before = repository.dependents(ids);
        int deleted = 0;
        int cancelled = 0;
        List<Problem> blocked = new ArrayList<>();
        List<Problem> failed = new ArrayList<>();
        for (TestAccount account : accounts) {
            try {
                Optional<DeletionRequestView> pending = deletions.activeRequestOf(account.id());
                UUID requestId;
                if (pending.isPresent()) {
                    requestId = pending.get().id();
                } else {
                    cancelled += cancelTradesWithTestAccounts(account.id(), candidates);
                    requestId =
                            deletions.request(account.id(), timeProvider.now(), REASON, false).id();
                }
                if (deletions.processNow(requestId)) {
                    deleted++;
                } else {
                    failed.add(new Problem(account.email(), "deletion request no longer pending"));
                }
            } catch (ApiException e) {
                if (e.getErrorCode() == ErrorCode.DELETION_BLOCKED) {
                    blocked.add(new Problem(account.email(), blockersOf(e)));
                    hideFromMap(account.id());
                } else {
                    failed.add(new Problem(account.email(), e.getMessage()));
                }
            } catch (RuntimeException e) {
                log.warn("Test account purge failed for {}: {}", account.id(), e.toString());
                failed.add(new Problem(account.email(), e.getClass().getSimpleName()));
            }
        }
        Dependents after = repository.dependents(ids);
        return new PurgeReport(
                accounts.size(),
                deleted,
                cancelled,
                before,
                after,
                List.copyOf(blocked),
                List.copyOf(failed),
                testAccounts().size());
    }

    private List<TestAccount> testAccounts() {
        // The SQL already filters the domain; checked again so nothing else can ever be selected.
        return repository.testAccounts().stream()
                .filter(account -> isTestAccountEmail(account.email()))
                .collect(Collectors.toList());
    }

    private int cancelTradesWithTestAccounts(UUID accountId, Set<UUID> candidates) {
        int cancelled = 0;
        for (OpenTrade trade : repository.openTradesOf(accountId)) {
            if (!candidates.contains(trade.otherParty(accountId))
                    || !CANCELLABLE_TRADES.contains(trade.status())) {
                continue; // a trade with someone else, or past payment: the deletion stays blocked
            }
            try {
                trades.cancel(accountId, trade.id(), REASON);
                cancelled++;
            } catch (ApiException e) {
                log.info("Trade {} not cancelled: {}", trade.id(), e.getMessage());
            }
        }
        return cancelled;
    }

    private void hideFromMap(UUID accountId) {
        PrivacySettingsView current = privacy.settingsOf(accountId);
        if (current.discoverable()) {
            privacy.update(
                    accountId,
                    new PrivacySettingsView(
                            false,
                            current.showOnlineStatus(),
                            current.showLastActive(),
                            current.profileVisibility(),
                            current.messagingPermission(),
                            current.wishlistVisible(),
                            current.searchDiscoverable()));
        }
    }

    private static String blockersOf(ApiException e) {
        Object blockers = e.getProperties().get(AccountDeletionService.BLOCKERS);
        return blockers == null ? "blocked" : String.valueOf(blockers);
    }
}
