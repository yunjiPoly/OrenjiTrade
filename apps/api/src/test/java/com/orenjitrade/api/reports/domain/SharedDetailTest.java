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
    void theTemplatesAreRecognisedAfterTypedText() {
        // The phone's composer puts the detail after what is typed, on a line of its own.
        assertThat(SharedDetail.of("Great, thanks!\nShip to:\nRae Fictional\n88 Zq Avenue"))
                .isEqualTo(SharedDetail.SHIPPING_ADDRESS);
        assertThat(SharedDetail.of("Total is $20.\ne-Transfer to zqpay@example.test"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        assertThat(SharedDetail.of("Sure\r\ne-Transfer to zqpay@example.test"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        // A no-break space typed or pasted around the words.
        assertThat(SharedDetail.of("\u00a0Ship\u00a0to:\u00a012 Fictional Road"))
                .isEqualTo(SharedDetail.SHIPPING_ADDRESS);
        assertThat(SharedDetail.of("Ok!\n\u00a0e-Transfer\u00a0to zqpay@example.test"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        // The address line on the same line as other words.
        assertThat(SharedDetail.of("Thanks! Ship to: 12 Fictional Road"))
                .isEqualTo(SharedDetail.SHIPPING_ADDRESS);
    }

    @Test
    void anEmailOrAPhoneNumberBesideETransferOrInteracIsHidden() {
        assertThat(SharedDetail.of("Please send the e-Transfer to zqpay2@example.test, thanks"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        assertThat(SharedDetail.of("My Interac email is zqpay@example.test"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        assertThat(SharedDetail.of("etransfer: zqpay@example.test"))
                .isEqualTo(SharedDetail.ETRANSFER_EMAIL);
        assertThat(SharedDetail.of("You can e transfer 514-555-0100"))
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
        assertThat(SharedDetail.of("Total is $20.\nI will send the e-Transfer tonight")).isNull();
        assertThat(SharedDetail.of("Interac works for me, $35 shipped")).isNull();
        assertThat(SharedDetail.of("Write to me at zq@example.test")).isNull();
    }
}
