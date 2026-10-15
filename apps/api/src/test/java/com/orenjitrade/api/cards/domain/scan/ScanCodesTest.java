package com.orenjitrade.api.cards.domain.scan;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** The code cleaning, the exact forms, the look-alike variants and the language of a code read. */
class ScanCodesTest {

    @Test
    void cleaningUpperCasesRemovesSpacesAndReadsDashLookAlikesAsADash() {
        assertThat(ScanCodes.clean("zacr-en036")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean(" ZACR - EN 036 ")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("ZACR–EN036")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("ZACR—EN036")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("ZACR_EN036")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("ZACR.EN036")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("ZACR~EN036")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("ZACR--EN036")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("-ZACR-EN036-")).isEqualTo("ZACR-EN036");
        assertThat(ScanCodes.clean("ZACR-EN036*'")).isEqualTo("ZACR-EN036");
        // Letters and digits are never swapped here: the catalog decides.
        assertThat(ScanCodes.clean("ZAO1-ENO75")).isEqualTo("ZAO1-ENO75");
        assertThat(ScanCodes.clean("  ")).isEmpty();
    }

    @Test
    void theExactFormsAreTheReadAMissingDashAndTheOtherFormOfAnOldCode() {
        // Any EN code may be the European form of an old code: its other form is looked up too.
        assertThat(ScanCodes.exactForms("ZACR-EN036")).containsExactly("ZACR-EN036", "ZACR-036");
        // Old North American prints have no region; old Europe prints have E.
        assertThat(ScanCodes.exactForms("ZOB-005")).containsExactly("ZOB-005", "ZOB-EN005");
        assertThat(ScanCodes.exactForms("ZOB-EN005")).containsExactly("ZOB-EN005", "ZOB-005");
        assertThat(ScanCodes.exactForms("ZOB-E001")).containsExactly("ZOB-E001", "ZOB-EN001");
        // A missing dash at each place it could go, English-shaped places first.
        assertThat(ScanCodes.exactForms("ZACREN036"))
                .startsWith("ZACR-EN036")
                .contains("ZACRE-N036", "ZA-CREN036", "ZAC-REN036");
        assertThat(ScanCodes.exactForms("ZOB005")).startsWith("ZOB-005", "ZOB-EN005");
        // Several dashes: one of them kept.
        assertThat(ScanCodes.exactForms("ZACR-EN-036")).startsWith("ZACR-EN036");
        assertThat(ScanCodes.exactForms("ZAVD-ENS08")).containsExactly("ZAVD-ENS08");
        assertThat(ScanCodes.exactForms("ATK")).isEmpty();
        assertThat(ScanCodes.exactForms("")).isEmpty();
        assertThat(ScanCodes.exactForms("X".repeat(30))).isEmpty();
    }

