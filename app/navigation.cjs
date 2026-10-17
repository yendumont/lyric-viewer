// Whether an address is a page of this app: its origin (scheme, host and port, after the address is parsed) must equal the app's own
// exactly. A prefix test is not enough: "http://127.0.0.1:3838@evil.example/" and "http://127.0.0.1:38380/" both begin with
// "http://127.0.0.1:3838" but are other sites.
function isAppPage(url, appAddress) {
  try {
    const target = new URL(url);
    const own = new URL(appAddress);
    return target.origin === own.origin && target.username === "" && target.password === "";
  } catch {
    return false;
  }
}

module.exports = { isAppPage };
