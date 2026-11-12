package dev.genshinboard.enka;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.config.AppProperties;

/**
 * Fetches player profiles from https://enka.network/api/uid/{uid}/.
 *
 * <p>Responses are cached for as long as Enka's {@code ttl} says (at least {@code min-cache-ttl}),
 * so refreshing the page doesn't hammer the API. If Enka is down, the last good copy is served
 * with a warning.
 */
@Component
public class EnkaClient {

    private static final Logger log = LoggerFactory.getLogger(EnkaClient.class);

    private final RestClient http;
    private final ObjectMapper mapper;
    private final Duration minTtl;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public EnkaClient(AppProperties props, ObjectMapper mapper) {
        AppProperties.Enka enka = props.enka();
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(enka.timeout())
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(enka.timeout());

        this.http = RestClient.builder()
                .baseUrl(enka.baseUrl())
                .requestFactory(factory)
                .defaultHeader(HttpHeaders.USER_AGENT, enka.userAgent())
                .build();
        this.mapper = mapper;
        this.minTtl = enka.minCacheTtl();
    }

    public FetchResult fetch(String uid) {
        Instant now = Instant.now();
        Cached cached = cache.get(uid);
        if (cached != null && now.isBefore(cached.expiresAt())) {
            return new FetchResult(cached.body(), cached.fetchedAt(), null);
        }

        try {
            String raw = http.get().uri("/api/uid/{uid}/", uid).retrieve().body(String.class);
            JsonNode body = mapper.readTree(raw);
            Duration ttl = Duration.ofSeconds(body.path("ttl").asLong(0));
            if (ttl.compareTo(minTtl) < 0) {
                ttl = minTtl;
            }
            cache.put(uid, new Cached(body, now, now.plus(ttl)));
            return new FetchResult(body, now, null);
        } catch (RestClientResponseException e) {
            return fallback(uid, cached, EnkaException.forStatus(e.getStatusCode().value()));
        } catch (ResourceAccessException e) {
            return fallback(uid, cached, new EnkaException(0, "Could not reach Enka.Network. Check your internet connection."));
        } catch (JsonProcessingException e) {
            return fallback(uid, cached, new EnkaException(0, "Enka.Network returned a response we couldn't read."));
        }
    }

    private FetchResult fallback(String uid, Cached cached, EnkaException error) {
        if (cached == null || error.isPermanent()) {
            throw error;
        }
        log.warn("Enka lookup for {} failed ({}); serving cached copy", uid, error.getMessage());
        return new FetchResult(cached.body(), cached.fetchedAt(), "Showing older data: " + error.getMessage());
    }

    private record Cached(JsonNode body, Instant fetchedAt, Instant expiresAt) {}
}
