BonusTracker v3.4.10 — Full Upload Package

This package was built from the uploaded v3.4.06 ZIP as the base.

Upload instructions:
1. Extract this ZIP.
2. In the GitHub repository root, upload/replace every extracted file and folder.
3. Preserve the .github folder and the .nojekyll file.
4. Commit the upload.
5. After GitHub Pages finishes publishing, open the site and confirm v3.4.10.

Main fixes:
- Closed non-repeatable offers are archived, not placed into churn cooldown.
- No reopen date or churn-ready date is created for archived offers.
- FourLeaf is recognized as non-repeatable even for older saved entries.
- Closing confirmation says Closed & Archived.
- FourLeaf analyzer status uses DD Due instead of Custom Timer.
- Requirement summary shows the $500+ DD due date.
- Safari analyzer scrolling remains included.
- Service worker activates the new version immediately.

Verification completed:
- All JavaScript files passed syntax checks.
- Latest-release file verification passed.
- Close-rule tests passed 7/7.
- Full app/analyzer regression checks passed 17/17.
- Archive lifecycle smoke checks passed.
