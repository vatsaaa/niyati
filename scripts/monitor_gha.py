#!/usr/bin/env python3
import os, time, sys, urllib.request, urllib.parse, json
owner='vatsaaa'
repo='niyati'
branch='chore/cleanup-readmes-remove-tmp'
url=f"https://api.github.com/repos/{owner}/{repo}/actions/runs?branch={urllib.parse.quote(branch)}&per_page=1"
hdr={'User-Agent':'niyati-monitor','Accept':'application/vnd.github.v3+json'}
token=os.environ.get('GITHUB_TOKEN')
if token:
    hdr['Authorization']=f"token {token}"
print('Polling GitHub Actions for branch:', branch, '(provide GITHUB_TOKEN env var if rate-limited)')
while True:
    try:
        req=urllib.request.Request(url, headers=hdr)
        with urllib.request.urlopen(req, timeout=30) as r:
            j=json.load(r)
    except Exception as e:
        print('ERROR fetching runs:', e)
        time.sleep(15)
        continue
    runs=j.get('workflow_runs', [])
    if not runs:
        print('No workflow runs found for branch yet. Retrying in 15s...')
        time.sleep(15)
        continue
    run=runs[0]
    html=run.get('html_url')
    status=run.get('status')
    conclusion=run.get('conclusion')
    ts=run.get('created_at')
    print(f"{ts} {html} | status={status} | conclusion={conclusion}")
    if status in ('in_progress','queued','waiting'):
        time.sleep(30)
        continue
    print('FINAL_CONCLUSION', conclusion)
    sys.exit(0 if conclusion=='success' else 1)
