package com.orenjitrade.api.admin.domain;

import com.orenjitrade.api.users.domain.AccountDeletionService;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Supplies the pending deletion request of {@code GET /api/v1/admin/users/{id}} from the users
 * module's deletion framework (kept in the admin module so users never depends on admin).
 */
@Component
public class DeletionRequestDetailContributor implements AdminUserDetailContributor {

    private final AccountDeletionService accountDeletionService;

    public DeletionRequestDetailContributor(AccountDeletionService accountDeletionService) {
        this.accountDeletionService = accountDeletionService;
    }

    @Override
    public @Nullable DeletionRequestSummary deletionRequest(UUID userId) {
        return accountDeletionService
                .activeRequestOf(userId)
                .map(
                        request ->
                                new DeletionRequestSummary(
                                        request.id(),
                                        request.status().name(),
                                        request.requestedAt(),
                                        request.scheduledFor()))
                .orElse(null);
    }
}
