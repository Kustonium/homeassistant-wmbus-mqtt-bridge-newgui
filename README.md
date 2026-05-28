# Home Assistant Add-on: wMBus MQTT Bridge NewGUI

**Dokumentacja / Documentation**

- [PL](docs/README.pl.md)
- [EN](docs/README.en.md)
- [DE](docs/README.de.md)
- [CS](docs/README.cs.md)
- [SK](docs/README.sk.md)

Ten dokument jest skrótem PL/EN. Pełne dokumenty językowe są w katalogu `docs/`.
Pliki dokumentacji pochodzą ze starej wersji projektu i zostały utrzymane w tych
samych językach: polski, angielski, niemiecki, czeski i słowacki.

Machine-generated translations may contain mistakes in every language, including
Polish and English.

---

## PL - co to jest

`wMBus MQTT Bridge NewGUI` dekoduje telegramy Wireless M-Bus bez lokalnego
dongla radiowego przy Home Assistant. Zewnętrzny odbiornik, na przykład ESP32 z
CC1101/SX1276/SX1262, publikuje surowy telegram HEX do MQTT, a ten add-on podaje
go do `wmbusmeters` przez `stdin:hex`.

Przepływ danych:

```text
ESP32 / gateway / bridge
  -> MQTT raw HEX, domyślnie wmbus/+/telegram
  -> bridge.sh
  -> wmbusmeters --useconfig /data
  -> MQTT state, domyślnie wmbusmeters/<id>/...
  -> Home Assistant MQTT Discovery, domyślnie homeassistant/...
```

Projekt jest forkiem i rozwinięciem `wmbusmeters-ha-addon`, ale ma nową warstwę
WebGUI. Stary serwerowy HTML został zastąpiony statycznym SPA w
`rootfs/usr/share/wmbus-webui`, które rozmawia z `webui.py` przez API i live
events.

### Najważniejsze funkcje

- MQTT jako wejście dla surowych telegramów HEX.
- Dekodowanie przez upstream `wmbusmeters`, bez własnego dekodera w projekcie.
- Home Assistant add-on z Ingress oraz tryb Docker standalone.
- Nowe WebGUI typu SPA: dashboard live, tabele, filtry, logi, ESP logs,
  ustawienia i widok About.
- Live refresh przez `EventSource` na `/api/events`; fallback do zwykłego
  odpytywania, gdy SSE nie jest dostępne.
- Wielojęzyczny interfejs: `en`, `pl`, `de`, `cs`, `sk`.
- Tryb LISTEN, DECODE z równoległym LISTEN oraz ukryty/zaawansowany tryb SEARCH.
- Soft reload pipeline po dodaniu/usunięciu licznika, bez pełnego restartu
  kontenera tam, gdzie wystarcza przeładowanie `wmbusmeters`.

### WebGUI

Widoczne trasy:

- `#/dashboard` - pipeline albo statystyki, przełączane w dashboardzie.
- `#/meters` - skonfigurowane liczniki oraz pending meters.
- `#/discover` - kandydaci z LISTEN, filtrowanie, preview value, dodawanie,
  ignorowanie i przywracanie.
- `#/logs` - zdarzenia runtime bridge/WebUI.
- `#/esp-logs` - diagnostyka ESP, zdarzenia i sugestie.
- `#/settings` - podgląd aktualnej konfiguracji i runtime.
- `#/about` - informacje o wersji, ścieżkach i projekcie.

Zaawansowana trasa `#/search` nadal istnieje, ale nie jest główną ścieżką pracy.
Najczęstsze identyfikowanie licznika odbywa się teraz w `#/discover` przez
preview value oraz filtr po wartości.

### Home Assistant

Add-on używa `config.yaml`:

- `ingress: true`
- `ingress_port: 8099`
- `hassio_api: true`
- `panel_title: wMBus Bridge NewGUI`
- domyślny `raw_topic: wmbus/+/telegram`

Tryb MQTT:

- `auto` - użyj brokera HA, jeśli jest dostępny; w innym razie external.
- `ha` - wymuś broker Home Assistant.
- `external` - użyj `external_mqtt_host`, `external_mqtt_port`,
  `external_mqtt_username`, `external_mqtt_password`.

### Docker standalone

Docker używa `docker/entrypoint.sh`. Domyślny katalog danych to `/config`, a
WebGUI startuje na porcie `8099`.

Minimalny `docker-compose.yml` powinien wystawić port WebGUI i zamontować
zapisywalny katalog konfiguracji:

```yaml
services:
  wmbus:
    build:
      context: .
      dockerfile: Dockerfile
      target: addon
    entrypoint: ["/usr/bin/docker-entrypoint.sh"]
    ports:
      - "8099:8099"
    volumes:
      - ./config:/config
    environment:
      WMBUS_BASE: /config
      WEBUI_PORT: 8099
```

`docker/entrypoint.sh` tworzy `/config/options.json`, jeśli go nie ma, czyta z
niego ustawienia MQTT i uruchamia równolegle `webui.py` oraz `bridge.sh`.

### Najważniejsze pliki runtime

W Home Assistant bazą jest `/data`, w Dockerze zwykle `/config`.

- `options.json` - konfiguracja użytkownika.
- `status.json` - status MQTT/pipeline/config.
- `status_meters.tsv` - ostatnio dekodowane skonfigurowane liczniki.
- `status_candidates.tsv` - kandydaci z LISTEN.
- `status_events.tsv` - zdarzenia runtime.
- `status_rate_1m.json` i `status_rate_history.tsv` - statystyki telegramów.
- `status_candidate_values.tsv` - preview value dla kandydatów.
- `status_esp_telegram_devices.tsv` - aktywne ESP wykryte z topicu RAW.
- `status_esp_events.tsv`, `status_esp_diag.json` - diagnostyka ESP.
- `.reload_pipeline`, `.reload_listen` - flagi miękkiego przeładowania.

