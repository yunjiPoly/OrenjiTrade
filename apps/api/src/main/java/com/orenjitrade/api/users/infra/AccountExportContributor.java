package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.users.domain.AccountDeletionService;
import com.orenjitrade.api.users.domain.ConsentService;
import com.orenjitrade.api.users.domain.ExportContributor;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Export sections of the users module: {@code account} (identity attributes, roles, plan), {@code
 * consents} and {@code deletionRequests}. The provider uid is internal and not exported.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AccountExportContributor implements ExportContributor {

    private final UserAccountService userAccountService;
    private final ConsentService consentService;
    private final AccountDeletionService accountDeletionService;

    public AccountExportContributor(
            UserAccountService userAccountService,
            ConsentService consentService,
            AccountDeletionService accountDeletionService) {
        this.userAccountService = userAccountService;
        this.consentService = consentService;
        this.accountDeletionService = accountDeletionService;
    }

    @Override
    public String section() {
        return "account";
    }

    @Override
    public @Nullable Object export(UUID userId) {
        @Nullable UserAccountSnapshot account =
                userAccountService.findSnapshot(userId).orElse(null);
        if (account == null) {
            return null;
        }
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("id", account.id());
        data.put("handle", account.handle());
        data.put("displayName", account.displayName());
        data.put("email", account.email());
        data.put("emailVerified", account.emailVerified());
        data.put("roles", account.roles().stream().map(Enum::name).sorted().toList());
        data.put("status", account.status().name());
        data.put("plan", account.planCode());
        data.put("createdAt", account.createdAt());
        data.put("lastActiveAt", account.lastActiveAt());
        data.put("consents", consentService.consentsOf(userId));
        data.put(
                "deletionRequests",
                accountDeletionService.requestsOf(userId).stream()
                        .map(
                                request -> {
                                    Map<String, @Nullable Object> row = new LinkedHashMap<>();
                                    row.put("id", request.id());
                                    row.put("status", request.status().name());
                                    row.put("reason", request.reason());
                                    row.put("requestedAt", request.requestedAt());
                                    row.put("scheduledFor", request.scheduledFor());
                                    row.put("cancelledAt", request.cancelledAt());
                                    return row;
                                })
                        .toList());
        return data;
    }
}
