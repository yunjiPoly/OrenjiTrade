package com.orenjitrade.api.auth.domain;

/**
 * Administrative operations on the identity provider (Firebase Admin SDK in deployed environments,
 * a no-op under the {@code test} profile). Used when suspending accounts, deleting them and to seed
 * the local emulator.
 */
public interface IdentityAdminClient {

    /** Disables sign-in and revokes refresh tokens; ID tokens already issued expire within 1 h. */
    void disableUser(String providerUid);

    void enableUser(String providerUid);

    /**
     * Revokes every refresh token (signs the user out on every device) without disabling the
     * account: the user can sign in again, e.g. to cancel a pending account deletion.
     */
    void revokeSessions(String providerUid);

    /** Deletes the provider user; ignored when it does not exist. */
    void deleteUser(String providerUid);

    /**
     * Creates a user (seeding).
     *
     * @return {@code true} when created, {@code false} when a user with that uid or email already
     *     exists
     */
    boolean createUser(IdentityUserCreation user);
}
