package com.orenjitrade.api.cards.infra.tcgdex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** TCGdex data files (TypeScript object literals) read as JSON without a JavaScript engine. */
class TsLiteralTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    private JsonNode read(String source) throws Exception {
        return mapper.readTree(TsLiteral.objectJson(source));
    }

    @Test
    void readsATcgdexCardFile() throws Exception {
        JsonNode card =
                read(
                        """
                        import { Card } from '../../../interfaces'
                        import Set from '../Zephyr Skies'

                        // a comment before the card
                        const card: Card = {
                        \tset: Set,
                        \tname: {
                        \t\ten: "Emberpup",
                        \t\tfr: 'Braisillon', /* block */
                        \t},
                        \thp: 70,
                        \tretreat: -1,
                        \tweight: 1.5e1,
                        \tdexId: [0x10, 1_000,],
                        \tattacks: [{ name: { en: `Ember "Nip"` }, damage: "30+" }],
                        \t'quoted key': true,
                        \t"other": null,
                        \tmissing: undefined,
                        \tnested: serie.id,
                        }

                        export default card
                        """);
        assertThat(card.path("set").isNull()).isTrue();
        assertThat(card.path("name").path("en").asString()).isEqualTo("Emberpup");
        assertThat(card.path("name").path("fr").asString()).isEqualTo("Braisillon");
        assertThat(card.path("hp").asInt()).isEqualTo(70);
        assertThat(card.path("retreat").asInt()).isEqualTo(-1);
        assertThat(card.path("weight").asDouble()).isEqualTo(15.0);
        assertThat(card.path("dexId").toString()).isEqualTo("[16,1000]");
        assertThat(card.path("attacks").path(0).path("name").path("en").asString())
                .isEqualTo("Ember \"Nip\"");
        assertThat(card.path("quoted key").asBoolean()).isTrue();
        assertThat(card.path("other").isNull()).isTrue();
        assertThat(card.path("missing").isNull()).isTrue();
        assertThat(card.path("nested").isNull()).isTrue();
    }

    @Test
    void keepsCommentMarksAndEscapesInsideStrings() throws Exception {
        JsonNode node =
                read(
                        """
                        const x = {
                          a: "1 {L} /* not a comment */ // nor this",
                          b: 'it\\'s \\u00e9\\x41\\u{1F525}',
                          c: "tab\\there",
                        }
                        """);
        assertThat(node.path("a").asString()).isEqualTo("1 {L} /* not a comment */ // nor this");
        assertThat(node.path("b").asString()).isEqualTo("it's éA🔥");
        assertThat(node.path("c").asString()).isEqualTo("tab\there");
    }

    @Test
    void readsAnExportDefaultLiteral() throws Exception {
        assertThat(read("export default {\n  id: 'tst',\n}\n").path("id").asString())
                .isEqualTo("tst");
    }

    @Test
    void refusesWhatIsNotAPlainLiteral() {
        assertThatThrownBy(() -> TsLiteral.objectJson("const card: Card = buildCard({ a: 1 })"))
                .isInstanceOf(TsLiteral.TsLiteralException.class);
        assertThatThrownBy(() -> TsLiteral.objectJson("const card = { ...base, a: 1 }"))
                .isInstanceOf(TsLiteral.TsLiteralException.class);
        assertThatThrownBy(() -> TsLiteral.objectJson("const card = { a: make(1) }"))
                .isInstanceOf(TsLiteral.TsLiteralException.class);
        assertThatThrownBy(() -> TsLiteral.objectJson("const card = { a: `x ${y}` }"))
                .isInstanceOf(TsLiteral.TsLiteralException.class);
        assertThatThrownBy(() -> TsLiteral.objectJson("const card = { a: \"open"))
                .isInstanceOf(TsLiteral.TsLiteralException.class);
        assertThatThrownBy(() -> TsLiteral.objectJson("const card = { a: 1"))
                .isInstanceOf(TsLiteral.TsLiteralException.class);
        assertThatThrownBy(() -> TsLiteral.objectJson("// nothing here"))
                .isInstanceOf(TsLiteral.TsLiteralException.class);
    }
}
