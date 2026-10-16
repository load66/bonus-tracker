# Add Bank Experience — SimpleFIN-supported secure handoff

## User-facing workflow

BonusTracker now provides a branded **Add bank** wizard under
**Finances → Accounts → Add bank**, as well as **Connect a bank** on
the empty-connections screen and **Connect a bank — guided setup** from the
existing Financial accounts management panel.

### Already connected to SimpleFIN
1. Open the wizard and choose **Continue securely to SimpleFIN**. This
   opens the provider's bank authorization site in a new browser tab.
2. On SimpleFIN, authorize your bank and complete any login/MFA.
3. Return to BonusTracker and choose **I authorized my bank — Find my accounts**.
4. Review the returned accounts, opt into read-only monitoring where needed,
   and link the correct bank bonus cycle and product explicitly.

**Do not disconnect/reconnect just to add a new institution**. The existing
SimpleFIN token, bonus mappings, evidence inbox reviews, and monitoring state
are preserved by the standard account-discovery endpoint. New accounts are not
monitored or linked automatically.

### Connecting SimpleFIN for the first time
1. Open the wizard and select **Continue securely to SimpleFIN**.
2. Authorize your first bank in the provider's own interface.
3. Choose **Get my SimpleFIN setup token** (Apps → New Connection on SimpleFIN).
4. Paste the provider's *single-use* token into BonusTracker and select
   **Connect my accounts securely**. BonusTracker sends it directly to the
   owner-authorized backend exchange endpoint without persisting it in
   browser storage.

## Provider boundary

SimpleFIN's official app integration has a **setup-token exchange**, not
an embeddable Plaid Link widget or a bank-credential login API. A true
fully-embedded bank-login experience requires a provider that explicitly
offers a supported hosted/embedded authentication component (for example,
Plaid Link) and entails different API and pricing constraints.

No BonusTracker page asks for, receives, or stores a bank username,
password, one-time MFA code, or bank security answers. Browser frames,
credential scraping, and fake lookalike login forms are prohibited.
SimpleFIN authorization and billing stay on the actual provider domain.

We cannot automatically learn whether authorization completed on another
tab because no OAuth callback or redirect state is defined by the
SimpleFIN setup-token protocol. Users explicitly initiate account discovery
when they return; the backend enforces provider rate limits. Not finding
an account does not imply that authorization failed or that the bank is
unsupported. The existing monitoring, account-type classification,
promotion rules, and bonus lifecycle logic remain unchanged.

## Tests

The release's Chromium / Firefox / WebKit browser tests check:
- Opening the branded wizard from Finances.
- Trusted HTTPS provider links opened in a separate tab using noopener.
- No credential or MFA inputs inside the bank wizard.
- First-time single-use token handoff using synthetic fixture data.
- Returning from provider authorization and explicitly discovering
  newly added accounts.
- Preserving saved bonus links and monitoring preferences.
- Unchanged tracker records and safe 320/390/430px layouts.

All tests use synthetic bank data. Do not assert a real institution has
been linked until the owner confirms the actual bank is visible.