### Licencja i atrybucje

Cały projekt jest dystrybuowany na licencji GNU GPL v3.0. Pełny tekst jest w
pliku [LICENSE](LICENSE).

Projekt zawiera i modyfikuje kod pochodzący z:

- `wmbusmeters` - https://github.com/wmbusmeters/wmbusmeters - GPL-3.0
- `wmbusmeters-ha-addon` - https://github.com/wmbusmeters/wmbusmeters-ha-addon - GPL-3.0

Nowe WebGUI jest inspirowane sposobem pracy Zigbee2MQTT: osobny frontend,
backend API i odświeżanie live. Według obecnego porównania lokalnego repo nie
zawiera skopiowanego kodu ani assetów Zigbee2MQTT. Jeżeli w przyszłości taki kod
zostanie dodany, trzeba zachować odpowiednie copyright notices i warunki GPL-3.0.

`rootfs/usr/share/wmbus-webui/assets/morphdom.min.js` jest biblioteką `morphdom`
na licencji MIT. Szczegóły są w [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## EN - what it is

`wMBus MQTT Bridge NewGUI` decodes Wireless M-Bus telegrams without a local radio
dongle attached to Home Assistant. An external receiver, for example an ESP32
with CC1101/SX1276/SX1262, publishes raw HEX telegrams to MQTT, and this add-on
feeds them into `wmbusmeters` through `stdin:hex`.

Data flow:

```text
ESP32 / gateway / bridge
  -> MQTT raw HEX, default wmbus/+/telegram
  -> bridge.sh
  -> wmbusmeters --useconfig /data
  -> MQTT state, default wmbusmeters/<id>/...
  -> Home Assistant MQTT Discovery, default homeassistant/...
```

The project is a fork and extension of `wmbusmeters-ha-addon`, but it now has a
new WebGUI layer. The old server-rendered HTML was replaced with a static SPA in
`rootfs/usr/share/wmbus-webui`, backed by `webui.py` API endpoints and live
events.

### Main features

- MQTT input for raw HEX telegrams.
- Decoding by upstream `wmbusmeters`; this project does not reimplement the
  decoder.
- Home Assistant add-on with Ingress and standalone Docker mode.
- New SPA WebGUI: live dashboard, tables, filters, logs, ESP logs, settings and
  About view.
- Live refresh through `EventSource` on `/api/events`; polling fallback when SSE
  is unavailable.
- Multilingual UI: `en`, `pl`, `de`, `cs`, `sk`.
- LISTEN mode, DECODE with parallel LISTEN, and hidden/advanced SEARCH mode.
- Soft pipeline reload after adding/removing meters when a full container
  restart is not required.

### WebGUI

Visible routes:

- `#/dashboard` - pipeline or statistics view, selected inside the dashboard.
- `#/meters` - configured meters and pending meters.
- `#/discover` - LISTEN candidates, filters, preview value, add, ignore and
  restore.
- `#/logs` - bridge/WebUI runtime events.
- `#/esp-logs` - ESP diagnostics, events and suggestions.
- `#/settings` - current configuration and runtime snapshot.
- `#/about` - version, paths and project information.

Advanced route `#/search` still exists, but it is no longer the main workflow.
The usual identification workflow now lives in `#/discover` through preview
value and value filtering.

### Home Assistant

The add-on is configured by `config.yaml`:

- `ingress: true`
- `ingress_port: 8099`
- `hassio_api: true`
- `panel_title: wMBus Bridge NewGUI`
- default `raw_topic: wmbus/+/telegram`

MQTT mode:

- `auto` - use the HA broker when available; otherwise use external settings.
- `ha` - force the Home Assistant broker.
- `external` - use `external_mqtt_host`, `external_mqtt_port`,
  `external_mqtt_username`, `external_mqtt_password`.

### Docker standalone

Docker uses `docker/entrypoint.sh`. The default data directory is `/config`, and
the WebGUI listens on port `8099`.

`docker/entrypoint.sh` creates `/config/options.json` if it is missing, reads
MQTT settings from it, then starts `webui.py` and `bridge.sh`.

### Runtime files

Home Assistant uses `/data`; Docker usually uses `/config`.

- `options.json` - user configuration.
- `status.json` - MQTT/pipeline/config status.
- `status_meters.tsv` - last decoded configured meters.
- `status_candidates.tsv` - LISTEN candidates.
- `status_events.tsv` - runtime events.
- `status_rate_1m.json` and `status_rate_history.tsv` - telegram rate stats.
- `status_candidate_values.tsv` - candidate preview values.
- `status_esp_telegram_devices.tsv` - active ESP devices detected from RAW topic.
- `status_esp_events.tsv`, `status_esp_diag.json` - ESP diagnostics.
- `.reload_pipeline`, `.reload_listen` - soft reload flags.

### License and attribution

The whole project is distributed under GNU GPL v3.0. The full text is in
[LICENSE](LICENSE).

The project contains and modifies code derived from:

- `wmbusmeters` - https://github.com/wmbusmeters/wmbusmeters - GPL-3.0
- `wmbusmeters-ha-addon` - https://github.com/wmbusmeters/wmbusmeters-ha-addon - GPL-3.0

The new WebGUI is inspired by the Zigbee2MQTT workflow: separate frontend,
backend API and live updates. Based on the current local comparison, this repo
does not include copied Zigbee2MQTT code or assets. If such code is added later,
the relevant copyright notices and GPL-3.0 obligations must be preserved.

`rootfs/usr/share/wmbus-webui/assets/morphdom.min.js` is the MIT-licensed
`morphdom` library. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
