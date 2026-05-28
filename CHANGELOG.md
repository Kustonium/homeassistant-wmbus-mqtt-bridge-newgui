# Changelog

This changelog covers the `1.5.x-dev` development series for `wMBus MQTT Bridge NewGUI`.

Current add-on version in `config.yaml`: `1.5.11-dev.46`.

## 1.5.11-dev.46

Development snapshot based on the current NewGUI runtime.

### Added

- WebGUI documentation updated for the NewGUI flow.
- Home Assistant pipeline tile text adjusted to show that decoded data lands in Home Assistant through MQTT integration.

### Changed

- ESP liveness uses RAW telegram traffic as the primary source. For a `raw_topic` with a `+` segment, the matched segment is treated as the ESP device name.
- ESP device display distinguishes active devices from stale MQTT-retained entries.
- ESP pipeline view can show multiple active ESP devices, source topic and per-device detail data.
- Dashboard pipeline view now exposes real status colors, ESP count, wMBus received/decoded counters and drill-down workspaces.
- Dashboard includes a Pipeline / Statistics segmented view and a sparkline based on runtime rate files.
- Discover is the main candidate workflow. It shows parallel-listen context, configured meters on air and candidate actions.
- Preview value flow decodes a candidate in the listen-only instance without adding it permanently.
- Preview value selection prefers meaningful fields such as `total_m3` or `current_power_consumption_kw` instead of diagnostic/fault counters such as `backflow_m3`.
- The legacy server-rendered WebUI code path was removed from `webui.py`; the static SPA and `/api/*` endpoints are the active interface.

### Fixed

- Active ESP marking applies to all active ESPs, not only the most recent one.
- Candidate preview and value filtering no longer rely on the first numeric field when a better primary reading is available.
- Pending restart detection compares `options.json` with `status_bridge_start.txt`.
- Restart overlay handles add-on restart and polls until the WebGUI is available again.
- Statistics scale separates candidate/meter bars from rate bars.
- RAW rate in decode mode avoids stale candidate TSV inflation.
- ESP count in the pipeline is based on active devices, not retained ghost entries.

### Runtime

- `bridge.sh` runs a parallel listen-only `wmbusmeters` instance when configured meters exist. The primary pipeline decodes configured meters; the listen instance keeps candidate reception visible.
- `/api/reload-pipeline` touches `.reload_pipeline`; `bridge.sh` restarts the decode pipeline and refreshes generated meter files.
- `/api/preview-candidate` creates `listen/etc/wmbusmeters.d/meter-preview-<id>` and touches `.reload_listen`.
- `/api/cancel-preview` removes the preview file, removes stale preview data when possible and touches `.reload_listen`.
- WebGUI add-meter flow calls the soft pipeline reload path after saving options.

## 1.5.11-dev.18 to 1.5.11-dev.45

### Added

- Pending meters view for entries saved in `options.json` but not yet decoded.
- Pending restart and waiting-for-first-telegram panels.
- Restarting overlay and recovery polling after add-on restart.
- Meter icons, removed legacy refresh buttons and more complete i18n coverage.
- Raw signal note in decode mode.
- Search / Discover features ported from the legacy WebUI into the SPA.
- Logs page event legend.
- Discover page decoded value column and live value filter.
- Preview value action for candidates.
- Pipeline and statistics dashboard views.
- ESP logs active-device identification.
- Multi-ESP pipeline details and ESP diagnostic drill-down.

### Fixed

- Pending meter count used instead of unreliable mtime checks in the pending banner.
- Candidate and meter rate bars use separate scales.
- `raw_per_min` can use ESP total when the ESP diagnostic source is fresher.
- Decode-mode candidate data is marked as stale when it comes from a previous listen session.
- Missing legacy WebUI behaviors were ported to the SPA, CSS and i18n files.
- Preview value field choice avoids false readings from fault counters.
- MQTT-retained ESP entries are not treated as active devices.

### Changed

- Discover page text reflects the parallel-listen architecture.
- Candidate panel is hidden on dashboard when configured meters are present.
- Dashboard candidate and meter data were consolidated into a single pending/waiting section.
- The old WebUI renderer was stripped from `webui.py`.

## 1.5.3-dev

Development snapshot after stable-track fixes promoted to `1.5.1` and `1.5.2`.

### Added

- Exhaustive field-suffix unit handling in `bridge.sh` and WebUI.
- Unit detection checks longer suffixes before shorter suffixes, so values such as `_kwh`, `_kvarh`, `_m3h` are not shadowed by shorter matches.
- Coverage for electrical, energy, pressure, humidity, time, mass and base-unit suffixes used by `wmbusmeters`.
- Dynamic meter status label in the WebUI based on recent reception: online, silent or offline.
- Restart button restored in the pending-meters panel.

### Changed

- Discovery templates use defensive `value_json.get(...) | default(none)`.
- `expire_after` is derived from observed average interval where available.
- `state_class: measurement` is limited to meaningful device classes.
- `device_class` for `m3` is derived from the reported meter media when possible.
- Documentation and notices from the stable track were carried into the dev add-on.

### CI

- Build workflow path filters were narrowed so text-only documentation commits do not rebuild the image.
- `sync-rootfs` workflow keeps the stable addon runtime tree aligned with the dev addon runtime tree.

### Notes

- `1.5.1-dev` and `1.5.2-dev` were not published as separate dev snapshots. The dev branch moved from `1.5.0-dev` to `1.5.3-dev` while incremental fixes were promoted to the stable channel.

## 1.5.0-dev

First development snapshot for the embedded WebUI work.

### Added

- WebUI served through Home Assistant Ingress on port `8099`.
- Python Web/API service in `rootfs/usr/bin/webui.py`.
- s6 WebUI service in `rootfs/etc/services.d/wmbus_webui/run`.
- Multi-language UI translation layer in `rootfs/usr/bin/i18n.py` for Polish, English, German, Czech and Slovak.
- Multi-language documentation under `docs/`.

### Changed

- Add-on stage set to `experimental`.
- Default Home Assistant `search_tolerance_m3` set to `0.05`.
- `bridge.sh` extended to write runtime status, candidate data and controls needed by the WebGUI.
- Dockerfile add-on stage includes Python for the WebUI.

### Notes

- `1.5.0-dev` followed the previous `1.4.x` add-on line and started the NewGUI development series.
