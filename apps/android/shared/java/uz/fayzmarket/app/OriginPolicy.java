package uz.fayzmarket.app;
import java.net.URI;
final class OriginPolicy {
  static boolean sameOrigin(String base, String candidate) {
    try {
      URI a = new URI(base), b = new URI(candidate);
      if (a.getHost() == null || b.getHost() == null || b.getUserInfo() != null) return false;
      if (!"https".equals(a.getScheme()) && !"http".equals(a.getScheme())) return false;
      int ap = a.getPort() == -1 ? ("https".equals(a.getScheme()) ? 443 : 80) : a.getPort();
      int bp = b.getPort() == -1 ? ("https".equals(b.getScheme()) ? 443 : 80) : b.getPort();
      return a.getScheme().equals(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost()) && ap == bp;
    } catch (Exception invalid) { return false; }
  }
}
