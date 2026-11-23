package uz.fayzmarket.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/**
 * Minimal, non-exported provider that lets the camera app write a photo into this app's cache
 * (content://<package>.captures/photo-<time>.jpg). Access is granted per request with URI permissions,
 * so the photo never has to be saved to the gallery first.
 */
public final class CaptureProvider extends ContentProvider {
  @Override public boolean onCreate() { return true; }
  private File file(Uri uri) throws FileNotFoundException {
    String name = uri.getLastPathSegment();
    if (name == null || !name.matches("photo-\\d{1,20}\\.jpg")) throw new FileNotFoundException("invalid");
    return new File(new File(getContext().getCacheDir(), "captures"), name);
  }
  @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.parseMode(mode));
  }
  @Override public String getType(Uri uri) { return "image/jpeg"; }
  @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
    try {
      File f = file(uri);
      MatrixCursor cursor = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
      cursor.addRow(new Object[] { f.getName(), f.length() });
      return cursor;
    } catch (FileNotFoundException e) { return null; }
  }
  @Override public Uri insert(Uri uri, ContentValues values) { return null; }
  @Override public int delete(Uri uri, String selection, String[] args) { return 0; }
  @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
}
