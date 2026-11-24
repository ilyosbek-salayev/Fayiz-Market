package uz.fayzmarket.app;
public class OriginPolicyTest {
  public static void main(String[] args) {
    String base = "https://api.example.test";
    String[] bad = {"http://api.example.test", "https://api.example.test:444", "https://api.example.test.evil.test", "https://api.example.test@evil.test", "https://evil.test@api.example.test", "javascript:alert(1)", "https://oauth.telegram.org"};
    for (String url : bad) if (OriginPolicy.sameOrigin(base, url)) throw new AssertionError(url);
    if (!OriginPolicy.sameOrigin(base, base + "/__app/index.html") || !OriginPolicy.sameOrigin(base, base + ":443/")) throw new AssertionError("trusted origin");
    System.out.println("9/9 origin policy checks passed");
  }
}
