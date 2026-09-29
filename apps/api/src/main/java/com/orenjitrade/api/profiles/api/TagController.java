package com.orenjitrade.api.profiles.api;

import com.orenjitrade.api.profiles.domain.TagCategory;
import com.orenjitrade.api.profiles.domain.TagService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/tags}: tag search for the profile editor. */
@RestController
@Validated
@Tag(name = "profile", description = "The caller's public profile, avatar and tags")
public class TagController {

    private final TagService tagService;

    public TagController(TagService tagService) {
        this.tagService = tagService;
    }

    @GetMapping(path = "/api/v1/tags", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "searchTags",
            summary = "Search profile tags",
            description =
                    "Active tags whose label or slug contains `query` (case and accent"
                            + " insensitive), prefix matches first, then the most used. Without"
                            + " `query`: the most used tags. Rate-limited (60 per minute).")
    public List<TagResponse> search(
            @Parameter(description = "Substring of the label or slug")
                    @RequestParam(required = false)
                    @Size(max = 50)
                    @Nullable String query,
            @RequestParam(required = false) @Nullable TagCategory category,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
        return tagService.search(query, category, limit).stream().map(TagResponse::from).toList();
    }
}
