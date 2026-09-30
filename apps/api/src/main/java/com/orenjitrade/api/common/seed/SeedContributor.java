package com.orenjitrade.api.common.seed;

/**
 * One idempotent step of the local/dev seed. Modules register a bean per data set (accounts,
 * profiles, locations, catalog, ...); {@link SeedDataRunner} runs them ordered by {@link #order()}.
 * Implementations must be safe to run repeatedly (upserts keyed by stable ids).
 */
public interface SeedContributor {

    /** Accounts first, then everything that references them. */
    int ORDER_ACCOUNTS = 100;

    int ORDER_IDENTITIES = 150;
    int ORDER_PROFILES = 200;
    int ORDER_LOCATIONS = 300;
    int ORDER_CATALOG = 400;
    int ORDER_INVENTORY = 500;
    int ORDER_INTERACTIONS = 600;

    /** Short name for logs. */
    String name();

    int order();

    void seed();
}
