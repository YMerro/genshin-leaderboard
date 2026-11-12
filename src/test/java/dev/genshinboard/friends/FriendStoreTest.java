package dev.genshinboard.friends;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.config.AppProperties;

class FriendStoreTest {

    @TempDir
    Path dir;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private FriendStore newStore() throws IOException {
        return new FriendStore(new AppProperties(dir, null, null), mapper);
    }

    @Test
    void persistsAcrossRestarts() throws IOException {
        FriendStore store = newStore();
        assertThat(store.add(new Friend("712345678", "Sam", Instant.parse("2026-01-01T00:00:00Z")))).isTrue();
        assertThat(store.add(new Friend("812345678", null, Instant.now()))).isTrue();

        FriendStore reloaded = newStore();
        assertThat(reloaded.list()).extracting(Friend::uid).containsExactly("712345678", "812345678");
        assertThat(reloaded.list().get(0).label()).isEqualTo("Sam");
    }

    @Test
    void rejectsDuplicatesAndRemoves() throws IOException {
        FriendStore store = newStore();
        store.add(new Friend("712345678", null, Instant.now()));

        assertThat(store.add(new Friend("712345678", "again", Instant.now()))).isFalse();
        assertThat(store.remove("712345678")).isTrue();
        assertThat(store.remove("712345678")).isFalse();
        assertThat(newStore().list()).isEmpty();
    }
}
