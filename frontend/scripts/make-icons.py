import struct, zlib

def make_png(w, h, color):
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    raw = b''.join(b'\x00' + bytes([color[0], color[1], color[2], 255] * w) for _ in range(h))
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )

open('public/icon-192.png', 'wb').write(make_png(192, 192, [15, 23, 42]))
open('public/icon-512.png', 'wb').write(make_png(512, 512, [15, 23, 42]))
print("Icons created: public/icon-192.png, public/icon-512.png")
