package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.auth.domain.AccountResolver;
import com.orenjitrade.api.auth.domain.ResolvedAccount;
import com.orenjitrade.api.auth.domain.VerifiedIdentity;
import com.orenjitrade.api.users.domain.IdentityClaims;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Users-module implementation of the auth module's {@link AccountResolver} SPI. */
@Component
public class AccountResolverAdapter implements AccountResolver {

    private final UserAccountService userAccountService;

    public AccountResolverAdapter(UserAccountService userAccountService) {
        this.userAccountService = userAccountService;
    }

    @Override
    public ResolvedAccount resolve(VerifiedIdentity identity) {
        UserAccountSnapshot account =
                userAccountService.resolve(
                        new IdentityClaims(
                                identity.providerUid(),
                                identity.email(),
                                identity.emailVerified(),
                                identity.displayName()));
        return new ResolvedAccount(
                account.id(),
                account.handle(),
                account.email(),
                account.emailVerified(),
                account.status(),
                account.suspendedUntil(),
                account.roles());
    }

    @Override
    public void recordActivity(UUID userId) {
        userAccountService.touchLastActive(userId);
    }
}
