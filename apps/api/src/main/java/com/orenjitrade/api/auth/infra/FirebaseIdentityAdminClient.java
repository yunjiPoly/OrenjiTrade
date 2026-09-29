package com.orenjitrade.api.auth.infra;

import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import com.orenjitrade.api.auth.domain.IdentityAdminClient;
import com.orenjitrade.api.auth.domain.IdentityAdminException;
import com.orenjitrade.api.auth.domain.IdentityUserCreation;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Firebase Admin SDK implementation of {@link IdentityAdminClient}. */
@Component
@Profile("!test")
public class FirebaseIdentityAdminClient implements IdentityAdminClient {

    private final FirebaseAuth firebaseAuth;

    public FirebaseIdentityAdminClient(FirebaseAuth firebaseAuth) {
        this.firebaseAuth = firebaseAuth;
    }

    @Override
    public void disableUser(String providerUid) {
        setDisabled(providerUid, true);
        try {
            firebaseAuth.revokeRefreshTokens(providerUid);
        } catch (FirebaseAuthException e) {
            throw new IdentityAdminException("Could not revoke sessions of " + providerUid, e);
        }
    }

    @Override
    public void enableUser(String providerUid) {
        setDisabled(providerUid, false);
    }

    @Override
    public void revokeSessions(String providerUid) {
        try {
            firebaseAuth.revokeRefreshTokens(providerUid);
        } catch (FirebaseAuthException e) {
            if (e.getAuthErrorCode() == AuthErrorCode.USER_NOT_FOUND) {
                return;
            }
            throw new IdentityAdminException("Could not revoke sessions of " + providerUid, e);
        }
    }

    @Override
    public void deleteUser(String providerUid) {
        try {
            firebaseAuth.deleteUser(providerUid);
        } catch (FirebaseAuthException e) {
            if (e.getAuthErrorCode() == AuthErrorCode.USER_NOT_FOUND) {
                return;
            }
            throw new IdentityAdminException("Could not delete identity " + providerUid, e);
        }
    }

    @Override
    public boolean createUser(IdentityUserCreation user) {
        UserRecord.CreateRequest request =
                new UserRecord.CreateRequest()
                        .setUid(user.providerUid())
                        .setEmail(user.email())
                        .setEmailVerified(user.emailVerified())
                        .setPassword(user.password());
        if (user.displayName() != null) {
            request.setDisplayName(user.displayName());
        }
        try {
            firebaseAuth.createUser(request);
            return true;
        } catch (FirebaseAuthException e) {
            if (e.getAuthErrorCode() == AuthErrorCode.UID_ALREADY_EXISTS
                    || e.getAuthErrorCode() == AuthErrorCode.EMAIL_ALREADY_EXISTS) {
                return false;
            }
            throw new IdentityAdminException("Could not create identity " + user.providerUid(), e);
        }
    }

    private void setDisabled(String providerUid, boolean disabled) {
        try {
            firebaseAuth.updateUser(
                    new UserRecord.UpdateRequest(providerUid).setDisabled(disabled));
        } catch (FirebaseAuthException e) {
            throw new IdentityAdminException(
                    (disabled ? "Could not disable identity " : "Could not enable identity ")
                            + providerUid,
                    e);
        }
    }
}
