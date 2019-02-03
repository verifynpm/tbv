[![npm](https://img.shields.io/npm/v/tbv.svg)](https://www.npmjs.com/package/tbv)
[![verification](https://api.verifynpm.com/v0/packages/tbv/badge.svg)](https://api.verifynpm.com/v0/packages/tbv)

# TBV (Trust but Verify)

Package verification for npm.

## How to:

### Verify packages from npm

1.  Install globally: `npm i -g tbv`
1.  Verify a package: `tbv verify {package}`
    * To verify latest, use package name only (eg. `redux`)
    * To verify a specific version, use name@version (eg. `redux@4.0.1`)

### View verbose output

1.  Use the `verbose` option: `npm verify {package} --verbose`

### Run in a Docker container

1.  Build the container: `npm run docker-build:{distro}`
    * Current supported distros are `alpine`, `fedora`, and `jessie`
1.  Run the container: `npm run docker-run:{distro} -- {package} [--verbose]`

### Test a package before publication

1.  Ensure that all commits have been pushed.
1.  Test local directory: `tbv test`

### Build from source

1.  Run the build script: `npm run build`
