import struct, zlib, os

def make_png(path, size, bg=(99, 91, 255), fg=(255, 255, 255)):
    w = h = size
    rows = []
    cx, cy = w / 2, h / 2
    r_outer = w * 0.46
    for y in range(h):
        row = bytearray()
        row.append(0)  # filter type 0
        for x in range(w):
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist > r_outer:
                # transparent-ish background outside circle -> just bg fade
                t = min(1.0, (dist - r_outer) / 6)
                r = int(bg[0] * (1 - t) + 245 * t)
                g = int(bg[1] * (1 - t) + 245 * t)
                b = int(bg[2] * (1 - t) + 250 * t)
                row += bytes((r, g, b))
                continue
            # gradient background circle
            grad = (y / h)
            r = int(bg[0] * (1 - grad) + 140 * grad)
            g = int(bg[1] * (1 - grad) + 110 * grad)
            b = int(bg[2] * (1 - grad) + 255 * grad)
            # draw a simple checkmark shape
            px, py = x / w, y / h
            on_check = False
            # checkmark polyline approx
            if 0.28 < px < 0.46 and 0.48 < py < 0.68:
                seg = (py - 0.48) / (0.68 - 0.48)
                target_x = 0.28 + seg * (0.46 - 0.28)
                if abs(px - target_x) < 0.045:
                    on_check = True
            if 0.44 < px < 0.74 and 0.28 < py < 0.62:
                seg = (px - 0.44) / (0.74 - 0.44)
                target_y = 0.62 - seg * (0.62 - 0.28)
                if abs(py - target_y) < 0.045:
                    on_check = True
            if on_check:
                row += bytes(fg)
            else:
                row += bytes((r, g, b))
        rows.append(bytes(row))
    raw = b"".join(rows)
    comp = zlib.compress(raw, 9)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

out_dir = os.path.dirname(os.path.abspath(__file__))
icons_dir = os.path.join(out_dir, "icons")
os.makedirs(icons_dir, exist_ok=True)
for size in [180, 192, 256, 384, 512]:
    make_png(os.path.join(icons_dir, f"icon-{size}.png"), size)
print("done")
