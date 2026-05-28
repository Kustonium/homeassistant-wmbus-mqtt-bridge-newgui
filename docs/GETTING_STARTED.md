# Getting Started - wMBus MQTT Bridge NewGUI

Version described: `1.5.11-dev.46`.

Language sections:

- [English](#english)
- [Polski](#polski)
- [Deutsch](#deutsch)
- [Slovencina](#slovencina)
- [Cestina](#cestina)

---

## English

### 1. Requirements

- MQTT broker reachable from the add-on or Docker container.
- A device that publishes Wireless M-Bus RAW HEX telegrams to MQTT.
- Default Home Assistant RAW topic: `wmbus/+/telegram`.
- If a meter is AES-encrypted, its 32-character HEX key is required for normal decoding.

The bridge reads MQTT payloads only. With `filter_hex_only: true`, whitespace is removed, optional `0x` is stripped, non-HEX payloads are ignored, and odd-length HEX payloads are ignored.

### 2. Home Assistant Start

1. Configure the add-on options.
2. Keep `mqtt_mode: auto` if the HA MQTT service should be used when available.
3. Use `mqtt_mode: ha` to require the HA MQTT service.
4. Use `mqtt_mode: external` and set `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password` for an external broker.
5. Keep `raw_topic: wmbus/+/telegram` unless the publisher uses a different topic.
6. Start the add-on.
7. Open the WebGUI through Home Assistant Ingress.

The add-on starts two services under HA: the bridge service and the WebGUI service. The WebGUI listens on port `8099` internally.

### 3. Docker Start

From the repository root:

```bash
docker compose -f docker/examples/docker-compose.yml up -d --build
```

Then edit:

```text
docker/examples/config/options.json
```

Restart the container after changing the generated Docker options file:

```bash
docker compose -f docker/examples/docker-compose.yml restart wmbus
```

Docker defaults are created by `docker/entrypoint.sh` when `/config/options.json` is missing. That generated file uses `external_mqtt_host: mosquitto` and `raw_topic: wmbus_bridge/+/telegram`.

### 4. First Telegrams

Start with `meters: []`. In this state the bridge is in LISTEN mode and records candidates.

Open `#/discover`:

1. Wait for candidate IDs.
2. Check driver, media, reception count and last telegram time.
3. Use Preview value when available. Preview creates a temporary `meter-preview-<id>` file in the listen-only config and reloads the listen instance.
4. Use the value filter if several candidates are visible.
5. Add the correct meter.

When a meter is added from the WebGUI, the frontend calls `/api/add-meter` and then requests `/api/reload-pipeline`. The decode pipeline is restarted without restarting the whole container.

### 5. Meter Configuration

Minimal meter entry:

```json
{
  "id": "cold_water",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

Use a stable `id`, because it is used in generated `wmbusmeters` files and Home Assistant entity identifiers. Use `type: auto` unless a specific `wmbusmeters` driver is known. Use an empty `key` for meters without AES key. Use a 32-character HEX key for encrypted meters.

After the first decoded telegram, the meter appears in `#/meters` and decoded JSON is published to:

```text
<state_prefix>/<meter_id>/state
```

With the default HA configuration:

```text
wmbusmeters/<meter_id>/state
```

### 6. Discovery and Home Assistant Entities

If `discovery_enabled: true`, `bridge.sh` publishes Home Assistant MQTT Discovery config under `discovery_prefix`, default `homeassistant`. It creates sensors for numeric JSON fields emitted by `wmbusmeters`.

The bridge derives units and Home Assistant classes from the decoded field names and meter media. Discovery config messages are retained when `discovery_retain: true`.

### 7. SEARCH Mode

SEARCH is an advanced workflow. It is controlled by:

- `search_mode`
- `search_expected_value_m3`
- `search_tolerance_m3`
- `search_delta_mode`
- `search_min_delta_m3`
- `search_topic`

The bridge collects water candidates in `search_candidates.tsv`, creates temporary search meter files, compares decoded values with the configured reading and writes status to `search_status.json` and matches to `search_matches.tsv`.

After adding a meter from a SEARCH result, disable `search_mode` to return to normal operation.

### 8. Checks

If no RAW telegrams are counted:

- Verify MQTT broker settings.
- Verify `raw_topic`.
- Verify that the publisher sends payload-only HEX, not JSON.

If ESP devices are not shown:

- Use a RAW topic with a `+` segment, for example `wmbus/+/telegram`.
- The segment matched by `+` is used as the ESP name.
- ESP diagnostic topics are optional and use `wmbus/+/diag` and `wmbus/+/diag/#`.

If a configured meter does not decode:

- Check `meter_id`.
- Check `type` or try `auto`.
- Check whether an AES key is required.
- Wait for the next meter transmission; intervals are not controlled by the add-on.

---

## Polski

### 1. Wymagania

- Broker MQTT dostępny z dodatku albo kontenera Docker.
- Urządzenie publikujące telegramy Wireless M-Bus RAW HEX do MQTT.
- Domyślny topic RAW w Home Assistant: `wmbus/+/telegram`.
- Dla licznika szyfrowanego AES potrzebny jest 32-znakowy klucz HEX.

Bridge czyta tylko payload MQTT. Przy `filter_hex_only: true` usuwa whitespace, usuwa opcjonalne `0x`, ignoruje payloady nie-HEX i ignoruje HEX o nieparzystej długości.

### 2. Start w Home Assistant

1. Skonfiguruj opcje dodatku.
2. Zostaw `mqtt_mode: auto`, jeśli dodatek ma użyć usługi MQTT Home Assistant, gdy jest dostępna.
3. Użyj `mqtt_mode: ha`, żeby wymusić usługę MQTT Home Assistant.
4. Użyj `mqtt_mode: external` i ustaw `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password` dla brokera zewnętrznego.
5. Zostaw `raw_topic: wmbus/+/telegram`, chyba że publisher używa innego topicu.
6. Uruchom dodatek.
7. Otwórz WebGUI przez Ingress Home Assistant.

W HA startują dwie usługi: bridge i WebGUI. WebGUI słucha wewnętrznie na porcie `8099`.

### 3. Start w Dockerze

Z katalogu głównego repozytorium:

```bash
docker compose -f docker/examples/docker-compose.yml up -d --build
```

Następnie edytuj:

```text
docker/examples/config/options.json
```

Po zmianie wygenerowanych opcji Dockera zrestartuj kontener:

```bash
docker compose -f docker/examples/docker-compose.yml restart wmbus
```

`docker/entrypoint.sh` tworzy domyślne `/config/options.json`, jeśli pliku nie ma. Ten wygenerowany plik używa `external_mqtt_host: mosquitto` i `raw_topic: wmbus_bridge/+/telegram`.

### 4. Pierwsze Telegramy

Zacznij od `meters: []`. Wtedy bridge działa w trybie LISTEN i zapisuje kandydatów.

Otwórz `#/discover`:

1. Poczekaj na ID kandydatów.
2. Sprawdź driver, media, liczbę odebrań i czas ostatniego telegramu.
3. Użyj Preview value, jeśli jest dostępne. Preview tworzy tymczasowy plik `meter-preview-<id>` w konfiguracji listen-only i przeładowuje instancję LISTEN.
4. Użyj filtra wartości, jeśli widocznych jest wielu kandydatów.
5. Dodaj właściwy licznik.

Gdy licznik jest dodany z WebGUI, frontend wywołuje `/api/add-meter`, a potem `/api/reload-pipeline`. Pipeline dekodowania restartuje się bez restartu całego kontenera.

### 5. Konfiguracja Licznika

Minimalny wpis:

```json
{
  "id": "zimna_woda",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

Użyj stabilnego `id`, bo trafia do wygenerowanych plików `wmbusmeters` i identyfikatorów encji Home Assistant. Użyj `type: auto`, jeśli nie znasz konkretnego drivera `wmbusmeters`. Zostaw pusty `key` dla liczników bez klucza AES. Dla liczników szyfrowanych wpisz 32-znakowy klucz HEX.

Po pierwszym zdekodowanym telegramie licznik pojawi się w `#/meters`, a JSON zostanie opublikowany do:

```text
<state_prefix>/<meter_id>/state
```

Przy domyślnej konfiguracji HA:

```text
wmbusmeters/<meter_id>/state
```

### 6. Discovery i Encje Home Assistant

Jeśli `discovery_enabled: true`, `bridge.sh` publikuje konfigurację Home Assistant MQTT Discovery pod `discovery_prefix`, domyślnie `homeassistant`. Tworzone są sensory dla numerycznych pól JSON emitowanych przez `wmbusmeters`.

Bridge wyznacza jednostki i klasy Home Assistant na podstawie nazw pól i media licznika. Konfiguracje Discovery są retained, gdy `discovery_retain: true`.

### 7. Tryb SEARCH

SEARCH to zaawansowany workflow. Sterują nim:

- `search_mode`
- `search_expected_value_m3`
- `search_tolerance_m3`
- `search_delta_mode`
- `search_min_delta_m3`
- `search_topic`

Bridge zbiera kandydatów wodomierzy w `search_candidates.tsv`, tworzy tymczasowe pliki liczników, porównuje zdekodowane wartości ze wskazaniem i zapisuje status do `search_status.json` oraz dopasowania do `search_matches.tsv`.

Po dodaniu licznika z wyniku SEARCH wyłącz `search_mode`, żeby wrócić do normalnej pracy.

### 8. Kontrola

Jeśli licznik RAW telegramów nie rośnie:

- Sprawdź ustawienia brokera MQTT.
- Sprawdź `raw_topic`.
- Sprawdź, czy publisher wysyła payload HEX, a nie JSON.

Jeśli urządzenia ESP nie są widoczne:

- Użyj topicu RAW z segmentem `+`, np. `wmbus/+/telegram`.
- Segment pasujący do `+` jest nazwą ESP.
- Topiki diagnostyczne ESP są opcjonalne i używają `wmbus/+/diag` oraz `wmbus/+/diag/#`.

Jeśli skonfigurowany licznik się nie dekoduje:

- Sprawdź `meter_id`.
- Sprawdź `type` albo użyj `auto`.
- Sprawdź, czy wymagany jest klucz AES.
- Poczekaj na kolejny telegram licznika; interwałów transmisji nie kontroluje dodatek.

---

## Deutsch

### 1. Voraussetzungen

- MQTT-Broker, erreichbar aus dem Add-on oder Docker-Container.
- Ein Gerät, das Wireless-M-Bus RAW-HEX-Telegramme nach MQTT publiziert.
- Standard-RAW-Topic in Home Assistant: `wmbus/+/telegram`.
- Für AES-verschlüsselte Zähler wird ein 32-stelliger HEX-Schlüssel benötigt.

Die Bridge liest nur MQTT-Payloads. Mit `filter_hex_only: true` werden Whitespace und optionales `0x` entfernt; Nicht-HEX und HEX mit ungerader Länge werden ignoriert.

### 2. Start in Home Assistant

1. Add-on-Optionen konfigurieren.
2. `mqtt_mode: auto` beibehalten, wenn der HA-MQTT-Service genutzt werden soll, falls verfügbar.
3. `mqtt_mode: ha` verwenden, um den HA-MQTT-Service zu erzwingen.
4. `mqtt_mode: external` verwenden und `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password` setzen.
5. `raw_topic: wmbus/+/telegram` beibehalten, wenn der Publisher kein anderes Topic nutzt.
6. Add-on starten.
7. WebGUI über Home Assistant Ingress öffnen.

Unter HA starten zwei Dienste: Bridge und WebGUI. Das WebGUI hört intern auf Port `8099`.

### 3. Docker-Start

Aus dem Repository-Root:

```bash
docker compose -f docker/examples/docker-compose.yml up -d --build
```

Danach bearbeiten:

```text
docker/examples/config/options.json
```

Nach Änderungen an der generierten Docker-Optionendatei den Container neu starten:

```bash
docker compose -f docker/examples/docker-compose.yml restart wmbus
```

`docker/entrypoint.sh` erstellt `/config/options.json`, wenn die Datei fehlt. Diese generierte Datei nutzt `external_mqtt_host: mosquitto` und `raw_topic: wmbus_bridge/+/telegram`.

### 4. Erste Telegramme

Mit `meters: []` beginnen. Dann läuft die Bridge im LISTEN-Modus und speichert Kandidaten.

`#/discover` öffnen:

1. Auf Kandidaten-IDs warten.
2. Driver, Media, Empfangszähler und letzten Telegrammzeitpunkt prüfen.
3. Preview value verwenden, wenn verfügbar. Preview erstellt eine temporäre Datei `meter-preview-<id>` in der listen-only Konfiguration und lädt die LISTEN-Instanz neu.
4. Wertfilter nutzen, wenn mehrere Kandidaten sichtbar sind.
5. Den richtigen Zähler hinzufügen.

Wenn ein Zähler aus dem WebGUI hinzugefügt wird, ruft das Frontend `/api/add-meter` und danach `/api/reload-pipeline` auf. Die Decode-Pipeline startet neu, ohne den ganzen Container neu zu starten.

### 5. Zählerkonfiguration

Minimaler Eintrag:

```json
{
  "id": "cold_water",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

`id` sollte stabil bleiben, da es in generierten `wmbusmeters`-Dateien und Home-Assistant-Entity-IDs verwendet wird. `type: auto` verwenden, wenn kein konkreter `wmbusmeters`-Treiber bekannt ist. `key` leer lassen, wenn kein AES-Schlüssel benötigt wird. Für verschlüsselte Zähler einen 32-stelligen HEX-Schlüssel eintragen.

Nach dem ersten dekodierten Telegramm erscheint der Zähler in `#/meters`, und JSON wird veröffentlicht nach:

```text
<state_prefix>/<meter_id>/state
```

Mit HA-Standardkonfiguration:

```text
wmbusmeters/<meter_id>/state
```

### 6. Discovery und Home-Assistant-Entitäten

Wenn `discovery_enabled: true`, veröffentlicht `bridge.sh` Home Assistant MQTT Discovery unter `discovery_prefix`, standardmäßig `homeassistant`. Sensoren werden für numerische JSON-Felder von `wmbusmeters` erzeugt.

Die Bridge leitet Einheiten und Home-Assistant-Klassen aus Feldnamen und Zählermedien ab. Discovery-Konfigurationen werden retained gesendet, wenn `discovery_retain: true`.

### 7. SEARCH-Modus

SEARCH ist ein erweiterter Workflow. Relevante Optionen:

- `search_mode`
- `search_expected_value_m3`
- `search_tolerance_m3`
- `search_delta_mode`
- `search_min_delta_m3`
- `search_topic`

Die Bridge sammelt Wassermesser-Kandidaten in `search_candidates.tsv`, erstellt temporäre Suchzähler, vergleicht dekodierte Werte mit dem konfigurierten Zählerstand und schreibt Status nach `search_status.json` sowie Treffer nach `search_matches.tsv`.

Nach dem Hinzufügen eines Zählers aus einem SEARCH-Ergebnis `search_mode` deaktivieren, um in den Normalbetrieb zurückzukehren.

### 8. Prüfungen

Wenn keine RAW-Telegramme gezählt werden:

- MQTT-Broker-Einstellungen prüfen.
- `raw_topic` prüfen.
- Prüfen, ob der Publisher payload-only HEX sendet, nicht JSON.

Wenn ESP-Geräte nicht angezeigt werden:

- RAW-Topic mit `+` Segment verwenden, z.B. `wmbus/+/telegram`.
- Das von `+` gematchte Segment ist der ESP-Name.
- ESP-Diagnosetopics sind optional und nutzen `wmbus/+/diag` und `wmbus/+/diag/#`.

Wenn ein konfigurierter Zähler nicht dekodiert:

- `meter_id` prüfen.
- `type` prüfen oder `auto` verwenden.
- Prüfen, ob ein AES-Schlüssel benötigt wird.
- Auf das nächste Telegramm des Zählers warten; die Sendeintervalle steuert das Add-on nicht.

---

## Slovencina

### 1. Požiadavky

- MQTT broker dostupný z doplnku alebo Docker kontajnera.
- Zariadenie, ktoré publikuje Wireless M-Bus RAW HEX telegramy do MQTT.
- Predvolený RAW topic v Home Assistant: `wmbus/+/telegram`.
- Pre AES šifrovaný merač je potrebný 32-znakový HEX kľúč.

Bridge číta iba MQTT payloady. Pri `filter_hex_only: true` odstráni whitespace, odstráni voliteľné `0x`, ignoruje non-HEX payloady a ignoruje HEX s nepárnou dĺžkou.

### 2. Štart v Home Assistant

1. Nakonfigurujte možnosti doplnku.
2. Nechajte `mqtt_mode: auto`, ak sa má použiť MQTT služba Home Assistant, keď je dostupná.
3. Použite `mqtt_mode: ha`, ak chcete vyžadovať MQTT službu Home Assistant.
4. Použite `mqtt_mode: external` a nastavte `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password`.
5. Nechajte `raw_topic: wmbus/+/telegram`, ak publisher nepoužíva iný topic.
6. Spustite doplnok.
7. Otvorte WebGUI cez Home Assistant Ingress.

V HA sa spustia dve služby: bridge a WebGUI. WebGUI interne počúva na porte `8099`.

### 3. Štart v Dockeri

Z koreňa repozitára:

```bash
docker compose -f docker/examples/docker-compose.yml up -d --build
```

Potom upravte:

```text
docker/examples/config/options.json
```

Po zmene vygenerovaného Docker options súboru reštartujte kontajner:

```bash
docker compose -f docker/examples/docker-compose.yml restart wmbus
```

`docker/entrypoint.sh` vytvorí `/config/options.json`, ak chýba. Tento vygenerovaný súbor používa `external_mqtt_host: mosquitto` a `raw_topic: wmbus_bridge/+/telegram`.

### 4. Prvé Telegramy

Začnite s `meters: []`. Vtedy bridge beží v režime LISTEN a zapisuje kandidátov.

Otvorte `#/discover`:

1. Počkajte na ID kandidátov.
2. Skontrolujte driver, media, počet príjmov a čas posledného telegramu.
3. Použite Preview value, ak je dostupné. Preview vytvorí dočasný súbor `meter-preview-<id>` v listen-only konfigurácii a znovu načíta LISTEN inštanciu.
4. Použite filter hodnoty, ak je viditeľných viac kandidátov.
5. Pridajte správny merač.

Keď sa merač pridá z WebGUI, frontend zavolá `/api/add-meter` a potom `/api/reload-pipeline`. Dekódovacia pipeline sa reštartuje bez reštartu celého kontajnera.

### 5. Konfigurácia Merača

Minimálny záznam:

```json
{
  "id": "studena_voda",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

Použite stabilné `id`, pretože sa používa vo vygenerovaných súboroch `wmbusmeters` a identifikátoroch entít Home Assistant. Použite `type: auto`, ak nepoznáte konkrétny driver `wmbusmeters`. Nechajte prázdny `key` pre merače bez AES kľúča. Pre šifrované merače vložte 32-znakový HEX kľúč.

Po prvom dekódovanom telegrame sa merač objaví v `#/meters` a JSON sa publikuje do:

```text
<state_prefix>/<meter_id>/state
```

Pri predvolenej HA konfigurácii:

```text
wmbusmeters/<meter_id>/state
```

### 6. Discovery a Entity Home Assistant

Ak `discovery_enabled: true`, `bridge.sh` publikuje Home Assistant MQTT Discovery pod `discovery_prefix`, predvolene `homeassistant`. Senzory sa vytvárajú pre numerické JSON polia emitované `wmbusmeters`.

Bridge odvodzuje jednotky a triedy Home Assistant z názvov polí a media merača. Discovery konfigurácie sú retained, keď `discovery_retain: true`.

### 7. Režim SEARCH

SEARCH je pokročilý workflow. Ovládajú ho:

- `search_mode`
- `search_expected_value_m3`
- `search_tolerance_m3`
- `search_delta_mode`
- `search_min_delta_m3`
- `search_topic`

Bridge zbiera kandidátov vodomerov v `search_candidates.tsv`, vytvára dočasné search merače, porovnáva dekódované hodnoty s nastaveným odpočtom a zapisuje status do `search_status.json` a zhody do `search_matches.tsv`.

Po pridaní merača z výsledku SEARCH vypnite `search_mode`, aby sa systém vrátil do normálnej prevádzky.

### 8. Kontroly

Ak sa nepočítajú žiadne RAW telegramy:

- Skontrolujte nastavenia MQTT brokera.
- Skontrolujte `raw_topic`.
- Skontrolujte, či publisher posiela payload-only HEX, nie JSON.

Ak sa nezobrazujú ESP zariadenia:

- Použite RAW topic so segmentom `+`, napríklad `wmbus/+/telegram`.
- Segment zodpovedajúci `+` je názov ESP.
- ESP diagnostické topicy sú voliteľné a používajú `wmbus/+/diag` a `wmbus/+/diag/#`.

Ak nakonfigurovaný merač nedekóduje:

- Skontrolujte `meter_id`.
- Skontrolujte `type` alebo použite `auto`.
- Skontrolujte, či je potrebný AES kľúč.
- Počkajte na ďalší telegram merača; intervaly vysielania doplnok neriadi.

---

## Cestina

### 1. Požadavky

- MQTT broker dostupný z doplňku nebo Docker kontejneru.
- Zařízení, které publikuje Wireless M-Bus RAW HEX telegramy do MQTT.
- Výchozí RAW topic v Home Assistant: `wmbus/+/telegram`.
- Pro AES šifrovaný měřič je potřeba 32znakový HEX klíč.

Bridge čte pouze MQTT payloady. Při `filter_hex_only: true` odstraní whitespace, odstraní volitelné `0x`, ignoruje non-HEX payloady a ignoruje HEX s lichou délkou.

### 2. Start v Home Assistant

1. Nakonfigurujte možnosti doplňku.
2. Nechte `mqtt_mode: auto`, pokud se má použít MQTT služba Home Assistant, když je dostupná.
3. Použijte `mqtt_mode: ha`, pokud chcete vyžadovat MQTT službu Home Assistant.
4. Použijte `mqtt_mode: external` a nastavte `external_mqtt_host`, `external_mqtt_port`, `external_mqtt_username`, `external_mqtt_password`.
5. Nechte `raw_topic: wmbus/+/telegram`, pokud publisher nepoužívá jiné topic.
6. Spusťte doplněk.
7. Otevřete WebGUI přes Home Assistant Ingress.

V HA se spustí dvě služby: bridge a WebGUI. WebGUI interně poslouchá na portu `8099`.

### 3. Start v Dockeru

Z kořene repozitáře:

```bash
docker compose -f docker/examples/docker-compose.yml up -d --build
```

Potom upravte:

```text
docker/examples/config/options.json
```

Po změně vygenerovaného Docker options souboru restartujte kontejner:

```bash
docker compose -f docker/examples/docker-compose.yml restart wmbus
```

`docker/entrypoint.sh` vytvoří `/config/options.json`, pokud chybí. Tento vygenerovaný soubor používá `external_mqtt_host: mosquitto` a `raw_topic: wmbus_bridge/+/telegram`.

### 4. První Telegramy

Začněte s `meters: []`. Tehdy bridge běží v režimu LISTEN a zapisuje kandidáty.

Otevřete `#/discover`:

1. Počkejte na ID kandidátů.
2. Zkontrolujte driver, media, počet příjmů a čas posledního telegramu.
3. Použijte Preview value, pokud je dostupné. Preview vytvoří dočasný soubor `meter-preview-<id>` v listen-only konfiguraci a znovu načte LISTEN instanci.
4. Použijte filtr hodnoty, pokud je vidět více kandidátů.
5. Přidejte správný měřič.

Když se měřič přidá z WebGUI, frontend zavolá `/api/add-meter` a potom `/api/reload-pipeline`. Dekódovací pipeline se restartuje bez restartu celého kontejneru.

### 5. Konfigurace Měřiče

Minimální záznam:

```json
{
  "id": "studena_voda",
  "meter_id": "12345678",
  "type": "auto",
  "type_other": "",
  "key": ""
}
```

Použijte stabilní `id`, protože se používá ve vygenerovaných souborech `wmbusmeters` a identifikátorech entit Home Assistant. Použijte `type: auto`, pokud neznáte konkrétní driver `wmbusmeters`. Nechte prázdný `key` pro měřiče bez AES klíče. Pro šifrované měřiče vložte 32znakový HEX klíč.

Po prvním dekódovaném telegramu se měřič objeví v `#/meters` a JSON se publikuje do:

```text
<state_prefix>/<meter_id>/state
```

Při výchozí HA konfiguraci:

```text
wmbusmeters/<meter_id>/state
```

### 6. Discovery a Entity Home Assistant

Pokud `discovery_enabled: true`, `bridge.sh` publikuje Home Assistant MQTT Discovery pod `discovery_prefix`, výchozí `homeassistant`. Senzory se vytvářejí pro numerická JSON pole emitovaná `wmbusmeters`.

Bridge odvozuje jednotky a třídy Home Assistant z názvů polí a media měřiče. Discovery konfigurace jsou retained, když `discovery_retain: true`.

### 7. Režim SEARCH

SEARCH je pokročilý workflow. Ovládají ho:

- `search_mode`
- `search_expected_value_m3`
- `search_tolerance_m3`
- `search_delta_mode`
- `search_min_delta_m3`
- `search_topic`

Bridge sbírá kandidáty vodoměrů v `search_candidates.tsv`, vytváří dočasné search měřiče, porovnává dekódované hodnoty s nastaveným odečtem a zapisuje status do `search_status.json` a shody do `search_matches.tsv`.

Po přidání měřiče z výsledku SEARCH vypněte `search_mode`, aby se systém vrátil do normálního provozu.

### 8. Kontroly

Pokud se nepočítají žádné RAW telegramy:

- Zkontrolujte nastavení MQTT brokeru.
- Zkontrolujte `raw_topic`.
- Zkontrolujte, zda publisher posílá payload-only HEX, ne JSON.

Pokud se nezobrazují ESP zařízení:

- Použijte RAW topic se segmentem `+`, například `wmbus/+/telegram`.
- Segment odpovídající `+` je název ESP.
- ESP diagnostické topicy jsou volitelné a používají `wmbus/+/diag` a `wmbus/+/diag/#`.

Pokud nakonfigurovaný měřič nedekóduje:

- Zkontrolujte `meter_id`.
- Zkontrolujte `type` nebo použijte `auto`.
- Zkontrolujte, zda je potřeba AES klíč.
- Počkejte na další telegram měřiče; intervaly vysílání doplněk neřídí.
