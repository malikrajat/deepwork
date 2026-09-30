# Signing the Windows installer

Everything a user sees before DeepWork is installed — the blue or yellow shield on
the UAC prompt, the publisher line under it, and whether SmartScreen interrupts
with "Windows protected your PC" — comes from the **Authenticode signature** on the
installer, and nothing else. Not the app's version metadata, not the file name, not
the release page.

As things stand the installers are **unsigned**, and Windows says so:

```powershell
Get-AuthenticodeSignature .\DeepWork_2.0.12_x64-setup.exe | Select-Object Status
# Status
# ------
# NotSigned
```

That is why the prompt says _Unknown publisher_. There is no code change that can
fix it: a publisher name in those dialogs is a claim Windows verifies against a
certificate authority, so the certificate has to exist in the name you want shown.
What the repository _can_ do — and now does — is identify itself correctly
everywhere else, and make signing a two-line change the day the certificate
arrives.

## What each option shows the user

| Option                                      | What the UAC / SmartScreen prompt shows                                                                              | Notes                                                                                                                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nothing** (today)                         | Yellow shield, _Unknown publisher_; SmartScreen's "Windows protected your PC" on a fresh download with no reputation | What every unsigned download looks like                                                                                                                                                                                           |
| **Self-signed certificate**                 | _Unknown publisher_ for everyone else                                                                                | Only trusted on machines that were told to trust it (your own PC, or an enterprise deploying by policy). Useful for rehearsing the pipeline, never for public downloads                                                           |
| **OV certificate** (organisation validated) | Blue shield with **your name**                                                                                       | Reputation starts at zero, so SmartScreen may still interrupt early on; it clears as downloads accumulate. Keys must live on a FIPS 140-2 Level 2 token or a cloud HSM (since June 2023)                                          |
| **EV certificate** (extended validation)    | Blue shield with **your name**, no SmartScreen interruption from the first download                                  | Microsoft grants instant reputation to EV. The most expensive route, and it also needs a hardware token or cloud HSM                                                                                                              |
| **Azure Trusted Signing**                   | Blue shield with **your name**                                                                                       | Microsoft's own signing service (roughly the price of a coffee a month). Short-lived certificates, no token to lose, and the same `signCommand` hook as any other cloud signer. Eligibility and identity verification still apply |

Two things are true whichever route you take:

- The certificate must be issued **in the name you want displayed** — "Rajat Malik"
  as a person, or the registered company name. The verification is the point: it is
  what makes the name worth anything to the person installing.
- **Timestamp the signature.** Without a timestamp, every installer you ever
  shipped stops being trusted the day the certificate expires. With one, it stays
  trusted for as long as the timestamp says.

## What the repository already does

The bundle identifies itself properly, so the places that read metadata and not a
signature are already right — Add/Remove Programs, the installer's file properties,
the app's own About page:

```jsonc
// src-tauri/tauri.conf.json
"bundle": {
  "publisher": "Rajat Malik",     // default is the second part of the identifier
  "copyright": "Copyright © 2026 Rajat Malik",
  "homepage": "https://github.com/malikrajat/deepwork",
  "category": "Productivity",
  "shortDescription": "…",
  "longDescription": "…"
}
```

Before this, `publisher` was unset and Tauri fell back to the second element of the
identifier — `deepwork` — which is the name that ended up in the installer's
metadata.

One gap worth naming, because it shows up in the wrong place at the wrong time:
the NSIS **installer's** own Details tab has no "Company" line. Tauri's installer
template writes the product name, description, copyright and version but not the
company, and the only hook it offers (`bundle.windows.nsis.installerHooks`) is
injected _inside a section_, where NSIS rejects `VIAddVersionKey` outright — tried,
and the build fails with "command VIAddVersionKey not valid in Section". Closing it
means forking the installer template, which this project deliberately avoids. The
publisher is on the app binary and in Add/Remove Programs, and once there is a
certificate it is on the installer's signature — which is where a cautious user
looks first anyway.

## Wiring a certificate in

### A certificate on your own machine (signtool)

1. Import the certificate (and its private key) into your user certificate store.
   For a token or HSM that means the vendor's driver, which presents the key as if
   it were local.
