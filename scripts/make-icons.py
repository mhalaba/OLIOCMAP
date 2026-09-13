#!/usr/bin/env python3
"""Minimal PNG writer for PWA icons (no Pillow)."""
import struct, zlib, pathlib

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

def write_png(path, size, color, pad=0):
    r, g, b = color
    rows = []
    for y in range(size):
        row = b"\x00"
        for x in range(size):
            edge = pad
            if x < edge or y < edge or x >= size - edge or y >= size - edge:
                row += bytes([0xD7, 0x26, 0x3D, 0x00 if pad else 255])
                if pad:
                    row = row[:-4] + bytes([0xD7, 0x26, 0x3D, 0])
            else:
                row += bytes([r, g, b, 255])
        rows.append(row)
    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    pathlib.Path(path).write_bytes(data)

root = pathlib.Path(__file__).resolve().parents[1] / "web" / "public" / "icons"
root.mkdir(parents=True, exist_ok=True)
write_png(root / "icon-192.png", 192, (0xD7, 0x26, 0x3D), pad=0)
write_png(root / "icon-512.png", 512, (0xD7, 0x26, 0x3D), pad=0)
write_png(root / "maskable-192.png", 192, (0xD7, 0x26, 0x3D), pad=24)
write_png(root / "maskable-512.png", 512, (0xD7, 0x26, 0x3D), pad=64)
print("icons ok")
