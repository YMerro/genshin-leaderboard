package dev.genshinboard.wishes;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigInteger;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.config.AppProperties;

/** Pulls per game account under {@code data/wishes/{uid}.json}, oldest first. Imports merge by pull ID. */
@Component
public class WishStore {

    static final Comparator<Pull> CHRONOLOGICAL = Comparator.comparing(p -> new BigInteger(p.id()));

    private final Path dir;
    private final ObjectMapper mapper;

    public WishStore(AppProperties props, ObjectMapper mapper) {
        this.dir = props.dataDir().resolve("wishes");
        this.mapper = mapper;
    }

    public synchronized Set<String> ids(String uid) {
        return load(uid).stream().map(Pull::id).collect(Collectors.toSet());
    }

    /** All pull IDs across every stored account (used to stop paging early on re-import). */
    public synchronized Set<String> allIds() {
        return uids().stream().flatMap(u -> load(u).stream()).map(Pull::id).collect(Collectors.toSet());
    }

    /** Merges new pulls and returns how many were actually new, per account UID. */
    public synchronized Map<String, Integer> merge(List<Pull> pulls) {
        Map<String, Integer> added = new LinkedHashMap<>();
        Map<String, List<Pull>> byUid = pulls.stream().collect(Collectors.groupingBy(Pull::uid, LinkedHashMap::new, Collectors.toList()));
        for (var entry : byUid.entrySet()) {
            String uid = entry.getKey();
            List<Pull> all = new ArrayList<>(load(uid));
            Set<String> known = all.stream().map(Pull::id).collect(Collectors.toSet());
            int count = 0;
            for (Pull p : entry.getValue()) {
                if (known.add(p.id())) {
                    all.add(p);
                    count++;
                }
            }
            all.sort(CHRONOLOGICAL);
            save(uid, all);
            added.put(uid, count);
        }
        return added;
    }

    public synchronized List<Pull> load(String uid) {
        Path f = file(uid);
        if (!Files.exists(f)) return List.of();
        try {
            return mapper.readValue(f.toFile(), new TypeReference<List<Pull>>() {});
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + f, e);
        }
    }

    public synchronized List<String> uids() {
        if (!Files.isDirectory(dir)) return List.of();
        List<String> result = new ArrayList<>();
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*.json")) {
            for (Path f : files) {
                result.add(f.getFileName().toString().replace(".json", ""));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        result.sort(null);
        return result;
    }

    public synchronized boolean delete(String uid) {
        try {
            return Files.deleteIfExists(file(uid));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void save(String uid, List<Pull> pulls) {
        try {
            Files.createDirectories(dir);
            Path tmp = dir.resolve(uid + ".json.tmp");
            mapper.writeValue(tmp.toFile(), pulls);
            Files.move(tmp, file(uid), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save wishes for " + uid, e);
        }
    }

    private Path file(String uid) {
        if (!uid.matches("\\d{6,12}")) throw new IllegalArgumentException("Bad UID");
        return dir.resolve(uid + ".json");
    }
}
