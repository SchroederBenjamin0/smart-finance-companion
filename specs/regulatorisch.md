# Regulatorische-Spec

## Hauptregel

> **Solange du diese App nur für dich selbst nutzt, ist sie regulatorisch
> unkritisch. Sobald jemand anderes sie nutzt, ändert sich alles.**

## Was du machen darfst

- ✅ App auf deinem privaten iPhone installieren
- ✅ Eigene Finanzdaten verarbeiten lassen
- ✅ AI-Empfehlungen für dich selbst nutzen
- ✅ Code auf öffentlichem GitHub-Repo hosten (das ist Open Source,
  kein Anlageberatung-Service)
- ✅ Erfahrungen in Blogposts oder Talks teilen — solange du klarstellst:
  "Das war für mich gebaut, nicht für andere"

## Was du NICHT machen darfst

- ❌ App im Apple App Store veröffentlichen ohne BaFin-Klärung
- ❌ Die App einem Freund zur Nutzung geben — auch nicht kostenlos
- ❌ Eine Webseite bauen, die die App bewirbt mit Performance-Claims
- ❌ Ein Konto bei Trade Republic im Namen einer anderen Person bedienen
- ❌ Investment-Empfehlungen aus der App auf Social Media als deine
  Empfehlungen ausgeben (z.B. "Schaut, was meine App empfiehlt!")
- ❌ Affiliate-Links zu Trade Republic einbauen

## Warum?

Anlageberatung in Deutschland ist nach §1 Abs. 1a Satz 2 Nr. 1a KWG
erlaubnispflichtig. Eine App, die Investment-Empfehlungen gibt, fällt
darunter, sobald sie für andere als den Eigentümer genutzt wird.

Die Erlaubnis kostet:
- Setup: 6-7 stelliger Betrag (Anwälte, Compliance, Setup einer GmbH
  oder ähnlich)
- Laufende Kosten: 5-stelliger Betrag jährlich (BaFin-Aufsicht,
  Reporting)
- Personelle Anforderungen: Geschäftsführer mit Finanz-Qualifikation
  (CFA, BWL-Studium + Berufserfahrung im Banking, etc.)

Strafen bei Verstoß: §54 KWG. Bis zu 5 Jahre Freiheitsstrafe oder
Geldstrafe.

## Disclaimer in der App

In Settings → "Über die App" muss folgender Text erscheinen:

```markdown
# Über diese App

Diese App ist ein **persönliches Werkzeug** für den Eigentümer dieses
Geräts. Sie ist **keine Anlageberatung** im Sinne des KWG.

Alle Empfehlungen sind **automatisch generierte Vorschläge** auf
Basis allgemeiner Buy-and-Hold-Prinzipien für ETF-Sparpläne.

Der Eigentümer dieser App:
- ist allein verantwortlich für seine Anlage-Entscheidungen
- versteht, dass vergangene Performance keine Garantie für zukünftige
  Renditen ist
- erkennt an, dass diese App keine professionelle Finanzberatung
  ersetzt

Diese App darf **nicht** an andere Personen weitergegeben oder für
andere Personen genutzt werden.
```

## Datenschutz (DSGVO)

Da nur du selbst diese App nutzt:
- Du bist sowohl Verantwortlicher als auch Betroffener
- Keine Datenschutzerklärung nötig (keine Drittnutzer)
- Keine Cookies-Banner nötig

Sobald die App von Dritten genutzt würde:
- DSGVO-konformes Datenschutz-Konzept nötig
- Auftragsverarbeitungsverträge mit Anthropic, GitHub, Yahoo, Marketaux
- Cookie-Banner / Consent-Management
- Datenexport- und Löschungs-Funktionen
- Impressum

## Falls du die App jemals weitergeben willst

Drei Möglichkeiten, die zumindest theoretisch funktionieren:

### Option 1: Open Source ohne Empfehlungen
Entferne den AI-Advisor komplett. Liefere nur die Allocation-Engine und
Tracking. Das wäre Open Source ohne Anlageberatung-Komponente.

### Option 2: Lizenzierung an einen Haftungsdach-Provider
Es gibt in Deutschland Firmen mit BaFin-Lizenz, die "Haftungsdach"
anbieten. Du wärst angebundener Vermittler. Komplexe Verträge,
Provisionen.

### Option 3: GmbH gründen + BaFin-Lizenz beantragen
Ernsthafte Geschäftsgründung. Realistisch nur wenn du es wirklich
groß ziehen willst.

**Pragmatisch**: Option 1 ist die wahrscheinlich beste Wahl wenn du
mal showcasen willst.

## Was du in der README schreiben solltest

In der öffentlichen README.md auf GitHub:

```markdown
# Smart Finance Companion

A personal finance PWA built for **a single user** (the repository owner).

## ⚠️ Important: Not for use by others

This is **not** a public service. It is a personal tool the owner built
for themselves. The repository is public for transparency and
educational purposes, but:

- The app is **not designed for use by other people**
- It does **not provide regulated investment advice**
- Forking and using this code yourself is your own responsibility
- The author cannot be held liable for any financial decisions
  made based on this code or its outputs

If you want to use something similar, fork the repo, modify the
allocation rules to your needs, and **only run it for yourself**.

## License

MIT (with the explicit understanding that this is not financial advice)
```

## Wann du regulatorisch ein Problem bekommst

Trigger-Events, die dich aus der "private use"-Zone holen:

1. **Du teilst die URL mit einem Freund** und sagst "schau mal, was
   meine App empfiehlt"
2. **Du baust einen Login** für mehrere User
3. **Du startest eine Marketing-Kampagne** (Twitter, LinkedIn, Reddit)
   für die App
4. **Du nimmst Geld** für die Nutzung der App
5. **Du trittst in der Presse** als "Entwickler einer Anlageberatung-
   App" auf

Wenn einer dieser Punkte zutrifft → Anwalt für Bank- und
Kapitalmarktrecht konsultieren.

## Was du SOFORT tun solltest

1. ✅ In `package.json` setze `"private": true`, damit niemand das Paket
   versehentlich auf npm publisht
2. ✅ In `LICENSE`-File schreibe MIT mit zusätzlichem Disclaimer (siehe
   oben)
3. ✅ In `README.md` schreibe den Disclaimer (siehe oben)
4. ✅ In `Settings → Über die App` zeige den Disclaimer in der App selbst

## Wenn du Zweifel hast

Bei jeder Frage "darf ich das?" → Anwalt fragen, NICHT Reddit fragen.
Anwalt für Bank- und Kapitalmarktrecht in Deutschland: ab ~250 €/Stunde.
Eine 1-Stunden-Konsultation ist günstiger als eine BaFin-Strafe.
