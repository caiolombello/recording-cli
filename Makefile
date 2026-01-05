SHELL := /bin/bash

APP_NAME := recording-cli
INSTALL_PREFIX ?= $(HOME)/.local
BIN_DIR := $(INSTALL_PREFIX)/bin
DIST_DIR := dist
ENTRY := $(DIST_DIR)/index.js

.PHONY: help install-deps install-cli install uninstall build

help:
	@echo "Targets:"
	@echo "  install-deps  Install system dependencies (Ubuntu)"
	@echo "  build         Build CLI into dist/"
	@echo "  install-cli   Install CLI shim into $(BIN_DIR)"
	@echo "  install       install-deps + install-cli"
	@echo "  uninstall     Remove CLI shim"

install-deps:
	sudo apt-get update
	sudo apt-get install -y ffmpeg wf-recorder libglib2.0-bin gstreamer1.0-pipewire gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav

build:
	bun build src/cli/index.ts --target=bun --outdir $(DIST_DIR)

install-cli: build
	mkdir -p $(BIN_DIR)
	@printf '%s\n' '#!/usr/bin/env bash' 'exec bun run "$(PWD)/$(ENTRY)" "$$@"' > $(BIN_DIR)/$(APP_NAME)
	chmod +x $(BIN_DIR)/$(APP_NAME)
	@echo "Installed $(APP_NAME) to $(BIN_DIR)/$(APP_NAME)"

install: install-deps install-cli

uninstall:
	rm -f $(BIN_DIR)/$(APP_NAME)
