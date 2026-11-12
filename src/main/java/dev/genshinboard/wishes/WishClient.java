package dev.genshinboard.wishes;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Downloads wish history from HoYoverse's gacha log API using the query parameters of a wish history link.
 *
 * <p>Only the link's query string is used. Requests always go to the official API host, never to the host
 * in the pasted link, and the authkey is never logged or stored.
 */
@Component
public class WishClient {

    static final String GLOBAL_API = "https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog";
    static final String CHINA_API = "https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog";

    /** Banner types to query. 301 also returns the second character banner (400). */
    static final List<String> BANNERS = List.of("301", "302", "200", "500", "100");

    private static final Pattern HOST = Pattern.compile("^https?://([^/?#]+)", Pattern.CASE_INSENSITIVE);
    private static final Set<String> OVERRIDDEN = Set.of("gacha_type", "page", "size", "end_id", "lang");
    private static final Duration PAGE_DELAY = Duration.ofMillis(350);

    private final RestClient http = RestClient.create();

    /** Parsed link: which API to call and the query parameters to send (raw, still URL-encoded). */
    record LinkParams(String api, Map<String, String> query) {}

    static LinkParams parse(String link) {
        String url = link == null ? "" : link.trim();
        Matcher m = HOST.matcher(url);
        if (!m.find() || !url.contains("authkey=")) {
            throw new WishImportException("That doesn't look like a wish history link. It should start with https:// and contain \"authkey=\".");
        }
        String host = m.group(1).toLowerCase();
        boolean china = host.endsWith("mihoyo.com");
        if (!china && !host.endsWith("hoyoverse.com") && !host.endsWith("hoyolab.com")) {
            throw new WishImportException("That link isn't from HoYoverse. Use the wish history link from the game.");
        }

        int start = url.indexOf('?');
        int end = url.indexOf('#', start + 1);
        String queryString = url.substring(start + 1, end < 0 ? url.length() : end);
        Map<String, String> query = new LinkedHashMap<>();
        for (String pair : queryString.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            String key = pair.substring(0, eq);
            if (!OVERRIDDEN.contains(key) && key.matches("[A-Za-z0-9_]+")) {
                query.put(key, pair.substring(eq + 1));
            }
        }
        if (query.getOrDefault("authkey", "").isEmpty()) {
            throw new WishImportException("The link is missing its authkey. Copy the whole link.");
        }
        return new LinkParams(china ? CHINA_API : GLOBAL_API, query);
    }

    /**
     * Fetches every banner, newest first, stopping a banner early once {@code alreadyHave} matches
     * (so re-imports only download new pulls).
     */
    public List<Pull> fetchAll(String link, Predicate<String> alreadyHave) {
        LinkParams params = parse(link);
        List<Pull> pulls = new ArrayList<>();
        for (String banner : BANNERS) {
            String endId = "0";
            for (int page = 1; ; page++) {
                JsonNode list = fetchPage(params, banner, page, endId);
                if (!list.isArray() || list.isEmpty()) break;
                boolean reachedKnown = false;
                for (JsonNode item : list) {
                    String id = item.path("id").asText();
                    if (alreadyHave.test(id)) {
                        reachedKnown = true;
                        break;
                    }
                    pulls.add(new Pull(id, item.path("uid").asText(), item.path("gacha_type").asText(banner),
                            item.path("name").asText(), item.path("item_type").asText(),
                            item.path("rank_type").asInt(3), item.path("time").asText()));
                    endId = id;
                }
                if (reachedKnown || list.size() < 20) break;
                pause();
            }
            pause();
        }
        return pulls;
    }

    private JsonNode fetchPage(LinkParams params, String banner, int page, String endId) {
        StringBuilder url = new StringBuilder(params.api()).append('?');
        params.query().forEach((k, v) -> url.append(k).append('=').append(v).append('&'));
        url.append("lang=en&gacha_type=").append(banner).append("&page=").append(page)
                .append("&size=20&end_id=").append(endId);

        URI uri;
        try {
            uri = URI.create(url.toString());
        } catch (IllegalArgumentException e) {
            throw new WishImportException("The link contains characters that can't be used. Copy it again.");
        }

        for (int attempt = 1; ; attempt++) {
            JsonNode body;
            try {
                body = http.get().uri(uri).retrieve().body(JsonNode.class);
            } catch (RestClientException e) {
                throw new WishImportException("Couldn't reach HoYoverse's wish history server. Try again in a moment.");
            }
            if (body == null) {
                throw new WishImportException("HoYoverse's wish history server sent an empty response. Try again in a moment.");
            }
            int retcode = body.path("retcode").asInt(-1);
            switch (retcode) {
                case 0 -> { return body.path("data").path("list"); }
                case -101 -> throw new WishImportException(
                        "This link has expired (they last about 24 hours). Open your wish history in-game, then get a fresh link.");
                case -100 -> throw new WishImportException("HoYoverse rejected the link's authkey. Get a fresh link and copy all of it.");
                case -110 -> {
                    if (attempt >= 4) throw new WishImportException("HoYoverse is rate limiting us. Wait a minute and try again.");
                    sleep(Duration.ofSeconds(2L * attempt));
                }
                default -> throw new WishImportException("HoYoverse returned an error ("
                        + body.path("message").asText("code " + retcode) + ").");
            }
        }
    }

    private static void pause() {
        sleep(PAGE_DELAY);
    }

    private static void sleep(Duration d) {
        try {
            Thread.sleep(d);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WishImportException("Import was interrupted.");
        }
    }
}
