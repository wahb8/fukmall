import {
  createSignedAssetPreview,
  createSignedStorageUrl,
  getRequiredSupabaseClient,
  invokeEdgeFunction,
  uploadAssetFile,
} from './storageAssets'

const CHAT_SELECT = `
  id,
  user_id,
  business_profile_id,
  title,
  status,
  last_message_at,
  created_at,
  updated_at
`

const CHAT_MESSAGE_SELECT = `
  id,
  chat_id,
  user_id,
  role,
  message_type,
  content_text,
  metadata,
  created_at
`

const GENERATED_POST_SELECT = `
  id,
  user_id,
  chat_id,
  source_message_id,
  status,
  prompt_text,
  caption_text,
  bucket_name,
  image_storage_path,
  width,
  height,
  metadata,
  created_at,
  updated_at
`

const UPLOADED_ASSET_SELECT = `
  id,
  user_id,
  business_profile_id,
  chat_id,
  asset_kind,
  bucket_name,
  storage_path,
  original_file_name,
  mime_type,
  file_size_bytes,
  width,
  height,
  created_at,
  updated_at
`

function normalizeAssetIds(assetIds) {
  return Array.from(new Set(
    (assetIds ?? [])
      .map((assetId) => String(assetId ?? '').trim())
      .filter(Boolean),
  ))
}

function getMessageAttachmentIds(message) {
  const attachmentAssetIds = message?.metadata?.attachment_asset_ids

  if (!Array.isArray(attachmentAssetIds)) {
    return []
  }

  return normalizeAssetIds(attachmentAssetIds)
}

