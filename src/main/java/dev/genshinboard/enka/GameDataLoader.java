package dev.genshinboard.enka;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.config.AppProperties;

/**
 * Downloads Enka's game data files on first use, keeps a copy under {@code data/store/},
 * and refreshes them once they are older than {@code app.store.refresh-after}.
 */
@Component
public class GameDataLoader {

    private static final Logger log = LoggerFactory.getLogger(GameDataLoader.class);
    private static final List<String> FILES = List.of("avatars.json", "locs.json", "pfps.json", "namecards.json", "relics.json");

    private final RestClient http;
    private final ObjectMapper mapper;
    private final Path dir;
    private final Duration refreshAfter;

    private volatile GameData data;
    private volatile Instant loadedAt = Instant.EPOCH;

    public GameDataLoader(AppProperties props, ObjectMapper mapper) {
        this.http = RestClient.builder()
                .baseUrl(props.store().baseUrl())
                .defaultHeader(HttpHeaders.USER_AGENT, props.enka().userAgent())
                .build();
        this.mapper = mapper;
        this.dir = props.dataDir().resolve("store");
        this.refreshAfter = props.store().refreshAfter();
    }

    public GameData get() {
        if (needsLoad()) {
            synchronized (this) {
                if (needsLoad()) {
                    load();
                }
            }
        }
        return data;
    }

    private boolean needsLoad() {
        return data == null || Instant.now().isAfter(loadedAt.plus(refreshAfter));
    }

    private void load() {
        Map<String, JsonNode> files = new HashMap<>();
        for (String name : FILES) {
            files.put(name, readOrDownload(name));
        }
        data = new GameData(
                files.get("avatars.json"),
                files.get("locs.json").path("en"),
                files.get("pfps.json"),
                files.get("namecards.json"),
                files.get("relics.json").path("Sets"));
        loadedAt = Instant.now();
    }

    private JsonNode readOrDownload(String name) {
        Path file = dir.resolve(name);
        try {
            boolean fresh = Files.exists(file)
                    && Files.getLastModifiedTime(file).toInstant().isAfter(Instant.now().minus(refreshAfter));
            if (!fresh) {
                try {
                    download(name, file);
                } catch (RestClientException | IOException e) {
                    if (!Files.exists(file)) {
                        throw new IllegalStateException("Could not download game data file " + name + " from Enka.Network", e);
                    }
                    log.warn("Could not refresh {}, using the cached copy: {}", name, e.getMessage());
                }
            }
            return mapper.readTree(file.toFile());
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + file, e);
        }
    }

    private void download(String name, Path file) throws IOException {
        log.info("Downloading game data {}", name);
        byte[] bytes = http.get().uri(name).retrieve().body(byte[].class);
        mapper.readTree(bytes); // make sure it's valid JSON before replacing the cached copy
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(name + ".tmp");
        Files.write(tmp, bytes);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
}
