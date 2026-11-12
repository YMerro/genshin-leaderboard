package dev.genshinboard.leaderboard;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;

import dev.genshinboard.enka.FetchResult;
import dev.genshinboard.enka.GameData;
import dev.genshinboard.leaderboard.PlayerSummary.CharacterBuild;
import dev.genshinboard.leaderboard.PlayerSummary.Stats;
import dev.genshinboard.leaderboard.PlayerSummary.Weapon;

/** Turns Enka's raw profile JSON into {@link PlayerSummary}. Field reference: https://api.enka.network */
public final class ProfileMapper {

    private static final Map<String, String> ELEMENTS = Map.of(
            "Fire", "Pyro", "Water", "Hydro", "Wind", "Anemo", "Electric", "Electro",
            "Grass", "Dendro", "Ice", "Cryo", "Rock", "Geo");

    /** fightPropMap keys for each element's DMG bonus; 30 is Physical. */
    private static final Map<String, String> ELEMENT_DMG_PROP = Map.of(
            "Pyro", "40", "Electro", "41", "Hydro", "42", "Dendro", "43",
            "Anemo", "44", "Geo", "45", "Cryo", "46");

    private static final Set<Integer> TRAVELER_IDS = Set.of(10000005, 10000007);

    private ProfileMapper() {}

    public static PlayerSummary toSummary(String uid, String label, FetchResult result, GameData game) {
        JsonNode body = result.body();
        JsonNode info = body.path("playerInfo");
        JsonNode avatars = body.path("avatarInfoList");

        List<CharacterBuild> characters = new ArrayList<>();
        for (JsonNode avatar : avatars) {
            characters.add(toBuild(avatar, game));
        }

        return new PlayerSummary(
                uid,
                label,
                info.path("nickname").asText("Traveler"),
                info.path("level").asInt(),
                info.path("worldLevel").asInt(),
                info.path("signature").asText(""),
                info.path("finishAchievementNum").asInt(),
                positive(info, "towerFloorIndex"),
                positive(info, "towerLevelIndex"),
                positive(info, "towerStarIndex"),
                positive(info, "theaterActIndex"),
                positive(info, "theaterStarIndex"),
                info.path("fetterCount").asInt(),
                game.profilePictureUrl(info.path("profilePicture")),
                game.namecardUrl(info.path("nameCardId").asInt()),
                !avatars.isArray(),
                characters,
                result.fetchedAt(),
                result.warning(),
                null);
    }

    static CharacterBuild toBuild(JsonNode avatar, GameData game) {
        int avatarId = avatar.path("avatarId").asInt();
        Integer skillDepot = avatar.hasNonNull("skillDepotId") ? avatar.path("skillDepotId").asInt() : null;
        JsonNode meta = game.avatar(avatarId, skillDepot);

        String element = ELEMENTS.getOrDefault(meta.path("Element").asText(), "Unknown");
        String name = TRAVELER_IDS.contains(avatarId)
                ? "Traveler (" + element + ")"
                : game.text(meta.path("NameTextMapHash").asText(), "Character " + avatarId);
        int rarity = meta.path("QualityType").asText().startsWith("QUALITY_ORANGE") ? 5 : 4;

        // Talent levels in normal attack / skill / burst order, including constellation boosts
        List<Integer> talents = new ArrayList<>();
        for (JsonNode skill : meta.path("SkillOrder")) {
            String skillId = skill.asText();
            int base = avatar.path("skillLevelMap").path(skillId).asInt();
            String proudId = meta.path("ProudMap").path(skillId).asText();
            int extra = avatar.path("proudSkillExtraLevelMap").path(proudId).asInt();
            talents.add(base + extra);
        }

        Weapon weapon = null;
        double critRateSubs = 0;
        double critDmgSubs = 0;
        int artifactCount = 0;
        Map<Integer, Integer> setCounts = new LinkedHashMap<>();
        Map<Integer, String> setNames = new LinkedHashMap<>();

        for (JsonNode item : avatar.path("equipList")) {
            JsonNode flat = item.path("flat");
            switch (flat.path("itemType").asText()) {
                case "ITEM_WEAPON" -> {
                    JsonNode w = item.path("weapon");
                    Iterator<JsonNode> affix = w.path("affixMap").elements();
                    int refinement = affix.hasNext() ? affix.next().asInt() + 1 : 1;
                    weapon = new Weapon(
                            game.text(flat.path("nameTextMapHash").asText(), "Unknown weapon"),
                            GameData.asset(flat.path("icon").asText(null)),
                            w.path("level").asInt(),
                            refinement,
                            flat.path("rankLevel").asInt());
                }
                case "ITEM_RELIQUARY" -> {
                    artifactCount++;
                    int setId = flat.path("setId").asInt();
                    setCounts.merge(setId, 1, Integer::sum);
                    setNames.computeIfAbsent(setId, id -> game.artifactSetName(id, flat.path("setNameTextMapHash").asText()));
                    for (JsonNode sub : flat.path("reliquarySubstats")) {
                        switch (sub.path("appendPropId").asText()) {
                            case "FIGHT_PROP_CRITICAL" -> critRateSubs += sub.path("statValue").asDouble();
                            case "FIGHT_PROP_CRITICAL_HURT" -> critDmgSubs += sub.path("statValue").asDouble();
                            default -> { }
                        }
                    }
                }
                default -> { }
            }
        }

        List<String> artifactSets = setCounts.entrySet().stream()
                .filter(e -> e.getValue() >= 2)
                .sorted(Map.Entry.<Integer, Integer>comparingByValue(Comparator.reverseOrder()))
                .map(e -> (e.getValue() >= 4 ? 4 : 2) + "pc " + setNames.get(e.getKey()))
                .toList();

        JsonNode fp = avatar.path("fightPropMap");
        String elementProp = ELEMENT_DMG_PROP.get(element);
        double elementBonus = elementProp == null ? 0 : fp.path(elementProp).asDouble();
        double physicalBonus = fp.path("30").asDouble();
        boolean physical = physicalBonus > elementBonus;

        Stats stats = new Stats(
                round(fp.path("2000").asDouble(), 0),
                round(fp.path("2001").asDouble(), 0),
                round(fp.path("2002").asDouble(), 0),
                round(fp.path("20").asDouble() * 100, 1),
                round(fp.path("22").asDouble() * 100, 1),
                round(fp.path("23").asDouble() * 100, 1),
                round(fp.path("28").asDouble(), 0),
                round((physical ? physicalBonus : elementBonus) * 100, 1),
                physical ? "Physical" : element);

        ArtifactGrader.Result graded = ArtifactGrader.grade(avatar.path("equipList"), stats.er(), game);

        return new CharacterBuild(
                avatarId,
                name,
                element,
                rarity,
                GameData.asset(meta.path("SideIconName").asText(null)),
                avatar.path("propMap").path("4001").path("val").asInt(),
                avatar.path("talentIdList").size(),
                avatar.path("fetterInfo").path("expLevel").asInt(),
                talents,
                weapon,
                stats,
                round(2 * critRateSubs + critDmgSubs, 1),
                artifactSets,
                artifactCount,
                graded.artifacts(),
                graded.gradedFor(),
                graded.score(),
                graded.grade());
    }

    private static Integer positive(JsonNode node, String field) {
        int value = node.path(field).asInt(0);
        return value > 0 ? value : null;
    }

    private static double round(double value, int decimals) {
        double scale = Math.pow(10, decimals);
        return Math.round(value * scale) / scale;
    }
}
