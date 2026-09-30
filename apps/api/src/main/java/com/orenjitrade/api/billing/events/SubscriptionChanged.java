package com.orenjitrade.api.billing.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published in the transaction that changed a subscription's status (activation, renewal, past due,
 * cancellation, expiry). Carries statuses and the plan code only, never amounts or references.
 *
 * @param subscriptionId the subscription
 * @param userId the member
 * @param planCode the subscription's plan
 * @param event what happened ({@code ACTIVATED}, {@code RENEWED}, {@code PAYMENT_FAILED}, {@code
 *     CANCEL_REQUESTED}, {@code CANCELLED}, {@code EXPIRED})
 * @param status status after the change
 * @param occurredAt when
 */
public record SubscriptionChanged(
        UUID subscriptionId,
        UUID userId,
        String planCode,
        String event,
        String status,
        Instant occurredAt) {}
