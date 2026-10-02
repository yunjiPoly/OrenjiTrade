package com.orenjitrade.api.cards.infra.ygoprodeck;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * JSON shapes of the YGOPRODeck API v7 (only the fields OrenjiTrade maps; everything else is
 * ignored). Reference: https://ygoprodeck.com/api-guide/.
 */
final class YgoProDeckDtos {

    private YgoProDeckDtos() {}

    /** {@code checkDBVer.php}: a one-element array. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record DbVersion(
            @JsonProperty("database_version") @Nullable String databaseVersion,
            @JsonProperty("last_update") @Nullable String lastUpdate) {}

    /** {@code cardinfo.php}: {@code {"data": [...]}}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record CardInfo(@Nullable List<Card> data) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Card(
            long id,
            @Nullable String name,
            @Nullable String type,
            @Nullable String humanReadableCardType,
            @Nullable String frameType,
            @Nullable String desc,
            @Nullable String race,
            @Nullable Integer atk,
            @Nullable Integer def,
            @Nullable Integer level,
            @Nullable String attribute,
            @Nullable String archetype,
            @Nullable Integer linkval,
            @Nullable List<String> linkmarkers,
            @Nullable Integer scale,
            @Nullable List<String> typeline,
            @JsonProperty("card_images") @Nullable List<Image> cardImages,
            @JsonProperty("card_sets") @Nullable List<CardSet> cardSets,
            @JsonProperty("misc_info") @Nullable List<Misc> miscInfo) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Image(
            long id,
            @JsonProperty("image_url") @Nullable String imageUrl,
            @JsonProperty("image_url_small") @Nullable String imageUrlSmall,
            @JsonProperty("image_url_cropped") @Nullable String imageUrlCropped) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CardSet(
            @JsonProperty("set_name") @Nullable String setName,
            @JsonProperty("set_code") @Nullable String setCode,
            @JsonProperty("set_rarity") @Nullable String setRarity,
            @JsonProperty("set_rarity_code") @Nullable String setRarityCode,
            @JsonProperty("set_price") @Nullable String setPrice) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Misc(@JsonProperty("konami_id") @Nullable Long konamiId) {}

    /** {@code cardsets.php}: an array of sets (codes are not unique: products share codes). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record SetInfo(
            @JsonProperty("set_name") @Nullable String setName,
            @JsonProperty("set_code") @Nullable String setCode,
            @JsonProperty("num_of_cards") @Nullable Integer numOfCards,
            @JsonProperty("tcg_date") @Nullable String tcgDate) {}
}
