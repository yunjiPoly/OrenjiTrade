from __future__ import annotations

import pytest
from PIL import ImageDraw, ImageEnhance

from app.ml.hashing import (
    HASH_BITS,
    HEX_LENGTH,
    dhash,
    hamming_distance,
    hash_to_hex,
    hex_to_hash,
    phash,
)
from tests.helpers import gradient_image, patterned_image


def test_hashes_are_deterministic() -> None:
    image = patterned_image()

    assert dhash(image) == dhash(patterned_image()) == dhash(image.copy())
    assert phash(image) == phash(patterned_image()) == phash(image.copy())


def test_hashes_fit_in_64_bits() -> None:
    image = patterned_image(seed=5)

    assert 0 <= dhash(image) < 2**HASH_BITS
    assert 0 <= phash(image) < 2**HASH_BITS


def test_gradient_direction_flips_every_dhash_bit() -> None:
    assert dhash(gradient_image()) == 2**HASH_BITS - 1
    assert dhash(gradient_image(reverse=True)) == 0
    assert hamming_distance(dhash(gradient_image()), dhash(gradient_image(reverse=True))) == 64


def test_small_perturbation_gives_small_distance() -> None:
    original = patterned_image(size=(200, 280))
    perturbed = ImageEnhance.Brightness(original).enhance(1.08)
    ImageDraw.Draw(perturbed).rectangle([4, 4, 12, 12], fill=(255, 255, 255))

    assert hamming_distance(dhash(original), dhash(perturbed)) <= 6
    assert hamming_distance(phash(original), phash(perturbed)) <= 6


def test_rescaled_image_keeps_a_close_hash() -> None:
    original = patterned_image(size=(200, 280))
    smaller = original.resize((100, 140))

    assert hamming_distance(dhash(original), dhash(smaller)) <= 6
    assert hamming_distance(phash(original), phash(smaller)) <= 6


def test_different_images_are_far_apart() -> None:
    first = gradient_image()
    second = gradient_image(reverse=True)

    assert hamming_distance(dhash(first), dhash(second)) > 12
    assert hamming_distance(phash(first), phash(second)) > 12
    assert hamming_distance(dhash(patterned_image(seed=1)), dhash(patterned_image(seed=5))) > 12


def test_hamming_distance_counts_differing_bits() -> None:
    assert hamming_distance(0, 0) == 0
    assert hamming_distance(0b1011, 0b0010) == 2
    assert hamming_distance(0, 2**HASH_BITS - 1) == HASH_BITS


def test_hex_round_trip() -> None:
    value = dhash(patterned_image(seed=7))
    text = hash_to_hex(value)

    assert len(text) == HEX_LENGTH
    assert text == text.lower()
    assert hex_to_hash(text) == value
    assert hex_to_hash(text.upper()) == value
    assert hash_to_hex(0) == "0" * HEX_LENGTH


@pytest.mark.parametrize("text", ["", "abc", "g" * HEX_LENGTH, "0" * (HEX_LENGTH + 1)])
def test_hex_to_hash_rejects_malformed_input(text: str) -> None:
    with pytest.raises(ValueError, match="hexadecimal"):
        hex_to_hash(text)
