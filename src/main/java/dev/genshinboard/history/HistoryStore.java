package dev.genshinboard.history;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.config.AppProperties;
import dev.genshinboard.history.Snapshot.CharacterSnapshot;
import dev.genshinboard.leaderboard.PlayerSummary;
import dev.genshinboard.leaderboard.PlayerSummary.CharacterBuild;

/** Daily snapshots per player, one file per UID under {@code data/history/}. Today's entry is overwritten. */
@Component
public class HistoryStore {

    private final Path dir;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Map<String, List<Snapshot>> cache = new ConcurrentHashMap<>();

    @Autowired
    public HistoryStore(AppProperties props, ObjectMapper mapper) {
        this(props, mapper, Clock.systemDefaultZone());
    }

    HistoryStore(AppProperties props, ObjectMapper mapper, Clock clock) {
        this.dir = props.dataDir().resolve("history");
        this.mapper = mapper;
        this.clock = clock;
    }

    /** Records today's numbers. Skips players that failed or are only showing stale cached data. */
    public void record(PlayerSummary player) {
        if (player.error() != null || player.warning() != null) {
            return;
        }
        Snapshot snapshot = toSnapshot(player, LocalDate.now(clock));
        synchronized (this) {
            List<Snapshot> list = new ArrayList<>(load(player.uid()));
            list.removeIf(s -> s.date().equals(snapshot.date()));
            list.add(snapshot);
            list.sort(Comparator.comparing(Snapshot::date));
            save(player.uid(), list);
            cache.put(player.uid(), List.copyOf(list));
        }
    }

    public List<Snapshot> history(String uid) {
        return load(uid);
    }

    public synchronized void delete(String uid) {
        cache.remove(uid);
        try {
            Files.deleteIfExists(file(uid));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static Snapshot toSnapshot(PlayerSummary p, LocalDate date) {
        Map<String, CharacterSnapshot> chars = new LinkedHashMap<>();
        for (CharacterBuild c : p.characters()) {
            chars.put(c.name(), new CharacterSnapshot(c.level(), c.constellation(), c.critValue(), c.artifactScore()));
        }
        int abyssScore = p.abyssFloor() == null ? 0
                : p.abyssFloor() * 1000 + nz(p.abyssChamber()) * 100 + nz(p.abyssStars());
        String abyss = p.abyssFloor() == null ? null : p.abyssFloor() + "-" + nz(p.abyssChamber());
        double best = p.characters().stream().mapToDouble(CharacterBuild::critValue).max().orElse(0);
        double avg = p.characters().stream().mapToDouble(CharacterBuild::artifactScore).average().orElse(0);
        return new Snapshot(date, p.adventureRank(), p.achievements(), abyssScore, abyss,
                p.maxFriendshipCharacters(), best, Math.round(avg * 10) / 10.0, chars);
    }

    private static int nz(Integer v) {
        return v == null ? 0 : v;
    }

    private List<Snapshot> load(String uid) {
        return cache.computeIfAbsent(uid, u -> {
            Path f = file(u);
            if (!Files.exists(f)) return List.of();
            try {
                // Tolerate hand-edited files: drop entries without a date and keep them in date order
                return mapper.readValue(f.toFile(), new TypeReference<List<Snapshot>>() {}).stream()
                        .filter(s -> s != null && s.date() != null)
                        .sorted(Comparator.comparing(Snapshot::date))
                        .toList();
            } catch (IOException e) {
                throw new UncheckedIOException("Could not read " + f, e);
            }
        });
    }

    private void save(String uid, List<Snapshot> list) {
        try {
            Files.createDirectories(dir);
            Path tmp = dir.resolve(uid + ".json.tmp");
            mapper.writeValue(tmp.toFile(), list);
            Files.move(tmp, file(uid), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save history for " + uid, e);
        }
    }

    private Path file(String uid) {
        if (!uid.matches("\\d{9,10}")) throw new IllegalArgumentException("Bad UID");
        return dir.resolve(uid + ".json");
    }
}
