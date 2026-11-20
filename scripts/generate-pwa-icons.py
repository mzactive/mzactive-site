#!/usr/bin/env python3
"""Regenerate PWA icons from the original transparent gold MZ logo.

The logo is scaled uniformly and centred on the existing petrol-green brand
background. No paths, lettering or colours are redrawn.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/brand/mzactive-logo-gold.png"
BACKGROUND = (9, 29, 33, 255)
OUTPUTS = (
    ("assets/icons/icon-512.png", 512, 0.76),
    ("assets/icons/icon-192.png", 192, 0.76),
    ("assets/icons/apple-touch-icon-180.png", 180, 0.76),
    ("assets/icons/icon-maskable-512.png", 512, 0.60),
    ("assets/icons/icon-maskable-192.png", 192, 0.60),
)


def read_png(path: Path) -> tuple[int, int, bytearray]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    position, compressed = 8, bytearray()
    while position < len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        kind = data[position + 4:position + 8]
        chunk = data[position + 8:position + 8 + length]
        position += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, _, _, _ = struct.unpack(">IIBBBBB", chunk)
            assert depth == 8 and colour == 6, (path, depth, colour)
        elif kind == b"IDAT":
            compressed.extend(chunk)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(compressed)
    stride = width * 4
    pixels, previous, index = bytearray(), bytearray(stride), 0
    for _ in range(height):
        filter_type = raw[index]
        index += 1
        row = bytearray(raw[index:index + stride])
        index += stride
        for x in range(stride):
            left = row[x - 4] if x >= 4 else 0
            above = previous[x]
            upper_left = previous[x - 4] if x >= 4 else 0
            if filter_type == 1:
                row[x] = (row[x] + left) & 255
            elif filter_type == 2:
                row[x] = (row[x] + above) & 255
            elif filter_type == 3:
                row[x] = (row[x] + (left + above) // 2) & 255
            elif filter_type == 4:
                predictor = left + above - upper_left
                distances = (abs(predictor - left), abs(predictor - above), abs(predictor - upper_left))
                nearest = left if distances[0] <= distances[1] and distances[0] <= distances[2] else above if distances[1] <= distances[2] else upper_left
                row[x] = (row[x] + nearest) & 255
        pixels.extend(row)
        previous = row
    return width, height, pixels


def crop_to_content(width: int, height: int, pixels: bytearray) -> tuple[int, int, bytearray]:
    left, top, right, bottom = width, height, -1, -1
    for y in range(height):
        for x in range(width):
            if pixels[(y * width + x) * 4 + 3] > 8:
                left, top = min(left, x), min(top, y)
                right, bottom = max(right, x), max(bottom, y)
    assert right >= left and bottom >= top
    cropped = bytearray()
    for y in range(top, bottom + 1):
        start = (y * width + left) * 4
        cropped.extend(pixels[start:start + (right - left + 1) * 4])
    return right - left + 1, bottom - top + 1, cropped


def sample(width: int, height: int, pixels: bytearray, x: int, y: int) -> tuple[int, int, int, int]:
    index = (min(max(y, 0), height - 1) * width + min(max(x, 0), width - 1)) * 4
    return tuple(pixels[index:index + 4])


def scale_image(width: int, height: int, pixels: bytearray, target_width: int, target_height: int) -> bytearray:
    scaled = bytearray()
    for y in range(target_height):
        source_y = (y + 0.5) * height / target_height - 0.5
        y0, y1 = int(source_y), min(int(source_y) + 1, height - 1)
        fy = source_y - y0
        for x in range(target_width):
            source_x = (x + 0.5) * width / target_width - 0.5
            x0, x1 = int(source_x), min(int(source_x) + 1, width - 1)
            fx = source_x - x0
            channels = []
            for channel in range(4):
                top = sample(width, height, pixels, x0, y0)[channel] * (1 - fx) + sample(width, height, pixels, x1, y0)[channel] * fx
                bottom = sample(width, height, pixels, x0, y1)[channel] * (1 - fx) + sample(width, height, pixels, x1, y1)[channel] * fx
                channels.append(round(top * (1 - fy) + bottom * fy))
            scaled.extend(channels)
    return scaled


def write_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff)

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * width * 4:(y + 1) * width * 4])
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)


def main() -> None:
    source_width, source_height, source_pixels = read_png(SOURCE)
    logo_width, logo_height, logo_pixels = crop_to_content(source_width, source_height, source_pixels)
    for name, size, width_ratio in OUTPUTS:
        target_width = round(size * width_ratio)
        target_height = round(logo_height * target_width / logo_width)
        assert target_height < size, (name, target_width, target_height)
        logo = scale_image(logo_width, logo_height, logo_pixels, target_width, target_height)
        x_offset, y_offset = (size - target_width) // 2, (size - target_height) // 2
        canvas = bytearray(BACKGROUND * (size * size))
        for y in range(target_height):
            for x in range(target_width):
                source = (y * target_width + x) * 4
                destination = ((y + y_offset) * size + x + x_offset) * 4
                alpha = logo[source + 3] / 255
                for channel in range(3):
                    canvas[destination + channel] = round(logo[source + channel] * alpha + BACKGROUND[channel] * (1 - alpha))
                canvas[destination + 3] = 255
        write_png(ROOT / name, size, size, canvas)
        print(f"{name}: {size}x{size}, logo {target_width}x{target_height}")


if __name__ == "__main__":
    main()
