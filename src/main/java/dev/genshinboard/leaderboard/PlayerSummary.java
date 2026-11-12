package dev.genshinboard.leaderboard;

import java.time.Instant;
import java.util.List;

/**
 * One friend's profile as shown on the leaderboard.
 *
 * @param label           the optional name you gave this friend when adding them
 * @param abyssFloor      current Spiral Abyss floor reached (null if none this period)
 * @param theaterAct      current Imaginarium Theater act reached (null if none)
 * @param showcaseHidden  true when no character details are available
 * @param warning         set when showing older cached data because Enka failed
 * @param error           set when this player couldn't be loaded at all; other fields are empty
 */
public record PlayerSummary(
        String uid,
        String label,
        String nickname,
        int adventureRank,
        int worldLevel,
        String signature,
        int achievements,
        Integer abyssFloor,
        Integer abyssChamber,
        Integer abyssStars,
        Integer theaterAct,
        Integer theaterStars,
        int maxFriendshipCharacters,
        String avatarUrl,
        String namecardUrl,
        boolean showcaseHidden,
        List<CharacterBuild> characters,
        Instant fetchedAt,
        String warning,
        String error) {

    public static PlayerSummary failed(String uid, String label, String error) {
        return new PlayerSummary(uid, label, null, 0, 0, null, 0, null, null, null, null, null, 0,
                null, null, false, List.of(), null, null, error);
    }

    public record CharacterBuild(
            int avatarId,
            String name,
            String element,
            int rarity,
            String iconUrl,
            int level,
            int constellation,
            int friendship,
            List<Integer> talents,
            Weapon weapon,
            Stats stats,
            double critValue,
            List<String> artifactSets,
            int artifactCount,
            List<Artifact> artifacts,
            List<String> gradedFor,
            double artifactScore,
            String artifactGrade) {}

    /**
     * @param usefulRolls sum of value / max roll over substats this character uses
     * @param wastedRolls rolls that went into flat HP, ATK or DEF
     */
    public record Artifact(
            String slot,
            String setName,
            String iconUrl,
            int rarity,
            int level,
            String mainStat,
            String mainValue,
            List<Substat> substats,
            double usefulRolls,
            int wastedRolls,
            String grade) {}

    /** @param rolls how many times this substat was rolled (initial + upgrades) */
    public record Substat(String name, String value, int rolls, boolean useful) {}

    public record Weapon(String name, String iconUrl, int level, int refinement, int rarity) {}

    /** Percent stats are already multiplied by 100 (e.g. 65.4 means 65.4%). */
    public record Stats(
            double hp,
            double atk,
            double def,
            double critRate,
            double critDmg,
            double er,
            double em,
            double dmgBonus,
            String dmgBonusType) {}
}
