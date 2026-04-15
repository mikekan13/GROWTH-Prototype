#!/usr/bin/env bash
# Run a command on the RunPod. Pass the command as args.
# Example: ./pod-exec.sh 'nvidia-smi -L'
set -e
KEY='C:/Projects/GRO.WTH/standalone/.ssh/runpod_growth'
# Port mapping is dynamic — re-fetch each time so rebuilds don't stale.
INFO=$(node 'C:/Projects/GRO.WTH/standalone/scripts/pod-info-json.mjs')
IP=$(echo "$INFO" | grep -oP '"publicIp":\s*"\K[^"]+')
PORT=$(echo "$INFO" | grep -oP '"22":\s*\K\d+')
if [ -z "$IP" ] || [ -z "$PORT" ]; then
  echo "Pod not running or no SSH port" >&2
  exit 1
fi
ssh -i "$KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p "$PORT" "root@$IP" "$@"
