package dev.genshinboard.wishes;

/** A wish import failure with a message that is safe to show (never contains the link or authkey). */
public class WishImportException extends RuntimeException {

    public WishImportException(String message) {
        super(message);
    }
}
