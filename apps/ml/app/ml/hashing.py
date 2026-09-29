"""Perceptual image hashes implemented with Pillow + numpy (no `imagehash` dependency).

Both hashes are 64-bit integers (8x8 bits). `dhash` compares horizontally adjacent pixels of a
9x8 grayscale thumbnail; `phash` keeps the low-frequency block of a 32x32 DCT. The Hamming
distance between two hashes approximates visual difference: 0 is identical, around 10 is a
near duplicate, and unrelated images typically score close to 32.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from PIL import Image

HASH_SIZE = 8
HASH_BITS = HASH_SIZE * HASH_SIZE
HEX_LENGTH = HASH_BITS // 4


def _grayscale(image: Image.Image, size: tuple[int, int]) -> NDArray[np.float64]:
    thumbnail = image.convert("L").resize(size, Image.Resampling.LANCZOS)
    return np.asarray(thumbnail, dtype=np.float64)


def _pack_bits(bits: NDArray[np.bool_]) -> int:
    value = 0
    for bit in bits.flatten():
        value = (value << 1) | int(bit)
    return value


def dhash(image: Image.Image, hash_size: int = HASH_SIZE) -> int:
    """Difference hash: gradient direction between horizontally adjacent pixels."""
    pixels = _grayscale(image, (hash_size + 1, hash_size))
    diff = pixels[:, 1:] > pixels[:, :-1]
    return _pack_bits(diff)


def _dct_matrix(size: int) -> NDArray[np.float64]:
    """Orthonormal DCT-II basis so that `basis @ block @ basis.T` is the 2-D DCT of `block`."""
    k = np.arange(size, dtype=np.float64)[:, None]
    n = np.arange(size, dtype=np.float64)[None, :]
    basis = np.cos(np.pi * (2.0 * n + 1.0) * k / (2.0 * size)) * np.sqrt(2.0 / size)
    basis[0, :] = 1.0 / np.sqrt(size)
    return basis


def phash(image: Image.Image, hash_size: int = HASH_SIZE, highfreq_factor: int = 4) -> int:
    """Perceptual hash: sign of low-frequency DCT coefficients relative to their median."""
    side = hash_size * highfreq_factor
    pixels = _grayscale(image, (side, side))
    basis = _dct_matrix(side)
    dct = basis @ pixels @ basis.T
    low = dct[:hash_size, :hash_size]
    median = float(np.median(low))
    return _pack_bits(low > median)


def hamming_distance(first: int, second: int) -> int:
    """Number of differing bits between two hashes."""
    return (first ^ second).bit_count()


def hash_to_hex(value: int, hash_size: int = HASH_SIZE) -> str:
    """Zero-padded lowercase hexadecimal representation (16 characters for 64 bits)."""
    return format(value, f"0{hash_size * hash_size // 4}x")


def hex_to_hash(text: str) -> int:
    """Parse the hexadecimal form produced by `hash_to_hex`."""
    cleaned = text.strip().lower()
    if len(cleaned) != HEX_LENGTH or any(ch not in "0123456789abcdef" for ch in cleaned):
        msg = f"expected {HEX_LENGTH} hexadecimal characters"
        raise ValueError(msg)
    return int(cleaned, 16)
