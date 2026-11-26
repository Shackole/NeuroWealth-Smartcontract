#!/usr/bin/env bash
set -euo pipefail

if (( $# != 2 )) || [[ "$2" != /* || ! "$1" =~ ^(deploy|smoke)$ ]]; then
  echo "Usage: $0 {deploy|smoke} /absolute/path/to/deployment-record" >&2
  exit 2
fi

infra_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
record="$2"
services=(prometheus alertmanager grafana)
export MONITORING_CONFIG_DIR="$record/config"
export MONITORING_DASHBOARDS_DIR="$MONITORING_CONFIG_DIR/dashboards"
compose=(docker compose --project-directory "$infra_dir" -f "$record/compose.yml")

# Write manifest paths as seen inside the service container.
manifest_entry() {
  local source="$1" destination="$2" sum
  sum="$(sha256sum < "$source")"
  printf '%s  %s\n' "${sum%% *}" "$destination"
}

manifest_directory() {
  local source="$1" destination="$2" file
  find "$source" -type f -print0 | sort -z | while IFS= read -r -d '' file; do
    manifest_entry "$file" "$destination/${file#"$source/"}"
  done
}

if [[ "$1" == deploy ]]; then
  # A record is unique to a deployment. Existing records stay available for audits.
  mkdir -- "$record"
  mkdir -- "$MONITORING_CONFIG_DIR"
  cp -- "$infra_dir/docker-compose.monitoring.yml" "$record/compose.yml"
  cp -RL -- "$infra_dir/prometheus.yml" "$infra_dir/alertmanager.yml" \
    "$infra_dir/rules" "$infra_dir/grafana" "$MONITORING_CONFIG_DIR/"
  cp -RL -- "$infra_dir/../docs/grafana" "$MONITORING_DASHBOARDS_DIR"

  {
    manifest_entry "$MONITORING_CONFIG_DIR/prometheus.yml" /etc/prometheus/prometheus.yml
    manifest_directory "$MONITORING_CONFIG_DIR/rules" /etc/prometheus/rules
  } > "$record/prometheus.sha256"
  manifest_entry "$MONITORING_CONFIG_DIR/alertmanager.yml" /etc/alertmanager/alertmanager.yml \
    > "$record/alertmanager.sha256"
  {
    manifest_directory "$MONITORING_CONFIG_DIR/grafana/provisioning" /etc/grafana/provisioning
    manifest_directory "$MONITORING_DASHBOARDS_DIR" /etc/grafana/dashboards
  } > "$record/grafana.sha256"
  (cd "$record" && sha256sum compose.yml prometheus.sha256 alertmanager.sha256 grafana.sha256 > deployment.sha256)
fi

(cd "$record" && sha256sum --strict --check deployment.sha256)
config_hash="$(sha256sum < "$record/deployment.sha256")"
export MONITORING_CONFIG_SHA256="${config_hash%% *}"

if [[ "$1" == deploy ]]; then
  echo "Monitoring deployment record: $record (SHA-256 $MONITORING_CONFIG_SHA256)"
  "${compose[@]}" up -d --wait --wait-timeout 180
fi

for service in "${services[@]}"; do
  container_id="$("${compose[@]}" ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "$service is not running" >&2
    exit 1
  fi
  health="$(docker inspect --format '{{.State.Health.Status}}' "$container_id")"
  recorded_hash="$(docker inspect --format '{{index .Config.Labels "org.neurowealth.monitoring.config-sha256"}}' "$container_id")"
  if [[ "$health" != healthy || "$recorded_hash" != "$MONITORING_CONFIG_SHA256" ]]; then
    echo "$service failed smoke validation: health=$health config_sha256=$recorded_hash expected=$MONITORING_CONFIG_SHA256" >&2
    exit 1
  fi
  echo "Checking $service configuration against $record"
  "${compose[@]}" exec -T "$service" sha256sum -c - < "$record/$service.sha256"
done