2. Copy its SHA-1 thumbprint:

   ```powershell
   Get-ChildItem Cert:\CurrentUser\My | Format-List Subject, Thumbprint
   ```

3. Add it to `src-tauri/tauri.conf.json`:

   ```jsonc
   "bundle": {
     "windows": {
       "digestAlgorithm": "sha256",
       "certificateThumbprint": "AB12…9F",
       "timestampUrl": "http://timestamp.digicert.com",
       "tsp": true
     }
   }
   ```

   `tsp` depends on the timestamp server: DigiCert, Sectigo and SSL.com all offer
   RFC 3161 endpoints, and most are also reachable over plain Authenticode
   timestamping — check your CA's documentation for the URL it wants.

### A cloud signer (Azure Trusted Signing and friends)

Cloud signers do their own timestamping, so only the command is configured:

```jsonc
"bundle": {
  "windows": {
    "digestAlgorithm": "sha256",
    "signCommand": "trusted-signing-cli -e https://weu.codesigning.azure.net -a <account> -c <profile> -d DeepWork %1"
  }
}
```

`%1` is Tauri's placeholder for the file to sign, and Tauri runs it over the
binaries it bundles. Keep the credentials in the environment
(`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) rather than in the
repository.

For a CI runner that should sign without changing the committed config, Tauri
merges `TAURI_CONFIG` over the file:

```bash
TAURI_CONFIG='{"bundle":{"windows":{"signCommand":"trusted-signing-cli … %1"}}}' npm run tauri:build
```

## Checking a build before you publish it

```powershell
# 1. Is it signed, and by the name you expect?
Get-AuthenticodeSignature .\DeepWork_2.0.12_x64-setup.exe |
  Format-List Status, SignerCertificate

# 2. Does the signature actually validate, chain included?
signtool verify /pa /v .\DeepWork_2.0.12_x64-setup.exe

# 3. What will the user's "Publisher" line and Apps & Features say?
(Get-Item .\DeepWork_2.0.12_x64-setup.exe).VersionInfo |
  Format-List CompanyName, ProductName, FileVersion, LegalCopyright
```

Check every artefact you are about to publish: `deepwork.exe`,
`DeepWork_<version>_x64-setup.exe` (the NSIS installer) and
`DeepWork_<version>_x64_en-US.msi`. The two installers are built by different
tools, so a configuration that signs one does not prove anything about the other.

## Publishing, even without a certificate

Two things make an unsigned download easier to defend in the meantime, and both are
worth doing permanently:

- **Publish a checksum next to each installer** on the release page, so anyone can
  confirm the file they downloaded is the file that was built:

  ```powershell
  Get-FileHash .\DeepWork_2.0.12_x64-setup.exe -Algorithm SHA256
  # or, on Linux/macOS:
  sha256sum DeepWork_2.0.12_amd64.AppImage
  ```

- **Say where the source is.** The repository, the tag and the build instructions
  are already public; a release note that points at them ("built from tag v2.0.12 by
  the GitHub Actions run linked below") gives a suspicious user something to check
  that does not depend on trusting a signature.

Neither replaces signing — they are what a careful person does with an unsigned
binary, not a reason not to get one.

## When Windows blocks the install anyway

Two different things stop an unsigned installer, they look similar in a
screenshot, and they need different answers. Find out which one it is before
changing anything: the fix for one does nothing for the other.

| What the user sees                                                                       | What it is              | What drives it                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| *Windows protected your PC* — "unrecognised app", with a **More info → Run anyway** link | SmartScreen             | The signature and the download's reputation. File metadata is not consulted, and there is no per-file appeal                                                                 |
| *Threat found: Trojan:Win32/…* in a notification, and the file is quarantined             | Defender's antivirus    | A heuristic match against the file's bytes or its behaviour. No "Run anyway" is offered, because the file is gone                                                          |
| *Do you want to allow this app to make changes?* with **Unknown publisher** under it      | The UAC prompt          | Nothing is blocked — this is the normal prompt for any unsigned installer. "Unknown publisher" is the unsigned signature, exactly as above                      |

There is a tell in the first two: **SmartScreen needs the Mark-of-the-Web.** It
only appears for a file that was downloaded or copied from somewhere — a build
run on the same machine and never passed through a browser or a network share has
no such mark, and cannot raise *Windows protected your PC* at all. If the file on
the machine was built locally and there is no `Zone.Identifier` stream on it,
what you saw was one of the other two:

```powershell
# Nothing printed means the file never came from the internet, so SmartScreen is out.
Get-Item .\DeepWork_2.0.12_x64-setup.exe -Stream * | Select-Object Stream
```

### If the antivirus engine flagged it

This is nearly always a false positive on a small, freshly built, unsigned
installer — the app is a Tauri build (a webview, a SQLite file, a tray icon), and
so is most of what trips "…!ml" heuristics. Confirm it locally first, on the
machine where the block happened:

```powershell
# Was anything actually detected, and what was it called?
Get-MpThreatDetection | Select-Object ThreatID, Resources, InitialDetectionTime

# The detections themselves, with the file and the threat name spelled out.
Get-WinEvent -LogName 'Microsoft-Windows-Windows Defender/Operational' |
  Where-Object { $_.Id -in 1116, 1117, 1118, 1119 } |
  Select-Object TimeCreated, Id, Message
```

If DeepWork's own file is named there, **submit it to Microsoft**: the
[file submission portal](https://www.microsoft.com/en-us/wdsi/filesubmission), as a
software developer reporting an incorrect detection. Attach the file that was
flagged (the NSIS `-setup.exe` and, if it was the app itself, `deepwork.exe`), give
it the SHA-256 and the URL it was downloaded from, and say in one line what it is:
a legitimate, currently unsigned installer for a desktop app. A wrong detection is
removed from the definitions for **everyone** once it is accepted, usually within
a day or two, and it is the only way to clear it for other people.

For your own machine in the meantime, Windows Security → *Protection history* →
the entry → **Allow on device** puts it back. That is a workaround for one
machine, and one you should not ask users to copy: a published download that needs
an antivirus exclusion to install is a download most people are right to refuse.

### If it is SmartScreen

This one has nothing to appeal: no detection was made, so there is no verdict to
dispute. The file is simply unknown, and SmartScreen's answer to unknown is to make
the person installing insist — which is why the dialog offers *Run anyway* at all.
What changes it:

- **A signature.** EV clears it from the first download; OV clears as downloads
  accumulate. This is the only durable fix, and it is the reason the section above
  exists.
- **A signed, timestamped build is what earns reputation.** Reputation is kept per
  publisher *and* per file, so it resets with every new binary — which is why the
  answer is a certificate rather than a cleverer release process.

Until then, whoever is installing can insist: **More info → Run anyway**, or, on
the file, right-click → Properties → **Unblock**, or

```powershell
Unblock-File .\DeepWork_2.0.12_x64-setup.exe
```

### What the build does to look less like something to block

These do not replace a signature, and are worth doing anyway, because heuristics
score the whole shape of a file rather than one thing in it:

- **The WebView2 bootstrapper is no longer downloaded at install time.**
  `bundle.windows.webviewInstallMode` is now `embedBootstrapper`, so the installer
  carries Microsoft's signed bootstrapper instead of reaching out to the internet
  and running what it fetches — which is a shape installers are watched for, and
  one Tauri's default (`downloadBootstrapper`) has. It also means the install
  works offline. The first build after this change downloads the bootstrapper
  once. On a fleet where the WebView2 runtime is known to be present (Windows 11
  ships it), `{ "type": "skip" }` is smaller still and runs no second binary at
  all; the trade is that a machine without the runtime gets an app that cannot
  start.
- **The binaries identify themselves.** `publisher`, `copyright`, `category` and
  both descriptions are set, and the app binary carries `CompanyName`,
  `ProductName`, `ProductVersion` and the version number. The one gap left is the
  NSIS *installer's* "Company" line, which Tauri's template does not write — see
  above for why that cannot be patched from this repository.
- **One installer per release, same name pattern, from the same URL.** Reputation
  is per file, so a renamed or re-packed build starts from zero again — and
  renaming a file to dodge a detection is how a legitimate release starts looking
  like a dodgy one.
