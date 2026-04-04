VERSION     := 1.0.0
BINARY      := drais-sdk
DIST        := dist
LDFLAGS     := -s -w -X main.version=$(VERSION)
GO          := go
BUILD       := CGO_ENABLED=0 $(GO) build -trimpath -ldflags "$(LDFLAGS)"

.PHONY: all clean linux windows darwin arm64 upx help

all: linux windows darwin arm64   ## Build all targets

linux: $(DIST)/$(BINARY)-linux-amd64       ## Build Linux x86-64

windows: $(DIST)/$(BINARY)-windows-amd64.exe  ## Build Windows x86-64

darwin: $(DIST)/$(BINARY)-darwin-amd64    ## Build macOS x86-64

arm64: $(DIST)/$(BINARY)-linux-arm64      ## Build Linux ARM64 (Raspberry Pi etc.)

$(DIST):
	mkdir -p $(DIST)

$(DIST)/$(BINARY)-linux-amd64: $(DIST)
	GOOS=linux   GOARCH=amd64  $(BUILD) -o $@ .
	@echo "✓  $@  $(shell du -sh $@ | cut -f1)"

$(DIST)/$(BINARY)-linux-arm64: $(DIST)
	GOOS=linux   GOARCH=arm64  $(BUILD) -o $@ .
	@echo "✓  $@  $(shell du -sh $@ | cut -f1)"

$(DIST)/$(BINARY)-windows-amd64.exe: $(DIST)
	GOOS=windows GOARCH=amd64  $(BUILD) -o $@ .
	@echo "✓  $@  $(shell du -sh $@ | cut -f1)"

$(DIST)/$(BINARY)-darwin-amd64: $(DIST)
	GOOS=darwin  GOARCH=amd64  $(BUILD) -o $@ .
	@echo "✓  $@  $(shell du -sh $@ | cut -f1)"

$(DIST)/$(BINARY)-darwin-arm64: $(DIST)
	GOOS=darwin  GOARCH=arm64  $(BUILD) -o $@ .
	@echo "✓  $@  $(shell du -sh $@ | cut -f1)"

upx: all    ## Compress binaries with UPX (must have upx installed)
	@command -v upx >/dev/null 2>&1 || { echo "upx not found — skipping"; exit 0; }
	upx --best --lzma $(DIST)/$(BINARY)-linux-amd64
	upx --best --lzma $(DIST)/$(BINARY)-linux-arm64
	upx --best --lzma $(DIST)/$(BINARY)-windows-amd64.exe

run: ## Run locally (dev mode)
	$(GO) run . -config ~/.drais-sdk/config.json

clean:  ## Remove build artefacts
	rm -rf $(DIST)

help:   ## Print this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
