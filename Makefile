# Makefile - helper tasks

.PHONY: e2e

e2e:
	@echo "Starting containerized e2e (this will build images and run the e2e service)"
	docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build e2e
	EXIT_CODE=$$?; docker compose -f docker-compose.yml -f docker-compose.e2e.yml down; exit $$EXIT_CODE
