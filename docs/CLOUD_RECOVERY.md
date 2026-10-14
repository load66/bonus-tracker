# Bonus Tracker cloud recovery

The recovery service uses the Trading Journal's existing private Cloudflare R2 configuration. Backup objects live in `bonus-tracker-recovery/v1/<hash-of-authenticated-owner>/`, separately from chart screenshots. R2 credentials remain on the backend. The existing signed-in owner restriction applies to every list, upload, download and storage-health request. Backup data is never sent to AI.

## First setup

1. Open Bonus Tracker on the phone containing your records.
2. Open **Cloud backup** and sign in with the same Trading Journal account.
3. Choose **Enable automatic backup**.
4. Wait for **Verified**. An upload is acknowledged only after the server reads it back and checks SHA-256 and account count.
5. Keep an exported recovery file in another safe location as an additional recovery option.

A connection or successful sign-in alone does not mean records are backed up. Pending or failed uploads remain visibly unconfirmed.

## Automatic protection

The app checks for changed persisted records and uploads after a short pause while open. Failed uploads retry while the app is active and when it reconnects. It also reads back its last verified version every twelve hours while active. An unchanged old phone does not publish stale data merely because twelve hours elapsed; the server checkpoints the newest uploaded state.

The backend independently creates a checkpoint in each twelve-hour UTC interval from the latest verified uploaded state. The checkpoint ID is stable across restarts and multiple backend instances. This works while the browser is closed, provided the backend is running. A sleeping/offline backend catches up when running again; no browser timer is treated as a guarantee.

Changes made offline cannot be recovered from the cloud until uploaded. The status reports this limitation. A new or reset phone never automatically uploads an empty replacement. Backups are separate versions; the app has no endpoint that deletes or overwrites an existing version. Cloud-provider account policies remain outside the app's control.

## Recover on a new phone

1. Open `https://load66.github.io/bonus-tracker/`.
2. Open **Cloud backup**, sign in to the same Trading Journal account, then choose **Recover on a new phone**.
3. Preview a version and check its date, account count and bank names. Older versions can be paged through.
4. Choose **Restore this version** and confirm.
5. If the new device already contains meaningful records, its state must first receive a verified safety backup. Recovery stops if that backup fails or records change during it.
6. The download's checksum and structure are verified. The established restore validator must accept every account. Storage writes are verified as a transaction before the live tracker adopts the recovered state.

## What is preserved

Exact serialized values for the central backup-storage key list: account records and all embedded fields (terms, financial rules, notes, milestone dates, checklist, timers and cycle history), tax/timer storage, personal and community datapoints, bank requirements, phone contacts, profile events, offer history, T&C archive, analyzer memory/training/rules and backup metadata. Selected tracker/tax years are included separately.

Sign-in tokens, passwords, cloud connection state and unrelated browser storage are excluded. A recovered device keeps its own sign-in. The server rejects unknown storage keys or unsupported recovery versions rather than claiming a complete backup.

The recovery envelope is `BonusTrackerCloudBackup`, numeric version `1`, with raw storage strings. Maximum supported snapshot size is 8 MiB; exceeding it produces a visible error. Future persistent fields must extend both the frontend key list and backend allowlist, with a roundtrip test.

## Verification

Tests cover a fresh device, exact stored-value restoration, credentials staying separate, checksum corruption, immutable upload identities, owner isolation, unavailable storage, twelve-hour restart-safe checkpoints, safety snapshots, and rollback when local storage fills partway through restore. Three-browser tests use isolated profiles and synthetic records; no live user records are changed during testing.
