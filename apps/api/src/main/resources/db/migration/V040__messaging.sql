-- V040: private messaging (Phase 5 contract "Private messaging"): conversations, participants, the
-- unique DIRECT pair, messages, attachments, pending image uploads and user blocks.
--
-- PRIVACY: message.body, message.payload, message_attachment and image_upload are private to the
-- two participants (moderators only when acting on a report, Phase 7). They are never logged, never
-- put into analytics or domain events (events carry ids only) and never exported for anybody but
-- their author. No location data lives in this module.

-- ---------------------------------------------------------------------------------------------
-- conversation: one row per DIRECT conversation, with a denormalised "last message" summary for
-- the conversation list (updated in the same transaction as the message insert).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE conversation (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind                   text        NOT NULL DEFAULT 'DIRECT' CHECK (kind IN ('DIRECT')),
    created_by             uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    last_message_id        uuid,
    last_message_at        timestamptz,
    last_message_preview   text,
    last_message_kind      text,
    last_message_sender_id uuid,
    CONSTRAINT ck_conversation_preview CHECK (last_message_preview IS NULL OR char_length(last_message_preview) <= 200),
    CONSTRAINT ck_conversation_last_kind CHECK (last_message_kind IS NULL OR last_message_kind IN
        ('TEXT', 'CARD_LINK', 'BINDER_LINK', 'OFFER_LINK', 'IMAGE', 'SYSTEM'))
);

COMMENT ON TABLE conversation IS 'Private DIRECT conversation between exactly two collectors (Phase 5).';
COMMENT ON COLUMN conversation.last_message_preview IS 'PRIVATE: first characters of the last message (or a label for links and photos); participants only.';

-- ---------------------------------------------------------------------------------------------
-- conversation_participant: read state and per-participant switches.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE conversation_participant (
    conversation_id      uuid        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    user_id              uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    joined_at            timestamptz NOT NULL DEFAULT now(),
    last_read_at         timestamptz,
    last_read_message_id uuid,
    muted                boolean     NOT NULL DEFAULT false,
    archived             boolean     NOT NULL DEFAULT false,
    CONSTRAINT pk_conversation_participant PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX ix_conversation_participant_user ON conversation_participant (user_id, conversation_id);

COMMENT ON COLUMN conversation_participant.last_read_at IS 'created_at of the last message the participant marked as read (only moves forward).';

-- ---------------------------------------------------------------------------------------------
-- conversation_pair: enforces one DIRECT conversation per unordered pair of accounts.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE conversation_pair (
    user_low        uuid NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    user_high       uuid NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    CONSTRAINT pk_conversation_pair PRIMARY KEY (user_low, user_high),
    CONSTRAINT uq_conversation_pair_conversation UNIQUE (conversation_id),
    CONSTRAINT ck_conversation_pair_order CHECK (user_low < user_high)
);

COMMENT ON TABLE conversation_pair IS 'One DIRECT conversation per pair: user_low < user_high (uuid order); POST /conversations is idempotent through it.';

-- ---------------------------------------------------------------------------------------------
-- message
-- ---------------------------------------------------------------------------------------------
CREATE TABLE message (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  uuid        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    sender_id        uuid        REFERENCES user_account (id) ON DELETE SET NULL,
    kind             text        NOT NULL
                                 CHECK (kind IN ('TEXT', 'CARD_LINK', 'BINDER_LINK', 'OFFER_LINK', 'IMAGE', 'SYSTEM')),
    body             text        NOT NULL DEFAULT '',
    payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    edited_at        timestamptz,
    deleted_at       timestamptz,
    moderation_state text        NOT NULL DEFAULT 'OK' CHECK (moderation_state IN ('OK', 'FLAGGED', 'REMOVED')),
    CONSTRAINT ck_message_body CHECK (char_length(body) <= 4000),
    CONSTRAINT ck_message_payload CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX ix_message_conversation_created ON message (conversation_id, created_at DESC, id DESC);
CREATE INDEX ix_message_sender ON message (sender_id, created_at DESC);

COMMENT ON TABLE message IS 'Private messages (Phase 5). Cursor-paginated newest first on ix_message_conversation_created.';
COMMENT ON COLUMN message.body IS 'PRIVATE: participants only (moderators acting on a report, Phase 7). Never logged or put into events.';
COMMENT ON COLUMN message.payload IS 'PRIVATE: link references and snapshots {card:{printingId,cardId,name,printingCode}, binder:{binderId,name,ownerHandle}, image:{attachmentId}}; URLs are derived at read time.';

-- ---------------------------------------------------------------------------------------------
-- message_attachment: photos of IMAGE messages (moved from image_upload when the message is sent).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE message_attachment (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid        NOT NULL REFERENCES message (id) ON DELETE CASCADE,
    storage_key text        NOT NULL,
    url         text        NOT NULL,
    width       integer     NOT NULL CHECK (width > 0),
    height      integer     NOT NULL CHECK (height > 0),
    bytes       integer     NOT NULL CHECK (bytes > 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_message_attachment_storage_key UNIQUE (storage_key)
);

CREATE INDEX ix_message_attachment_message ON message_attachment (message_id);

COMMENT ON TABLE message_attachment IS 'PRIVATE: re-encoded JPEG photos of IMAGE messages (EXIF/GPS stripped); URL derived from storage_key at read time.';

-- ---------------------------------------------------------------------------------------------
-- image_upload: POST /uploads/images results waiting to be attached (consumed within 1 h, the
-- upload-cleanup job deletes the rest together with their stored objects).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE image_upload (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    kind        text        NOT NULL CHECK (kind IN ('MESSAGE', 'INVENTORY')),
    storage_key text        NOT NULL,
    width       integer     NOT NULL CHECK (width > 0),
    height      integer     NOT NULL CHECK (height > 0),
    bytes       integer     NOT NULL CHECK (bytes > 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz,
    CONSTRAINT uq_image_upload_storage_key UNIQUE (storage_key)
);

CREATE INDEX ix_image_upload_owner ON image_upload (owner_id);
CREATE INDEX ix_image_upload_pending ON image_upload (created_at) WHERE consumed_at IS NULL;

COMMENT ON TABLE image_upload IS 'PRIVATE: pending uploads of the owner; consumed by message creation within 1 h, deleted by the upload-cleanup job otherwise.';

-- ---------------------------------------------------------------------------------------------
-- user_block: a block hides conversations both ways and forbids new ones (403 MESSAGING_BLOCKED);
-- the profiles, binders and search modules hide blocked collectors through BlockRelationProvider.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_block (
    blocker_id uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    blocked_id uuid        NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    reason     text,
    CONSTRAINT pk_user_block PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT ck_user_block_self CHECK (blocker_id <> blocked_id),
    CONSTRAINT ck_user_block_reason CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE INDEX ix_user_block_blocked ON user_block (blocked_id);

COMMENT ON TABLE user_block IS 'Blocks between collectors; checked in both directions.';
COMMENT ON COLUMN user_block.reason IS 'PRIVATE: optional note of the blocker; never shown to the blocked collector.';
