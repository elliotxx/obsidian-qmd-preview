.PHONY: help install build test lint package clean version release-build

VERSION_TYPE ?= patch

help:
	@echo "Available commands:"
	@echo "  make install              - Install dependencies"
	@echo "  make build                - Build plugin"
	@echo "  make test                 - Run tests"
	@echo "  make lint                 - Run linter"
	@echo "  make package              - Build release zip"
	@echo "  make clean                - Remove generated artifacts"
	@echo "  make version TYPE=patch   - Bump version"
	@echo "  make release-build        - Build release artifact"

install:
	npm install

build:
	npm run build

test:
	npm test

lint:
	npm run lint

package:
	npm run package

clean:
	rm -rf main.js release

version:
	node scripts/bump-version.mjs $(VERSION_TYPE)

release-build:
	npm run package
