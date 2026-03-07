#!/usr/bin/env python3
import sys
import os
import base64
import tempfile
import webview
from PIL import Image, ImageDraw


def add_rounded_corners_and_border(im, rad, border_width, border_color):
    w, h = im.size
    mask = Image.new('L', (w, h), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rectangle((rad, 0, w - rad, h), fill=255)
    draw_mask.rectangle((0, rad, w, h - rad), fill=255)
    draw_mask.pieslice((0, 0, rad * 2, rad * 2), 180, 270, fill=255)
    draw_mask.pieslice((w - rad * 2, 0, w, rad * 2), 270, 360, fill=255)
    draw_mask.pieslice((0, h - rad * 2, rad * 2, h), 90, 180, fill=255)
    draw_mask.pieslice((w - rad * 2, h - rad * 2, w, h), 0, 90, fill=255)
    im_rgba = im.convert("RGBA")
    im_rgba.putalpha(mask)

    border_img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border_img)
    bw = border_width
    if bw > 0:
        draw_border.rectangle((rad, 0, w - rad - 1, bw - 1), fill=border_color)
        draw_border.rectangle((rad, h - bw, w - rad - 1, h - 1), fill=border_color)
        draw_border.rectangle((0, rad, bw - 1, h - rad - 1), fill=border_color)
        draw_border.rectangle((w - bw, rad, w - 1, h - rad - 1), fill=border_color)
        if rad > 0:
            draw_border.arc((0, 0, rad * 2 - 1, rad * 2 - 1), 180, 270, fill=border_color, width=bw)
            draw_border.arc((w - rad * 2, 0, w - 1, rad * 2 - 1), 270, 360, fill=border_color, width=bw)
            draw_border.arc((0, h - rad * 2, rad * 2 - 1, h - 1), 90, 180, fill=border_color, width=bw)
            draw_border.arc((w - rad * 2, h - rad * 2, w - 1, h - 1), 0, 90, fill=border_color, width=bw)

    final = Image.alpha_composite(Image.new('RGBA', (w, h), (0, 0, 0, 0)), im_rgba)
    final = Image.alpha_composite(final, border_img)
    return final


def resize_to_height(img, target_h):
    w, h = img.size
    new_w = int(w * (target_h / h))
    return img.resize((new_w, target_h), Image.Resampling.LANCZOS)


def resize_to_width(img, target_w):
    w, h = img.size
    new_h = int(h * (target_w / w))
    return img.resize((target_w, new_h), Image.Resampling.LANCZOS)


def resize_to_fit(img, target_w, target_h):
    """Resize and crop to exactly (target_w, target_h)."""
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return img.crop((left, top, left + target_w, top + target_h))


