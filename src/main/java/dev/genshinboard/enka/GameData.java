package dev.genshinboard.enka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.MissingNode;

/**
 * Lookup tables that turn Enka's numeric IDs into names and image URLs.
 * Backed by the files in https://github.com/EnkaNetwork/API-docs/tree/master/store/gi.
 */
public final class GameData {

    private static final String ASSET_HOST = "https://enka.network";

    private final JsonNode avatars;
    private final JsonNode text;
    private final JsonNode pfps;
    private final JsonNode namecards;
    private final JsonNode relicSets;

    /**
     * @param text      the English section of locs.json (hash -> string)
     * @param relicSets the "Sets" section of relics.json (setId -> {Name: hash})
     */
    public GameData(JsonNode avatars, JsonNode text, JsonNode pfps, JsonNode namecards, JsonNode relicSets) {
        this.avatars = orMissing(avatars);
        this.text = orMissing(text);
        this.pfps = orMissing(pfps);
        this.namecards = orMissing(namecards);
        this.relicSets = orMissing(relicSets);
    }

    /** Artifact set name; the profile's own setNameTextMapHash isn't in locs.json, so go via the set ID. */
    public String artifactSetName(int setId, String fallbackHash) {
        String byId = text(relicSets.path(String.valueOf(setId)).path("Name").asText(), null);
        return byId != null ? byId : text(fallbackHash, "Set " + setId);
    }

    /** Character metadata. The Traveler has one entry per element, keyed "avatarId-skillDepotId". */
    public JsonNode avatar(int avatarId, Integer skillDepotId) {
        if (skillDepotId != null) {
            JsonNode variant = avatars.path(avatarId + "-" + skillDepotId);
            if (!variant.isMissingNode()) {
                return variant;
            }
        }
        return avatars.path(String.valueOf(avatarId));
    }

    public String text(String hash, String fallback) {
        JsonNode value = text.path(hash);
        return value.isTextual() && !value.asText().isBlank() ? value.asText() : fallback;
    }

    public String profilePictureUrl(JsonNode picture) {
        if (picture.hasNonNull("id")) {
            String path = pfps.path(picture.path("id").asText()).path("IconPath").asText(null);
            if (path != null) {
                return asset(path);
            }
        }
        if (picture.hasNonNull("avatarId")) {
            return asset(avatar(picture.path("avatarId").asInt(), null).path("SideIconName").asText(null));
        }
        return null;
    }

    public String namecardUrl(int namecardId) {
        return asset(namecards.path(String.valueOf(namecardId)).path("Icon").asText(null));
    }

    /** Accepts either a store path ("/ui/X.png") or a bare icon name from the API ("UI_EquipIcon_X"). */
    public static String asset(String pathOrName) {
        if (pathOrName == null || pathOrName.isBlank()) {
            return null;
        }
        return pathOrName.startsWith("/") ? ASSET_HOST + pathOrName : ASSET_HOST + "/ui/" + pathOrName + ".png";
    }

    private static JsonNode orMissing(JsonNode node) {
        return node == null ? MissingNode.getInstance() : node;
    }
}
