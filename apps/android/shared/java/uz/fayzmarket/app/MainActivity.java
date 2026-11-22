package uz.fayzmarket.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import java.io.File;
import java.io.InputStream;

/**
 * Shared WebView shell for the customer and admin apps. The web UI is bundled in assets and served under
 * <API origin>/__app/ so API calls are same-origin. Native features are exposed through window.FayzNative.
 */
public final class MainActivity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> files;
  private Uri captureUri;
  private File captureFile;
  private GeolocationPermissions.Callback geoCallback;
  private String geoOrigin;
  private String pendingOrderId;
  private Biometrics biometrics;
  private static final int PICK_FILE = 41, CAPTURE_PHOTO = 42, LOCATION_PERMISSION = 43;
  private static final String CHANNEL_OPERATIONS = "operations", CHANNEL_ORDERS = "orders";

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    biometrics = new Biometrics(this);
    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor("#FAFAF7"));
    setContentView(web);
    applySystemBars("#FAFAF7", true);
    createChannels();
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setGeolocationEnabled(true);
    web.addJavascriptInterface(new NativeBridge(), "FayzNative");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = uri.getPath();
        if (!apiHost().equals(uri.getHost()) || path == null || !path.startsWith("/__app/")) return null;
        String asset = path.substring("/__app/".length());
        if (asset.contains("..") || asset.isEmpty()) return null;
        try {
          InputStream data = getAssets().open(asset);
          String mime = asset.endsWith(".js") ? "text/javascript" : asset.endsWith(".css") ? "text/css" : asset.endsWith(".svg") ? "image/svg+xml" : asset.endsWith(".png") ? "image/png" : asset.endsWith(".webp") ? "image/webp" : asset.endsWith(".woff2") ? "font/woff2" : "text/html";
          return new WebResourceResponse(mime, "UTF-8", data);
        } catch (Exception ignored) { return null; }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if (scheme.equals("fayzmarket") && "p".equals(uri.getHost())) {
          web.evaluateJavascript("window.dispatchEvent(new CustomEvent('fayz-product',{detail:" + org.json.JSONObject.quote(uri.getLastPathSegment()) + "}))", null);
          return true;
        }
        if (scheme.equals("http") || scheme.equals("https")) {
          String host = uri.getHost() == null ? "" : uri.getHost();
          // The API origin and Telegram's official login page stay inside the app; everything else opens outside.
          if (host.equals(apiHost()) || host.equals("oauth.telegram.org")) return false;
          openOutside(uri); return true;
        }
        openOutside(uri); return true; // tel:, geo:, tg: …
      }
      @Override public void onPageFinished(WebView view, String url) { deliverPendingOrder(); }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
        new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK", (d, w) -> result.confirm()).setCancelable(false).show(); return true;
      }
      @Override public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
        new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Ha", (d, w) -> result.confirm()).setNegativeButton("Yoʻq", (d, w) -> result.cancel()).setCancelable(false).show(); return true;
      }
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (files != null) files.onReceiveValue(null);
        files = callback;
        if (params.isCaptureEnabled() && startCamera()) return true;
        try { startActivityForResult(params.createIntent(), PICK_FILE); return true; }
        catch (Exception error) { files = null; callback.onReceiveValue(null); return false; }
      }
      /** Location is shared only with the app's own origin and only after the Android permission is granted. */
      @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        if (!apiHost().equals(Uri.parse(origin).getHost())) { callback.invoke(origin, false, false); return; }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) { callback.invoke(origin, true, false); return; }
        geoOrigin = origin; geoCallback = callback;
        requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, LOCATION_PERMISSION);
      }
    });
    pendingOrderId = getIntent().getStringExtra("orderId");
    openApp();
  }

  @Override protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent); setIntent(intent);
    String orderId = intent.getStringExtra("orderId");
    if (orderId != null) { pendingOrderId = orderId; deliverPendingOrder(); }
  }
  private void deliverPendingOrder() {
    if (pendingOrderId == null || web == null) return;
    String id = pendingOrderId; pendingOrderId = null;
    web.postDelayed(() -> web.evaluateJavascript("window.dispatchEvent(new CustomEvent('fayz-open-order',{detail:" + org.json.JSONObject.quote(id) + "}))", null), 800);
  }

  private String defaultApiUrl() { return getString(getResources().getIdentifier("default_api_url", "string", getPackageName())); }
  private String apiUrl() { return getPreferences(MODE_PRIVATE).getString("api_url", defaultApiUrl()).replaceAll("/+$", ""); }
  private String apiHost() { String host = Uri.parse(apiUrl()).getHost(); return host == null ? "" : host; }
  private void openApp() {
    String url = apiUrl() + "/__app/index.html";
    Uri incoming = getIntent().getData();
    if (incoming != null && "fayzmarket".equals(incoming.getScheme()) && "p".equals(incoming.getHost())) {
      String slug = incoming.getLastPathSegment();
      if (slug != null && slug.matches("[a-z0-9-]+")) url += "#/p/" + slug;
    }
    web.loadUrl(url);
  }
  private void openOutside(Uri uri) {
    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
  }

  // ---------- Camera: full-resolution photo into the app cache (not the gallery) ----------
  private boolean startCamera() {
    try {
      File dir = new File(getCacheDir(), "captures");
      if (!dir.exists() && !dir.mkdirs()) return false;
      File[] old = dir.listFiles(); if (old != null) for (File f : old) if (f.lastModified() < System.currentTimeMillis() - 86_400_000L) f.delete();
      captureFile = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
      captureUri = Uri.parse("content://" + getPackageName() + ".captures/" + captureFile.getName());
      Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
      intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, captureUri);
      intent.setClipData(ClipData.newRawUri("photo", captureUri));
      intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
      startActivityForResult(intent, CAPTURE_PHOTO);
      return true;
    } catch (Exception noCameraApp) { captureUri = null; captureFile = null; return false; }
  }

  @Override protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (files == null) return;
    if (request == PICK_FILE) files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
    else if (request == CAPTURE_PHOTO) files.onReceiveValue(result == RESULT_OK && captureFile != null && captureFile.length() > 0 ? new Uri[] { captureUri } : null);
    files = null;
  }

  @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
    if (request != LOCATION_PERMISSION || geoCallback == null) return;
    boolean granted = false; for (int r : results) granted |= r == PackageManager.PERMISSION_GRANTED;
    geoCallback.invoke(geoOrigin, granted, false); geoCallback = null; geoOrigin = null;
  }

  // ---------- Notifications ----------
  private void createChannels() {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(new NotificationChannel(CHANNEL_OPERATIONS, "Ish jarayoni", NotificationManager.IMPORTANCE_HIGH));
    manager.createNotificationChannel(new NotificationChannel(CHANNEL_ORDERS, "Buyurtmalar", NotificationManager.IMPORTANCE_DEFAULT));
  }
  private void showNotification(String key, String title, String body, String orderId) {
    Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    if (orderId != null && orderId.matches("\\d{1,12}")) open.putExtra("orderId", orderId);
    PendingIntent tap = PendingIntent.getActivity(this, key.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    String channel = getPackageName().endsWith(".admin") ? CHANNEL_OPERATIONS : CHANNEL_ORDERS;
    Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this);
    builder.setSmallIcon(getResources().getIdentifier("ic_stat_fayz", "drawable", getPackageName()))
      .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
      .setAutoCancel(true).setContentIntent(tap).setColor(Color.parseColor("#F0B800"))
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPublicVersion(new Notification.Builder(this).setSmallIcon(getResources().getIdentifier("ic_stat_fayz", "drawable", getPackageName())).setContentTitle("Fayz Market").setContentText("Yangi bildirishnoma").build());
    if (Build.VERSION.SDK_INT < 26) builder.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
    getSystemService(NotificationManager.class).notify(key.hashCode(), builder.build());
  }

  // ---------- Menu / debug API address ----------
  @Override public boolean onCreateOptionsMenu(Menu menu) { menu.add("API manzili"); menu.add("Yangilash"); return true; }
  @Override public boolean onOptionsItemSelected(MenuItem item) {
    if (item.getTitle().equals("Yangilash")) { web.reload(); return true; }
    showApiDialog(); return true;
  }
  private void showApiDialog() {
    EditText field = new EditText(this); field.setSingleLine(true); field.setText(apiUrl());
    new AlertDialog.Builder(this).setTitle("Server (API) manzili").setView(field).setPositiveButton("Saqlash", (d, w) -> {
      String value = field.getText().toString().trim();
      if (!value.matches("https?://[^/ ]+(?::[0-9]+)?/?")) { new AlertDialog.Builder(this).setMessage("Toʻliq http:// yoki https:// manzil kiriting").setPositiveButton("OK", null).show(); return; }
      getPreferences(MODE_PRIVATE).edit().putString("api_url", value).apply(); openApp();
    }).setNegativeButton("Bekor qilish", null).show();
  }
  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
  private boolean debuggable() { return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0; }
  private void applySystemBars(String color, boolean light) {
    try {
      int value = Color.parseColor(color);
      getWindow().setStatusBarColor(value);
      int flags = getWindow().getDecorView().getSystemUiVisibility();
      flags = light ? flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
      if (Build.VERSION.SDK_INT >= 26) {
        getWindow().setNavigationBarColor(value);
        flags = light ? flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      }
      getWindow().getDecorView().setSystemUiVisibility(flags);
    } catch (Exception ignored) { }
  }
  void callback(String id, boolean ok, String value) {
    runOnUiThread(() -> web.evaluateJavascript("window.__fayzNative&&window.__fayzNative(" + org.json.JSONObject.quote(id) + "," + ok + "," + org.json.JSONObject.quote(value) + ")", null));
  }

  private final class NativeBridge {
    @JavascriptInterface public void share(String text) { runOnUiThread(() -> { Intent send = new Intent(Intent.ACTION_SEND); send.setType("text/plain"); send.putExtra(Intent.EXTRA_TEXT, text); startActivity(Intent.createChooser(send, "Ulashish")); }); }
    @JavascriptInterface public boolean isDebug() { return debuggable(); }
    @JavascriptInterface public void openApiSettings() { if (debuggable()) runOnUiThread(MainActivity.this::showApiDialog); }
    @JavascriptInterface public void reload() { runOnUiThread(() -> web.reload()); }
    @JavascriptInterface public void setSystemBars(String color, boolean light) { runOnUiThread(() -> applySystemBars(color, light)); }
    @JavascriptInterface public void notify(String key, String title, String body, String orderId) { runOnUiThread(() -> showNotification(key, title, body, orderId)); }
    @JavascriptInterface public void keepScreenOn(boolean on) { runOnUiThread(() -> { if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); }); }
    @JavascriptInterface public void openExternal(String url) {
      Uri uri = Uri.parse(url); String scheme = uri.getScheme() == null ? "" : uri.getScheme();
      if (scheme.equals("tel") || scheme.equals("https") || scheme.equals("geo")) runOnUiThread(() -> openOutside(uri));
    }
    @JavascriptInterface public String biometricStatus() { return biometrics.status(); }
    @JavascriptInterface public boolean biometricStored() { return biometrics.stored(); }
    @JavascriptInterface public void biometricEnable(String secret, String id) { runOnUiThread(() -> biometrics.enable(secret, (ok, value) -> callback(id, ok, value))); }
    @JavascriptInterface public void biometricUnlock(String id) { runOnUiThread(() -> biometrics.unlock((ok, value) -> callback(id, ok, value))); }
    @JavascriptInterface public void biometricDisable() { biometrics.disable(); }
  }
}
