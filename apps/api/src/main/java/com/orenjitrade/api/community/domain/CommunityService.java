package com.orenjitrade.api.community.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.ratelimit.RateLimiter;
import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.ChatDeckCore;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.cards.domain.CardLink;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.community.domain.CommunityInputs.ChannelPatch;
import com.orenjitrade.api.community.domain.CommunityInputs.NewChannel;
import com.orenjitrade.api.community.domain.CommunityInputs.NewPost;
import com.orenjitrade.api.community.events.CommunityPostCreated;
import com.orenjitrade.api.community.infra.ChannelRepository;
import com.orenjitrade.api.community.infra.ChannelRepository.ChannelRow;
import com.orenjitrade.api.community.infra.ChannelRepository.LastPostRow;
import com.orenjitrade.api.community.infra.PostPhotoRepository;
import com.orenjitrade.api.community.infra.PostPhotoRepository.PhotoRow;
import com.orenjitrade.api.community.infra.PostRepository;
import com.orenjitrade.api.community.infra.PostRepository.PostRow;
import com.orenjitrade.api.community.infra.ReplyRepository;
import com.orenjitrade.api.community.infra.ReplyRepository.ReplyRow;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.location.api.PlaceResponse;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.location.domain.RegionCatalog;
import com.orenjitrade.api.messaging.domain.AttachableUpload;
import com.orenjitrade.api.messaging.domain.BlockService;
import com.orenjitrade.api.messaging.domain.ImageUploadService;
import com.orenjitrade.api.messaging.domain.UploadKind;
import com.orenjitrade.api.moderation.domain.ContentModerationState;
import com.orenjitrade.api.moderation.domain.FlagSubjectType;
import com.orenjitrade.api.moderation.domain.ModerationDecision;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.ModerationService;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.profiles.domain.PrivacyPolicyService;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import com.orenjitrade.api.users.domain.ConsentService;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The community module's service interface (Phase 5 contract "Community chat"): channels, posts,
 * replies, edits and deletions for members while the {@code publicChat} feature flag is on (404
 * FEATURE_DISABLED otherwise), plus the moderator console (channels, removals; audited).
 *
 * <p>Writes go through: validation (400) → duplicate-body detection within 24 h (409
 * DUPLICATE_POST) → the channel's {@code post_rate_limit_per_hour} (429 RATE_LIMITED) → {@link
 * ModerationService#check} (422 POST_BLOCKED, FLAG rules store the content FLAGGED). Posts and
 * replies of blocked collectors (either direction), suspended or deleted accounts are hidden;
 * removed and deleted ones are never served.
 */
@Service
public class CommunityService {

    public static final int POST_MAX = 2000;
    public static final int REPLY_MAX = 1000;
    public static final int REASON_MAX = 500;
    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;
    public static final int DEFAULT_POST_RATE_PER_HOUR = 10;
    public static final Duration DUPLICATE_WINDOW = Duration.ofHours(24);

    /** Photos per post (stage R11, owner 2026-10-08: up to 4, 3 MB each). */
    public static final int PHOTOS_MAX = 4;

    public static final String TARGET_POST = "COMMUNITY_POST";
    public static final String TARGET_REPLY = "COMMUNITY_REPLY";
    public static final String TARGET_CHANNEL = "COMMUNITY_CHANNEL";
    public static final String ACTION_POST_REMOVE = "community.post.remove";
    public static final String ACTION_POST_DELETE = "community.post.delete";
    public static final String ACTION_REPLY_REMOVE = "community.reply.remove";
    public static final String ACTION_REPLY_DELETE = "community.reply.delete";
    public static final String ACTION_CHANNEL_CREATE = "community.channel.create";
    public static final String ACTION_CHANNEL_UPDATE = "community.channel.update";

    static final String CHANNEL_NOT_FOUND = "Channel not found";
    static final String POST_NOT_FOUND = "Post not found";
    static final String REPLY_NOT_FOUND = "Reply not found";
    static final String RATE_KEY_PREFIX = "community:post:";
    static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    /**
     * Who reads a post's place: a signed-in member who is not its author. Every reader of a room is
     * a member, and the author reads what the others read (stage R11 review fix 1: a discoverable
     * author with a PRIVATE profile saw their own province that nobody else sees).
     */
    static final ViewerContext ROOM_READER = new ViewerContext(new UUID(0L, 0L), false, false);

    private static final Logger log = LoggerFactory.getLogger(CommunityService.class);