function buildChatThumbnailLabel(title) {
  const words = String(title ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) {
    return 'P'
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
}

function truncatePreviewText(value, maxLength = 68) {
  const text = String(value ?? '').trim()

  if (!text) {
    return ''
  }

  if (text.length <= maxLength) {
    return text
  }

  if (maxLength <= 3) {
    return text.slice(0, maxLength)
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`
}

function formatChatListDetail(timestamp) {
  if (!timestamp) {
    return ''
  }

  const parsedTime = new Date(timestamp)

  if (Number.isNaN(parsedTime.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(parsedTime)
}

function buildChatPreview(latestMessage, latestPost) {
  const latestMessageTime = Date.parse(latestMessage?.created_at ?? '')
  const latestPostTime = Date.parse(latestPost?.created_at ?? '')
  const hasValidMessageTime = Number.isFinite(latestMessageTime)
  const hasValidPostTime = Number.isFinite(latestPostTime)

  if (
    latestPost?.caption_text &&
    (!hasValidMessageTime || (hasValidPostTime && latestPostTime >= latestMessageTime))
  ) {
    return truncatePreviewText(latestPost.caption_text)
  }

  if (latestMessage?.content_text) {
    return truncatePreviewText(latestMessage.content_text)
  }

  return 'No messages yet'
}

function getChatActivityTimestamp(chat, latestMessage, latestPost) {
  const candidates = [
    chat?.last_message_at,
    latestMessage?.created_at,
    latestPost?.created_at,
    chat?.updated_at,
    chat?.created_at,
  ]
    .map((value) => Date.parse(value ?? ''))
    .filter((value) => Number.isFinite(value))

  return candidates.length > 0 ? Math.max(...candidates) : 0
}

function buildPostStatusLabel(status) {
  if (!status) {
    return ''
  }

  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function isGeneratedPostImageAvailable(post) {
  return Boolean(post?.bucket_name && post?.image_storage_path)
}

function sortTimelineEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt)
    const rightTime = Date.parse(right.createdAt)

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    const leftPriority = left.kind === 'message' ? 0 : 1
    const rightPriority = right.kind === 'message' ? 0 : 1

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    return String(left.id).localeCompare(String(right.id))
  })
}

export function buildChatTitleFromPrompt(prompt, fallbackTitle = 'Untitled chat') {
  const normalizedPrompt = String(prompt ?? '').replace(/\s+/g, ' ').trim()

  if (!normalizedPrompt) {
    return fallbackTitle
  }

  return normalizedPrompt.length > 56
    ? `${normalizedPrompt.slice(0, 53).trimEnd()}...`
    : normalizedPrompt
}

async function createGeneratedPostPreview(supabase, post) {
  const previewUrl = await createSignedStorageUrl(
    supabase,
    post.bucket_name,
    post.image_storage_path,
    60 * 60,
  )

  return {
    ...post,
    previewUrl,
  }
}

async function loadAttachmentAssetMap(supabase, messages) {
  const attachmentIds = normalizeAssetIds(
    messages.flatMap((message) => getMessageAttachmentIds(message)),
  )

  if (attachmentIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('uploaded_assets')
    .select(UPLOADED_ASSET_SELECT)
    .in('id', attachmentIds)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Unable to load the chat attachments.')
  }

  const previewAssets = await Promise.all(
    (data ?? []).map((asset) => createSignedAssetPreview(supabase, asset)),
  )

  return new Map(previewAssets.map((asset) => [asset.id, asset]))
}

export async function listChats() {
  const supabase = getRequiredSupabaseClient('Supabase is not configured for chats.')
  const { data: chats, error } = await supabase
    .from('chats')
    .select(CHAT_SELECT)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'Unable to load chats.')
  }

  if (!Array.isArray(chats) || chats.length === 0) {
    return []
  }

  const chatIds = chats.map((chat) => chat.id)
  const [
    { data: latestMessages, error: latestMessagesError },
    { data: latestPosts, error: latestPostsError },
  ] = await Promise.all([
    supabase
      .from('chat_messages')
      .select(CHAT_MESSAGE_SELECT)
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('generated_posts')
      .select(GENERATED_POST_SELECT)
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false }),
  ])

  if (latestMessagesError) {
    throw new Error(latestMessagesError.message || 'Unable to load the latest chat messages.')
  }

  if (latestPostsError) {
    throw new Error(latestPostsError.message || 'Unable to load generated post previews.')
  }

  const latestMessageByChatId = new Map()

  for (const message of latestMessages ?? []) {
    if (!latestMessageByChatId.has(message.chat_id)) {
      latestMessageByChatId.set(message.chat_id, message)
    }
  }

  const latestPostByChatId = new Map()

  for (const post of latestPosts ?? []) {
    if (!latestPostByChatId.has(post.chat_id)) {
      latestPostByChatId.set(post.chat_id, post)
    }
  }

  const signedPreviewByChatId = new Map()
  const previewCandidates = Array.from(latestPostByChatId.entries())
    .filter(([, post]) => isGeneratedPostImageAvailable(post))

  await Promise.all(previewCandidates.map(async ([chatId, post]) => {
    const previewUrl = await createSignedStorageUrl(
      supabase,
      post.bucket_name,
      post.image_storage_path,
      30 * 60,
    )

    signedPreviewByChatId.set(chatId, previewUrl)
  }))

  return chats
    .map((chat) => {
      const latestMessage = latestMessageByChatId.get(chat.id) ?? null
      const latestPost = latestPostByChatId.get(chat.id) ?? null
      const activityTimestamp = getChatActivityTimestamp(chat, latestMessage, latestPost)

      return {
        ...chat,
        subtitle: buildChatPreview(latestMessage, latestPost),
        detail: formatChatListDetail(activityTimestamp ? new Date(activityTimestamp).toISOString() : null),
        thumbnailLabel: buildChatThumbnailLabel(chat.title),
        thumbnailSrc: signedPreviewByChatId.get(chat.id) ?? null,
        latestMessage,
        latestGeneratedPost: latestPost,
        activityTimestamp,
      }
    })
    .sort((left, right) => right.activityTimestamp - left.activityTimestamp)
}

export async function loadChatSession(chatId) {
  const supabase = getRequiredSupabaseClient('Supabase is not configured for chats.')
  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .select(CHAT_SELECT)
    .eq('id', chatId)
    .eq('status', 'active')
    .maybeSingle()

  if (chatError) {
    throw new Error(chatError.message || 'Unable to load the selected chat.')
  }

  if (!chat) {
    return null
  }

  const [
    { data: messages, error: messagesError },
    { data: generatedPosts, error: generatedPostsError },
  ] = await Promise.all([
    supabase
      .from('chat_messages')
      .select(CHAT_MESSAGE_SELECT)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true }),
    supabase
      .from('generated_posts')
      .select(GENERATED_POST_SELECT)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true }),
  ])

  if (messagesError) {
    throw new Error(messagesError.message || 'Unable to load the chat history.')
  }

  if (generatedPostsError) {
    throw new Error(generatedPostsError.message || 'Unable to load generated posts.')
  }

  const attachmentAssetMap = await loadAttachmentAssetMap(supabase, messages ?? [])
  const generatedPostEntries = await Promise.all(
    (generatedPosts ?? []).map((post) => createGeneratedPostPreview(supabase, post)),
  )

  const timelineEntries = sortTimelineEntries([
    ...(messages ?? []).map((message) => ({
      id: message.id,
      kind: 'message',
      role: message.role,
      messageType: message.message_type,
      text: message.content_text ?? '',
      createdAt: message.created_at,
      attachments: getMessageAttachmentIds(message)
        .map((assetId) => attachmentAssetMap.get(assetId))
        .filter(Boolean),
      metadata: message.metadata ?? {},
    })),
    ...generatedPostEntries.map((post) => ({
      id: post.id,
      kind: 'generated_post',
      status: post.status,
      promptText: post.prompt_text ?? '',
      captionText: post.caption_text ?? '',
      createdAt: post.created_at,
      sourceMessageId: post.source_message_id ?? null,
      previewUrl: post.previewUrl ?? null,
      width: post.width,
      height: post.height,
      detail: buildPostStatusLabel(post.status),
      metadata: post.metadata ?? {},
    })),
  ])

  return {
    chat,
    timelineEntries,
    latestGeneratedPost: generatedPostEntries.at(-1) ?? null,
  }
}

export async function createChat({
  title,
  businessProfileId = null,
}) {
  const supabase = getRequiredSupabaseClient('Supabase is not configured for chats.')
  const normalizedTitle = String(title ?? '').trim() || 'Untitled chat'
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user?.id) {
    throw new Error(userError?.message || 'You must be signed in to create a chat.')
  }

  const { data, error } = await supabase
    .from('chats')
    .insert({
      user_id: userData.user.id,
      title: normalizedTitle,
      business_profile_id: businessProfileId,
    })
    .select(CHAT_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Unable to create a new chat.')
  }

  return data
}

export async function generatePost({
  chatId,
  prompt,
  width,
  height,
  businessProfileId = null,
  attachmentAssetIds = [],
}) {
  const normalizedPrompt = String(prompt ?? '').trim()

  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.')
  }

  if (!Number.isInteger(width) || width <= 0) {
    throw new Error('Width must be a positive integer.')
  }

  if (!Number.isInteger(height) || height <= 0) {
    throw new Error('Height must be a positive integer.')
  }

  return invokeEdgeFunction(
    'generate-post',
    {
      chat_id: chatId,
      prompt: normalizedPrompt,
      width,
      height,
      business_profile_id: businessProfileId,
      attachment_asset_ids: normalizeAssetIds(attachmentAssetIds),
    },
    'Unable to generate the post.',
  )
}

export async function renameChat(chatId, title) {
  const supabase = getRequiredSupabaseClient('Supabase is not configured for chats.')
  const normalizedTitle = String(title ?? '').trim()

  if (!normalizedTitle) {
    throw new Error('Chat title cannot be empty.')
  }

  const { data, error } = await supabase
    .from('chats')
    .update({
      title: normalizedTitle,
    })
    .eq('id', chatId)
    .select(CHAT_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Unable to rename the chat.')
  }

  return data
}

export async function deleteChat(chatId) {
  const supabase = getRequiredSupabaseClient('Supabase is not configured for chats.')
  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('id', chatId)

  if (error) {
    throw new Error(error.message || 'Unable to delete the chat.')
  }
}

export async function submitUserPrompt({
  chatId,
  prompt,
  attachmentAssetIds = [],
}) {
  const supabase = getRequiredSupabaseClient('Supabase is not configured for chats.')
  const normalizedPrompt = String(prompt ?? '').trim()

  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.')
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      chat_id: chatId,
      role: 'user',
      message_type: 'text',
      content_text: normalizedPrompt,
      metadata: {
        attachment_asset_ids: normalizeAssetIds(attachmentAssetIds),
      },
    })
    .select(CHAT_MESSAGE_SELECT)
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Unable to save the prompt.')
  }

  return data
}

export async function uploadPromptAttachment(chatId, file) {
  const supabase = getRequiredSupabaseClient('Supabase is not configured for chats.')
  const asset = await uploadAssetFile({
    file,
    assetKind: 'prompt_attachment',
    chatId,
  })

  return createSignedAssetPreview(supabase, asset)
}
