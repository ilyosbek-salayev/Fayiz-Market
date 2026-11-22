package uz.fayzmarket.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import java.io.InputStream;

public final class MainActivity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> files;
  private static final int PICK_FILE = 41;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    LinearLayout controls = new LinearLayout(this);
    Button address = new Button(this);
    address.setText("API manzili");
    address.setOnClickListener(view -> showApiDialog());
    Button refresh = new Button(this);
    refresh.setText("Yangilash");
    refresh.setOnClickListener(view -> web.reload());
    controls.addView(address, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
    controls.addView(refresh, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
    root.addView(controls);
    root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
    setContentView(root);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    web.addJavascriptInterface(new NativeBridge(), "FayzNative");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = uri.getPath();
        if (!Uri.parse(apiUrl()).getHost().equals(uri.getHost()) || path == null || !path.startsWith("/__app/")) return null;
        String asset = path.substring("/__app/".length());
        if (asset.contains("..") || asset.isEmpty()) return null;
        try {
          InputStream data = getAssets().open(asset);
          String mime = asset.endsWith(".js") ? "text/javascript" : asset.endsWith(".css") ? "text/css" : asset.endsWith(".svg") ? "image/svg+xml" : asset.endsWith(".png") ? "image/png" : asset.endsWith(".webp") ? "image/webp" : "text/html";
          return new WebResourceResponse(mime, "UTF-8", data);
        } catch (Exception ignored) { return null; }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri.getScheme().equals("fayzmarket") && uri.getHost().equals("p")) {
          web.evaluateJavascript("window.dispatchEvent(new CustomEvent('fayz-product',{detail:" + org.json.JSONObject.quote(uri.getLastPathSegment()) + "}))", null);
          return true;
        }
        if ((uri.getScheme().equals("http") || uri.getScheme().equals("https")) && !uri.getHost().equals(Uri.parse(apiUrl()).getHost())) {
          startActivity(new Intent(Intent.ACTION_VIEW, uri)); return true;
        }
        return false;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
        new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK", (d,w) -> result.confirm()).setCancelable(false).show(); return true;
      }
      @Override public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
        new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Ha", (d,w) -> result.confirm()).setNegativeButton("Yoʻq", (d,w) -> result.cancel()).setCancelable(false).show(); return true;
      }
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        files = callback;
        try { startActivityForResult(params.createIntent(), PICK_FILE); return true; }
        catch (Exception error) { files = null; callback.onReceiveValue(null); return false; }
      }
    });
    openApp();
  }

  private String apiUrl() { return getPreferences(MODE_PRIVATE).getString("api_url", getString(uz.fayzmarket.admin.R.string.default_api_url)).replaceAll("/+$", ""); }
  private void openApp() {
    String url = apiUrl() + "/__app/index.html";
    Uri incoming = getIntent().getData();
    if (incoming != null && "fayzmarket".equals(incoming.getScheme()) && "p".equals(incoming.getHost())) {
      String slug = incoming.getLastPathSegment();
      if (slug != null && slug.matches("[a-z0-9-]+")) url += "#/p/" + slug;
    }
    web.loadUrl(url);
  }

  @Override public boolean onCreateOptionsMenu(Menu menu) { menu.add("API manzili"); menu.add("Yangilash"); return true; }
  @Override public boolean onOptionsItemSelected(MenuItem item) {
    if (item.getTitle().equals("Yangilash")) { web.reload(); return true; }
    showApiDialog(); return true;
  }
  private void showApiDialog() {
    EditText field = new EditText(this); field.setSingleLine(true); field.setText(apiUrl());
    new AlertDialog.Builder(this).setTitle("Lokal API manzili").setView(field).setPositiveButton("Saqlash", (d,w) -> {
      String value = field.getText().toString().trim();
      if (!value.matches("https?://[^/ ]+(?::[0-9]+)?/?")) { new AlertDialog.Builder(this).setMessage("Toʻliq http:// yoki https:// manzil kiriting").setPositiveButton("OK", null).show(); return; }
      getPreferences(MODE_PRIVATE).edit().putString("api_url", value).apply(); openApp();
    }).setNegativeButton("Bekor qilish", null).show();
  }
  @Override protected void onActivityResult(int request, int result, Intent data) { super.onActivityResult(request, result, data); if (request == PICK_FILE && files != null) { files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); files = null; } }
  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
  private final class NativeBridge {
    @JavascriptInterface public void share(String text) { runOnUiThread(() -> { Intent send = new Intent(Intent.ACTION_SEND); send.setType("text/plain"); send.putExtra(Intent.EXTRA_TEXT, text); startActivity(Intent.createChooser(send, "Ulashish")); }); }
  }
}
