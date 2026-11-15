# Passwort-zurücksetzen-Mail

Betreff: **BewerbungsBoost – Passwort zurücksetzen**

Für das gehostete Projekt unter **Authentication → Emails → Templates → Reset password** den Betreff setzen und `recovery.html` als HTML-Inhalt hinterlegen. Danach speichern und die gespeicherte Vorlage erneut öffnen. Ein GitHub-/Vercel-Deployment allein aktiviert diese Supabase-Einstellung nicht.

Die Vorlage verwendet ausschliesslich Supabases `{{ .ConfirmationURL }}` für Button und Ersatzlink. Den Platzhalter unverändert lassen; ein direkter Link zur App würde die Token-Prüfung überspringen. Keine Link-Tracker oder URL-Verkürzer dazwischenschalten.

Tabellenlayout, Inline-CSS und Systemschriften sind für E-Mail-Clients einschliesslich Outlook vorgesehen. Farben entsprechen `tailwind.config.ts`. Keine externen Bilder, Schriftarten oder Tracking-Pixel. Deutsch, formelle Anrede und Schweizer Schreibweise entsprechen der App. Es wird keine feste Ablaufzeit versprochen.

Zum Prüfen nach dem Speichern einen neuen Link in der App anfordern. Betreff, Layout, Button und Ersatzlink in der empfangenen E-Mail kontrollieren. Nur den neuesten Link im anfordernden Browser verwenden. Eine Vorschau bestätigt weder die Zustellung noch die Passwortänderung.

Die Vorlage ändert nur Betreff und Inhalt. Absendername/-adresse und ein allfälliger vom Standard-Maildienst ergänzter Footer werden separat durch Supabase beziehungsweise den Versanddienst festgelegt.
