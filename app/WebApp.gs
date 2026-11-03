/**
 * Om Team Register: the app link.
 * Deploy as a web app that runs as you, open to anyone (see README). Staff never get the sheet.
 *   ?join=<code>  opens the joining form
 *   ?g=<token>    comes back from the Google sign-in project
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var safe = function (v, re) { v = String(v || ''); return re.test(v) ? v : ''; };
  var t = HtmlService.createTemplateFromFile('App');
  t.boot = JSON.stringify({
    join: safe(p.join, /^[a-f0-9]{12}$/),
    g: safe(p.g, /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/),
    appUrl: appUrl_()
  });
  return t.evaluate()
    .setTitle(setting_('orgName') || 'Om Team')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
