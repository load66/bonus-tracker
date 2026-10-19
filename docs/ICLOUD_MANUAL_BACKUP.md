# BonusTracker — manual iCloud Drive backups

BonusTracker stays on GitHub Pages. Its local accounts, history, datapoints, saved terms, tax information, and timers can be saved as a complete JSON file. A browser cannot silently write that file to iCloud Drive in the background; these backups require a user action.

## Migrate an existing phone

1. Open BonusTracker on the phone with your latest records.
2. Settings → Move to iCloud Drive → Save backup file.
3. In the iOS Share Sheet select Save to Files, then iCloud Drive. Save in a private BonusTracker Backups folder.
4. Open Apple's Files app, confirm the file is in iCloud Drive rather than On My iPhone, and allow it to finish uploading.
5. Return to BonusTracker, select Check file from iCloud, and choose that exact exported JSON file. The read-only validator compares the complete file against the current records.
6. Only after verification, select Switch to iCloud only. This turns automatic Railway cloud backup off on this phone without deleting old server backups.
7. Export again after material changes or at least weekly.

## Restore on a replacement phone

Open https://load66.github.io/bonus-tracker/ and choose Import backup file, then select the JSON from Files → iCloud Drive. Review the confirmation; restoration validates and writes records transactionally.

If the old phone no longer has its complete records but the private Railway backup does, recover those server records **before** switching off Railway. Existing server snapshots cannot be retrieved after the API is stopped.

## What still works

All local account recording and saved rules, source data, archives, timers, date calculations, and the GitHub Pages public bank-offer feed continue. Online AI answers, private cloud terms synchronization, live official-offer checks, and Railway usage details stop in iCloud-only mode. The static offers feed may become stale if its publishing pipeline is stopped.

## What is not changed

Railway services, R2 recovery objects, and any Trading Journal/LEAPS workloads are not deleted. This frontend migration does not stop shared Railway billing. Keep those services available until you have personally verified an off-device full backup and decided what to do with other apps.

The exported JSON contains sensitive financial information and is not encrypted by BonusTracker. Store it in a private iCloud Drive folder protected by your Apple Account. iCloud upload completion must be checked in Apple's Files app; the browser cannot independently verify Apple's sync status.
