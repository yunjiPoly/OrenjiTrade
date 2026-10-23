package com.orenjitrade.api.profiles.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.profiles.domain.AvatarImageProcessor;
import com.orenjitrade.api.profiles.domain.MyProfileView;
import com.orenjitrade.api.profiles.domain.ProfileService;
import com.orenjitrade.api.profiles.domain.ProfileUpdate;
import com.orenjitrade.api.users.domain.HandleRules;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** {@code /api/v1/me/profile}: the caller's public profile, avatar and tags. */
@RestController
@RequestMapping(path = "/api/v1/me/profile", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "profile", description = "The caller's public profile, avatar and tags")
public class MyProfileController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ProfileService profileService;

    public MyProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    @Operation(
            operationId = "getMyProfile",
            summary = "The caller's profile",
            description =
                    "Returns defaults derived from the account (handle, display name) until the"
                            + " profile is saved for the first time.")
    public MyProfileResponse get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return MyProfileResponse.from(profileService.getMine(principal.userId()));
    }

    @GetMapping("/handle-availability")
    @Operation(
            operationId = "getHandleAvailability",
            summary = "Whether the caller could save a handle",
            description =
                    "Stage R12: the welcome step checks the handle while the collector types. The"
                        + " save's own rules (trimmed and lower-cased, 3-24 characters [a-z0-9_],"
                        + " unique case-insensitively, reserved words refused), nothing saved. A"
                        + " reserved handle reads TAKEN, as the save says. The caller's own handle"
                        + " is CURRENT. Members only; rate-limited (60 per 10 minutes). The save"
                        + " (PUT /me/profile) still decides.")
    public HandleAvailabilityResponse handleAvailability(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "The handle to check, as typed", example = "sam_trades")
                    @RequestParam
                    String handle) {
        String normalised = HandleRules.normalise(handle);
        return HandleAvailabilityResponse.of(
                normalised, profileService.handleAvailability(principal.userId(), handle));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateMyProfile",
            summary = "Save the caller's profile",
            description =
                    "Full replacement of handle, display name, bio, games and languages. 400 for"
                        + " unknown games (yugioh, pokemon, mtg, riftbound), non ISO 639-1"
                        + " languages or blocked terms; 409 HANDLE_TAKEN when the handle is used"
                        + " (case-insensitive) or reserved. The first save completes the"
                        + " `profileComplete` onboarding step. Stage R13: an optional `tags` object"
                        + " replaces the profile tags in the same transaction (the rules of PUT"
                        + " /me/profile/tags); a refused tag saves nothing.")
    @ApiResponse(responseCode = "200", description = "Saved profile")
    @ApiResponse(
            responseCode = "409",
            description = "HANDLE_TAKEN",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public MyProfileResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateProfileRequest body) {
        ProfileUpdate update =
                new ProfileUpdate(
                        body.handle(),
                        body.displayName(),
                        body.bio(),
                        body.games(),
                        body.languages());
        UpdateProfileTagsRequest tags = body.tags();
        if (tags == null) {
            return MyProfileResponse.from(profileService.update(principal.userId(), update));
        }
        return MyProfileResponse.from(
                profileService.updateWithTags(
                        principal.userId(),
                        update,
                        tags.tagIds() == null ? List.of() : tags.tagIds(),
                        tags.customLabels() == null ? List.of() : tags.customLabels()));
    }

    @PostMapping(path = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            operationId = "uploadMyAvatar",
            summary = "Upload the caller's avatar",
            description =
                    "Multipart part `file`: JPEG, PNG or WebP up to 5 MB (type sniffed from the"
                        + " content). The server cover-crops it to a 512x512 square and re-encodes"
                        + " it without any metadata (EXIF/GPS stripped). 413 above 5 MB, 415 for"
                        + " other types, 400 for unreadable images. Rate-limited (10 per hour).")
    @ApiResponse(responseCode = "200", description = "Avatar stored")
    @ApiResponse(
            responseCode = "413",
            description = "PAYLOAD_TOO_LARGE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "415",
            description = "UNSUPPORTED_MEDIA_TYPE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AvatarResponse uploadAvatar(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestPart("file") MultipartFile file) {
        if (file.getSize() > AvatarImageProcessor.MAX_BYTES) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, "The avatar must be at most 5 MB");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the upload", e);
        }
        MyProfileView view = profileService.uploadAvatar(principal.userId(), bytes);
        String url = view.avatarUrl();
        if (url == null) {
            throw new IllegalStateException("Avatar URL missing after upload");
        }
        return new AvatarResponse(url);
    }

    @DeleteMapping("/avatar")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteMyAvatar", summary = "Remove the caller's avatar")
    @ApiResponse(responseCode = "204", description = "Removed (or there was none)")
    public void deleteAvatar(@AuthenticationPrincipal AuthenticatedUser principal) {
        profileService.deleteAvatar(principal.userId());
    }

    @PutMapping(path = "/tags", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateMyProfileTags",
            summary = "Replace the caller's profile tags",
            description =
                    "At most 12 tags in total. `tagIds` must be active tags; `customLabels` (2-24"
                            + " characters) are checked against the banned-term rules and created"
                            + " as CUSTOM tags (or matched to an existing tag with the same"
                            + " slug). Returns the resulting tags.")
    public List<TagResponse> updateTags(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateProfileTagsRequest body) {
        return profileService
                .replaceTags(
                        principal.userId(),
                        body.tagIds() == null ? List.of() : body.tagIds(),
                        body.customLabels() == null ? List.of() : body.customLabels())
                .stream()
                .map(TagResponse::from)
                .toList();
    }
}
