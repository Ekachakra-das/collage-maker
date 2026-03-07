# Collage Maker

A professional, private, and powerful photo collage editor that works in your browser and as a desktop application.

## Key Features

- **Multiple Layout Types**: Supports horizontal, vertical, and custom grid layouts.
- **Dynamic Configuration**: Adjust rows, columns, spacing, and corner radius in real-time.
- **Privacy First**: All processing happens locally. No photos are uploaded to any server.
- **Premium Design**: Modern, responsive interface with a dark mode aesthetic and smooth micro-interactions.
- **High-Quality Export**: Download your creations as high-resolution PNG files.
- **Cross-Platform**: Web version for quick access and a macOS desktop version for a native experience.

## Usage

### Web Version
Simply open `index.html` in any modern browser.

### Desktop Version (macOS)
Requires Python 3, `pywebview`, and `Pillow`.

```bash
# Install dependencies
pip install pywebview Pillow

# Run the app
python3 CollageMaker_App(macOS)/app.py
```

## Build & Development

The project includes a `Makefile` for common tasks:

- `make run-web`: Open the web version in your default browser.
- `make run-app`: Run the macOS desktop application.
- `make help`: Show available commands.
