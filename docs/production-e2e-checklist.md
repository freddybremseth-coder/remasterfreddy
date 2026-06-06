# Re-Master Freddy Production E2E Checklist

Use this checklist for the first authenticated production test at:

```text
https://remasterfreddy.vercel.app/admin
```

Use a clearly named test song, test image, test logo and test thumbnail. Do not use an important finished song for the first run.

Never paste passwords, access tokens, Supabase session values, cookies, refresh tokens or Vercel secrets into issues, screenshots, chat, commits or documentation.

## Test Run Header

- Date and local time in Europe/Madrid:
- Tester:
- Browser and OS:
- Re-Master URL:
- RealtyFlow backend URL shown in Vercel env:
- Test song title:
- Test MP3 filename:
- Test image filename:
- Test logo filename:
- Test thumbnail filename:

## 1. Login And Session

- [ ] Open `/admin`.
- [ ] Log in as `freddy.bremseth@gmail.com`.
- [ ] Confirm the admin layout loads.
- [ ] Confirm logout works.
- [ ] Log back in.
- [ ] Confirm a different email is rejected if available for testing.
- [ ] Leave the tab idle long enough to confirm expired sessions show a clear login/session message.

Diagnostics to capture if this fails:

- The visible error text.
- Browser console error text with tokens/cookies redacted.
- Network status code for the failing `/api/*` request.
- Approximate local time of failure.

## 2. Supabase Connection

- [ ] Confirm the browser login works with `VITE_SUPABASE_URL`.
- [ ] Confirm the browser login works with `VITE_SUPABASE_ANON_KEY`.
- [ ] Confirm server routes do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- [ ] Confirm Re-Master uses the same Supabase project as RealtyFlow.

Expected project ref:

```text
ereapsfcsqtdmzosgnnn
```

## 3. Image Bank

- [ ] Upload one normal image.
- [ ] Upload one logo.
- [ ] Upload one thumbnail.
- [ ] Confirm each asset appears in the correct filter.
- [ ] Confirm image previews load.
- [ ] Confirm usage count displays.
- [ ] Delete one test image-bank entry.
- [ ] Record whether the delete action removed only the image-bank entry or also the underlying Storage object.

Open product decision:

- [ ] Decide whether delete should offer two explicit options: `Remove from image bank only` and `Delete Storage file too`.

## 4. MP3 Upload

- [ ] Select a valid MP3.
- [ ] Enter test title.
- [ ] Enter test artist.
- [ ] Upload the MP3.
- [ ] Confirm signed upload succeeds.
- [ ] Confirm the song is registered.
- [ ] Confirm the song appears in the production queue.
- [ ] Try an invalid file type and confirm it is rejected.
- [ ] Try a duplicated filename and confirm it does not overwrite the previous file unexpectedly.
- [ ] Try a large MP3 and record the size and result.

## 5. Pipeline Inputs

- [ ] Select multiple slideshow images.
- [ ] Select one logo.
- [ ] Select a custom thumbnail.
- [ ] Confirm AI-generated thumbnail remains the fallback if no thumbnail is selected.
- [ ] Choose language: Norwegian, English or Spanish.
- [ ] Choose publish immediately or a scheduled publish time.
- [ ] If scheduled, confirm local Europe/Madrid time is converted correctly.

## 6. YouTube Connection

- [ ] Confirm the YouTube status card loads.
- [ ] Confirm the connected channel title is the expected Re-Master Freddy channel.
- [ ] Confirm subscribers and video count display.
- [ ] Confirm the reconnect link opens the RealtyFlow OAuth route.
- [ ] After reconnect, confirm the OAuth flow returns to Re-Master admin, not the old RealtyFlow settings page.
- [ ] Confirm pipeline controls are blocked if the wrong channel or no channel is verified.

## 7. Video Pipeline

- [ ] Start the video pipeline for the test song.
- [ ] Confirm status updates begin.
- [ ] Confirm AI analysis step completes.
- [ ] Confirm metadata generation step completes.
- [ ] Confirm image selection/generation step completes.
- [ ] Confirm FFmpeg render step completes.
- [ ] Confirm YouTube upload step completes.
- [ ] Confirm scheduling or immediate publication step completes.
- [ ] Confirm final status is saved.
- [ ] Confirm YouTube video ID is saved.
- [ ] Confirm YouTube URL is saved.
- [ ] Open the YouTube URL and verify it is on the correct channel.

Diagnostics to capture if this fails:

- Pipeline step name.
- Visible error message.
- Song title and song ID if shown.
- YouTube video ID if one was created.
- Whether browser tab was open the entire time.
- Whether the same test was retried.

## 8. Manual AI Recommendation

- [ ] Open the recommendations tab.
- [ ] Pick one non-destructive strategy or schedule recommendation.
- [ ] Review before and after content.
- [ ] Approve exactly one recommendation.
- [ ] Confirm status changes to planned/completed as expected.
- [ ] Confirm the button is locked after approval/execution.
- [ ] Confirm history shows the action.

## 9. Autopilot

- [ ] Set autopilot mode to `off`.
- [ ] Confirm `Kjor sikker autopilot` is disabled.
- [ ] Set autopilot mode to `preview`.
- [ ] Run safe autopilot.
- [ ] Confirm it analyzes recommendations.
- [ ] Confirm it stores nothing.
- [ ] Confirm metadata suggestions are listed as requiring manual approval.
- [ ] Set autopilot mode to `plan_non_destructive`.
- [ ] Set `maxActionsPerRun` to a value from 1 to 10.
- [ ] Run safe autopilot.
- [ ] Confirm only `create_content`, `strategy` or `schedule` plans are saved.
- [ ] Confirm `update_metadata` is never saved automatically.

## 10. Growth Actions And Duplicate Protection

- [ ] Confirm new safe plans appear in `growth_actions`.
- [ ] Confirm action type is one of `create_content`, `strategy` or `schedule`.
- [ ] Confirm `hypothesis` contains a stable `remaster:` fingerprint.
- [ ] Run the same autopilot mode again.
- [ ] Confirm duplicate actions are skipped.
- [ ] Confirm counts show analyzed, saved/would-save, skipped and manual metadata suggestions.

## Safe Diagnostics Template

When sending results back for investigation, use this template:

```text
Step:
Expected:
Actual:
Visible error:
Browser:
Local time:
Song title:
Asset filename:
YouTube video ID or URL:
Network route and status code:
Screenshot attached: yes/no
Secrets removed: yes
```

Do not include:

- Passwords.
- Authorization headers.
- Supabase access or refresh tokens.
- Cookies.
- `REALTYFLOW_MIGRATION_SECRET`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- Google or YouTube refresh tokens.
