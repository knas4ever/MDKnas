# Publishing to the Microsoft Store

1. Make the first submission by hand in Partner Center (upload the `mdknas-msix` artifact from the Tauri workflow) and get it certified.
2. In Partner Center → Account settings → Manage users, add an Azure AD application with the **Manager** role. Copy its Tenant ID and Client ID, and create a client secret.
3. Add these repository secrets (Settings → Secrets and variables → Actions):
   `STORE_TENANT_ID`, `STORE_CLIENT_ID`, `STORE_CLIENT_SECRET`, `STORE_SELLER_ID` (Account settings → Legal info), `STORE_PRODUCT_ID` (the app's Partner Center ID).
4. To release: bump `version` in `package.json` (build date `YYYY.M.D`) and update `CHANGELOG.md`, then push to `master`. The Release workflow builds the MSIX and **Publish to Microsoft Store** then submits it automatically (skipped while the secrets are missing). It can also be run by hand to re-submit the latest build.

The Store version is `YYYY.M.D.0` (the Store requires the last number to be 0, so the `-N` build number is dropped). It must be higher than the previously published version, so submit at most one build per day to the Store.