    @Test
    void anotherLanguagesRegionIsRecognisedButAnEnglishReadingWinsWithoutADash() {
        assertThat(ScanCodes.otherLanguage("ZACR-FR036")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZACR-DE036")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZACR-IT036")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZACR-SP036")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZACR-PT036")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZACR-FRO36")).as("a misread digit").isTrue();
        assertThat(ScanCodes.otherLanguage("ZOB-F001")).as("old French").isTrue();
        assertThat(ScanCodes.otherLanguage("ZOB-G001")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZOB-S001")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZACRFR036")).isTrue();
        assertThat(ScanCodes.otherLanguage("ZACR-EN036")).isFalse();
        assertThat(ScanCodes.otherLanguage("ZOB-E001")).isFalse();
        assertThat(ScanCodes.otherLanguage("ZOB-005")).isFalse();
        assertThat(ScanCodes.otherLanguage("ZAVD-ENS08")).isFalse();
        // ZM-DE001 would be German, ZMD-E001 is an old English Europe print.
        assertThat(ScanCodes.otherLanguage("ZMDE001")).isFalse();
        assertThat(ScanCodes.isEnglish("ZACR-EN036")).isTrue();
        assertThat(ScanCodes.isEnglish("ZOB-S001")).isFalse();
        assertThat(ScanCodes.isEnglish("ZACR-FR036")).isFalse();
    }

    @Test
    void lookAlikesSwapLettersToDigitsInTheNumberAndBothWaysInTheSetPartFewestFirst() {
        List<String> variants =
                ScanCodes.lookAlikes(ScanCodes.exactForms("ZAO1-ENO75")).stream()
                        .map(ScanCodes.Variant::code)
                        .toList();
        assertThat(variants).contains("ZA01-EN075", "ZAO1-EN075", "ZA01-ENO75");
        assertThat(ScanCodes.lookAlikes(ScanCodes.exactForms("ZAO1-ENO75")))
                .filteredOn(variant -> variant.code().equals("ZA01-EN075"))
                .singleElement()
                .satisfies(variant -> assertThat(variant.swaps()).isEqualTo(2));
        assertThat(variants.indexOf("ZAO1-EN075")).isLessThan(variants.indexOf("ZA01-EN075"));

        // O/0, I/1, L/1, S/5, B/8, Z/2, G/6 and D/0 in the number part.
        assertThat(codes("ZACR-EN03G")).contains("ZACR-EN036");
        assertThat(codes("ZACR-ENO3B")).contains("ZACR-EN038");
        assertThat(codes("ZDK-OOI")).contains("ZDK-001", "ZDK-EN001");
        assertThat(codes("ZDK-0DL")).contains("ZDK-001");
        assertThat(codes("ZP2Z-EN1S6")).contains("ZP22-EN156");
        // The letter before the digits may stay a letter (ZAVD-ENS08) or be a misread digit.
        assertThat(codes("ZAVD-ENSO8")).contains("ZAVD-ENS08", "ZAVD-EN508");
        // Digits become letters in the region.
        assertThat(codes("ZOB-3001")).isEmpty();
        assertThat(codes("ZD5-EN001")).contains("ZDS-EN001", "Z05-EN001", "2D5-EN001");
        // A variant of an old code brings its other form.
        assertThat(codes("ZOB-OO5")).contains("ZOB-005", "ZOB-EN005");
        // The read itself is no variant; another language never is one.
        assertThat(codes("ZACR-EN036")).doesNotContain("ZACR-EN036");
        assertThat(codes("ZOB-500I")).noneMatch(ScanCodes::isOtherLanguage);
    }

    @Test
    void atMost64VariantsPerCodeRead() {
        List<ScanCodes.Variant> variants = ScanCodes.lookAlikes(ScanCodes.exactForms("B0O1-OIS8"));
        assertThat(variants).hasSize(ScanCodes.MAX_LOOK_ALIKES);
        assertThat(variants)
                .isSortedAccordingTo(java.util.Comparator.comparingInt(ScanCodes.Variant::swaps));
        assertThat(variants.stream().map(ScanCodes.Variant::code).distinct()).hasSize(64);
    }

    @Test
    void neighboursAreOneLookAlikeCharacterAwayTheWiderLookAlikesIncluded() {
        List<String> neighbours = ScanCodes.neighbours(ScanCodes.exactForms("ZACR-EN038"));
        assertThat(neighbours).contains("ZACR-EN036", "ZACR-EN033", "ZACR-EN088");
        assertThat(neighbours).doesNotContain("ZACR-EN038");
        assertThat(ScanCodes.neighbours(ScanCodes.exactForms("ZA01-EN075")))
                .contains("ZA0I-EN075", "ZAO1-EN075", "ZA07-EN075", "ZA01-EN875", "ZA01-EN015");
        assertThat(ScanCodes.neighbours(ScanCodes.exactForms("ZA01-EN075")))
                .hasSizeLessThanOrEqualTo(ScanCodes.MAX_NEIGHBOURS);

        assertThat(ScanCodes.oneLookAlikeApart("ZACR-EN036", "ZACR-EN038")).isTrue();
        assertThat(ScanCodes.oneLookAlikeApart("ZACR-EN036", "ZACR-EN03G")).isTrue();
        assertThat(ScanCodes.oneLookAlikeApart("ZA01-EN075", "ZA01-EN015")).isTrue();
        assertThat(ScanCodes.oneLookAlikeApart("ZACR-EN036", "ZACR-EN037")).isFalse();
        assertThat(ScanCodes.oneLookAlikeApart("ZACR-EN036", "ZACR-EN088")).isFalse();
        assertThat(ScanCodes.oneLookAlikeApart("ZACR-EN036", "ZACR-EN036")).isFalse();
        assertThat(ScanCodes.oneLookAlikeApart("ZACR-EN036", "ZACR-EN0366")).isFalse();
    }

    private static List<String> codes(String cleaned) {
        return ScanCodes.lookAlikes(ScanCodes.exactForms(cleaned)).stream()
                .map(ScanCodes.Variant::code)
                .toList();
    }
}
