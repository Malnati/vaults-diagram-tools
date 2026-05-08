SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help
.DELETE_ON_ERROR:
.NOTPARALLEL: publish-all publish-github-release publish-registries verify-publication

PACKAGE_NAME := $(shell node -p "require('./package.json').name")
VERSION := $(shell node -p "require('./package.json').version")
TAG := v$(VERSION)
GITHUB_REPO := Malnati/vaults-diagram-tools
GHCR_IMAGE := ghcr.io/malnati/vaults-diagram-tools
QUAY_IMAGE := quay.io/ricardomalnati/vaults-diagram-tools
LOCAL_IMAGE := vaults-diagram-tools:release
MCP_PUBLISHER := tmp/mcp-publisher
MCP_NAME := $(shell node -p "require('./package.json').mcpName")
MCP_NAME_ENCODED := $(shell node -p "encodeURIComponent(require('./package.json').mcpName)")
MCP_REGISTRY_API ?= https://registry.modelcontextprotocol.io/v0
MCP_REGISTRY_SEARCH_URL := $(MCP_REGISTRY_API)/servers?search=$(MCP_NAME_ENCODED)
VSCE_VERSION := $(shell node -p "require('./packaging/vscode/package.json').devDependencies['@vscode/vsce']")
OVSX_VERSION := $(shell node -p "require('./packaging/vscode/package.json').devDependencies.ovsx")

.PHONY: help auth install-mcp-publisher preflight package publish-all publish-github-release publish-registries verify-publication

help:
	@printf '%s\n' \
	  'vaults-diagram-tools publication targets' \
	  '' \
	  '  make auth                 Authenticate local terminal-first channels.' \
	  '  make preflight            Guard release metadata, tag/npm availability, and clean main worktree.' \
	  '  make package              Test, refresh vendor manifest, pack npm/zip/VSIX, build local image.' \
	  '  make publish-github-release  Push main, tag $(TAG), wait release workflow, verify release assets.' \
	  '  make publish-registries   Publish npm, VS Marketplace, Open VSX, GHCR, Quay, MCP Registry.' \
	  '  make verify-publication   Verify npm, GitHub Release, containers, and MCP Registry.' \
	  '  make publish-all          Run the full sequence above.' \
	  '' \
	  'Current package: $(PACKAGE_NAME) $(VERSION) ($(TAG))' \
	  'Policy: guard-only; bump/commit version before running if tag/npm already exists.'

auth:
	@echo '==> npm authentication'
	@npm whoami >/dev/null 2>&1 || npm login
	@echo '==> GitHub CLI authentication'
	@gh auth status >/dev/null 2>&1 || gh auth login
	@$(MAKE) install-mcp-publisher
	@echo '==> MCP Registry authentication'
	@$(MCP_PUBLISHER) login github
	@echo '==> VS Code Marketplace authentication'
	@npx --yes @vscode/vsce@$(VSCE_VERSION) verify-pat malnati >/dev/null 2>&1 || npx --yes @vscode/vsce@$(VSCE_VERSION) login malnati
	@echo '==> Open VSX authentication'
	@npx --yes ovsx@$(OVSX_VERSION) verify-pat malnati >/dev/null 2>&1 || npx --yes ovsx@$(OVSX_VERSION) login malnati
	@echo '==> GHCR authentication'
	@docker login ghcr.io
	@echo '==> Quay.io authentication'
	@podman login quay.io

install-mcp-publisher:
	@if [ ! -x '$(MCP_PUBLISHER)' ]; then \
	  mkdir -p tmp; \
	  os="$$(uname -s | tr '[:upper:]' '[:lower:]')"; \
	  arch="$$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"; \
	  echo "==> installing MCP publisher for $${os}_$${arch}"; \
	  curl -fsSL "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$${os}_$${arch}.tar.gz" | tar -xz -C tmp mcp-publisher; \
	  chmod +x '$(MCP_PUBLISHER)'; \
	else \
	  echo 'OK: $(MCP_PUBLISHER) already installed'; \
	fi

preflight:
	@node -e 'const fs=require("fs");const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));const lock=JSON.parse(fs.readFileSync("package-lock.json","utf8"));const server=JSON.parse(fs.readFileSync("server.json","utf8"));const problems=[];const rootLock=lock.packages&&lock.packages[""];const serverPkg=server.packages&&server.packages[0];if(!rootLock||rootLock.version!==pkg.version) problems.push("package-lock.json root version must equal package.json version " + pkg.version);if(server.version!==pkg.version) problems.push("server.json version must equal package.json version " + pkg.version);if(!serverPkg||serverPkg.version!==pkg.version) problems.push("server.json package version must equal package.json version " + pkg.version);if(pkg.mcpName!==server.name) problems.push("package.json mcpName must equal server.json name");if(!serverPkg||serverPkg.identifier!==pkg.name) problems.push("server.json package identifier must equal package.json name");if(problems.length){console.error("ERROR: release metadata mismatch:");for(const problem of problems) console.error(" - " + problem);process.exit(1);}console.log("OK: release metadata aligned at " + pkg.version);'
	@if git rev-parse -q --verify "refs/tags/$(TAG)" >/dev/null; then \
	  echo 'ERROR: local tag $(TAG) already exists; bump version before publishing.'; \
	  exit 1; \
	fi
	@if git ls-remote --exit-code --tags origin "refs/tags/$(TAG)" >/dev/null 2>&1; then \
	  echo 'ERROR: remote tag $(TAG) already exists; bump version before publishing.'; \
	  exit 1; \
	fi
	@set +e; npm_view="$$(npm view "$(PACKAGE_NAME)@$(VERSION)" version 2>&1)"; npm_status=$$?; set -e; \
	if [ "$$npm_status" -eq 0 ]; then \
	  echo 'ERROR: npm $(PACKAGE_NAME)@$(VERSION) already exists; bump version before publishing.'; \
	  exit 1; \
	fi; \
	if printf '%s\n' "$$npm_view" | grep -Eq 'E404|404 Not Found|is not in this registry'; then \
	  echo 'OK: npm $(PACKAGE_NAME)@$(VERSION) not found yet'; \
	else \
	  echo 'ERROR: unable to verify npm availability for $(PACKAGE_NAME)@$(VERSION):'; \
	  printf '%s\n' "$$npm_view"; \
	  exit 1; \
	fi
	@if [ "$$(git branch --show-current)" != 'main' ]; then \
	  echo 'ERROR: publication must run from local main branch.'; \
	  exit 1; \
	fi
	@if [ -n "$$(git status --porcelain --untracked-files=all)" ]; then \
	  echo 'ERROR: worktree must be clean before publication.'; \
	  git status --short --untracked-files=all; \
	  exit 1; \
	fi
	@echo 'OK: preflight passed for $(PACKAGE_NAME) $(VERSION)'

