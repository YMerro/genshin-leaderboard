package dev.genshinboard.history;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import dev.genshinboard.leaderboard.LeaderboardService;

/** Loads the leaderboard once a day so history fills in even when nobody opens the page. */
@Component
public class DailySnapshotJob {

    private static final Logger log = LoggerFactory.getLogger(DailySnapshotJob.class);

    private final LeaderboardService leaderboard;

    public DailySnapshotJob(LeaderboardService leaderboard) {
        this.leaderboard = leaderboard;
    }

    @Scheduled(cron = "${app.history.snapshot-cron}")
    public void snapshot() {
        int players = leaderboard.leaderboard().players().size();
        log.info("Daily snapshot taken for {} players", players);
    }
}
