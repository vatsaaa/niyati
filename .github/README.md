Repository CI notes
===================

Security scans (Trivy / SARIF uploads)
------------------------------------

- GitHub Actions runs triggered by pull requests from forks have reduced permissions.
- Specifically, the `GITHUB_TOKEN` for fork-run workflows does not have permission to write security events or upload SARIF files.
- To avoid noisy failures, the `security.yml` workflow skips SARIF upload for forked PRs and provides a `manual-trivy-scan` job which maintainers can run manually from the repository Actions UI.

How to run manual Trivy scan
----------------------------

1. Go to the repository Actions → Security Vulnerability Scan workflow.
2. Click "Run workflow" and select the branch (e.g., `master`).
3. Click "Run workflow" to trigger the `manual-trivy-scan` job which will run Trivy and upload SARIF results.

Notes
-----
- If you need forks to run SARIF uploads, consider having maintainers run the manual scan for the fork branch or use a trusted CI runner with appropriate permissions (be cautious with secrets).
