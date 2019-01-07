# TBV (Trust but Verify)

Package verification for npm.

## How to:

### Verify packages from npm

1.  Install globally: `npm i -g tbv`
1.  Verify a package: `tbv verify {package}`
  * To verify latest, use package name only (eg. `redux`)
  * To verify a specific version, use name@version (eg. `redux@4.0.1`)

### Test a package before publication

1.  Ensure that all commits have been pushed.
1.  Test local directory: `tbv test`

### Build from source

1.  Run the build script: `npm run build`
