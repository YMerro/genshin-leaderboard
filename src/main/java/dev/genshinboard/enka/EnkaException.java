package dev.genshinboard.enka;

/** A failed Enka.Network lookup, with a message that is safe to show to users. */
public class EnkaException extends RuntimeException {

    /** HTTP status from Enka, or 0 when Enka could not be reached at all. */
    private final int status;

    public EnkaException(int status, String message) {
        super(message);
        this.status = status;
    }

    public static EnkaException forStatus(int status) {
        String message = switch (status) {
            case 400 -> "Invalid UID format.";
            case 404 -> "No player found with this UID.";
            case 424 -> "Enka.Network can't reach the game right now (maintenance or a game update). Try again later.";
            case 429 -> "Rate limited by Enka.Network. Wait a minute and try again.";
            case 500, 503 -> "Enka.Network is having problems right now. Try again later.";
            default -> "Enka.Network returned HTTP " + status + ".";
        };
        return new EnkaException(status, message);
    }

    public int status() {
        return status;
    }

    /** True when retrying won't help (bad or unknown UID). */
    public boolean isPermanent() {
        return status == 400 || status == 404;
    }
}
