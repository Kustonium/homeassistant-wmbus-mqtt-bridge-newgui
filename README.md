# Home Assistant Add-on: wMBus MQTT Bridge NewGUI

Version described: `1.5.11-dev.46`.

This repository contains a Home Assistant add-on and a standalone Docker runtime for processing Wireless M-Bus telegrams received through MQTT. The runtime accepts RAW HEX telegram payloads, passes them to `wmbusmeters` through `stdin:hex`, publishes decoded JSON back to MQTT, and can publish Home Assistant MQTT Discovery configuration.

Language sections:

- [English](#english)
- [Polski](#polski)
- [Deutsch](#deutsch)
- [Slovencina](#slovencina)
- [Cestina](#cestina)

Detailed first-run steps are in [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

---

## English

### Scope

`wMBus MQTT Bridge NewGUI` is an experimental Home Assistant add-on. It does not implement its own Wireless M-Bus decoder. Decoding is done by upstream `wmbusmeters`.

The expected input is a raw HEX telegram published to MQTT, usually by an external receiver such as an ESP32 gateway with a wMBus radio module.

Typical data path:

```text
ESP32 / gateway
  -> MQTT RAW HEX payload, default HA topic: wmbus/+/telegram
  -> bridge.sh
  -> wmbusmeters --useconfig /data
  -> MQTT state topic: wmbusmeters/<id>/state
  -> optional Home Assistant MQTT Discovery under homeassistant/...
```

The add-on runs with:

- `ingress: true`
- `ingress_port: 8099`
- `hassio_api: true`
- `stage: experimental`
- supported architectures: `amd64`, `aarch64`

### Runtime Components

| Component | Path | Function |
|---|---|---|
| Add-on metadata | `config.yaml` | HA add-on name, version, schema, Ingress and MQTT service request. |
| Bridge | `rootfs/usr/bin/bridge.sh` | MQTT subscription, HEX filtering, `wmbusmeters` process, MQTT state publishing, Discovery publishing, runtime status files. |
| HA wrapper | `rootfs/usr/bin/run.sh` | Selects MQTT broker in `auto`, `ha` or `external` mode and starts `bridge.sh`. |
| Web/API server | `rootfs/usr/bin/webui.py` | Serves the SPA, API endpoints, SSE stream, Supervisor API writes, Docker fallback writes. |
| Translations | `rootfs/usr/bin/i18n.py` | UI strings and language detection for `en`, `pl`, `de`, `cs`, `sk`. |
| Frontend | `rootfs/usr/share/wmbus-webui/` | Static WebGUI: dashboard, meters, discover, logs, ESP logs, settings, about. |
| Docker wrapper | `docker/entrypoint.sh` | Creates `/config/options.json` when missing, starts `webui.py` and `bridge.sh`. |

### Operating Modes

| Mode | Condition | Behavior |
|---|---|---|
| LISTEN | `meters` is empty | `wmbusmeters` listens for visible telegrams and `bridge.sh` writes candidates to status files. |
| DECODE | `meters` contains configured meters | `bridge.sh` writes `wmbusmeters` meter files and publishes decoded JSON for configured meter IDs. |
| DECODE + LISTEN | configured meters exist | A second listen-only `wmbusmeters` instance keeps candidate reception data available while the primary pipeline decodes configured meters. |
| SEARCH | `search_mode: true` | Advanced reading-based matching using candidates collected in `search_candidates.tsv`. |

The normal onboarding path in the NewGUI is the Discover view: observe candidates, request a preview value when possible, filter by value, then add the meter.

### WebGUI and API

The WebGUI is served on port `8099`. Under Home Assistant it is opened through Ingress. In Docker it is exposed through the mapped port.

Main routes:

| Route | Content |
|---|---|
| `#/dashboard` | Pipeline view or statistics view. |
| `#/meters` | Configured meters, pending meters and removal actions. |
| `#/discover` | LISTEN candidates, preview value, filters, ignore/restore and add actions. |
| `#/logs` | Runtime event stream written by bridge and WebUI. |
| `#/esp-logs` | ESP device and diagnostic data. |
| `#/settings` | Runtime configuration and status snapshot. |
| `#/about` | Version, paths and project information. |
| `#/search` | Advanced SEARCH view. |

Main API endpoints:

| Endpoint | Method | Function |
|---|---:|---|
| `/api/app` | GET | Full frontend data model, including i18n labels. |
| `/api/events` | GET | Server-Sent Events stream for live updates. |
| `/api/status` | GET | Raw state snapshot. |
| `/api/add-meter` | POST | Add a meter to `options.json`. Uses Supervisor API in HA, direct file write outside HA. |
| `/api/remove-meter` | POST | Remove a meter from `options.json`. Uses Supervisor API in HA. |
| `/api/reload-pipeline` | POST | Touch `.reload_pipeline`; `bridge.sh` restarts the decode pipeline. |
| `/api/preview-candidate` | POST | Create a temporary listen-only meter preview file. |
| `/api/cancel-preview` | POST | Remove the preview file and reload the listen pipeline. |
| `/api/ignore`, `/api/unignore` | POST | Hide or restore a candidate. |
| `/api/restart-bridge` | POST | Restart the whole add-on through Supervisor API. |
| `/api/search-control` | POST | Enable or disable advanced SEARCH mode. |

Live updates use `EventSource` on `/api/events`. The frontend falls back to polling if `EventSource` is unavailable.

### Configuration

Home Assistant options are defined in `config.yaml`.

Important defaults:

| Option | Default | Meaning |
|---|---|---|
| `raw_topic` | `wmbus/+/telegram` | MQTT topic for raw HEX telegram payloads. |
| `loglevel` | `normal` | `normal`, `verbose` or `debug`. |
| `filter_hex_only` | `true` | Strip whitespace and accept only even-length HEX payloads. |
| `debug_every_n` | `0` | Print every Nth accepted HEX telegram when greater than zero. |
| `discovery_enabled` | `true` | Publish Home Assistant MQTT Discovery. |
| `discovery_prefix` | `homeassistant` | Discovery topic prefix. |
| `discovery_retain` | `true` | Retain Discovery config messages. |
| `state_prefix` | `wmbusmeters` | Prefix for decoded MQTT state topics. |
| `state_retain` | `false` | Retain decoded state messages. |
| `mqtt_mode` | `auto` | `auto`, `ha` or `external`. |
| `external_mqtt_port` | `1883` | External broker port. |
| `meters` | `[]` | Configured meter list. |

MQTT mode:

- `auto` - use the Home Assistant MQTT service if available; otherwise require external broker settings.
- `ha` - require the Home Assistant MQTT service.
- `external` - use `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password`.

Meter entry shape:

```json
{
  "id": "cold_water",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

`meter_id` is handled as an 8-character hexadecimal ID by the WebGUI and bridge helpers. `key` is empty for meters without an AES key, or a 32-character HEX AES key.

### Runtime Files

Home Assistant uses `/data`. Docker uses `/config` unless `WMBUS_BASE` is changed.

| File | Meaning |
|---|---|
| `options.json` | Current options read by bridge and WebUI. |
| `etc/wmbusmeters.conf` | Generated primary `wmbusmeters` config. |
| `etc/wmbusmeters.d/` | Generated configured meter files. |
| `listen/etc/wmbusmeters.conf` | Generated listen-only config. |
| `listen/etc/wmbusmeters.d/meter-preview-*` | Temporary preview meter files. |
| `status.json` | Main runtime status. |
| `status_meters.tsv` | Decoded configured meters. |
| `status_candidates.tsv` | LISTEN candidates. |
| `status_events.tsv` | Runtime events. |
| `status_seen.tsv` | Per-ID reception statistics used by the bridge. |
| `status_rate_1m.json`, `status_rate_history.tsv` | Telegram rate data. |
| `status_candidate_analysis.tsv`, `status_candidate_raw.tsv` | Candidate analysis data. |
| `status_candidate_values.tsv` | Preview values decoded by the listen instance. |
| `status_ignored_candidates.tsv` | Candidate IDs hidden in WebGUI. |
| `status_esp_telegram_devices.tsv` | ESP liveness from RAW topic traffic. |
| `status_esp_diag.json`, `status_esp_events.tsv` | ESP diagnostics from `wmbus/+/diag...` topics. |
| `status_esp_suggestion.json`, `status_esp_boot.json` | ESP suggestion and boot event payloads. |
| `search_candidates.tsv`, `search_matches.tsv`, `search_status.json` | Advanced SEARCH state. |
| `.reload_pipeline`, `.reload_listen` | Soft reload flags consumed by `bridge.sh`. |

### ESP Tracking

The bridge tracks active ESP devices from the RAW telegram topic. For the default `raw_topic` value `wmbus/+/telegram`, the segment matching `+` is treated as the device name, for example `wmbus/xiaoseed/telegram` gives `xiaoseed`.

If `raw_topic` has no `+` wildcard, per-device RAW tracking is disabled. ESP diagnostics can still be read from `wmbus/+/diag` and `wmbus/+/diag/#` when the ESP publishes them.

### License and Attribution

The project is distributed under GNU GPL v3.0. See [LICENSE](LICENSE).

The repository contains or derives from:

- `wmbusmeters` - GPL-3.0
- `wmbusmeters-ha-addon` - GPL-3.0
- `morphdom.min.js` - MIT, documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

---

## Polski

### Zakres

`wMBus MQTT Bridge NewGUI` jest eksperymentalnym dodatkiem Home Assistant. Projekt nie zawiera własnego dekodera Wireless M-Bus. Dekodowanie wykonuje upstreamowy `wmbusmeters`.

Wejściem jest surowy telegram HEX opublikowany do MQTT, zwykle przez zewnętrzny odbiornik, na przykład bramkę ESP32 z modułem radiowym wMBus.

Typowy przepływ danych:

```text
ESP32 / bramka
  -> payload MQTT RAW HEX, domyślny topic HA: wmbus/+/telegram
  -> bridge.sh
  -> wmbusmeters --useconfig /data
  -> topic stanu MQTT: wmbusmeters/<id>/state
  -> opcjonalnie Home Assistant MQTT Discovery pod homeassistant/...
```

Dodatek działa z:

- `ingress: true`
- `ingress_port: 8099`
- `hassio_api: true`
- `stage: experimental`
- architektury: `amd64`, `aarch64`

### Komponenty Runtime

| Komponent | Ścieżka | Funkcja |
|---|---|---|
| Metadane dodatku | `config.yaml` | Nazwa, wersja, schema, Ingress i żądanie usługi MQTT. |
| Bridge | `rootfs/usr/bin/bridge.sh` | Subskrypcja MQTT, filtrowanie HEX, proces `wmbusmeters`, publikacja MQTT i Discovery, pliki statusu. |
| Wrapper HA | `rootfs/usr/bin/run.sh` | Wybiera brokera MQTT w trybie `auto`, `ha` lub `external` i uruchamia `bridge.sh`. |
| Serwer Web/API | `rootfs/usr/bin/webui.py` | Serwuje SPA, endpointy API, SSE, zapisy przez Supervisor API i fallback dla Dockera. |
| Tłumaczenia | `rootfs/usr/bin/i18n.py` | Teksty UI i wykrywanie języka dla `en`, `pl`, `de`, `cs`, `sk`. |
| Frontend | `rootfs/usr/share/wmbus-webui/` | Statyczne WebGUI: dashboard, meters, discover, logs, ESP logs, settings, about. |
| Wrapper Docker | `docker/entrypoint.sh` | Tworzy `/config/options.json`, jeśli go nie ma, startuje `webui.py` i `bridge.sh`. |

### Tryby Pracy

| Tryb | Warunek | Zachowanie |
|---|---|---|
| LISTEN | `meters` jest puste | `wmbusmeters` nasłuchuje widocznych telegramów, a `bridge.sh` zapisuje kandydatów do plików statusu. |
| DECODE | `meters` zawiera liczniki | `bridge.sh` tworzy pliki liczników dla `wmbusmeters` i publikuje JSON dla skonfigurowanych ID. |
| DECODE + LISTEN | istnieją skonfigurowane liczniki | Druga instancja listen-only utrzymuje dane kandydatów, gdy główny pipeline dekoduje liczniki. |
| SEARCH | `search_mode: true` | Zaawansowane dopasowanie po wskazaniu licznika z użyciem `search_candidates.tsv`. |

Podstawowa ścieżka onboardingu w NewGUI to widok Discover: obserwacja kandydatów, podgląd wartości, filtr po wartości i dodanie licznika.

### WebGUI i API

WebGUI działa na porcie `8099`. W Home Assistant jest otwierane przez Ingress. W Dockerze wymaga mapowania portu.

Główne widoki:

| Widok | Zawartość |
|---|---|
| `#/dashboard` | Pipeline albo statystyki. |
| `#/meters` | Skonfigurowane liczniki, oczekujące liczniki i usuwanie. |
| `#/discover` | Kandydaci LISTEN, podgląd wartości, filtry, ignorowanie/przywracanie i dodawanie. |
| `#/logs` | Krótki strumień zdarzeń runtime. |
| `#/esp-logs` | Dane urządzeń ESP i diagnostyka. |
| `#/settings` | Konfiguracja runtime i snapshot statusu. |
| `#/about` | Wersja, ścieżki i informacje o projekcie. |
| `#/search` | Zaawansowany widok SEARCH. |

Najważniejsze endpointy API:

| Endpoint | Metoda | Funkcja |
|---|---:|---|
| `/api/app` | GET | Pełny model danych frontendu razem z i18n. |
| `/api/events` | GET | Strumień Server-Sent Events do odświeżania live. |
| `/api/status` | GET | Surowy snapshot stanu. |
| `/api/add-meter` | POST | Dodaje licznik do `options.json`; w HA przez Supervisor API, poza HA bezpośrednio do pliku. |
| `/api/remove-meter` | POST | Usuwa licznik z `options.json`; w HA przez Supervisor API. |
| `/api/reload-pipeline` | POST | Tworzy `.reload_pipeline`; `bridge.sh` restartuje pipeline dekodowania. |
| `/api/preview-candidate` | POST | Tworzy tymczasowy plik licznika preview w instancji LISTEN. |
| `/api/cancel-preview` | POST | Usuwa preview i przeładowuje LISTEN. |
| `/api/ignore`, `/api/unignore` | POST | Ukrywa lub przywraca kandydata. |
| `/api/restart-bridge` | POST | Restartuje cały dodatek przez Supervisor API. |
| `/api/search-control` | POST | Włącza lub wyłącza zaawansowany SEARCH. |

Odświeżanie live używa `EventSource` na `/api/events`. Gdy `EventSource` nie jest dostępny, frontend przechodzi na odpytywanie.

### Konfiguracja

Opcje Home Assistant są zdefiniowane w `config.yaml`.

Ważne wartości domyślne:

| Opcja | Domyślnie | Znaczenie |
|---|---|---|
| `raw_topic` | `wmbus/+/telegram` | Topic MQTT z payloadem RAW HEX. |
| `loglevel` | `normal` | `normal`, `verbose` albo `debug`. |
| `filter_hex_only` | `true` | Usuwa whitespace i akceptuje tylko parzystej długości HEX. |
| `debug_every_n` | `0` | Wypisuje co N-ty zaakceptowany telegram, gdy wartość jest większa od zera. |
| `discovery_enabled` | `true` | Publikuje Home Assistant MQTT Discovery. |
| `discovery_prefix` | `homeassistant` | Prefix Discovery. |
| `discovery_retain` | `true` | Retain dla konfiguracji Discovery. |
| `state_prefix` | `wmbusmeters` | Prefix topiców stanu MQTT. |
| `state_retain` | `false` | Retain dla stanów. |
| `mqtt_mode` | `auto` | `auto`, `ha` albo `external`. |
| `external_mqtt_port` | `1883` | Port zewnętrznego brokera. |
| `meters` | `[]` | Lista skonfigurowanych liczników. |

Tryby MQTT:

- `auto` - użyj usługi MQTT Home Assistant, jeśli jest dostępna; inaczej wymagaj ustawień brokera zewnętrznego.
- `ha` - wymagaj usługi MQTT Home Assistant.
- `external` - użyj `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password`.

Format wpisu licznika:

```json
{
  "id": "zimna_woda",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

`meter_id` jest obsługiwany przez WebGUI i helpery bridge jako 8-znakowy identyfikator HEX. `key` pozostaje pusty dla liczników bez klucza AES albo zawiera 32 znaki HEX.

### Pliki Runtime

Home Assistant używa `/data`. Docker używa `/config`, jeśli nie zmieniono `WMBUS_BASE`.

| Plik | Znaczenie |
|---|---|
| `options.json` | Aktualne opcje czytane przez bridge i WebUI. |
| `etc/wmbusmeters.conf` | Wygenerowana konfiguracja głównego `wmbusmeters`. |
| `etc/wmbusmeters.d/` | Wygenerowane pliki skonfigurowanych liczników. |
| `listen/etc/wmbusmeters.conf` | Wygenerowana konfiguracja listen-only. |
| `listen/etc/wmbusmeters.d/meter-preview-*` | Tymczasowe pliki preview. |
| `status.json` | Główny status runtime. |
| `status_meters.tsv` | Zdekodowane skonfigurowane liczniki. |
| `status_candidates.tsv` | Kandydaci LISTEN. |
| `status_events.tsv` | Zdarzenia runtime. |
| `status_seen.tsv` | Statystyki odbioru per ID. |
| `status_rate_1m.json`, `status_rate_history.tsv` | Dane tempa telegramów. |
| `status_candidate_analysis.tsv`, `status_candidate_raw.tsv` | Analiza kandydatów. |
| `status_candidate_values.tsv` | Wartości preview zdekodowane przez LISTEN. |
| `status_ignored_candidates.tsv` | Kandydaci ukryci w WebGUI. |
| `status_esp_telegram_devices.tsv` | Aktywność ESP na podstawie topicu RAW. |
| `status_esp_diag.json`, `status_esp_events.tsv` | Diagnostyka ESP z topiców `wmbus/+/diag...`. |
| `status_esp_suggestion.json`, `status_esp_boot.json` | Payloady suggestion i boot z ESP. |
| `search_candidates.tsv`, `search_matches.tsv`, `search_status.json` | Stan zaawansowanego SEARCH. |
| `.reload_pipeline`, `.reload_listen` | Flagi miękkiego przeładowania obsługiwane przez `bridge.sh`. |

### Śledzenie ESP

Bridge śledzi aktywne ESP z topicu RAW. Dla domyślnego `raw_topic` `wmbus/+/telegram` segment pasujący do `+` jest traktowany jako nazwa urządzenia, np. `wmbus/xiaoseed/telegram` daje `xiaoseed`.

Jeśli `raw_topic` nie ma wildcardu `+`, śledzenie per urządzenie z topicu RAW jest wyłączone. Diagnostyka ESP może nadal być czytana z `wmbus/+/diag` i `wmbus/+/diag/#`, jeżeli ESP ją publikuje.

### Licencja i Atrybucje

Projekt jest dystrybuowany na licencji GNU GPL v3.0. Zobacz [LICENSE](LICENSE).

Repozytorium zawiera lub wywodzi się z:

- `wmbusmeters` - GPL-3.0
- `wmbusmeters-ha-addon` - GPL-3.0
- `morphdom.min.js` - MIT, opisane w [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

---

## Deutsch

### Umfang

`wMBus MQTT Bridge NewGUI` ist ein experimentelles Home-Assistant-Add-on. Das Projekt implementiert keinen eigenen Wireless-M-Bus-Decoder. Die Dekodierung erfolgt durch upstream `wmbusmeters`.

Der Eingang ist ein RAW-HEX-Telegramm auf MQTT, normalerweise von einem externen Empfänger wie einem ESP32-Gateway mit wMBus-Funkmodul.

Typischer Datenpfad:

```text
ESP32 / Gateway
  -> MQTT RAW HEX Payload, HA-Standardtopic: wmbus/+/telegram
  -> bridge.sh
  -> wmbusmeters --useconfig /data
  -> MQTT State Topic: wmbusmeters/<id>/state
  -> optional Home Assistant MQTT Discovery unter homeassistant/...
```

Das Add-on läuft mit:

- `ingress: true`
- `ingress_port: 8099`
- `hassio_api: true`
- `stage: experimental`
- Architekturen: `amd64`, `aarch64`

### Runtime-Komponenten

| Komponente | Pfad | Funktion |
|---|---|---|
| Add-on-Metadaten | `config.yaml` | Name, Version, Schema, Ingress und MQTT-Serviceanforderung. |
| Bridge | `rootfs/usr/bin/bridge.sh` | MQTT-Abo, HEX-Filter, `wmbusmeters`, MQTT State, Discovery, Statusdateien. |
| HA-Wrapper | `rootfs/usr/bin/run.sh` | Wählt MQTT in `auto`, `ha` oder `external` und startet `bridge.sh`. |
| Web/API-Server | `rootfs/usr/bin/webui.py` | Serviert SPA, API, SSE, Supervisor-API-Schreibzugriffe und Docker-Fallback. |
| Übersetzungen | `rootfs/usr/bin/i18n.py` | UI-Texte und Spracherkennung für `en`, `pl`, `de`, `cs`, `sk`. |
| Frontend | `rootfs/usr/share/wmbus-webui/` | Statisches WebGUI: Dashboard, Meters, Discover, Logs, ESP Logs, Settings, About. |
| Docker-Wrapper | `docker/entrypoint.sh` | Erstellt `/config/options.json` bei Bedarf und startet `webui.py` und `bridge.sh`. |

### Betriebsarten

| Modus | Bedingung | Verhalten |
|---|---|---|
| LISTEN | `meters` ist leer | `wmbusmeters` hört sichtbare Telegramme, `bridge.sh` schreibt Kandidaten in Statusdateien. |
| DECODE | `meters` enthält Zähler | `bridge.sh` erzeugt Zählerdateien für `wmbusmeters` und veröffentlicht JSON für konfigurierte IDs. |
| DECODE + LISTEN | konfigurierte Zähler existieren | Eine zweite listen-only Instanz hält Kandidatendaten verfügbar, während die Hauptpipeline dekodiert. |
| SEARCH | `search_mode: true` | Erweiterte Suche nach Zählerstand mit Kandidaten aus `search_candidates.tsv`. |

Der normale NewGUI-Ablauf ist Discover: Kandidaten beobachten, optional Preview-Wert anfordern, nach Wert filtern und den Zähler hinzufügen.

### WebGUI und API

Das WebGUI läuft auf Port `8099`. In Home Assistant wird es per Ingress geöffnet. In Docker muss der Port gemappt werden.

Hauptansichten:

| Route | Inhalt |
|---|---|
| `#/dashboard` | Pipeline oder Statistikansicht. |
| `#/meters` | Konfigurierte Zähler, ausstehende Zähler und Entfernen. |
| `#/discover` | LISTEN-Kandidaten, Preview-Wert, Filter, Ignorieren/Wiederherstellen und Hinzufügen. |
| `#/logs` | Runtime-Ereignisse. |
| `#/esp-logs` | ESP-Geräte und Diagnostik. |
| `#/settings` | Runtime-Konfiguration und Statussnapshot. |
| `#/about` | Version, Pfade und Projektinformationen. |
| `#/search` | Erweiterte SEARCH-Ansicht. |

Wichtige API-Endpunkte:

| Endpoint | Methode | Funktion |
|---|---:|---|
| `/api/app` | GET | Vollständiges Frontend-Datenmodell inklusive i18n. |
| `/api/events` | GET | Server-Sent Events für Live-Updates. |
| `/api/status` | GET | Rohes Statussnapshot. |
| `/api/add-meter` | POST | Fügt einen Zähler zu `options.json` hinzu; in HA per Supervisor API, sonst direkt in die Datei. |
| `/api/remove-meter` | POST | Entfernt einen Zähler aus `options.json`; in HA per Supervisor API. |
| `/api/reload-pipeline` | POST | Erstellt `.reload_pipeline`; `bridge.sh` startet die Decode-Pipeline neu. |
| `/api/preview-candidate` | POST | Erstellt temporäre Preview-Zählerdatei in der LISTEN-Instanz. |
| `/api/cancel-preview` | POST | Entfernt Preview und lädt LISTEN neu. |
| `/api/ignore`, `/api/unignore` | POST | Kandidat ausblenden oder wiederherstellen. |
| `/api/restart-bridge` | POST | Startet das gesamte Add-on über Supervisor API neu. |
| `/api/search-control` | POST | Aktiviert oder deaktiviert erweiterten SEARCH. |

Live-Updates verwenden `EventSource` auf `/api/events`. Ohne `EventSource` nutzt das Frontend Polling.

### Konfiguration

Home-Assistant-Optionen sind in `config.yaml` definiert.

Wichtige Standardwerte:

| Option | Standard | Bedeutung |
|---|---|---|
| `raw_topic` | `wmbus/+/telegram` | MQTT-Topic mit RAW-HEX-Payload. |
| `loglevel` | `normal` | `normal`, `verbose` oder `debug`. |
| `filter_hex_only` | `true` | Whitespace entfernen und nur gerade HEX-Länge akzeptieren. |
| `debug_every_n` | `0` | Gibt jedes N-te akzeptierte Telegramm aus, wenn größer null. |
| `discovery_enabled` | `true` | Home Assistant MQTT Discovery veröffentlichen. |
| `discovery_prefix` | `homeassistant` | Discovery-Präfix. |
| `discovery_retain` | `true` | Discovery-Konfigurationen retained senden. |
| `state_prefix` | `wmbusmeters` | Präfix für MQTT-State-Topics. |
| `state_retain` | `false` | State-Nachrichten retained senden. |
| `mqtt_mode` | `auto` | `auto`, `ha` oder `external`. |
| `external_mqtt_port` | `1883` | Port des externen Brokers. |
| `meters` | `[]` | Liste konfigurierter Zähler. |

MQTT-Modi:

- `auto` - Home-Assistant-MQTT-Service nutzen, wenn verfügbar; sonst externe Brokerwerte verlangen.
- `ha` - Home-Assistant-MQTT-Service erzwingen.
- `external` - `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password` verwenden.

Zählereintrag:

```json
{
  "id": "cold_water",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

`meter_id` wird durch WebGUI und Bridge-Helfer als 8-stellige HEX-ID behandelt. `key` bleibt leer oder enthält einen 32-stelligen HEX-AES-Schlüssel.

### Runtime-Dateien

Home Assistant verwendet `/data`. Docker verwendet `/config`, sofern `WMBUS_BASE` nicht geändert wurde.

| Datei | Bedeutung |
|---|---|
| `options.json` | Aktuelle Optionen für Bridge und WebUI. |
| `etc/wmbusmeters.conf` | Generierte Hauptkonfiguration für `wmbusmeters`. |
| `etc/wmbusmeters.d/` | Generierte Dateien für konfigurierte Zähler. |
| `listen/etc/wmbusmeters.conf` | Generierte listen-only Konfiguration. |
| `listen/etc/wmbusmeters.d/meter-preview-*` | Temporäre Preview-Dateien. |
| `status.json` | Hauptstatus. |
| `status_meters.tsv` | Dekodierte konfigurierte Zähler. |
| `status_candidates.tsv` | LISTEN-Kandidaten. |
| `status_events.tsv` | Runtime-Ereignisse. |
| `status_seen.tsv` | Empfangsstatistik pro ID. |
| `status_rate_1m.json`, `status_rate_history.tsv` | Telegrammrate. |
| `status_candidate_analysis.tsv`, `status_candidate_raw.tsv` | Kandidatenanalyse. |
| `status_candidate_values.tsv` | Preview-Werte aus der LISTEN-Instanz. |
| `status_ignored_candidates.tsv` | Im WebGUI ausgeblendete Kandidaten. |
| `status_esp_telegram_devices.tsv` | ESP-Aktivität aus RAW-Topic-Verkehr. |
| `status_esp_diag.json`, `status_esp_events.tsv` | ESP-Diagnostik aus `wmbus/+/diag...`. |
| `status_esp_suggestion.json`, `status_esp_boot.json` | ESP suggestion und boot Payloads. |
| `search_candidates.tsv`, `search_matches.tsv`, `search_status.json` | Erweiterter SEARCH-Status. |
| `.reload_pipeline`, `.reload_listen` | Soft-Reload-Flags für `bridge.sh`. |

### ESP-Erkennung

Die Bridge erkennt aktive ESPs aus dem RAW-Telegramm-Topic. Bei `raw_topic` `wmbus/+/telegram` wird das Segment, das `+` entspricht, als Gerätename verwendet, zum Beispiel `wmbus/xiaoseed/telegram` -> `xiaoseed`.

Wenn `raw_topic` kein `+` enthält, ist RAW-basierte Geräteerkennung deaktiviert. Diagnostik kann weiterhin über `wmbus/+/diag` und `wmbus/+/diag/#` gelesen werden, wenn das ESP sie veröffentlicht.

### Lizenz und Attribution

Das Projekt steht unter GNU GPL v3.0. Siehe [LICENSE](LICENSE).

Das Repository enthält oder basiert auf:

- `wmbusmeters` - GPL-3.0
- `wmbusmeters-ha-addon` - GPL-3.0
- `morphdom.min.js` - MIT, dokumentiert in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

---

## Slovencina

### Rozsah

`wMBus MQTT Bridge NewGUI` je experimentálny doplnok pre Home Assistant. Projekt neimplementuje vlastný dekodér Wireless M-Bus. Dekódovanie vykonáva upstreamový `wmbusmeters`.

Vstupom je surový HEX telegram publikovaný do MQTT, zvyčajne z externého prijímača, napríklad ESP32 brány s wMBus rádiovým modulom.

Typický tok dát:

```text
ESP32 / brána
  -> MQTT RAW HEX payload, predvolený HA topic: wmbus/+/telegram
  -> bridge.sh
  -> wmbusmeters --useconfig /data
  -> MQTT stavový topic: wmbusmeters/<id>/state
  -> voliteľne Home Assistant MQTT Discovery pod homeassistant/...
```

Doplnok beží s:

- `ingress: true`
- `ingress_port: 8099`
- `hassio_api: true`
- `stage: experimental`
- architektúry: `amd64`, `aarch64`

### Runtime Komponenty

| Komponent | Cesta | Funkcia |
|---|---|---|
| Metadáta doplnku | `config.yaml` | Názov, verzia, schema, Ingress a požiadavka na MQTT službu. |
| Bridge | `rootfs/usr/bin/bridge.sh` | MQTT odber, HEX filter, `wmbusmeters`, MQTT stav, Discovery, stavové súbory. |
| HA wrapper | `rootfs/usr/bin/run.sh` | Vyberá MQTT broker v režime `auto`, `ha` alebo `external` a spúšťa `bridge.sh`. |
| Web/API server | `rootfs/usr/bin/webui.py` | Servíruje SPA, API, SSE, zápisy cez Supervisor API a Docker fallback. |
| Preklady | `rootfs/usr/bin/i18n.py` | Texty UI a detekcia jazyka pre `en`, `pl`, `de`, `cs`, `sk`. |
| Frontend | `rootfs/usr/share/wmbus-webui/` | Statické WebGUI: dashboard, meters, discover, logs, ESP logs, settings, about. |
| Docker wrapper | `docker/entrypoint.sh` | Vytvorí `/config/options.json`, ak chýba, a spustí `webui.py` a `bridge.sh`. |

### Režimy Prevádzky

| Režim | Podmienka | Správanie |
|---|---|---|
| LISTEN | `meters` je prázdne | `wmbusmeters` počúva viditeľné telegramy a `bridge.sh` zapisuje kandidátov do stavových súborov. |
| DECODE | `meters` obsahuje merače | `bridge.sh` vytvorí súbory meračov pre `wmbusmeters` a publikuje JSON pre nakonfigurované ID. |
| DECODE + LISTEN | existujú nakonfigurované merače | Druhá listen-only inštancia udržiava údaje kandidátov, kým hlavná pipeline dekóduje merače. |
| SEARCH | `search_mode: true` | Pokročilé hľadanie podľa odpočtu s kandidátmi zo `search_candidates.tsv`. |

Bežný onboarding v NewGUI je Discover: sledovanie kandidátov, prípadne preview hodnoty, filtrovanie podľa hodnoty a pridanie merača.

### WebGUI a API

WebGUI beží na porte `8099`. V Home Assistant sa otvára cez Ingress. V Dockeri musí byť port namapovaný.

Hlavné pohľady:

| Route | Obsah |
|---|---|
| `#/dashboard` | Pipeline alebo štatistiky. |
| `#/meters` | Nakonfigurované merače, čakajúce merače a odstránenie. |
| `#/discover` | LISTEN kandidáti, preview hodnota, filtre, ignorovanie/obnovenie a pridanie. |
| `#/logs` | Runtime udalosti. |
| `#/esp-logs` | ESP zariadenia a diagnostika. |
| `#/settings` | Runtime konfigurácia a snapshot stavu. |
| `#/about` | Verzia, cesty a informácie o projekte. |
| `#/search` | Pokročilý SEARCH pohľad. |

Dôležité API endpointy:

| Endpoint | Metóda | Funkcia |
|---|---:|---|
| `/api/app` | GET | Kompletný dátový model frontendu vrátane i18n. |
| `/api/events` | GET | Server-Sent Events pre živé aktualizácie. |
| `/api/status` | GET | Surový snapshot stavu. |
| `/api/add-meter` | POST | Pridá merač do `options.json`; v HA cez Supervisor API, mimo HA priamo do súboru. |
| `/api/remove-meter` | POST | Odstráni merač z `options.json`; v HA cez Supervisor API. |
| `/api/reload-pipeline` | POST | Vytvorí `.reload_pipeline`; `bridge.sh` reštartuje dekódovaciu pipeline. |
| `/api/preview-candidate` | POST | Vytvorí dočasný preview súbor merača v LISTEN inštancii. |
| `/api/cancel-preview` | POST | Odstráni preview a znovu načíta LISTEN. |
| `/api/ignore`, `/api/unignore` | POST | Skryje alebo obnoví kandidáta. |
| `/api/restart-bridge` | POST | Reštartuje celý doplnok cez Supervisor API. |
| `/api/search-control` | POST | Zapne alebo vypne pokročilý SEARCH. |

Živé aktualizácie používajú `EventSource` na `/api/events`. Ak `EventSource` nie je dostupný, frontend použije polling.

### Konfigurácia

Možnosti Home Assistant sú definované v `config.yaml`.

Dôležité predvolené hodnoty:

| Možnosť | Predvolené | Význam |
|---|---|---|
| `raw_topic` | `wmbus/+/telegram` | MQTT topic s RAW HEX payloadom. |
| `loglevel` | `normal` | `normal`, `verbose` alebo `debug`. |
| `filter_hex_only` | `true` | Odstráni whitespace a prijíma len párnu dĺžku HEX. |
| `debug_every_n` | `0` | Vypíše každý N-tý prijatý telegram, ak je hodnota väčšia ako nula. |
| `discovery_enabled` | `true` | Publikuje Home Assistant MQTT Discovery. |
| `discovery_prefix` | `homeassistant` | Discovery prefix. |
| `discovery_retain` | `true` | Retain pre Discovery konfiguráciu. |
| `state_prefix` | `wmbusmeters` | Prefix MQTT stavových topicov. |
| `state_retain` | `false` | Retain pre stavové správy. |
| `mqtt_mode` | `auto` | `auto`, `ha` alebo `external`. |
| `external_mqtt_port` | `1883` | Port externého brokera. |
| `meters` | `[]` | Zoznam nakonfigurovaných meračov. |

MQTT režimy:

- `auto` - použiť MQTT službu Home Assistant, ak je dostupná; inak vyžadovať externý broker.
- `ha` - vyžadovať MQTT službu Home Assistant.
- `external` - použiť `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password`.

Tvar záznamu merača:

```json
{
  "id": "studena_voda",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

`meter_id` WebGUI a bridge helpery spracúvajú ako 8-znakové HEX ID. `key` je prázdny alebo obsahuje 32-znakový HEX AES kľúč.

### Runtime Súbory

Home Assistant používa `/data`. Docker používa `/config`, ak nie je zmenené `WMBUS_BASE`.

| Súbor | Význam |
|---|---|
| `options.json` | Aktuálne možnosti pre bridge a WebUI. |
| `etc/wmbusmeters.conf` | Vygenerovaná hlavná konfigurácia `wmbusmeters`. |
| `etc/wmbusmeters.d/` | Vygenerované súbory nakonfigurovaných meračov. |
| `listen/etc/wmbusmeters.conf` | Vygenerovaná listen-only konfigurácia. |
| `listen/etc/wmbusmeters.d/meter-preview-*` | Dočasné preview súbory. |
| `status.json` | Hlavný runtime status. |
| `status_meters.tsv` | Dekódované nakonfigurované merače. |
| `status_candidates.tsv` | LISTEN kandidáti. |
| `status_events.tsv` | Runtime udalosti. |
| `status_seen.tsv` | Štatistiky príjmu podľa ID. |
| `status_rate_1m.json`, `status_rate_history.tsv` | Údaje o rýchlosti telegramov. |
| `status_candidate_analysis.tsv`, `status_candidate_raw.tsv` | Analýza kandidátov. |
| `status_candidate_values.tsv` | Preview hodnoty z LISTEN inštancie. |
| `status_ignored_candidates.tsv` | Kandidáti skrytí vo WebGUI. |
| `status_esp_telegram_devices.tsv` | Aktivita ESP z RAW topicu. |
| `status_esp_diag.json`, `status_esp_events.tsv` | ESP diagnostika z `wmbus/+/diag...`. |
| `status_esp_suggestion.json`, `status_esp_boot.json` | ESP suggestion a boot payloady. |
| `search_candidates.tsv`, `search_matches.tsv`, `search_status.json` | Stav pokročilého SEARCH. |
| `.reload_pipeline`, `.reload_listen` | Soft-reload flagy pre `bridge.sh`. |

### Sledovanie ESP

Bridge sleduje aktívne ESP z RAW telegram topicu. Pri `raw_topic` `wmbus/+/telegram` sa segment zodpovedajúci `+` berie ako názov zariadenia, napríklad `wmbus/xiaoseed/telegram` -> `xiaoseed`.

Ak `raw_topic` nemá wildcard `+`, sledovanie zariadení z RAW topicu je vypnuté. Diagnostika môže byť stále čítaná z `wmbus/+/diag` a `wmbus/+/diag/#`, ak ju ESP publikuje.

### Licencia a Atribúcia

Projekt je distribuovaný pod GNU GPL v3.0. Pozri [LICENSE](LICENSE).

Repozitár obsahuje alebo vychádza z:

- `wmbusmeters` - GPL-3.0
- `wmbusmeters-ha-addon` - GPL-3.0
- `morphdom.min.js` - MIT, zdokumentované v [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

---

## Cestina

### Rozsah

`wMBus MQTT Bridge NewGUI` je experimentální doplněk pro Home Assistant. Projekt neimplementuje vlastní dekodér Wireless M-Bus. Dekódování provádí upstreamový `wmbusmeters`.

Vstupem je surový HEX telegram publikovaný do MQTT, obvykle z externího přijímače, například ESP32 brány s wMBus rádiovým modulem.

Typický tok dat:

```text
ESP32 / brána
  -> MQTT RAW HEX payload, výchozí HA topic: wmbus/+/telegram
  -> bridge.sh
  -> wmbusmeters --useconfig /data
  -> MQTT stavový topic: wmbusmeters/<id>/state
  -> volitelně Home Assistant MQTT Discovery pod homeassistant/...
```

Doplněk běží s:

- `ingress: true`
- `ingress_port: 8099`
- `hassio_api: true`
- `stage: experimental`
- architektury: `amd64`, `aarch64`

### Runtime Komponenty

| Komponenta | Cesta | Funkce |
|---|---|---|
| Metadata doplňku | `config.yaml` | Název, verze, schema, Ingress a požadavek na MQTT službu. |
| Bridge | `rootfs/usr/bin/bridge.sh` | MQTT odběr, HEX filtr, `wmbusmeters`, MQTT stav, Discovery, stavové soubory. |
| HA wrapper | `rootfs/usr/bin/run.sh` | Vybírá MQTT broker v režimu `auto`, `ha` nebo `external` a spouští `bridge.sh`. |
| Web/API server | `rootfs/usr/bin/webui.py` | Servíruje SPA, API, SSE, zápisy přes Supervisor API a Docker fallback. |
| Překlady | `rootfs/usr/bin/i18n.py` | Texty UI a detekce jazyka pro `en`, `pl`, `de`, `cs`, `sk`. |
| Frontend | `rootfs/usr/share/wmbus-webui/` | Statické WebGUI: dashboard, meters, discover, logs, ESP logs, settings, about. |
| Docker wrapper | `docker/entrypoint.sh` | Vytvoří `/config/options.json`, pokud chybí, a spustí `webui.py` a `bridge.sh`. |

### Provozní Režimy

| Režim | Podmínka | Chování |
|---|---|---|
| LISTEN | `meters` je prázdné | `wmbusmeters` poslouchá viditelné telegramy a `bridge.sh` zapisuje kandidáty do stavových souborů. |
| DECODE | `meters` obsahuje měřiče | `bridge.sh` vytvoří soubory měřičů pro `wmbusmeters` a publikuje JSON pro nakonfigurovaná ID. |
| DECODE + LISTEN | existují nakonfigurované měřiče | Druhá listen-only instance udržuje data kandidátů, zatímco hlavní pipeline dekóduje měřiče. |
| SEARCH | `search_mode: true` | Pokročilé hledání podle odečtu s kandidáty ze `search_candidates.tsv`. |

Běžný onboarding v NewGUI je Discover: sledování kandidátů, případně preview hodnoty, filtr podle hodnoty a přidání měřiče.

### WebGUI a API

WebGUI běží na portu `8099`. V Home Assistant se otevírá přes Ingress. V Dockeru musí být port namapován.

Hlavní pohledy:

| Route | Obsah |
|---|---|
| `#/dashboard` | Pipeline nebo statistiky. |
| `#/meters` | Nakonfigurované měřiče, čekající měřiče a odstranění. |
| `#/discover` | LISTEN kandidáti, preview hodnota, filtry, ignorování/obnovení a přidání. |
| `#/logs` | Runtime události. |
| `#/esp-logs` | ESP zařízení a diagnostika. |
| `#/settings` | Runtime konfigurace a snapshot stavu. |
| `#/about` | Verze, cesty a informace o projektu. |
| `#/search` | Pokročilý SEARCH pohled. |

Důležité API endpointy:

| Endpoint | Metoda | Funkce |
|---|---:|---|
| `/api/app` | GET | Kompletní datový model frontendu včetně i18n. |
| `/api/events` | GET | Server-Sent Events pro živé aktualizace. |
| `/api/status` | GET | Surový snapshot stavu. |
| `/api/add-meter` | POST | Přidá měřič do `options.json`; v HA přes Supervisor API, mimo HA přímo do souboru. |
| `/api/remove-meter` | POST | Odstraní měřič z `options.json`; v HA přes Supervisor API. |
| `/api/reload-pipeline` | POST | Vytvoří `.reload_pipeline`; `bridge.sh` restartuje dekódovací pipeline. |
| `/api/preview-candidate` | POST | Vytvoří dočasný preview soubor měřiče v LISTEN instanci. |
| `/api/cancel-preview` | POST | Odstraní preview a znovu načte LISTEN. |
| `/api/ignore`, `/api/unignore` | POST | Skryje nebo obnoví kandidáta. |
| `/api/restart-bridge` | POST | Restartuje celý doplněk přes Supervisor API. |
| `/api/search-control` | POST | Zapne nebo vypne pokročilý SEARCH. |

Živé aktualizace používají `EventSource` na `/api/events`. Pokud `EventSource` není dostupný, frontend použije polling.

### Konfigurace

Možnosti Home Assistant jsou definované v `config.yaml`.

Důležité výchozí hodnoty:

| Možnost | Výchozí | Význam |
|---|---|---|
| `raw_topic` | `wmbus/+/telegram` | MQTT topic s RAW HEX payloadem. |
| `loglevel` | `normal` | `normal`, `verbose` nebo `debug`. |
| `filter_hex_only` | `true` | Odstraní whitespace a přijímá jen sudou délku HEX. |
| `debug_every_n` | `0` | Vypíše každý N-tý přijatý telegram, pokud je hodnota větší než nula. |
| `discovery_enabled` | `true` | Publikuje Home Assistant MQTT Discovery. |
| `discovery_prefix` | `homeassistant` | Discovery prefix. |
| `discovery_retain` | `true` | Retain pro Discovery konfiguraci. |
| `state_prefix` | `wmbusmeters` | Prefix MQTT stavových topiců. |
| `state_retain` | `false` | Retain pro stavové zprávy. |
| `mqtt_mode` | `auto` | `auto`, `ha` nebo `external`. |
| `external_mqtt_port` | `1883` | Port externího brokeru. |
| `meters` | `[]` | Seznam nakonfigurovaných měřičů. |

MQTT režimy:

- `auto` - použít MQTT službu Home Assistant, pokud je dostupná; jinak vyžadovat externí broker.
- `ha` - vyžadovat MQTT službu Home Assistant.
- `external` - použít `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password`.

Tvar záznamu měřiče:

```json
{
  "id": "studena_voda",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

`meter_id` WebGUI a bridge helpery zpracovávají jako 8znakové HEX ID. `key` je prázdný nebo obsahuje 32znakový HEX AES klíč.

### Runtime Soubory

Home Assistant používá `/data`. Docker používá `/config`, pokud není změněno `WMBUS_BASE`.

| Soubor | Význam |
|---|---|
| `options.json` | Aktuální možnosti pro bridge a WebUI. |
| `etc/wmbusmeters.conf` | Vygenerovaná hlavní konfigurace `wmbusmeters`. |
| `etc/wmbusmeters.d/` | Vygenerované soubory nakonfigurovaných měřičů. |
| `listen/etc/wmbusmeters.conf` | Vygenerovaná listen-only konfigurace. |
| `listen/etc/wmbusmeters.d/meter-preview-*` | Dočasné preview soubory. |
| `status.json` | Hlavní runtime status. |
| `status_meters.tsv` | Dekódované nakonfigurované měřiče. |
| `status_candidates.tsv` | LISTEN kandidáti. |
| `status_events.tsv` | Runtime události. |
| `status_seen.tsv` | Statistiky příjmu podle ID. |
| `status_rate_1m.json`, `status_rate_history.tsv` | Údaje o rychlosti telegramů. |
| `status_candidate_analysis.tsv`, `status_candidate_raw.tsv` | Analýza kandidátů. |
| `status_candidate_values.tsv` | Preview hodnoty z LISTEN instance. |
| `status_ignored_candidates.tsv` | Kandidáti skrytí ve WebGUI. |
| `status_esp_telegram_devices.tsv` | Aktivita ESP z RAW topicu. |
| `status_esp_diag.json`, `status_esp_events.tsv` | ESP diagnostika z `wmbus/+/diag...`. |
| `status_esp_suggestion.json`, `status_esp_boot.json` | ESP suggestion a boot payloady. |
| `search_candidates.tsv`, `search_matches.tsv`, `search_status.json` | Stav pokročilého SEARCH. |
| `.reload_pipeline`, `.reload_listen` | Soft-reload flagy pro `bridge.sh`. |

### Sledování ESP

Bridge sleduje aktivní ESP z RAW telegram topicu. Při `raw_topic` `wmbus/+/telegram` se segment odpovídající `+` bere jako název zařízení, například `wmbus/xiaoseed/telegram` -> `xiaoseed`.

Pokud `raw_topic` nemá wildcard `+`, sledování zařízení z RAW topicu je vypnuté. Diagnostika může být stále čtena z `wmbus/+/diag` a `wmbus/+/diag/#`, pokud ji ESP publikuje.

### Licence a Atribuce

Projekt je distribuován pod GNU GPL v3.0. Viz [LICENSE](LICENSE).

Repozitář obsahuje nebo vychází z:

- `wmbusmeters` - GPL-3.0
- `wmbusmeters-ha-addon` - GPL-3.0
- `morphdom.min.js` - MIT, zdokumentováno v [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
