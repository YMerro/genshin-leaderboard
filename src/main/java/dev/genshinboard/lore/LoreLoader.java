package dev.genshinboard.lore;

import java.io.IOException;
import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.config.AppProperties;
import dev.genshinboard.lore.Lore.ArtifactPieceLore;
import dev.genshinboard.lore.Lore.ArtifactSetLore;
import dev.genshinboard.lore.Lore.CharacterLore;
import dev.genshinboard.lore.Lore.IconLore;
import dev.genshinboard.lore.Lore.WeaponLore;

/**
 * Downloads character and weapon lore from the genshin-db API, keeps only what the quiz needs,
 * and caches it in {@code data/lore/lore.json} for a week. If the API is down, the cached copy
 * (or an empty set) is used, and the quiz falls back to its hand-written facts.
 */
@Component
public class LoreLoader {

    private static final Logger log = LoggerFactory.getLogger(LoreLoader.class);
    private static final String API = "https://genshin-db-api.vercel.app/api/v5/";
    private static final String ALL = "?query=names&matchCategories=true&verboseCategories=true";
    private static final Duration REFRESH_AFTER = Duration.ofDays(7);
    private static final Duration RETRY_AFTER_FAILURE = Duration.ofHours(1);

    private final RestClient http;
    private final ObjectMapper mapper;
    private final Path file;

    private volatile Lore lore;
    private volatile Instant lastAttempt = Instant.EPOCH;

