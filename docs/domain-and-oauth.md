# Re-Master Domain And OAuth Notes

## Production URL

The fallback Vercel production URL is:

```text
https://remasterfreddy.vercel.app
```

The custom production domain is:

```text
remaster.freddybremseth.com
```

## Vercel Domain Status

Checked with Vercel CLI on 2026-06-06.

- Vercel account/team: `freddy-bremseths-projects`
- Vercel project: `remasterfreddy`
- Domain is registered in Vercel: yes
- Domain is assigned to project: yes, `remasterfreddy`
- DNS currently resolves from this environment: no, `NXDOMAIN`

Vercel reported the current DNS provider nameservers as:

```text
ns1.dns-parking.com
ns2.dns-parking.com
```

Vercel reported the intended Vercel nameservers as:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

## Required DNS Change

Vercel currently recommends this DNS record at the active DNS provider:

```text
A remaster.freddybremseth.com 76.76.21.21
```

Alternative: move the domain nameservers to Vercel:

```text
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Do not configure both conflicting DNS strategies at the same time. If DNS remains with the current provider, add the `A` record Vercel requested. If DNS is moved to Vercel, manage the record from Vercel DNS after nameserver propagation.

## Manual DNS Steps For Freddy

1. Open the DNS panel for `freddybremseth.com`.
2. Add or update the `remaster` host record.
3. Use record type `A`.
4. Set value to `76.76.21.21`.
5. Remove conflicting `remaster` CNAME/A records if any exist.
6. Wait for DNS propagation.
7. Re-test:

```bash
dig remaster.freddybremseth.com
```

Expected result after propagation: an answer containing `76.76.21.21`, or a valid Vercel-managed response if nameservers were moved.

## OAuth Reconnect Return

Re-Master uses RealtyFlow for Google/YouTube OAuth during the migration period.

Expected reconnect flow:

1. Re-Master admin calls its protected `/api/youtube-health` function.
2. Re-Master proxies to RealtyFlow `/api/youtube/status?brandId=remasterfreddy`.
3. RealtyFlow returns a reconnect URL for `/api/oauth/google`.
4. The reconnect URL must include `return_to=/oauth/remaster-return`.
5. After Google consent or channel selection, RealtyFlow redirects through `/oauth/remaster-return` to Re-Master admin.

Set this server environment variable in RealtyFlow if the default return URL must be overridden:

```text
REMASTER_ADMIN_URL=https://remaster.freddybremseth.com/admin
```

Legacy fallback URL:

```text
https://remasterfreddy.vercel.app/admin
```