    private final ChannelRepository channels;
    private final PostRepository posts;
    private final PostPhotoRepository photos;
    private final ReplyRepository replies;
    private final FeatureFlags featureFlags;
    private final ConsentService consents;
    private final BlockService blocks;
    private final MemberDirectory members;
    private final ModerationService moderation;
    private final RateLimiter rateLimiter;
    private final CatalogService catalog;
    private final PublicBinderService publicBinders;
    private final BinderService binders;
    private final ImageUploadService uploads;
    private final LocationService locations;
    private final PrivacyPolicyService privacyPolicy;
    private final GameService games;
    private final RegionCatalog regions;
    private final AuditService auditService;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public CommunityService(
            ChannelRepository channels,
            PostRepository posts,
            PostPhotoRepository photos,
            ReplyRepository replies,
            FeatureFlags featureFlags,
            ConsentService consents,
            BlockService blocks,
            MemberDirectory members,
            ModerationService moderation,
            RateLimiter rateLimiter,
            CatalogService catalog,
            PublicBinderService publicBinders,
            BinderService binders,
            ImageUploadService uploads,
            LocationService locations,
            PrivacyPolicyService privacyPolicy,
            GameService games,
            RegionCatalog regions,
            AuditService auditService,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.channels = channels;
        this.posts = posts;
        this.photos = photos;
        this.replies = replies;
        this.featureFlags = featureFlags;
        this.consents = consents;
        this.blocks = blocks;
        this.members = members;
        this.moderation = moderation;
        this.rateLimiter = rateLimiter;
        this.catalog = catalog;
        this.publicBinders = publicBinders;
        this.binders = binders;
        this.uploads = uploads;
        this.locations = locations;
        this.privacyPolicy = privacyPolicy;
        this.games = games;
        this.regions = regions;
        this.auditService = auditService;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    // ---------------------------------------------------------------------------------------
    // Channels
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /community/channels}: active channels, optionally by game and by platform region
     * code (the region channels, ADR 0017), each with the newest post the viewer may see (stage
     * R11: blocks both ways, suspended and deleted accounts, deleted and removed posts left out);
     * the 24 h post count follows the same rule (review fix 1).
     */
    @Transactional(readOnly = true)
    public List<ChannelView> channels(
            AuthenticatedUser viewer, @Nullable String game, @Nullable String region) {
        requireFeature(viewer);
        Instant now = timeProvider.now();
        Set<UUID> hidden = blocks.hiddenFrom(viewer.userId());
        List<ChannelRow> rows =
                channels.listForMember(blankToNull(game), blankToNull(region), hidden, now);
        Map<UUID, LastPostRow> last =
                channels.lastPosts(rows.stream().map(ChannelRow::id).toList(), hidden, now);
        Map<UUID, MemberCard> authors =
                members.cards(
                        last.values().stream().map(LastPostRow::authorId).distinct().toList());
        List<ChannelView> result = new ArrayList<>();
        for (ChannelRow row : rows) {
            @Nullable LastPostRow post = last.get(row.id());
            @Nullable MemberCard author = post == null ? null : authors.get(post.authorId());
            result.add(
                    channelView(
                            row,
                            post == null || author == null
                                    ? null
                                    : new ChannelLastPost(
                                            post.postId(),
                                            author.handle(),
                                            ChannelLastPost.preview(post.body()),
                                            post.createdAt(),
                                            post.authorId().equals(viewer.userId()))));
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Posts
    // ---------------------------------------------------------------------------------------

    /** {@code GET /community/channels/{slug}/posts}: newest first. */
    @Transactional(readOnly = true)
    public CursorPage<PostView> posts(
            AuthenticatedUser viewer, String slug, @Nullable String cursor, int limit) {
        requireFeature(viewer);
        Instant now = timeProvider.now();
        ChannelRow channel = requireActiveChannel(slug, now);
        List<PostRow> rows =
                posts.page(
                        channel.id(),
                        blocks.hiddenFrom(viewer.userId()),
                        TimeCursor.decode(cursor),
                        limit + 1,
                        now);
        boolean hasMore = rows.size() > limit;
        List<PostRow> slice = hasMore ? rows.subList(0, limit) : rows;
        List<PostView> items = postViews(slice, viewer);
        if (!hasMore) {
            return CursorPage.last(items);
        }
        PostRow last = slice.get(slice.size() - 1);
        return CursorPage.of(items, new TimeCursor(last.createdAt(), last.id()).encode());
    }

    /**
     * {@code POST /community/channels/{slug}/posts}; {@code 403 AGE_CONFIRMATION_REQUIRED} until
     * the author confirmed being 18 or older.
     */
    @Transactional
    public PostView createPost(AuthenticatedUser author, String slug, NewPost input) {
        requireFeature(author);
        consents.requireAgeConfirmed(author.userId());
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        ChannelRow channel = requireActiveChannel(slug, now);
        String body = requireText("body", input.body(), POST_MAX);
        ObjectNode payload = jsonMapper.createObjectNode();
        if (input.cardPrintingId() != null) {
            CardLink card =
                    catalog.cardLink(input.cardPrintingId())
                            .orElseThrow(() -> invalid("cardPrintingId", "Unknown printing"));
            ObjectNode node = payload.putObject("card");
            node.put("printingId", card.id().toString());
            node.put("cardId", card.cardId().toString());
            node.put("name", card.name());
            if (card.printingCode() != null) {
                node.put("printingCode", card.printingCode());
            }
        }
        if (input.binderId() != null) {
            BinderLink binder =
                    publicBinders
                            .binderLink(null, input.binderId())
                            .orElseThrow(
                                    () -> invalid("binderId", "Only public binders can be shared"));
            ObjectNode node = payload.putObject("binder");
            node.put("binderId", binder.id().toString());
            node.put("name", binder.name());
            node.put("ownerHandle", binder.ownerHandle());
        }
        UUID me = author.userId();
        List<AttachableUpload> attached = lockPhotos(me, input.photoUploadIds());
        String hash = ModerationService.digest(body);
        if (posts.duplicateExists(me, hash, now.minus(DUPLICATE_WINDOW))) {
            throw new ApiException(
                    ErrorCode.DUPLICATE_POST, "You already posted this text in the last 24 hours");
        }
        OptionalLong count =
                rateLimiter.hit(
                        RATE_KEY_PREFIX + channel.id() + ":" + me, Duration.ofHours(1).toMillis());
        if (count.isPresent() && count.getAsLong() > channel.postRateLimitPerHour()) {
            throw new ApiException(
                            ErrorCode.RATE_LIMITED,
                            "You reached the posting limit of this channel ("
                                    + channel.postRateLimitPerHour()
                                    + " per hour)")
                    .withProperty("retryAfterSeconds", 3600);
        }
        ModerationDecision decision = moderation.check(ModerationScope.POST, body, me);
        if (decision.blocked()) {
            throw postBlocked();
        }
        UUID id = UUID.randomUUID();
        posts.insert(
                id,
                channel.id(),
                me,
                body,
                hash,
                jsonMapper.writeValueAsString(payload),
                state(decision).name(),
                now);
        for (int position = 0; position < attached.size(); position++) {
            AttachableUpload upload = attached.get(position);
            photos.insert(
                    UUID.randomUUID(),
                    id,
                    upload.storageKey(),
                    upload.width(),
                    upload.height(),
                    upload.bytes(),
                    position,
                    now);
            uploads.markConsumed(upload.id());
        }
        if (decision.flagged()) {
            moderation.recordFlags(decision, FlagSubjectType.COMMUNITY_POST, id, me);
        }
        events.publishEvent(new CommunityPostCreated(id, channel.id(), channel.slug(), me, now));
        return postViews(List.of(requireAnyPost(id)), author).get(0);
    }

    /** {@code PATCH /community/posts/{id}}: the author edits the text. */
    @Transactional
    public PostView editPost(AuthenticatedUser author, UUID postId, String rawBody) {
        requireFeature(author);
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        PostRow post = requireVisiblePost(author, postId, now);
        if (!post.authorId().equals(author.userId())) {
            throw ApiException.forbidden("Only the author can edit a post");
        }
        String body = requireText("body", rawBody, POST_MAX);
        ModerationDecision decision = moderation.check(ModerationScope.POST, body, author.userId());
        if (decision.blocked()) {
            throw postBlocked();
        }
        ContentModerationState current = ContentModerationState.valueOf(post.moderationState());
        ContentModerationState next =
                decision.flagged() || current == ContentModerationState.FLAGGED
                        ? ContentModerationState.FLAGGED
                        : ContentModerationState.OK;
        posts.updateBody(postId, body, ModerationService.digest(body), next.name(), now);
        if (decision.flagged()) {
            moderation.recordFlags(
                    decision, FlagSubjectType.COMMUNITY_POST, postId, author.userId());
        }
        return postViews(List.of(requireAnyPost(postId)), author).get(0);
    }

    /** {@code DELETE /community/posts/{id}}: the author, or a moderator (audited). */
    @Transactional
    public void deletePost(AuthenticatedUser actor, UUID postId) {
        requireFeature(actor);
        Instant now = timeProvider.now();
        PostRow post = requireVisiblePost(actor, postId, now);
        boolean own = post.authorId().equals(actor.userId());
        if (!own && !isModerator(actor)) {
            throw ApiException.forbidden("Only the author or a moderator can delete a post");
        }
        posts.softDelete(postId, actor.userId(), now);
        deletePhotosAfterCommit(photos.deleteOfPost(postId));
        if (!own) {
            auditService.record(
                    ActorType.ADMIN,
                    actor.userId(),
                    ACTION_POST_DELETE,
                    TARGET_POST,
                    postId.toString(),
                    Map.of("authorId", post.authorId().toString(), "channel", post.channelSlug()));
        }
    }

    // ---------------------------------------------------------------------------------------
    // Replies
    // ---------------------------------------------------------------------------------------

    /** {@code GET /community/posts/{id}/replies}: oldest first. */
    @Transactional(readOnly = true)
    public CursorPage<ReplyView> replies(
            AuthenticatedUser viewer, UUID postId, @Nullable String cursor, int limit) {
        requireFeature(viewer);
        Instant now = timeProvider.now();
        requireVisiblePost(viewer, postId, now);
        List<ReplyRow> rows =
                replies.page(
                        postId,
                        blocks.hiddenFrom(viewer.userId()),
                        TimeCursor.decode(cursor),
                        limit + 1,
                        now);
        boolean hasMore = rows.size() > limit;
        List<ReplyRow> slice = hasMore ? rows.subList(0, limit) : rows;
        List<ReplyView> items = replyViews(slice, viewer);
        if (!hasMore) {
            return CursorPage.last(items);
        }
        ReplyRow last = slice.get(slice.size() - 1);
        return CursorPage.of(items, new TimeCursor(last.createdAt(), last.id()).encode());
    }

    /**
     * {@code POST /community/posts/{id}/replies}; {@code 403 AGE_CONFIRMATION_REQUIRED} until the
     * author confirmed being 18 or older.
     */
    @Transactional
    public ReplyView createReply(AuthenticatedUser author, UUID postId, String rawBody) {
        requireFeature(author);
        consents.requireAgeConfirmed(author.userId());
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        PostRow post = requireVisiblePost(author, postId, now);
        String body = requireText("body", rawBody, REPLY_MAX);
        ModerationDecision decision = moderation.check(ModerationScope.POST, body, author.userId());
        if (decision.blocked()) {
            throw postBlocked();
        }
        UUID id = UUID.randomUUID();
        replies.insert(id, post.id(), author.userId(), body, state(decision).name(), now);
        posts.replyAdded(post.id(), now);
        if (decision.flagged()) {
            moderation.recordFlags(decision, FlagSubjectType.COMMUNITY_REPLY, id, author.userId());
        }
        ReplyRow stored =
                replies.findAny(id)
                        .orElseThrow(() -> new IllegalStateException("Reply not stored"));
        return replyViews(List.of(stored), author).get(0);
    }

    /** {@code DELETE /community/replies/{id}}: the author, or a moderator (audited). */
    @Transactional
    public void deleteReply(AuthenticatedUser actor, UUID replyId) {
        requireFeature(actor);
        Instant now = timeProvider.now();
        ReplyRow reply =
                replies.findAny(replyId)
                        .filter(row -> row.deletedAt() == null)
                        .filter(row -> !"REMOVED".equals(row.moderationState()))
                        .orElseThrow(() -> ApiException.notFound(REPLY_NOT_FOUND));
        requireVisiblePost(actor, reply.postId(), now);
        if (blocks.hiddenFrom(actor.userId()).contains(reply.authorId())) {
            throw ApiException.notFound(REPLY_NOT_FOUND);
        }
        boolean own = reply.authorId().equals(actor.userId());
        if (!own && !isModerator(actor)) {
            throw ApiException.forbidden("Only the author or a moderator can delete a reply");
        }
        if (replies.softDelete(replyId, actor.userId(), now)) {
            posts.replyRemoved(reply.postId());
        }
        if (!own) {
            auditService.record(
                    ActorType.ADMIN,
                    actor.userId(),
                    ACTION_REPLY_DELETE,
                    TARGET_REPLY,
                    replyId.toString(),
                    Map.of("authorId", reply.authorId().toString()));
        }
    }

    // ---------------------------------------------------------------------------------------
    // Moderator console
    // ---------------------------------------------------------------------------------------

    /** {@code GET /admin/community/channels}: every channel, archived ones included. */
    @Transactional(readOnly = true)
    public List<AdminChannelView> adminChannels() {
        return channels.list(false, null, null, timeProvider.now()).stream()
                .map(CommunityService::adminView)
                .toList();
    }

    /** {@code POST /admin/community/channels} (audited). */
    @Transactional
    public AdminChannelView createChannel(AuthenticatedUser actor, NewChannel input) {
        List<ProblemFieldError> errors = new ArrayList<>();
        String slug = input.slug().trim();
        if (!SLUG.matcher(slug).matches() || slug.length() > 64) {
            errors.add(
                    new ProblemFieldError(
                            "slug", "lower-case letters, digits and hyphens, at most 64"));
        }
        String name = input.name().trim();
        if (name.isEmpty() || name.length() > 80) {
            errors.add(new ProblemFieldError("name", "must be 1-80 characters"));
        }
        @Nullable String game = validateGame(input.game(), errors);
        @Nullable String region = validateRegion(input.regionLabel(), errors);
        String description = input.description() == null ? "" : input.description().trim();
        if (description.length() > 500) {
            errors.add(new ProblemFieldError("description", "must be at most 500 characters"));
        }
        int rate =
                input.postRateLimitPerHour() == null
                        ? DEFAULT_POST_RATE_PER_HOUR
                        : input.postRateLimitPerHour();
        if (rate < 1 || rate > 1000) {
            errors.add(new ProblemFieldError("postRateLimitPerHour", "must be 1-1000"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        if (channels.slugExists(slug)) {
            throw ApiException.conflict("A channel with this slug already exists");
        }
        Instant now = timeProvider.now();
        UUID id = UUID.randomUUID();
        if (!channels.insert(
                new ChannelRepository.NewChannel(
                        id,
                        slug,
                        name,
                        input.kind().name(),
                        game,
                        region,
                        description,
                        rate,
                        input.sortOrder() == null ? 100 : input.sortOrder()),
                actor.userId(),
                now)) {
            throw ApiException.conflict("A channel with this slug already exists");
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("slug", slug);
        details.put("kind", input.kind().name());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_CHANNEL_CREATE,
                TARGET_CHANNEL,
                id.toString(),
                details);
        return adminView(channels.findById(id, now).orElseThrow());
    }

    /** {@code PATCH /admin/community/channels/{id}} (audited). */
    @Transactional
    public AdminChannelView updateChannel(AuthenticatedUser actor, UUID id, ChannelPatch patch) {
        Instant now = timeProvider.now();
        ChannelRow current =
                channels.findById(id, now)
                        .orElseThrow(() -> ApiException.notFound(CHANNEL_NOT_FOUND));
        List<ProblemFieldError> errors = new ArrayList<>();
        String name = patch.name() == null ? current.name() : patch.name().trim();
        if (name.isEmpty() || name.length() > 80) {
            errors.add(new ProblemFieldError("name", "must be 1-80 characters"));
        }
        String description =
                patch.description() == null ? current.description() : patch.description().trim();
        if (description.length() > 500) {
            errors.add(new ProblemFieldError("description", "must be at most 500 characters"));
        }
        int rate =
                patch.postRateLimitPerHour() == null
                        ? current.postRateLimitPerHour()
                        : patch.postRateLimitPerHour();
        if (rate < 1 || rate > 1000) {
            errors.add(new ProblemFieldError("postRateLimitPerHour", "must be 1-1000"));
        }
        @Nullable String game =
                patch.game() == null ? current.gameSlug() : validateGame(patch.game(), errors);
        @Nullable String region =
                patch.regionLabel() == null
                        ? current.regionLabel()
                        : validateRegion(patch.regionLabel(), errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        String status = patch.status() == null ? current.status() : patch.status().name();
        int sortOrder = patch.sortOrder() == null ? current.sortOrder() : patch.sortOrder();
        channels.update(
                id, name, description, status, rate, sortOrder, game, region, actor.userId(), now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("slug", current.slug());
        details.put("previousStatus", current.status());
        details.put("status", status);
        details.put("previousPostRateLimitPerHour", current.postRateLimitPerHour());
        details.put("postRateLimitPerHour", rate);
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_CHANNEL_UPDATE,
                TARGET_CHANNEL,
                id.toString(),
                details);
        return adminView(channels.findById(id, now).orElseThrow());
    }

    /**
     * {@code POST /admin/community/posts/{id}/remove}: hides the post for everybody, resolves its
     * open moderation flags and audits the removal with the reason.
     */
    @Transactional
    public void removePost(AuthenticatedUser moderator, UUID postId, String rawReason) {
        String reason = requireText("reason", rawReason, REASON_MAX);
        PostRow post =
                posts.findAny(postId)
                        .filter(row -> row.deletedAt() == null)
                        .orElseThrow(() -> ApiException.notFound(POST_NOT_FOUND));
        if ("REMOVED".equals(post.moderationState())) {
            throw ApiException.conflict("This post is already removed");
        }
        posts.remove(postId, moderator.userId(), reason, timeProvider.now());
        deletePhotosAfterCommit(photos.deleteOfPost(postId));
        int resolved =
                moderation.resolveSubject(
                        FlagSubjectType.COMMUNITY_POST, postId, moderator.userId(), "Post removed");
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("authorId", post.authorId().toString());
        details.put("channel", post.channelSlug());
        details.put("reason", reason);
        details.put("flagsResolved", resolved);
        auditService.record(
                ActorType.ADMIN,
                moderator.userId(),
                ACTION_POST_REMOVE,
                TARGET_POST,
                postId.toString(),
                details);
        log.info("Community post {} removed by {}", postId, moderator.userId());
    }

    /** {@code POST /admin/community/replies/{id}/remove} (audited). */
    @Transactional
    public void removeReply(AuthenticatedUser moderator, UUID replyId, String rawReason) {
        String reason = requireText("reason", rawReason, REASON_MAX);
        ReplyRow reply =
                replies.findAny(replyId)
                        .filter(row -> row.deletedAt() == null)
                        .orElseThrow(() -> ApiException.notFound(REPLY_NOT_FOUND));
        if ("REMOVED".equals(reply.moderationState())) {
            throw ApiException.conflict("This reply is already removed");
        }
        if (replies.remove(replyId, moderator.userId(), reason, timeProvider.now())) {
            posts.replyRemoved(reply.postId());
        }
        int resolved =
                moderation.resolveSubject(
                        FlagSubjectType.COMMUNITY_REPLY,
                        replyId,
                        moderator.userId(),
                        "Reply removed");
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("authorId", reply.authorId().toString());
        details.put("postId", reply.postId().toString());
        details.put("reason", reason);
        details.put("flagsResolved", resolved);
        auditService.record(
                ActorType.ADMIN,
                moderator.userId(),
                ACTION_REPLY_REMOVE,
                TARGET_REPLY,
                replyId.toString(),
                details);
    }

    // ---------------------------------------------------------------------------------------
    // Region channels
    // ---------------------------------------------------------------------------------------

    /** The author of a post, whatever its state (Phase 7 report context); empty when unknown. */
    @Transactional(readOnly = true)
    public Optional<UUID> postAuthor(UUID postId) {
        return posts.findAny(postId).map(PostRow::authorId);
    }

    /**
     * Posts and replies of an author removed by moderators, newest first (Phase 7 moderator history
     * of a reported collector).
     */
    @Transactional(readOnly = true)
    public List<RemovedContent> removedContentOf(UUID authorId, int limit) {
        return posts.removedOf(authorId, limit).stream()
                .map(
                        row ->
                                new RemovedContent(
                                        row.kind(),
                                        row.id(),
                                        row.channelSlug(),
                                        row.removedAt(),
                                        row.reason()))
                .toList();
    }

    /**
     * A post or reply a moderator removed.
     *
     * @param kind POST or REPLY
     * @param id post or reply id
     * @param channelSlug its channel
     * @param removedAt when
     * @param reason the moderator's reason
     */
    public record RemovedContent(
            String kind,
            UUID id,
            String channelSlug,
            @Nullable Instant removedAt,
            @Nullable String reason) {}

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    /** Export section {@code community}: the owner's posts and replies. */
    @Transactional(readOnly = true)
    public @Nullable Map<String, Object> export(UUID userId) {
        List<Map<String, Object>> postRows = new ArrayList<>();
        List<PostRow> own = posts.byAuthor(userId);
        Map<UUID, List<PhotoRow>> ownPhotos =
                photos.byPosts(own.stream().map(PostRow::id).toList());
        for (PostRow row : own) {
            Map<String, Object> post = new LinkedHashMap<>();
            post.put("id", row.id());
            post.put("channel", row.channelSlug());
            post.put("body", row.body());
            post.put("createdAt", row.createdAt());
            post.put("moderationState", row.moderationState());
            List<PhotoRow> attachedPhotos = ownPhotos.getOrDefault(row.id(), List.of());
            if (!attachedPhotos.isEmpty()) {
                post.put(
                        "photos",
                        attachedPhotos.stream()
                                .map(photo -> uploads.urlOf(photo.storageKey()))
                                .toList());
            }
            postRows.add(post);
        }
        List<Map<String, Object>> replyRows = new ArrayList<>();
        for (ReplyRow row : replies.byAuthor(userId)) {
            Map<String, Object> reply = new LinkedHashMap<>();
            reply.put("id", row.id());
            reply.put("postId", row.postId());
            reply.put("body", row.body());
            reply.put("createdAt", row.createdAt());
            replyRows.add(reply);
        }
        if (postRows.isEmpty() && replyRows.isEmpty()) {
            return null;
        }
        Map<String, Object> section = new LinkedHashMap<>();
        section.put("posts", postRows);
        section.put("replies", replyRows);
        return section;
    }

    /** Account deletion: the author's posts and replies are deleted and their text erased. */
    @Transactional
    public void purge(UUID userId) {
        Instant now = timeProvider.now();
        List<String> photoKeys = photos.deleteByAuthor(userId);
        int postCount = posts.eraseByAuthor(userId, now);
        int replyCount = replies.eraseByAuthor(userId, now);
        replies.recount(userId);
        deletePhotosAfterCommit(photoKeys);
        log.info(
                "Community data purged for {}: {} post(s), {} reply(ies), {} photo(s)",
                userId,
                postCount,
                replyCount,
                photoKeys.size());
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private void requireFeature(AuthenticatedUser viewer) {
        featureFlags.require(FeatureFlagKeys.PUBLIC_CHAT, viewer.userId());
    }

    private ChannelRow requireActiveChannel(String slug, Instant now) {
        return channels.findBySlug(slug, now)
                .filter(row -> ChannelStatus.ACTIVE.name().equals(row.status()))
                .orElseThrow(() -> ApiException.notFound(CHANNEL_NOT_FOUND));
    }

    private PostRow requireVisiblePost(AuthenticatedUser viewer, UUID postId, Instant now) {
        return posts.findVisible(postId, blocks.hiddenFrom(viewer.userId()), now)
                .filter(row -> ChannelStatus.ACTIVE.name().equals(row.channelStatus()))
                .orElseThrow(() -> ApiException.notFound(POST_NOT_FOUND));
    }

    private PostRow requireAnyPost(UUID postId) {
        return posts.findAny(postId).orElseThrow(() -> ApiException.notFound(POST_NOT_FOUND));
    }

    private List<PostView> postViews(List<PostRow> rows, AuthenticatedUser viewer) {
        List<UUID> authorIds = rows.stream().map(PostRow::authorId).distinct().toList();
        Map<UUID, MemberCard> authors = members.cards(authorIds);
        Map<UUID, PublicPlace> places = locations.publicPlacesOf(authorIds);
        Set<UUID> printingIds = new LinkedHashSet<>();
        Set<UUID> binderIds = new LinkedHashSet<>();
        List<JsonNode> payloads = new ArrayList<>();
        for (PostRow row : rows) {
            JsonNode payload = jsonMapper.readTree(row.payloadJson());
            payloads.add(payload);
            @Nullable UUID printingId = uuid(payload.path("card").path("printingId"));
            if (printingId != null) {
                printingIds.add(printingId);
            }
            @Nullable UUID binderId = uuid(payload.path("binder").path("binderId"));
            if (binderId != null) {
                binderIds.add(binderId);
            }
        }
        Map<UUID, String> images = catalog.frontImageUrls(printingIds);
        Map<UUID, ChatDeckCore> sharedBinders = binders.chatDeckCores(binderIds);
        Set<UUID> hidden = binderIds.isEmpty() ? Set.of() : blocks.hiddenFrom(viewer.userId());
        Map<UUID, List<PhotoRow>> photoRows =
                photos.byPosts(rows.stream().map(PostRow::id).toList());
        boolean moderator = isModerator(viewer);
        List<PostView> result = new ArrayList<>();
        for (int index = 0; index < rows.size(); index++) {
            PostRow row = rows.get(index);
            MemberCard author = authors.get(row.authorId());
            if (author == null) {
                continue;
            }
            boolean own = row.authorId().equals(viewer.userId());
            @Nullable PublicPlace place = places.get(row.authorId());
            List<PostPhoto> postPhotos =
                    photoRows.getOrDefault(row.id(), List.of()).stream()
                            .map(
                                    photo ->
                                            new PostPhoto(
                                                    uploads.urlOf(photo.storageKey()),
                                                    photo.width(),
                                                    photo.height()))
                            .toList();
            result.add(
                    new PostView(
                            row.id(),
                            row.channelSlug(),
                            new PostAuthor(
                                    author.id(),
                                    author.handle(),
                                    author.displayName(),
                                    author.avatarUrl()),
                            row.body(),
                            payload(payloads.get(index), images, sharedBinders, hidden, postPhotos),
                            row.createdAt(),
                            row.editedAt(),
                            row.replyCount(),
                            row.lastReplyAt(),
                            own,
                            own || moderator,
                            ContentModerationState.valueOf(row.moderationState()),
                            place != null
                                            && privacyPolicy.canSeeLocation(
                                                    ROOM_READER, row.authorId(), author.privacy())
                                    ? PlaceResponse.from(place)
                                    : null));
        }
        return result;
    }

    private List<ReplyView> replyViews(List<ReplyRow> rows, AuthenticatedUser viewer) {
        Map<UUID, MemberCard> authors =
                members.cards(rows.stream().map(ReplyRow::authorId).distinct().toList());
        boolean moderator = isModerator(viewer);
        List<ReplyView> result = new ArrayList<>();
        for (ReplyRow row : rows) {
            MemberCard author = authors.get(row.authorId());
            if (author == null) {
                continue;
            }
            boolean own = row.authorId().equals(viewer.userId());
            result.add(
                    new ReplyView(
                            row.id(),
                            row.postId(),
                            new PostAuthor(
                                    author.id(),
                                    author.handle(),
                                    author.displayName(),
                                    author.avatarUrl()),
                            row.body(),
                            row.createdAt(),
                            own || moderator,
                            ContentModerationState.valueOf(row.moderationState())));
        }
        return result;
    }

    /**
     * A stored payload as members read it: the card with its current picture, the binder while the
     * reader can open it (public, unsold, its owner listed and not blocked with the reader in
     * either direction) with its deck core details, and the photos. A binder the reader can no
     * longer open is left out, its stored name and owner's handle included, and {@code
     * binderUnavailable} says so (stage R11 review fix 1).
     */
    static PostPayload payload(
            JsonNode payload,
            Map<UUID, String> images,
            Map<UUID, ChatDeckCore> sharedBinders,
            Set<UUID> hiddenOwners,
            List<PostPhoto> photos) {
        @Nullable CardLink card = null;
        JsonNode cardNode = payload.path("card");
        @Nullable UUID printingId = uuid(cardNode.path("printingId"));
        @Nullable UUID cardId = uuid(cardNode.path("cardId"));
        if (printingId != null && cardId != null) {
            card =
                    new CardLink(
                            printingId,
                            cardId,
                            cardNode.path("name").asString(""),
                            cardNode.hasNonNull("printingCode")
                                    ? cardNode.path("printingCode").asString()
                                    : null,
                            images.get(printingId));
        }
        @Nullable BinderLink binder = null;
        boolean binderUnavailable = false;
        JsonNode binderNode = payload.path("binder");
        @Nullable UUID binderId = uuid(binderNode.path("binderId"));
        if (binderId != null) {
            @Nullable ChatDeckCore shared = sharedBinders.get(binderId);
            if (shared != null
                    && shared.effectivePublic()
                    && shared.soldAt() == null
                    && !hiddenOwners.contains(shared.ownerId())) {
                boolean deckCore = shared.sellsAsCore();
                binder =
                        new BinderLink(
                                binderId,
                                binderNode.path("name").asString(""),
                                binderNode.path("ownerHandle").asString(""),
                                deckCore,
                                deckCore ? shared.askingPriceText() : null,
                                shared.imageUrl());
            } else {
                binderUnavailable = true;
            }
        }
        return card == null && binder == null && !binderUnavailable && photos.isEmpty()
                ? PostPayload.EMPTY
                : new PostPayload(card, binder, photos, binderUnavailable ? Boolean.TRUE : null);
    }

    /**
     * Locks the COMMUNITY uploads of a new post, in order: at most {@link #PHOTOS_MAX}, each once,
     * each the author's and from the last hour (400 otherwise). The locks hold until the post is
     * stored; a refused post leaves them unattached, so the same photos can be sent again.
     */
    private List<AttachableUpload> lockPhotos(UUID authorId, List<UUID> uploadIds) {
        if (uploadIds.isEmpty()) {
            return List.of();
        }
        if (uploadIds.size() > PHOTOS_MAX) {
            throw invalid("photoUploadIds", "At most " + PHOTOS_MAX + " photos per post");
        }
        if (new HashSet<>(uploadIds).size() != uploadIds.size()) {
            throw invalid("photoUploadIds", "Each photo can be attached once");
        }
        List<AttachableUpload> locked = new ArrayList<>();
        for (UUID uploadId : uploadIds) {
            locked.add(
                    uploads.lockAttachable(authorId, uploadId, UploadKind.COMMUNITY)
                            .orElseThrow(
                                    () ->
                                            invalid(
                                                    "photoUploadIds",
                                                    "Unknown, used or expired photo upload")));
        }
        return locked;
    }

    /** Deletes the files of deleted photos once the transaction that deleted their rows commits. */
    private void deletePhotosAfterCommit(List<String> storageKeys) {
        if (storageKeys.isEmpty()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            uploads.deleteObjects(storageKeys);
                        }
                    });
        } else {
            uploads.deleteObjects(storageKeys);
        }
    }

    private @Nullable String validateGame(@Nullable String game, List<ProblemFieldError> errors) {
        if (game == null || game.isBlank()) {
            return null;
        }
        String slug = game.trim();
        if (games.find(slug).isEmpty()) {
            errors.add(new ProblemFieldError("game", "Unknown game"));
        }
        return slug;
    }

    /**
     * The region of a region channel: a platform region code (ADR 0017: one channel per platform
     * region, never a city). Blank means none; anything else that is not a code is refused.
     */
    private @Nullable String validateRegion(
            @Nullable String region, List<ProblemFieldError> errors) {
        if (region == null || region.isBlank()) {
            return null;
        }
        String code = region.trim().toLowerCase(Locale.ROOT);
        if (regions.region(code).isEmpty()) {
            errors.add(
                    new ProblemFieldError(
                            "regionLabel", "must be a platform region code (GET /regions)"));
        }
        return code;
    }

    private static String requireText(String field, @Nullable String raw, int max) {
        String text = raw == null ? "" : raw.strip();
        if (text.isEmpty()) {
            throw invalid(field, "must not be blank");
        }
        if (text.length() > max) {
            throw invalid(field, "must be at most " + max + " characters");
        }
        return text;
    }

    private static ContentModerationState state(ModerationDecision decision) {
        return decision.flagged() ? ContentModerationState.FLAGGED : ContentModerationState.OK;
    }

    static boolean isModerator(AuthenticatedUser user) {
        return user.hasAnyRole(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN);
    }

    private static ChannelView channelView(ChannelRow row, @Nullable ChannelLastPost lastPost) {
        return new ChannelView(
                row.id(),
                row.slug(),
                row.name(),
                ChannelKind.valueOf(row.kind()),
                row.gameSlug(),
                row.regionLabel(),
                row.description(),
                row.postCount24h(),
                lastPost);
    }

    private static AdminChannelView adminView(ChannelRow row) {
        return new AdminChannelView(
                row.id(),
                row.slug(),
                row.name(),
                ChannelKind.valueOf(row.kind()),
                row.gameSlug(),
                row.regionLabel(),
                row.description(),
                ChannelStatus.valueOf(row.status()),
                row.postRateLimitPerHour(),
                row.sortOrder(),
                row.postCount24h(),
                row.updatedAt());
    }

    private static @Nullable UUID uuid(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        try {
            return UUID.fromString(node.asString());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    private static ApiException postBlocked() {
        return new ApiException(
                ErrorCode.POST_BLOCKED,
                "This post cannot be published because it breaks the community guidelines");
    }
}
