package com.orenjitrade.api.payments.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentProvider.CreatePaymentRequest;
import com.orenjitrade.api.payments.domain.PaymentProvider.Money;
import com.orenjitrade.api.payments.domain.PaymentProvider.PayoutRequest;
import com.orenjitrade.api.payments.domain.PaymentProvider.ProtectedPayment;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookEvent;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookKind;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookSignatureException;
import com.orenjitrade.api.payments.domain.SellerAccountState;
import com.orenjitrade.api.payments.infra.FakePaymentProvider.SignedWebhook;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** The local fake provider: synthetic signed webhooks, onboarding, idempotent money calls. */
class FakePaymentProviderTest {

    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");

    private final FakePaymentProvider provider =
            new FakePaymentProvider(
                    new PaymentProperties.Fake("test-secret", "", Duration.ofMinutes(5)),
                    JsonMapper.builder().build(),
                    TimeProvider.fixed(NOW));

    private static Map<String, String> lower(Map<String, String> headers) {
        return Map.of(
                FakePaymentProvider.SIGNATURE_HEADER.toLowerCase(Locale.ROOT),
                headers.get(FakePaymentProvider.SIGNATURE_HEADER));
    }

    @Test
    void syntheticWebhooksVerifyAndReadBack() {
        SignedWebhook webhook =
                provider.syntheticEvent(
                        FakePaymentProvider.PAYMENT_SECURED, Map.of("paymentRef", "fake_pi_1"));
        WebhookEvent event = provider.parseWebhook(webhook.payload(), lower(webhook.headers()));
        assertThat(event.kind()).isEqualTo(WebhookKind.PAYMENT_SECURED);
        assertThat(event.type()).isEqualTo("payment.secured");
        assertThat(event.paymentRef()).isEqualTo("fake_pi_1");
        assertThat(event.providerEventId()).startsWith("evt_fake_");
        assertThat(event.occurredAt()).isEqualTo(NOW);

        SignedWebhook failed =
                provider.syntheticEvent(
                        FakePaymentProvider.PAYMENT_FAILED,
                        Map.of("paymentRef", "fake_pi_2", "failureCode", "card_declined"));
        WebhookEvent failure = provider.parseWebhook(failed.payload(), lower(failed.headers()));
        assertThat(failure.kind()).isEqualTo(WebhookKind.PAYMENT_FAILED);
        assertThat(failure.failureCode()).isEqualTo("card_declined");

        SignedWebhook account =
                provider.syntheticEvent(
                        FakePaymentProvider.ACCOUNT_UPDATED,
                        Map.of(
                                "accountRef",
                                "fake_acct_1",
                                "accountStatus",
                                "RESTRICTED",
                                "payoutsEnabled",
                                false));
        WebhookEvent updated = provider.parseWebhook(account.payload(), lower(account.headers()));
        assertThat(updated.kind()).isEqualTo(WebhookKind.SELLER_ACCOUNT_UPDATED);
        assertThat(updated.account()).isNotNull();
        assertThat(updated.account().status()).isEqualTo(SellerAccountState.RESTRICTED);
    }

    @Test
    void tamperedMissingAndForeignSignaturesAreRefused() {
        SignedWebhook webhook =
                provider.syntheticEvent(
                        FakePaymentProvider.PAYMENT_SECURED, Map.of("paymentRef", "fake_pi_1"));
        String tampered = webhook.payload().replace("fake_pi_1", "fake_pi_9");
        assertThatThrownBy(() -> provider.parseWebhook(tampered, lower(webhook.headers())))
                .isInstanceOf(WebhookSignatureException.class)
                .satisfies(
                        e ->
                                assertThat(((WebhookSignatureException) e).claimedType())
                                        .isEqualTo("payment.secured"));
        assertThatThrownBy(() -> provider.parseWebhook(webhook.payload(), Map.of()))
                .isInstanceOf(WebhookSignatureException.class);
        String foreign = WebhookSignatures.header("other-secret", NOW, webhook.payload());
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        webhook.payload(), Map.of("x-fake-signature", foreign)))
                .isInstanceOf(WebhookSignatureException.class);
        String stale =
                WebhookSignatures.header(
                        "test-secret", NOW.minus(Duration.ofMinutes(6)), webhook.payload());
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        webhook.payload(), Map.of("x-fake-signature", stale)))
                .isInstanceOf(WebhookSignatureException.class)
                .hasMessageContaining("tolerance");
    }

    @Test
    void onboardingIsImmediateAndMoneyCallsAreIdempotent() {
        var onboarding = provider.onboardSeller(UUID.randomUUID(), null, "/settings/payouts");
        assertThat(onboarding.status()).isEqualTo(SellerAccountState.ACTIVE);
        assertThat(onboarding.payoutsEnabled()).isTrue();
        assertThat(onboarding.url()).isEqualTo("/settings/payouts?onboarding=complete");
        assertThat(onboarding.accountRef()).startsWith("fake_acct_");

        UUID paymentId = UUID.randomUUID();
        ProtectedPayment payment =
                provider.createProtectedPayment(
                        new CreatePaymentRequest(
                                paymentId,
                                1,
                                UUID.randomUUID(),
                                UUID.randomUUID(),
                                onboarding.accountRef(),
                                new Money(new BigDecimal("40"), "cad"),
                                new Money(new BigDecimal("2"), "CAD"),
                                "test"));
        assertThat(payment.paymentRef()).startsWith("fake_pi_");
        assertThat(payment.checkoutUrl()).isEqualTo("/checkout/fake/" + payment.paymentRef());
        assertThat(payment.clientSecret()).isNull();

        PayoutRequest payout =
                new PayoutRequest(
                        paymentId,
                        payment.paymentRef(),
                        onboarding.accountRef(),
                        new Money(new BigDecimal("38"), "CAD"),
                        "trade_x");
        assertThat(provider.releasePayout(payout).payoutRef())
                .isEqualTo(provider.releasePayout(payout).payoutRef());
        Money refund = new Money(new BigDecimal("5"), "CAD");
        assertThat(provider.refund(payment.paymentRef(), refund, "x", "key-1").refundRef())
                .isEqualTo(provider.refund(payment.paymentRef(), refund, "x", "key-1").refundRef())
                .isNotEqualTo(
                        provider.refund(payment.paymentRef(), refund, "x", "key-2").refundRef());
        assertThat(provider.calls()).anyMatch(call -> call.startsWith("create:"));
        assertThat(new Money(new BigDecimal("40"), "cad").text()).isEqualTo("40.00 CAD");
    }
}