    public LoreLoader(AppProperties props, ObjectMapper mapper) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(60));
        this.http = RestClient.builder().baseUrl(API).requestFactory(factory)
                .defaultHeader(HttpHeaders.USER_AGENT, props.enka().userAgent()).build();
        this.mapper = mapper;
        this.file = props.dataDir().resolve("lore").resolve("lore.json");
    }

    public synchronized Lore get() {
        if (lore == null) {
            lore = readCache();
        }
        boolean stale = lore.fetchedAt() == null || lore.version() < Lore.CURRENT_VERSION
                || lore.fetchedAt().isBefore(Instant.now().minus(REFRESH_AFTER));
        if (stale && lastAttempt.isBefore(Instant.now().minus(RETRY_AFTER_FAILURE))) {
            lastAttempt = Instant.now();
            try {
                lore = download();
                save(lore);
                log.info("Loaded lore for {} characters and {} weapons", lore.characters().size(), lore.weapons().size());
            } catch (RestClientException | IOException e) {
                log.warn("Could not refresh lore from genshin-db, using {}: {}",
                        lore.fetchedAt() == null ? "hand-written facts only" : "cached copy", e.getMessage());
            }
        }
        return lore;
    }

    private Lore download() throws IOException {
        JsonNode characters = fetch("characters");
        JsonNode talents = fetch("talents");
        JsonNode constellations = fetch("constellations");
        JsonNode foods = fetch("foods");
        JsonNode weapons = fetch("weapons");
        JsonNode artifacts = fetch("artifacts");
        JsonNode namecards = fetch("namecards");

        Map<String, JsonNode> talentsByName = byName(talents);
        Map<String, JsonNode> consByName = byName(constellations);
        Map<String, String> dishByCharacter = new HashMap<>();
        for (JsonNode food : foods) {
            String who = text(food, "characterName");
            if (who != null) dishByCharacter.put(who, text(food, "name"));
        }

        // Icons used by more than one character (generic cooking/expedition perks, shared normal attacks)
        // would make unanswerable questions, so count every icon first and keep only unique ones
        Map<String, Integer> iconUses = new HashMap<>();
        for (JsonNode t : talents) {
            for (String f : List.of("combat2", "combat3", "passive1", "passive2", "passive3")) {
                String file = text(t.path("images"), "filename_" + f);
                if (file != null) iconUses.merge(file, 1, Integer::sum);
            }
        }
        for (JsonNode k : constellations) {
            for (int i = 1; i <= 6; i++) {
                String file = text(k.path("images"), "filename_c" + i);
                if (file != null) iconUses.merge(file, 1, Integer::sum);
            }
        }

        List<CharacterLore> chars = new ArrayList<>();
        for (JsonNode c : characters) {
            String name = text(c, "name");
            // The Traveler and the Manekin(a) share their lore with the player, so skip them
            if (name == null || text(c, "title") == null) continue;
            JsonNode t = talentsByName.getOrDefault(name, mapper.createObjectNode());
            JsonNode k = consByName.getOrDefault(name, mapper.createObjectNode());
            List<String> cons = new ArrayList<>();
            for (int i = 1; i <= 6; i++) {
                String n = text(k.path("c" + i), "name");
                if (n != null) cons.add(n);
            }
            List<IconLore> icons = new ArrayList<>();
            addIcon(icons, iconUses, "skill", t.path("combat2"), t.path("images"), "filename_combat2");
            addIcon(icons, iconUses, "burst", t.path("combat3"), t.path("images"), "filename_combat3");
            for (int i = 1; i <= 3; i++) {
                addIcon(icons, iconUses, "passive", t.path("passive" + i), t.path("images"), "filename_passive" + i);
            }
            for (int i = 1; i <= 6; i++) {
                addIcon(icons, iconUses, "constellation", k.path("c" + i), k.path("images"), "filename_c" + i);
            }
            chars.add(new CharacterLore(name, text(c, "title"), text(c, "description"), text(c, "birthday"),
                    text(c, "affiliation"), text(c, "region"), text(c, "constellation"),
                    text(c.path("cv"), "english"), text(c.path("cv"), "japanese"),
                    text(t.path("combat2"), "name"), text(t.path("combat3"), "name"), text(t.path("passive3"), "name"),
                    cons, dishByCharacter.get(name), icons, namecardFor(namecards, name)));
        }

        List<ArtifactSetLore> sets = new ArrayList<>();
        for (JsonNode a : artifacts) {
            // Only sets that drop at 4-5★ are ones players actually recognize
            boolean endgame = false;
            for (JsonNode r : a.path("rarityList")) endgame |= r.asInt() >= 4;
            if (!endgame || text(a, "name") == null) continue;
            List<ArtifactPieceLore> pieces = new ArrayList<>();
            for (String slot : List.of("flower", "plume", "sands", "goblet", "circlet")) {
                String icon = text(a.path("images"), "filename_" + slot);
                String pieceName = text(a.path(slot), "name");
                if (icon != null && pieceName != null) pieces.add(new ArtifactPieceLore(slot, pieceName, icon));
            }
            if (!pieces.isEmpty()) sets.add(new ArtifactSetLore(text(a, "name"), pieces));
        }

        List<WeaponLore> weaponList = new ArrayList<>();
        for (JsonNode w : weapons) {
            String description = text(w, "description");
            int rarity = w.path("rarity").asInt();
            // Short or generic descriptions make poor questions, and 1-2★ weapons are obscure
            if (description != null && description.length() >= 40 && rarity >= 3) {
                weaponList.add(new WeaponLore(text(w, "name"), rarity, text(w, "weaponText"), description,
                        text(w.path("images"), "filename_icon")));
            }
        }
        return new Lore(Lore.CURRENT_VERSION, Instant.now(), chars, weaponList, sets);
    }

    private static void addIcon(List<IconLore> icons, Map<String, Integer> uses, String kind,
                                JsonNode talent, JsonNode images, String imageField) {
        String name = text(talent, "name");
        String file = text(images, imageField);
        if (name != null && file != null && uses.getOrDefault(file, 0) == 1) {
            icons.add(new IconLore(kind, name, file));
        }
    }

    /** Character name cards are named "<Character>: <Card name>". */
    private static String namecardFor(JsonNode namecards, String character) {
        for (JsonNode n : namecards) {
            String name = text(n, "name");
            if (name != null && name.startsWith(character + ":")) {
                return text(n.path("images"), "filename_background");
            }
        }
        return null;
    }

    private JsonNode fetch(String folder) throws IOException {
        byte[] body = http.get().uri(folder + ALL).retrieve().body(byte[].class);
        JsonNode node = body == null ? null : mapper.readTree(body);
        if (node == null || !node.isArray() || node.isEmpty()) {
            throw new IOException("genshin-db returned no " + folder);
        }
        return node;
    }

    private static Map<String, JsonNode> byName(JsonNode list) {
        Map<String, JsonNode> map = new HashMap<>();
        for (JsonNode n : list) {
            String name = text(n, "name");
            if (name != null) map.put(name, n);
        }
        return map;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isTextual() && !v.asText().isBlank() ? v.asText().trim() : null;
    }

    private Lore readCache() {
        if (!Files.exists(file)) return Lore.empty();
        try {
            return mapper.readValue(file.toFile(), Lore.class);
        } catch (IOException e) {
            log.warn("Ignoring unreadable lore cache: {}", e.getMessage());
            return Lore.empty();
        }
    }

    private void save(Lore value) throws IOException {
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling("lore.json.tmp");
        mapper.writeValue(tmp.toFile(), value);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
}
