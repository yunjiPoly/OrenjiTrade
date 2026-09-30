package com.orenjitrade.api.credits.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Random;
import org.junit.jupiter.api.Test;

/** Referral code generation and normalisation. */
class ReferralCodesTest {

    @Test
    void codesUseAnUnambiguousAlphabet() {
        Random random = new Random(42);
        for (int i = 0; i < 200; i++) {
            String code = ReferralCodes.generate(random);
            assertThat(code).hasSize(ReferralCodes.LENGTH).doesNotContainAnyWhitespaces();
            assertThat(code.chars()).allMatch(c -> ReferralCodes.ALPHABET.indexOf(c) >= 0);
            assertThat(code).doesNotContain("0", "O", "1", "I", "L");
        }
    }

    @Test
    void inputIsNormalised() {
        assertThat(ReferralCodes.normalise(" k7m2-pq9x ")).contains("K7M2PQ9X");
        assertThat(ReferralCodes.normalise("collector1")).contains("COLLECTOR1");
        assertThat(ReferralCodes.normalise("abc")).isEmpty();
        assertThat(ReferralCodes.normalise("not a code!")).isEmpty();
        assertThat(ReferralCodes.normalise(null)).isEmpty();
    }
}
