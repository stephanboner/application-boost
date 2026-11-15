# Qualität der Bewerbungsschreiben

Der Writer verbindet belegte Angaben mit den wichtigsten Stellenaufgaben. CV und Zusatzangaben sind Selbstauskünfte; das Matching ist nur eine fehlbare Auswahlhilfe. Persönliche Motivation wird freiwillig im bestehenden Qualifikationsschritt erfasst, ohne zusätzlichen KI-Aufruf. Leere Angaben rechtfertigen keine erfundenen Wechselgründe oder Firmenbegeisterung. Der Matcher berücksichtigt Tätigkeitsbeschreibungen und unterscheidet fehlende Belege von fehlenden Fähigkeiten.

Die Stellenanalyse erhält bis zu 12'000 Zeichen gezielt extrahierten Inserattexts. HTML-Seiten mit passendem JSON-LD JobPosting werden gegenüber Navigation und ähnlichen Stellen bevorzugt. Der vom Server extrahierte Text wird als Kontext weitergegeben; vom Modell behaupteter Originaltext wird überschrieben. Alle dynamischen Writer-Eingaben, einschliesslich Matching und Anrede, bleiben in Datenblöcken. Briefkopf, Datum und Betreff erstellt ausschliesslich die App.

Antwortbudgets: Stellenparser 2'000 Tokens / 30 Sekunden; Writer 2'400 Tokens für bis zu ungefähr 500 Wörter. Jeder Aufruf bleibt quota-pflichtig. Die Zahl der Modellaufrufe wurde nicht erhöht. Ein nicht verfügbarer optionaler URL-Cache darf eine erfolgreiche Analyse nicht in einen Serverfehler verwandeln. Cache-Version v6 verhindert die Wiederverwendung alter Extraktionen. Stellen-URLs werden nur direkt abgerufen; SSRF- und Grössenbeschränkungen bleiben aktiv.

## Vergleich mit echten Modellantworten

Vor einer Aussage über messbar bessere Textqualität alte und neue Fassung mit demselben Modell und denselben synthetischen Eingaben vergleichen. Mindestens diese Fälle jeweils mehrmals erzeugen: Berufseinstieg mit dünnem CV; Quereinstieg mit übertragbaren Kompetenzen; erfahrene Projektleitung ohne Personalverantwortung; fehlende Muss-Anforderung; vorhandene beziehungsweise fehlende persönliche Motivation; französisches Schreiben mit Kontaktname ohne Anrede.

Je Antwort bewerten: Fakten vollständig belegt; keine erfundenen Zahlen, Führung oder Motivation; konkrete Verbindung Aufgabe–Beleg–Beitrag; keine chronologische CV-Wiederholung; natürlicher Ton; richtige Sprache/Anrede und separater Briefkopf. Eine erfundene Qualifikation zählt als Ausschlussfehler. Vergleiche möglichst blind beurteilen.

Automatisierte Tests prüfen Datenübergabe, Vertrauensgrenzen, HTML-Extraktion, SDK-Transport und Fehlerverhalten. Synthetische Providerantworten und Prompt-Assertions messen keine stilistische Verbesserung echter Modellantworten. Der öffentliche Finder-Beispiellink wurde zusätzlich gegen den neuen Extraktor geprüft; der vollständige angemeldete Produktionsablauf benötigt einen erneuten Versuch in der App.


## Verbindliches Antwortformat der Stellenanalyse

Der Stellenparser sendet das statische JSON-Schema aus `src/lib/job-output-schema.ts` als `output_config.format` mit `type: json_schema` an die Anthropic Messages API. Eine reine Prompt-Anweisung zu JSON hatte Formatfehler nicht verhindert. Die vorhandene SDK-Version überträgt dieses Body-Feld; ein HTTP-Integrationstest prüft die tatsächlich gesendeten Bytes gegen den lokalen Provider. Der normale Writer bleibt Freitext.

Die Zod-Prüfung bleibt zusätzlich aktiv, unter anderem für Längenbeschränkungen. Die von Anthropic dokumentierte Gross-/Kleinschreibungsabweichung bei Enums wird normalisiert. Syntaxfehler und falsche Stellenfelder erhalten getrennte sichere Fehlercodes (`AI_INVALID_JSON`, `AI_INVALID_JOB_DATA`); weder Modellantwort noch verworfene Feldwerte werden dafür protokolliert. Das Schema enthält keine Nutzerangaben und wird bei der Quota-Reservierung berücksichtigt. Die aktuelle Cache-Version verwirft frühere Ergebnisse. Structured Outputs lösen Formatprobleme, garantieren aber keine sachliche Korrektheit.


### Bot-Schutz ist kein Stelleninserat

HTTP 200 und mindestens 200 Zeichen reichen nicht als Nachweis für lesbaren Inserattext. Sicherheits- und CAPTCHA-Zwischenseiten werden vor dem Modellaufruf verworfen. Es gibt nur einen direkten Abruf; ein blockierter oder fehlgeschlagener Abruf führt zur Aufforderung, den Inserattext einzufügen. URLs und Seiteninhalte werden dafür nicht an einen externen Reader oder Proxy weitergegeben.

Titel-Platzhalter und Ergebnisse ohne Aufgaben oder Anforderungen gelten auch bei gültigem JSON nicht als erkannte Stelle. API, Cache und Vorschau prüfen dies; Cache-Version v6 verwirft frühere Fehlresultate und alle Ergebnisse des entfernten Reader-Pfads. Die Änderung garantiert keine fachliche Vollständigkeit jeder Modellantwort. Ein angemeldeter Produktionsimport wurde nicht durch den Agenten durchgeführt.
