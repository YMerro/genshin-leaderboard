package dev.genshinboard.friends;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.config.AppProperties;

/** The friend list, saved as {@code data/friends.json}. */
@Component
public class FriendStore {

    private final Path file;
    private final ObjectMapper mapper;
    private final List<Friend> friends = new ArrayList<>();

    public FriendStore(AppProperties props, ObjectMapper mapper) throws IOException {
        this.file = props.dataDir().resolve("friends.json");
        this.mapper = mapper;
        if (Files.exists(file)) {
            friends.addAll(mapper.readValue(file.toFile(), new TypeReference<List<Friend>>() {}));
        }
    }

    public synchronized List<Friend> list() {
        return List.copyOf(friends);
    }

    public synchronized boolean contains(String uid) {
        return friends.stream().anyMatch(f -> f.uid().equals(uid));
    }

    public synchronized boolean add(Friend friend) {
        if (contains(friend.uid())) {
            return false;
        }
        friends.add(friend);
        save();
        return true;
    }

    public synchronized boolean remove(String uid) {
        boolean removed = friends.removeIf(f -> f.uid().equals(uid));
        if (removed) {
            save();
        }
        return removed;
    }

    private void save() {
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            Path tmp = file.resolveSibling("friends.json.tmp");
            mapper.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), friends);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save " + file, e);
        }
    }
}
