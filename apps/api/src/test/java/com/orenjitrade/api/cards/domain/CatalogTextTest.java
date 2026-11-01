package com.orenjitrade.api.cards.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Slugs, normalisation, printing codes and placeholder rendering. */
class CatalogTextTest {

    @Test
    void slugsAreAsciiDashedAndStable() {
        assertThat(CatalogText.slug("Azure-Eyes Sky Dragon")).isEqualTo("azure-eyes-sky-dragon");
        assertThat(CatalogText.slug("Chevalier Épée-Miroir")).isEqualTo("chevalier-epee-miroir");
        assertThat(CatalogText.slug("Monarch's Tempest Decree"))
                .isEqualTo("monarch-s-tempest-decree");
        assertThat(CatalogText.slug("Kaelen, Rift Warden")).isEqualTo("kaelen-rift-warden");
        assertThat(CatalogText.slug("  !!!  ")).isEqualTo("card");
        assertThat(CatalogText.slug("x".repeat(300))).hasSize(100);
        assertThat(CatalogText.slugWithSuffix("pétalune", 2)).isEqualTo("pétalune-2");
        assertThat(CatalogText.SLUG.matcher(CatalogText.slug("Émberfang Fox VMAX")).matches())
                .isTrue();
    }

    @Test
    void normalisationStripsAccentsAndCase() {
        assertThat(CatalogText.normalise("  Pétalune EX ")).isEqualTo("petalune ex");
        assertThat(CatalogText.normalise("Réquiem des Marées")).isEqualTo("requiem des marees");
        assertThat(CatalogText.escapeLike("50%_off\\")).isEqualTo("50\\%\\_off\\\\");
    }

    @Test
    void printingCodesAreRecognisedCaseInsensitively() {
        assertThat(CatalogText.asPrintingCode("azr-en001")).contains("AZR-EN001");
        assertThat(CatalogText.asPrintingCode(" TDX-001 ")).contains("TDX-001");
        assertThat(CatalogText.asPrintingCode("azure eyes")).isEmpty();
        assertThat(CatalogText.asPrintingCode("AZR-")).isEmpty();
        assertThat(CatalogText.asPrintingCode(null)).isEmpty();
        assertThat(CatalogText.asPrintingCodePrefix("azr-en0")).contains("AZR-EN0");
        assertThat(CatalogText.asPrintingCodePrefix("AZR-")).contains("AZR-");
        assertThat(CatalogText.asPrintingCodePrefix("azr")).isEmpty();
        assertThat(CatalogText.normalisePrintingCode(" lob-en001 ")).isEqualTo("LOB-EN001");
        assertThat(CatalogText.normalisePrintingCode("  ")).isNull();
    }

    /**
     * A code typed as the card prints it (stage R10, review fix 1, U2): a space for the dash, and a
     * padded number (Magic prints 0012; the catalogue's Magic code is ZTK-12) also read without its
     * zeros, the code as typed first.
     */
    @Test
    void codesTypedAsTheCardPrintsThem() {
        assertThat(CatalogText.printingCodeCandidates("ZTK-12", false)).containsExactly("ZTK-12");
        assertThat(CatalogText.printingCodeCandidates("ztk 12", false)).containsExactly("ZTK-12");
        assertThat(CatalogText.printingCodeCandidates(" ZTK  0012 ", false))
                .containsExactly("ZTK-0012", "ZTK-12");
        assertThat(CatalogText.printingCodeCandidates("ztk - 012", false))
                .containsExactly("ZTK-012", "ZTK-12");
        assertThat(CatalogText.printingCodeCandidates("ZTK-012P", false))
                .containsExactly("ZTK-012P", "ZTK-12P");
        assertThat(CatalogText.printingCodeCandidates("lob en001", false))
                .containsExactly("LOB-EN001");
        assertThat(CatalogText.printingCodeCandidates("ZSK-001", false))
                .containsExactly("ZSK-001", "ZSK-1");
        assertThat(CatalogText.printingCodeCandidates("ZTK-0", false)).containsExactly("ZTK-0");
        assertThat(CatalogText.printingCodeCandidates("ZTK-00", false))
                .containsExactly("ZTK-00", "ZTK-0");
        // Words are no code, and a code typed without a separator is not guessed.
        assertThat(CatalogText.printingCodeCandidates("Mew ex", false)).isEmpty();
        assertThat(CatalogText.printingCodeCandidates("ztk12", false)).isEmpty();
        assertThat(CatalogText.printingCodeCandidates("ZTK", false)).isEmpty();
        assertThat(CatalogText.printingCodeCandidates("ZTK 12 34", false)).isEmpty();
        assertThat(CatalogText.printingCodeCandidates(null, false)).isEmpty();
        // While typing.
        assertThat(CatalogText.printingCodePrefixCandidates("ztk 0")).containsExactly("ZTK-0");
        assertThat(CatalogText.printingCodePrefixCandidates("ztk 01"))
                .containsExactly("ZTK-01", "ZTK-1");
        assertThat(CatalogText.printingCodePrefixCandidates("AZR-")).containsExactly("AZR-");
        assertThat(CatalogText.printingCodePrefixCandidates("azr en0")).containsExactly("AZR-EN0");
        assertThat(CatalogText.printingCodePrefixCandidates("azr")).isEmpty();
        assertThat(CatalogText.printingCodePrefixCandidates("Mew ex")).isEmpty();
    }

    @Test
    void placeholderEscapesAndWraps() {
        String svg =
                PlaceholderSvgRenderer.render("pokemon", "Pokémon", "<Evil> & \"Quoted\" 'Card'");
        assertThat(svg).contains("&lt;Evil&gt; &amp;", "&quot;Quoted&quot;", "&apos;Card&apos;");
        assertThat(svg).doesNotContain("<Evil>");
        assertThat(PlaceholderSvgRenderer.wrap("Azure-Eyes Sky Dragon"))
                .containsExactly("Azure-Eyes Sky", "Dragon");
        assertThat(PlaceholderSvgRenderer.wrap("Supercalifragilisticexpialidocious"))
                .containsExactly("Supercalifragilis…");
        assertThat(
                        PlaceholderSvgRenderer.wrap(
                                        "a b c d e f g h i j k l m n o p q r s t u v w x y z a b c"
                                                + " d e f g h i j k l m n o p q r s t u v w x y z")
                                .size())
                .isEqualTo(PlaceholderSvgRenderer.MAX_LINES);
        assertThat(PlaceholderSvgRenderer.escape("tab\there\u0001")).isEqualTo("tab\there");
    }
}
