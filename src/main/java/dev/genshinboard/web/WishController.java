package dev.genshinboard.web;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.genshinboard.web.ApiController.ApiError;
import dev.genshinboard.wishes.Pull;
import dev.genshinboard.wishes.WishClient;
import dev.genshinboard.wishes.WishImportException;
import dev.genshinboard.wishes.WishStats;
import dev.genshinboard.wishes.WishStore;

@RestController
@RequestMapping("/api/wishes")
public class WishController {

    private final WishClient client;
    private final WishStore store;

    public WishController(WishClient client, WishStore store) {
        this.client = client;
        this.store = store;
    }

    public record ImportRequest(String url) {}

    public record ImportResult(Map<String, Integer> added, List<WishStats.Account> accounts) {}

    @GetMapping
    public List<WishStats.Account> accounts() {
        return store.uids().stream().map(uid -> WishStats.compute(uid, store.load(uid))).toList();
    }

    /** The link is used for this request only; it is never stored or logged. */
    @PostMapping("/import")
    public ImportResult importWishes(@RequestBody ImportRequest request) {
        var known = store.allIds();
        List<Pull> pulls = client.fetchAll(request.url(), known::contains);
        Map<String, Integer> added = store.merge(pulls);
        return new ImportResult(added, accounts());
    }

    @DeleteMapping("/{uid}")
    public ResponseEntity<?> delete(@PathVariable String uid) {
        if (!uid.matches("\\d{6,12}") || !store.delete(uid)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError("No wish history saved for that UID."));
        }
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(WishImportException.class)
    public ResponseEntity<ApiError> importFailed(WishImportException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiError(e.getMessage()));
    }
}
