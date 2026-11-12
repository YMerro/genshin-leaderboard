package dev.genshinboard.history;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import dev.genshinboard.config.AppProperties;
import dev.genshinboard.leaderboard.PlayerSummary;

class HistoryStoreTest {

    @TempDir
    Path dir;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private HistoryStore store(String day) {
        Clock clock = Clock.fixed(Instant.parse(day + "T12:00:00Z"), ZoneOffset.UTC);
        return new HistoryStore(new AppProperties(dir, null, null), mapper, clock);
    }

    private PlayerSummary player(int ar, String warning, String error) {
        return new PlayerSummary("712345678", null, "Sam", ar, 8, "", 500, 12, 3, 36, null, null, 10,
                null, null, false, List.of(), Instant.now(), warning, error);
    }

    @Test
    void oneSnapshotPerDayOverwritingToday() {
        HistoryStore monday = store("2026-11-09");
        monday.record(player(58, null, null));
        monday.record(player(59, null, null));

        HistoryStore tuesday = store("2026-11-10");
        tuesday.record(player(60, null, null));

        List<Snapshot> history = store("2026-11-10").history("712345678");
        assertThat(history).extracting(Snapshot::date)
                .containsExactly(LocalDate.parse("2026-11-09"), LocalDate.parse("2026-11-10"));
        assertThat(history).extracting(Snapshot::adventureRank).containsExactly(59, 60);
        assertThat(history.get(0).abyssScore()).isEqualTo(12336);
        assertThat(history.get(0).abyss()).isEqualTo("12-3");
    }

    @Test
    void skipsFailedAndStalePlayers() {
        HistoryStore s = store("2026-11-09");
        s.record(player(58, "Showing older data", null));
        s.record(PlayerSummary.failed("712345678", null, "down"));
        assertThat(s.history("712345678")).isEmpty();
    }
}
