import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CreatePostRequest } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { TextField } from '@/src/components/ui/TextField';
import { BinderLinkPicker, CardLinkPicker } from '@/src/features/messages/LinkPickers';
import type { BinderLinkChoice, CardLinkChoice } from '@/src/features/messages/messageDraft';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { POST_MAX_LENGTH } from './communityHelpers';

type Picker = 'card' | 'binder' | null;

/** The request of a post (text plus an optional card and binder link). */
export function postRequest(
  text: string,
  card: CardLinkChoice | null,
  binder: BinderLinkChoice | null
): CreatePostRequest {
  const request: CreatePostRequest = { body: text.trim() };
  if (card) {
    request.cardPrintingId = card.printingId;
  }
  if (binder) {
    request.binderId = binder.binderId;
  }
  return request;
}

/**
 * "Write a post" of a channel (the web's `app-post-composer`): text (1–2000 characters, inline
 * validation), optional card and public binder links picked inline, and the Post button.
 * Refusals from the server (duplicate, per-channel rate limit, moderation) come back through
 * `error`.
 */
export function PostComposer({
  channelName,
  displayName,
  avatarUrl,
  busy,
  error,
  onPost,
}: {
  channelName: string;
  displayName: string;
  avatarUrl: string | null | undefined;
  busy: boolean;
  error: string | null;
  /** Resolves true when the post was published (the composer then clears). */
  onPost: (request: CreatePostRequest) => Promise<boolean>;
}) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [card, setCard] = useState<CardLinkChoice | null>(null);
  const [binder, setBinder] = useState<BinderLinkChoice | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [touched, setTouched] = useState(false);
  const length = text.length;
  const tooLong = length > POST_MAX_LENGTH;
  const empty = text.trim().length === 0;
  const canPost = !busy && !empty && !tooLong;

  let hint = 'Be kind, no personal details.';
  if (tooLong) {
    hint = `Posts are limited to ${POST_MAX_LENGTH} characters.`;
  } else if (length > POST_MAX_LENGTH - 200) {
    hint = `${length} / ${POST_MAX_LENGTH}`;
  }

  const submit = async () => {
    setTouched(true);
    if (!canPost) {
      return;
    }
    if (await onPost(postRequest(text, card, binder))) {
      setText('');
      setCard(null);
      setBinder(null);
      setTouched(false);
    }
  };

  return (
    <View
      testID="post-composer"
      style={[styles.root, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.main}>
        <Avatar src={avatarUrl} name={displayName} size={36} />
        <TextField
          label="Post text"
          value={text}
          onChangeText={setText}
          placeholder={`Share with ${channelName}…`}
          multiline
          maxLength={POST_MAX_LENGTH + 1}
          error={touched && empty ? 'A post needs some text.' : tooLong ? hint : null}
          hint={tooLong ? undefined : hint}
          containerStyle={styles.grow}
          testID="post-text"
        />
      </View>
      {picker === 'card' ? (
        <CardLinkPicker
          onPicked={(choice) => {
            setCard(choice);
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      ) : null}
      {picker === 'binder' ? (
        <BinderLinkPicker
          onPicked={(choice) => {
            setBinder(choice);
            setPicker(null);
          }}
          onCancel={() => setPicker(null)}
        />
      ) : null}
      {card ? (
        <View testID="post-attachment-card" style={[styles.chip, { borderColor: palette.border }]}>
          <CardImage src={card.imageUrl} alt="" game={card.game} size="xs" />
          <Text numberOfLines={1} style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            {card.name}
            {card.printingCode ? ` · ${card.printingCode}` : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove the card"
            onPress={() => setCard(null)}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {binder ? (
        <View
          testID="post-attachment-binder"
          style={[styles.chip, { borderColor: palette.border }]}
        >
          <MaterialCommunityIcons name="book-open-variant" size={22} color={palette.primary} />
          <Text numberOfLines={1} style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            {binder.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove the binder"
            onPress={() => setBinder(null)}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          testID="post-error"
          style={[textStyle('sm'), { color: palette.danger }]}
        >
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Card"
          icon="cards-outline"
          variant="ghost"
          onPress={() => setPicker(picker === 'card' ? null : 'card')}
          testID="post-add-card"
        />
        <Button
          label="Binder"
          icon="book-open-variant"
          variant="ghost"
          onPress={() => setPicker(picker === 'binder' ? null : 'binder')}
          testID="post-add-binder"
        />
        <View style={styles.grow} />
        <Button
          label="Post"
          icon="send"
          onPress={() => void submit()}
          disabled={!canPost}
          loading={busy}
          loadingLabel="Posting…"
          testID="post-submit"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1 },
  main: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  grow: { flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  strong: { fontWeight: fontWeight.semibold },
});
