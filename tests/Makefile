.PHONY: test-up
test-up:
	docker compose -f docker-compose.test.yml up -d --build --wait

.PHONY: test-down
test-down:
	docker compose -f docker-compose.test.yml down -v

# The test DB persists across `test-up` runs until `test-down`. Drizzle only
# applies migrations newer than the last one it recorded, so after editing an
# existing migration or switching to a branch with different migrations, run
# `make test-down` first or the test DB keeps the old schema.
.PHONY: test-watch
test-watch: test-up
	pnpm exec vitest integration

.PHONY: test
test: test-up
	pnpm exec vitest run integration; \
	status=$$?; \
	$(MAKE) test-down; \
	exit $$status
