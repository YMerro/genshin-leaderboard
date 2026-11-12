package dev.genshinboard.leaderboard;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import dev.genshinboard.enka.EnkaClient;
import dev.genshinboard.enka.EnkaException;
import dev.genshinboard.enka.GameDataLoader;
import dev.genshinboard.friends.Friend;
import dev.genshinboard.friends.FriendStore;
import dev.genshinboard.history.HistoryStore;

@Service
public class LeaderboardService {

    private static final Logger log = LoggerFactory.getLogger(LeaderboardService.class);

    /** Kept small to stay polite with Enka's rate limits. */
    private static final int PARALLEL_LOOKUPS = 3;

    private final FriendStore friends;
    private final EnkaClient enka;
    private final GameDataLoader gameData;
    private final HistoryStore history;

    public LeaderboardService(FriendStore friends, EnkaClient enka, GameDataLoader gameData, HistoryStore history) {
        this.friends = friends;
        this.enka = enka;
        this.gameData = gameData;
        this.history = history;
    }

    public record Leaderboard(List<PlayerSummary> players, Instant generatedAt) {}

    /** Loads every friend. A player that fails to load is returned with {@code error} set. */
    public Leaderboard leaderboard() {
        List<Friend> list = friends.list();
        List<PlayerSummary> players = new ArrayList<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(PARALLEL_LOOKUPS)) {
            List<Future<PlayerSummary>> futures = new ArrayList<>();
            for (Friend friend : list) {
                futures.add(pool.submit(() -> summarize(friend)));
            }
            for (int i = 0; i < futures.size(); i++) {
                try {
                    players.add(futures.get(i).get());
                } catch (ExecutionException e) {
                    Friend friend = list.get(i);
                    players.add(PlayerSummary.failed(friend.uid(), friend.label(), "Could not load this player."));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Interrupted while loading the leaderboard", e);
                }
            }
        }
        for (PlayerSummary player : players) {
            try {
                history.record(player);
            } catch (RuntimeException e) {
                log.warn("Could not save history for {}: {}", player.uid(), e.getMessage());
            }
        }
        return new Leaderboard(players, Instant.now());
    }

    /** Looks up one UID. Throws {@link EnkaException} if Enka can't return it. */
    public PlayerSummary lookup(String uid, String label) {
        return ProfileMapper.toSummary(uid, label, enka.fetch(uid), gameData.get());
    }

    private PlayerSummary summarize(Friend friend) {
        try {
            return lookup(friend.uid(), friend.label());
        } catch (EnkaException e) {
            return PlayerSummary.failed(friend.uid(), friend.label(), e.getMessage());
        } catch (RuntimeException e) {
            log.error("Failed to load player {}", friend.uid(), e);
            return PlayerSummary.failed(friend.uid(), friend.label(), "Could not load this player: " + e.getMessage());
        }
    }
}