package:
	@mkdir -p dist
	@npm ci
	@npm test
	@npm run vendor:refresh
	@git diff --exit-code packages/renderer/vendor/node/package-lock.json packages/renderer/vendor/node/vendor-manifest.json
	@npm pack --pack-destination dist
	@npm run package:zip
	@npm run vscode:install
	@npm run vscode:test
	@npm run vscode:package
	@docker build -f containers/Containerfile -t $(LOCAL_IMAGE) .

publish-all: auth preflight package publish-github-release publish-registries verify-publication

publish-github-release:
	@git push origin main
	@git tag -a '$(TAG)' -m 'chore(release): $(TAG)'
	@git push origin '$(TAG)'
	@run_id=''; \
	for attempt in $$(seq 1 60); do \
	  run_id="$$(gh run list --repo '$(GITHUB_REPO)' --workflow release.yml --event push --limit 20 --json databaseId,headBranch --jq '.[] | select(.headBranch == "$(TAG)") | .databaseId' | head -n 1)"; \
	  if [ -n "$$run_id" ]; then break; fi; \
	  sleep 5; \
	done; \
	if [ -z "$$run_id" ]; then \
	  echo 'ERROR: release workflow run for $(TAG) was not found.'; \
	  exit 1; \
	fi; \
	gh run watch "$$run_id" --repo '$(GITHUB_REPO)' --exit-status
	@gh release view '$(TAG)' --repo '$(GITHUB_REPO)' --json assets --jq '.assets[].name' | grep -Fx '$(PACKAGE_NAME)-$(VERSION).tgz'
	@gh release view '$(TAG)' --repo '$(GITHUB_REPO)' --json assets --jq '.assets[].name' | grep -Fx '$(PACKAGE_NAME)-$(VERSION).zip'
	@gh release view '$(TAG)' --repo '$(GITHUB_REPO)' --json assets --jq '.assets[].name' | grep -Fx 'vaults-diagram-tools-vscode-$(VERSION).vsix'
	@echo 'OK: GitHub Release $(TAG) assets verified'

publish-registries:
	@npm publish --access public
	@npm run vscode:publish:marketplace
	@npm run vscode:publish:openvsx
	@docker build -f containers/Containerfile -t $(GHCR_IMAGE):$(TAG) -t $(GHCR_IMAGE):latest .
	@docker push $(GHCR_IMAGE):$(TAG)
	@docker push $(GHCR_IMAGE):latest
	@podman build -f containers/Containerfile -t $(QUAY_IMAGE):$(TAG) -t $(QUAY_IMAGE):latest .
	@podman push $(QUAY_IMAGE):$(TAG)
	@podman push $(QUAY_IMAGE):latest
	@$(MAKE) install-mcp-publisher
	@$(MCP_PUBLISHER) validate
	@$(MCP_PUBLISHER) publish

verify-publication:
	@npm view '$(PACKAGE_NAME)' version | grep -Fx '$(VERSION)'
	@gh release view '$(TAG)' --repo '$(GITHUB_REPO)' >/dev/null
	@docker manifest inspect $(GHCR_IMAGE):$(TAG) >/dev/null
	@podman manifest inspect $(QUAY_IMAGE):$(TAG) >/dev/null
	@curl -fsSL '$(MCP_REGISTRY_SEARCH_URL)' | MCP_NAME='$(MCP_NAME)' VERSION='$(VERSION)' node -e 'let input="";process.stdin.on("data",chunk=>input+=chunk);process.stdin.on("end",()=>{const payload=JSON.parse(input);const servers=(payload.servers||[]).map(entry=>entry.server||entry);const server=servers.find(entry=>entry.name===process.env.MCP_NAME);if(!server){console.error("ERROR: MCP Registry server not found: " + process.env.MCP_NAME);process.exit(1);}if(server.version!==process.env.VERSION){console.error("ERROR: MCP Registry version " + server.version + " does not match " + process.env.VERSION);process.exit(1);}console.log("OK: MCP Registry " + server.name + " " + server.version);});'
	@echo 'OK: publication verified for $(PACKAGE_NAME) $(VERSION)'
