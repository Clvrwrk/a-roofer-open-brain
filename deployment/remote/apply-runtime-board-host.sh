#!/usr/bin/env bash
# One-shot apply on the US agent host (178.156.203.23, PE-US-AGENTS) for docs/109
# D8 / D9(c) / D12. Run as root AFTER the runtime-board commit is on origin/main:
#
#   ssh -i ~/.ssh/hetzner_office root@178.156.203.23 \
#     'cd /opt/openbrain/a-roofers-open-brain && git fetch -q origin && \
#      git show origin/main:deployment/remote/apply-runtime-board-host.sh | bash'
#
# What it does (idempotent):
#   1. Realigns the checkout to origin/main (it was 118 commits behind on 2026-09-11,
#      with 12 files staged-but-uncommitted; the 3 that differ from main are saved as
#      /root/host-local-scripts-<date>.patch, never lost).
#   2. Installs the openbrain-*.service units from the repo — they now carry
#      Environment=HOME=/root (fixes jt-sentinel / wip-pack failing under systemd)
#      and the ExecStopPost runtime-job-report hook — then daemon-reloads.
#   3. Re-runs the two units that were failing and prints their result; each run
#      also reports into runtime_job_runs, so /agents turns from unknown to a colour.
# Rollback: git checkout <previous sha>; reinstall the old unit files; daemon-reload.
set -euo pipefail
REPO=/opt/openbrain/a-roofers-open-brain
cd "$REPO"

echo "== 1. realign checkout to origin/main"
git fetch -q origin
STAGED=$(git diff --cached --name-only || true)
if [ -n "$STAGED" ]; then
  PATCH="/root/host-local-scripts-$(date +%F).patch"
  git diff --cached origin/main -- $STAGED > "$PATCH" || true
  echo "   saved host-local differences to $PATCH ($(wc -l < "$PATCH") lines)"
  for f in $STAGED; do git rm -q --cached "$f" 2>/dev/null || true; rm -f "$f"; done
fi
git merge -q --ff-only origin/main
echo "   now at $(git log -1 --format='%h %cs %s' | cut -c1-90)"

echo "== 1b. python deps for the Thursday pack (openpyxl; Aspose retired 2026-09-12)"
# Ubuntu 24 marks the system Python externally managed; the host runs these jobs
# as root with system python3, so allow the site-packages install there and fall
# back to a plain install elsewhere.
python3 -m pip install --quiet -r scripts/analytics/requirements.txt --break-system-packages 2>/dev/null \
  || python3 -m pip install --quiet -r scripts/analytics/requirements.txt
python3 -c "import openpyxl; print('   openpyxl', openpyxl.__version__)"

echo "== 2. install systemd units (HOME + ExecStopPost report hook)"
for u in abc-sync jt-sentinel maya-gate maya-qa qbo-thursday-sync site-sweep wip-pack-thursday; do
  install -m 0644 "deployment/remote/systemd/openbrain-$u.service" "/etc/systemd/system/openbrain-$u.service"
  rm -f "/etc/systemd/system/openbrain-$u.service.d/10-home.conf" 2>/dev/null || true
done
chmod +x scripts/runtime-job-report.sh
systemctl daemon-reload
echo "   HOME for jt-sentinel: $(systemctl show openbrain-jt-sentinel.service -p Environment --value)"

echo "== 3. re-run the two failing units"
for u in jt-sentinel wip-pack-thursday; do
  systemctl start "openbrain-$u.service" || true
  echo "   openbrain-$u: $(systemctl show "openbrain-$u.service" -p Result -p ExecMainStatus --value | tr '\n' ' ')"
  journalctl -u "openbrain-$u.service" --since '-5min' --no-pager -o cat | grep -E 'runtime-job-report|error|Error|FAIL' | tail -3 || true
done
echo "done — check /agents › Scheduled jobs · agent host"
