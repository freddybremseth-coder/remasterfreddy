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

## Avgrenset køkjøring (ikke driftsatt)

`scripts/run-jukebox-spool-worker.py` kan kjøre én avgrenset batch av manuelt klargjorte, private jobber på en betrodd arbeidervert. Ingen kontinuerlig scheduler installeres av denne PR-en. Dette er et mellomsteg for å teste automatisert jobbvalg, og **ikke** automatisk nedlasting av katalogmaster, videomotiv eller hele RealtyFlow-køen.

Opprett en mappe under en beskyttet spool-rot med eksakt jobb-UUID som navn. Legg inn:

- `job.json` med kun `{"jobId":"<UUID>","audio":"master.wav","jukebox":"cabinet.mp4"}`
- `clip-export.json` hentet fra den administratorbeskyttede eksporten mens jobben står som `queued`
- En lokalt verifisert original masterfil og et godkjent, lokalt jukebox-motiv med filnavnene fra `job.json`

Bruk separat hemmelighetslager på arbeiderverten, og sett `REMASTER_JUKEBOX_PRIVATE_RENDER_ENABLED=true`, `REMASTER_JUKEBOX_PRIVATE_SPOOL_ENABLED=true`, `SUPABASE_URL` og `SUPABASE_SERVICE_ROLE_KEY`. Kjør:

```bash
python3 scripts/run-jukebox-spool-worker.py --spool /privat/jukebox-spool --limit 1 --run-once
```

Uten `--upload-private-preview` skjer **ingen** MP4-opplasting til Storage, og aldri YouTube-opplasting. Privat Storage kan bare brukes separat når `REMASTER_JUKEBOX_PRIVATE_UPLOADS_ENABLED=true` og flagget `--upload-private-preview` er gitt. Ved tvetydig feil stopper jobben uten automatisk forsøk på nytt; en operatør må kontrollere jobbstaten, renderforsøket og lokale filer.

Køarbeideren kjører med maksimalt fem jobbmapper per kall; bruk aldri en ubeskyttet katalog. Fremtidig fullt automatisert drift krever en godkjent server-side produsent som knytter katalogmaster og jukebox-asset til jobb-ID, laster dem ned med autentiserte rettigheter, verifiserer SHA-256 og gjør en transaksjonssikker overgang til den betrodde køen. **Den komponenten er ikke implementert her.**

## Automatisk staging fra RealtyFlows låtkatalog (nytt)

En beskyttet katalogoppslagsmodul ligger i `scripts/prepare-jukebox-catalog-spool.py`. Den bruker `handoff.songId` fra privat jobbeksport, leser nøyaktig denne låten fra `public.songs` med `brand=remasterfreddy` via service-role på betrodd arbeidervert, og laster ned kun master fra `assets` i den eksakte Supabase-prosjektinstansen. SHA-256 må samsvare med `handoff.masterSha256`. Feil kilde, feil format eller endrede lydbytes stopper staging uten `job.json`.

Den administratorbeskyttede eksporten må først lagres som `clip-export.json` i en jobbmappe med UUID-navn. Legg dessuten inn det **godkjente** Jukebox-motivet som `cabinet.mp4`; dette er fortsatt et separat, manuelt asset-steg. Følgende klargjør deretter musikken og oppretter spool-kontrakten:

```bash
export REMASTER_JUKEBOX_PRIVATE_SPOOL_ENABLED=true
# SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY må komme fra hemmelighetslager
python3 scripts/prepare-jukebox-catalog-spool.py \
  --job-directory /privat/jukebox-spool/<job-uuid> \
  --prepare-private
```

Etter dette kan den eksisterende spool-arbeideren kjøre én jobb med `--run-once`. Ingen del av dette publiserer til YouTube. Det er fortsatt **ingen** kontinuerlig arbeidsprosess eller automatisk nedlasting av godkjent jukebox-motiv, og Jukebox er ikke produksjonsaktivert. En fremtidig motivkatalog må knytte en revidert, immutable asset-ID og SHA-256 til valgt Jukebox-stil; ikke bruk uspesifikke nettadresser eller første treff i Storage.
