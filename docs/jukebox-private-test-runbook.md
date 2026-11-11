# Re-master Freddy Jukebox – privat ende-til-ende-test

**Status: utviklingsgren, ikke produksjonsaktivert.** Dette er en manuell, betrodd operatørflyt for én konkret jobb. Det er **ikke** offentlig YouTube-publisering, og det er ikke en kontinuerlig bakgrunnsarbeider.

## Forutsetninger

- RealtyFlow PR #1643 og renderings-PR #57 er testet, vurdert og riktig konfigurert. Kjør aldri SQL-migrasjonen i produksjon bare for å åpne testskjermbildet.
- Administrator har opprettet en Jukebox-jobb i RealtyFlow. Fra den beskyttede klippeksporten lagres manifest-JSON **før jobben reserveres** (eksporten krever `queued`).
- Den riktige originalmasteren finnes lokalt som MP3/WAV etc.; SHA-256 må være lik `handoff.masterSha256` i eksporten **og** i den serverlagrede jobben. Bruk aldri en tilfeldig web-URL som lydkilde.
- Den visuelt godkjente jukebox-videoen finnes lokalt. Minst ett godkjent mellomklipp **eller** ett valgt bilde finnes i eksporten.
- Betrodd maskin har Python 3.10+, ffmpeg, ffprobe og nok diskplass. Ingen service-role-nøkkel skal legges i front-end, GitHub-issues, logger eller chat.
- Privat Supabase bucket må være opprettet med riktige RLS-/Storage-rettigheter før faktisk upload. Dette må verifiseres separat.

## 1. Lokal rendering – ingen nettbasert videopublisering

Konfigurer på den betrodde maskinen (verdiene skal settes i hemmelighetslager):

```bash
export SUPABASE_URL="https://<prosjekt>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<hemmelig service-role-nøkkel>"
export REMASTER_JUKEBOX_PRIVATE_RENDER_ENABLED=true
```

Bruk et **nytt** arbeidsområde, og gi MP4-en eksakt filnavn `<job-uuid>.mp4`:

```bash
python3 scripts/run-jukebox-private-test.py \
  --export /trygt/clip-export.json \
  --audio /trygt/original-master.mp3 \
  --jukebox /trygt/jukebox-godkjent.mp4 \
  --workspace /trygt/ny-arbeidsmappe \
  --output /trygt/<job-uuid>.mp4 \
  --job-id "<job-uuid>" \
  --approve-private-test
```

Koden kontrollerer master-SHA, format, varighet og valgt media før den forsøker å reservere en jobb. En serverfastsatt CAS-oppdatering binder jobben til et renderforsøk. Ved feil **etter** reservasjon må operatør inspisere og bruke den eksisterende lease-recovery-mekanismen; ikke gjenbruk et tidligere renderforsøk for å unngå duplikater.

## 2. Valgfri privat forhåndsvisning i Supabase Storage

Etter at rettigheter og privat bucket er verifisert kan operatøren sette `REMASTER_JUKEBOX_PRIVATE_UPLOADS_ENABLED=true` og legge til:

```bash
  --upload-private-preview
```

Dette er fortsatt **ikke YouTube-opplasting**. Videoen lastes opp til privat lagring, leses tilbake for SHA-256-kontroll, og jobben settes til `ready` bare hvis den fortsatt er i **samme** `rendering`-forsøk. Deretter kan administrator se den kortvarige signerte forhåndsvisningen og godkjenne den separat.

## 3. YouTube forblir sperret

- Privat YouTube-handoff er en separat, deaktiverbar tjeneste i RealtyFlow.
- Ingen offentlig planlegging eller offentlig YouTube-publisering startes her.
- Fullvideo og Short bruker separate jobb-ID-er, kontrollsummer, godkjenninger og YouTube-ID-er.
- Automatisk rendering fra RealtyFlows kø og automatisk YouTube-publisering krever egen driftssatt jobbplanlegging, sikker credential-håndtering og en vellykket ekte ende-til-ende-test.

## Testdekning

`test-jukebox-claim.py`, `test-jukebox-finalization.py` og `test-jukebox-private-test.py` er lagt til `jukebox-render-smoke.yml`. De kjører uten nettverk og verifiserer låsing av jobber, korrekt renderforsøk, filintegritet og privat opplastingsgjerde.
