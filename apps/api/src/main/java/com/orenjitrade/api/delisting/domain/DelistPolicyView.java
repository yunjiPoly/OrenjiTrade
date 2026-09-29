package com.orenjitrade.api.delisting.domain;

/**
 * A stored delist policy with its active flag (admin views).
 *
 * @param policy thresholds
 * @param active whether this is the policy the freshness job applies
 */
public record DelistPolicyView(FreshnessPolicy policy, boolean active) {}
