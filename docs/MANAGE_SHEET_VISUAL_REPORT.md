# Manage action sheet — v3.6.12 visual verification

Source reference: owner's iPhone Safari screenshot of the v3.6.10 light Account Actions sheet. This screenshot is not copied into the public repository.

## Expected result

The Manage sheet is now a dark surface using \`#12141C\` with a \`#1E212C\` stroke, a 24px top radius, a grab handle, human-readable stage label, bank identity, and a visible close control. One inset-divided list replaces all separate light action cards. Thirty-four-pixel icon tiles contain line SVGs. The destructive action remains in a distinct red-tinted group at the end.

The fixed account-detail footer is not rendered while Manage is open. The sheet scrolls independently, ends above the bottom navigation, and respects iPhone safe-area insets. Every action still calls its existing handler; stage-primary actions and Ask AI do not repeat in the top-level list. Secondary stage functions and advanced tools remain reachable through a collapsed disclosure.

Other detail-related timer, deposit, and close-selection sheets inherit the dark prompt palette without changing their form logic.

## Screenshot comparison

| Baseline | Release browser artifact | Verification |
| --- | --- | --- |
| iPhone Safari v3.6.10, old light Manage sheet | \`chromium-manage-sheet-390.png\` | 390px dark sheet with footer hidden, no white action cards, human stage label, SVG icons and visible Delete action |
| Same reference | \`webkit-manage-sheet-390.png\` | iOS WebKit-style rendering, mobile safe-area and button accessibility |

The screenshots are generated under the release run's browser artifacts, not populated with real bank data. A screenshot must only be marked verified after both browsers' completed jobs succeed.

## Acceptance checks

- Closing the sheet restores the detail's sticky footer.
- \`Delete account\` remains fully visible and tappable after scrolling at 320px, 390px and 430px, and still prompts for confirmation.
- Edit, task, timer, Activity and all other actions retain their original handlers and persistence semantics.
- Visible Manage row icons are SVG (not emoji); labels are human-readable; saved evidence is not altered.
- Tests use only synthetic entries, never real providers or existing account data.
