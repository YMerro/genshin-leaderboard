package dev.genshinboard.wishes;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Pity and 50/50 statistics for one account.
 *
 * <p>The two character event banners (301 and 400) share pity, so they're one pool. The 50/50 is
 * judged by whether a character-banner 5★ is a standard-pool character. Capturing Radiance (5.0+)
 * isn't modeled separately: a radiance win just counts as a win.
 */
public final class WishStats {

    /** Standard-pool 5★ characters. If HoYoverse adds one, add it here. */
    static final Set<String> STANDARD_FIVE_STARS = Set.of(
            "Diluc", "Jean", "Keqing", "Mona", "Qiqi", "Tighnari", "Dehya", "Yumemizuki Mizuki");

    public record Account(String uid, int totalPulls, int primogems, List<Banner> banners) {}

    /**
     * @param guaranteed for the character banner: is the next 5★ guaranteed featured? null elsewhere
     * @param wins       50/50s won (character banner only)
     * @param losses     50/50s lost (character banner only)
     */
    public record Banner(String key, String name, int total, int pity5, int pity4, Boolean guaranteed,
                         double avgPity5, int wins, int losses, List<FiveStar> fiveStars) {}

    /** @param result "won", "lost", "guaranteed" on the character banner; null elsewhere */
    public record FiveStar(String name, String itemType, int pity, String time, String result) {}

    private record Pool(String key, String name, Set<String> types) {}

    private static final List<Pool> POOLS = List.of(
            new Pool("character", "Character Event", Set.of("301", "400")),
            new Pool("weapon", "Weapon Event", Set.of("302")),
            new Pool("chronicled", "Chronicled Wish", Set.of("500")),
            new Pool("standard", "Standard", Set.of("200")),
            new Pool("beginner", "Beginners'", Set.of("100")));

    private WishStats() {}

    /** @param pulls one account's pulls, oldest first */
    public static Account compute(String uid, List<Pull> pulls) {
        List<Banner> banners = new ArrayList<>();
        for (Pool pool : POOLS) {
            List<Pull> inPool = pulls.stream().filter(p -> pool.types().contains(p.gachaType())).toList();
            if (!inPool.isEmpty()) {
                banners.add(banner(pool, inPool));
            }
        }
        return new Account(uid, pulls.size(), pulls.size() * 160, banners);
    }

    private static Banner banner(Pool pool, List<Pull> pulls) {
        boolean isCharacter = pool.key().equals("character");
        int pity5 = 0;
        int pity4 = 0;
        boolean guaranteed = false;
        int wins = 0;
        int losses = 0;
        List<FiveStar> fiveStars = new ArrayList<>();

        for (Pull p : pulls) {
            pity5++;
            pity4++;
            if (p.rank() == 5) {
                String result = null;
                if (isCharacter) {
                    if (STANDARD_FIVE_STARS.contains(p.name())) {
                        result = "lost";
                        losses++;
                        guaranteed = true;
                    } else if (guaranteed) {
                        result = "guaranteed";
                        guaranteed = false;
                    } else {
                        result = "won";
                        wins++;
                    }
                }
                fiveStars.add(new FiveStar(p.name(), p.itemType(), pity5, p.time(), result));
                pity5 = 0;
                pity4 = 0;
            } else if (p.rank() == 4) {
                pity4 = 0;
            }
        }

        double avg = fiveStars.stream().mapToInt(FiveStar::pity).average().orElse(0);
        return new Banner(pool.key(), pool.name(), pulls.size(), pity5, pity4,
                isCharacter ? guaranteed : null, Math.round(avg * 10) / 10.0, wins, losses,
                fiveStars.reversed());
    }
}
