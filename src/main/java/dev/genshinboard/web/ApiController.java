package dev.genshinboard.web;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.genshinboard.enka.EnkaException;
import dev.genshinboard.enka.GameData;
import dev.genshinboard.enka.GameDataLoader;
import dev.genshinboard.friends.Friend;
import dev.genshinboard.friends.FriendStore;
import dev.genshinboard.history.HistoryStore;
import dev.genshinboard.history.Snapshot;
import dev.genshinboard.leaderboard.LeaderboardService;
import dev.genshinboard.leaderboard.LeaderboardService.Leaderboard;
import dev.genshinboard.leaderboard.PlayerSummary;

@RestController
@RequestMapping("/api")
public class ApiController {

    private static final Pattern UID = Pattern.compile("\\d{9,10}");
    private static final int MAX_LABEL_LENGTH = 40;

    private final LeaderboardService leaderboard;
    private final FriendStore friends;
    private final HistoryStore history;
    private final GameDataLoader gameData;

    public ApiController(LeaderboardService leaderboard, FriendStore friends, HistoryStore history, GameDataLoader gameData) {
        this.leaderboard = leaderboard;
        this.friends = friends;
        this.history = history;
        this.gameData = gameData;
    }

    public record AddFriendRequest(String uid, String label) {}

    public record ApiError(String error) {}

    @GetMapping("/leaderboard")
    public Leaderboard leaderboard() {
        return leaderboard.leaderboard();
    }

    @GetMapping("/friends")
    public List<Friend> friends() {
        return friends.list();
    }

    /** Every playable character's name, element, weapon type, rarity and icon (for quiz trivia). */
    @GetMapping("/characters")
    public List<GameData.CharacterInfo> characters() {
        return gameData.get().characters();
    }

    /** Daily snapshots for every saved player, keyed by UID. */
    @GetMapping("/history")
    public Map<String, List<Snapshot>> history() {
        Map<String, List<Snapshot>> result = new LinkedHashMap<>();
        for (Friend f : friends.list()) {
            result.put(f.uid(), history.history(f.uid()));
        }
        return result;
    }

    /** Checks the UID exists on Enka before saving it, and returns the player's profile. */
    @PostMapping("/friends")
    public ResponseEntity<?> addFriend(@RequestBody AddFriendRequest request) {
        String uid = request.uid() == null ? "" : request.uid().trim();
        if (!UID.matcher(uid).matches()) {
            return error(HttpStatus.BAD_REQUEST, "A UID is 9 or 10 digits, e.g. 712345678.");
        }
        if (friends.contains(uid)) {
            return error(HttpStatus.CONFLICT, "That UID is already on the leaderboard.");
        }

        String label = request.label() == null || request.label().isBlank() ? null : request.label().trim();
        if (label != null && label.length() > MAX_LABEL_LENGTH) {
            label = label.substring(0, MAX_LABEL_LENGTH);
        }

        PlayerSummary player = leaderboard.lookup(uid, label);
        if (!friends.add(new Friend(uid, label, Instant.now()))) {
            return error(HttpStatus.CONFLICT, "That UID is already on the leaderboard.");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(player);
    }

    @DeleteMapping("/friends/{uid}")
    public ResponseEntity<?> removeFriend(@PathVariable String uid) {
        return friends.remove(uid)
                ? ResponseEntity.noContent().build()
                : error(HttpStatus.NOT_FOUND, "That UID isn't on the leaderboard.");
    }

    @ExceptionHandler(EnkaException.class)
    public ResponseEntity<ApiError> enkaFailed(EnkaException e) {
        HttpStatus status = switch (e.status()) {
            case 400 -> HttpStatus.BAD_REQUEST;
            case 404 -> HttpStatus.NOT_FOUND;
            case 429 -> HttpStatus.TOO_MANY_REQUESTS;
            default -> HttpStatus.SERVICE_UNAVAILABLE;
        };
        return error(status, e.getMessage());
    }

    private static ResponseEntity<ApiError> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(new ApiError(message));
    }
}
