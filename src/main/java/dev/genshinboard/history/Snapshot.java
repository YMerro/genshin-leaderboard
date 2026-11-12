package dev.genshinboard.history;

import java.time.LocalDate;
import java.util.Map;

/**
 * One player's key numbers on one day.
 *
 * @param abyssScore floor * 1000 + chamber * 100 + stars, comparable across days (0 = none)
 * @param characters keyed by character name
 */
public record Snapshot(
        LocalDate date,
        int adventureRank,
        int achievements,
        int abyssScore,
        String abyss,
        int maxFriendshipCharacters,
        double bestCritValue,
        double avgRollScore,
        Map<String, CharacterSnapshot> characters) {

    public record CharacterSnapshot(int level, int constellation, double critValue, double rollScore) {}
}