class CollageBridge:
    def __init__(self):
        self.img_paths = {}   # slot(int) -> path
        self._last_collage = None

    def pick_image(self, slot):
        result = window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=('Image Files (*.png;*.jpg;*.jpeg;*.webp)', 'All Files (*.*)')
        )
        if result and len(result) > 0:
            path = result[0]
            self.img_paths[int(slot)] = path
            thumb_b64 = self._thumb_b64(path)
            return {"success": True, "path": path, "name": os.path.basename(path), "thumb": thumb_b64}
        return {"success": False}

    def _thumb_b64(self, path):
        img = Image.open(path).convert("RGB")
        img.thumbnail((300, 200))
        buf = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        img.save(buf.name, "JPEG", quality=80)
        with open(buf.name, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        os.unlink(buf.name)
        return "data:image/jpeg;base64," + data

    def generate_collage(self, settings):
        try:
            layout = settings.get("layout", "h")
            spacing = int(settings.get("spacing", 40))
            radius = int(settings.get("radius", 40))
            border_width = int(settings.get("borderWidth", 2))
            bg_hex = settings.get("bgColor", "#ffffff")
            br_hex = settings.get("borderColor", "#c8c8c8")
            bg = tuple(int(bg_hex.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
            br = tuple(int(br_hex.lstrip("#")[i:i+2], 16) for i in (0, 2, 4)) + (255,)

            # Determine slots based on layout
            if layout == 'grid':
                rows = int(settings.get("rows", 2))
                cols = int(settings.get("cols", 2))
                count = rows * cols
                required = list(range(1, count + 1))
            else:
                # h or v
                count = int(settings.get("count", 2))
                required = list(range(1, count + 1))

            missing = [s for s in required if s not in self.img_paths]
            if missing:
                return {"success": False, "error": f"Upload photo into slot #{missing[0]}"}

            imgs = {s: Image.open(self.img_paths[s]) for s in required}
            collage = None

            if layout == "h":
                # Variable photos side by side, same height (based on first img)
                h = imgs[1].height
                resized = {1: imgs[1]}
                for s in required[1:]:
                    resized[s] = resize_to_height(imgs[s], h)
                
                processed = {s: add_rounded_corners_and_border(resized[s], radius, border_width, br) for s in required}
                widths = [resized[s].width for s in required]
                total_w = sum(widths) + (len(required) + 1) * spacing
                total_h = h + 2 * spacing
                
                collage = Image.new('RGB', (total_w, total_h), bg)
                x = spacing
                for s in required:
                    collage.paste(processed[s], (x, spacing), processed[s])
                    x += widths[s-1] + spacing

            elif layout == "v":
                # Variable photos stacked vertically, same width (based on first img)
                w = imgs[1].width
                resized = {1: imgs[1]}
                for s in required[1:]:
                    resized[s] = resize_to_width(imgs[s], w)
                
                processed = {s: add_rounded_corners_and_border(resized[s], radius, border_width, br) for s in required}
                heights = [resized[s].height for s in required]
                total_w = w + 2 * spacing
                total_h = sum(heights) + (len(required) + 1) * spacing
                
                collage = Image.new('RGB', (total_w, total_h), bg)
                y = spacing
                for s in required:
                    collage.paste(processed[s], (spacing, y), processed[s])
                    y += heights[s-1] + spacing

            elif layout == "grid":
                # Dynamic grid MxN - cells fit to the first image dimensions
                cell_w = imgs[1].width
                cell_h = imgs[1].height
                resized = {s: resize_to_fit(imgs[s], cell_w, cell_h) for s in required}
                processed = {s: add_rounded_corners_and_border(resized[s], radius, border_width, br) for s in required}
                
                total_w = cols * cell_w + (cols + 1) * spacing
                total_h = rows * cell_h + (rows + 1) * spacing
                collage = Image.new('RGB', (total_w, total_h), bg)
                
                for i, s in enumerate(required):
                    r = i // cols
                    c = i % cols
                    x = spacing + c * (cell_w + spacing)
                    y = spacing + r * (cell_h + spacing)
                    collage.paste(processed[s], (x, y), processed[s])

            self._last_collage = collage

            preview = collage.copy()
            preview.thumbnail((900, 500))
            buf = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            preview.save(buf.name, "JPEG", quality=85)
            with open(buf.name, "rb") as f:
                data = base64.b64encode(f.read()).decode()
            os.unlink(buf.name)
            return {"success": True, "preview": "data:image/jpeg;base64," + data}

        except Exception as e:
            return {"success": False, "error": str(e)}

    def save_collage(self):
        if not self._last_collage:
            return {"success": False, "error": "Сначала создайте коллаж!"}
        result = window.create_file_dialog(webview.SAVE_DIALOG, save_filename="collage.png")
        if result:
            path = result if isinstance(result, str) else result[0]
            if not path.lower().endswith(".png"):
                path += ".png"
            self._last_collage.save(path)
            return {"success": True, "path": path}
        return {"success": False, "error": "Отменено"}


if __name__ == "__main__":
    bridge = CollageBridge()
    html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui.html")
    window = webview.create_window(
        "Collage Maker",
        html_path,
        js_api=bridge,
        width=860,
        height=680,
        min_size=(700, 560),
        background_color="#0f0f13"
    )
    webview.start(debug=False)
