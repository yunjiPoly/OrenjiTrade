package com.orenjitrade.api.credits.infra;

import com.orenjitrade.api.credits.domain.CreditLedger;
import com.orenjitrade.api.credits.domain.CreditRows.CreditEntry;
import com.orenjitrade.api.credits.domain.CreditRows.Redemption;
import com.orenjitrade.api.credits.domain.ReferralService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The credits module's account-data extensions: the export section {@code credits} (balance, every
 * ledger entry of the account without admin notes, the referral code and redemptions) and the
 * deletion participant (the referral code is deleted; the append-only ledger stays attached to the
 * anonymised account, as the deletion framework keeps ledgers).
 */
@Configuration(proxyBeanMethods = false)
public class CreditsExtensions {

    @Bean
    @Order(491)
    ExportContributor creditsExportContributor(CreditLedger ledger, ReferralService referrals) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "credits";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                List<CreditEntry> entries = ledger.all(userId);
                List<Redemption> redemptions = referrals.involving(userId);
                @Nullable String code = referrals.codeOf(userId).orElse(null);
                if (entries.isEmpty() && redemptions.isEmpty() && code == null) {
                    return null;
                }
                Map<String, Object> section = new LinkedHashMap<>();
                section.put("balance", ledger.balanceNow(userId));
                section.put("entries", entries.stream().map(CreditsExtensions::exported).toList());
                if (code != null) {
                    section.put("referralCode", code);
                }
                section.put(
                        "referrals",
                        redemptions.stream()
                                .map(
                                        redemption ->
                                                Map.of(
                                                        "role",
                                                        redemption.refereeId().equals(userId)
                                                                ? "REFEREE"
                                                                : "REFERRER",
                                                        "createdAt",
                                                        redemption.createdAt().toString()))
                                .toList());
                return section;
            }
        };
    }

    @Bean
    @Order(491)
    DeletionParticipant creditsDeletionParticipant(ReferralService referrals) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "credits";
            }

            @Override
            public void purge(UUID userId) {
                referrals.purge(userId);
            }
        };
    }

    static Map<String, Object> exported(CreditEntry entry) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", entry.id().toString());
        result.put("amount", entry.amount());
        result.put("balanceAfter", entry.balanceAfter());
        result.put("type", entry.type().name());
        result.put("reason", entry.reason());
        result.put("createdAt", entry.createdAt().toString());
        return result;
    }
}
