.PHONY: all run-web run-app help

all: help

help:
	@echo "Available commands:"
	@echo "  make run-web   - Open the web version in the default browser"
	@echo "  make run-app   - Run the macOS desktop application"

run-web:
	open index.html

run-app:
	python3 "CollageMaker_App(macOS)/app.py"
