package com.orenjitrade.api.binders.domain;

import java.util.List;

/**
 * What a binder shows of itself in lists and on its page (stage R3): its photos, up to three
 * preview pictures and, for a deck core, its key cards.
 *
 * @param photos the binder's photos in order (in public views only a deck core's)
 * @param previewImages up to {@value BinderService#PREVIEW_MAX} pictures: the first photo of a deck
 *     core that has one, otherwise the card pictures of its first items (in public views the cards
 *     buyers see: public ones, and every card of a public deck core)
 * @param keyCards a deck core's cards with their copies, most copies first (at most {@value
 *     BinderService#KEY_CARDS_MAX}; in public views every live card of the public deck core,
 *     whatever its own visibility); empty for other binders
 */
public record BinderShowcase(
        List<BinderPhoto> photos, List<String> previewImages, List<KeyCard> keyCards) {

    public static final BinderShowcase EMPTY = new BinderShowcase(List.of(), List.of(), List.of());

    public BinderShowcase {
        photos = List.copyOf(photos);
        previewImages = List.copyOf(previewImages);
        keyCards = List.copyOf(keyCards);
    }
}
