package com.orenjitrade.api.reports.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The chat's shared details that staff never read (spec 15.8.4, web stage WH1). */
class SharedDetailTest {

    @Test
    void theChatTemplatesAreRecognisedEvenEdited() {
        assertThat(SharedDetail.of("Ship to:\nSam Tremblay\n12 rue des Cartes"))
                .isEqualTo(SharedDetail.SHIPPING_ADDRESS);
        assertThat(SharedDetail.of("  ship to :  12 Fictional Road"))
                .isEqualTo(SharedDetail.SHIPPING_ADDRESS);
        assertThat(SharedDetail.of("e-Transfer to sam@example.test"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        assertThat(SharedDetail.of("E-TRANSFER TO 514 555 0100"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        assertThat(SharedDetail.of("etransfer to sam@example.test"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
    }

    @Test
    void otherMessagesKeepTheirText() {
        assertThat(SharedDetail.of(null)).isNull();
        assertThat(SharedDetail.of("")).isNull();
        assertThat(SharedDetail.of("e-Transfer sent!")).isNull();
        assertThat(SharedDetail.of("Got your e-Transfer")).isNull();
        assertThat(SharedDetail.of("How much with shipping?")).isNull();
        assertThat(SharedDetail.of("I will ship to you tomorrow")).isNull();
        assertThat(SharedDetail.of("Shipping tomorrow with tracking")).isNull();
    }
}
