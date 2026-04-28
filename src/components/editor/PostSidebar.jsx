import { useState } from 'react'
import logoConceptTransparent from '../../assets/logo concept-transparent.png'

function renderThumbnail(post) {
  if (typeof post.thumbnailSrc === 'string' && post.thumbnailSrc.length > 0) {
    return (
      <img
        className="post-sidebar-post-thumbnail-image"
        src={post.thumbnailSrc}
        alt=""
        aria-hidden="true"
      />
    )
  }

  return (
    <span className="post-sidebar-post-thumbnail-fallback" aria-hidden="true">
      {post.thumbnailLabel ?? 'P'}
    </span>
  )
}

export function PostSidebar({
  posts = [],
  activePostId = null,
  isLoading = false,
  onNewPost,
  onSelectPost,
  onRenamePost,
  onDeletePost,
  logoHref = '/',
  onLogoClick,
}) {
  const [editingPostId, setEditingPostId] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')

  function beginRename(post) {
    setEditingPostId(post.id)
    setDraftTitle(post.title)
  }

  async function submitRename(postId) {
    const nextTitle = draftTitle.trim()

    if (!nextTitle) {
      return
    }

    await onRenamePost?.(postId, nextTitle)
    setEditingPostId(null)
    setDraftTitle('')
  }

  return (
    <aside className="post-sidebar" aria-label="Post navigation">
      <div className="post-sidebar-header">
        <a
          className="post-sidebar-brand"
          href={logoHref}
          onClick={(event) => {
            if (typeof onLogoClick === 'function') {
              event.preventDefault()
              onLogoClick(event)
            }
          }}
          aria-label="Kryopic home"
        >
          <img className="post-sidebar-brand-mark" src={logoConceptTransparent} alt="" aria-hidden="true" />
        </a>

        <button
          className="post-sidebar-new-post"
          type="button"
          onClick={onNewPost}
        >
          New Post
        </button>
      </div>

      <div className="post-sidebar-list-shell">
        <div className="post-sidebar-list-header">
          <p className="eyebrow">Posts</p>
          <span className="post-sidebar-list-count">{posts.length}</span>
        </div>

        <div className="post-sidebar-post-list">
          {!isLoading && posts.length === 0 ? (
            <p className="post-sidebar-empty">No chats yet. Start with a new post or send a prompt.</p>
          ) : null}

          {posts.map((post) => {
            const isActive = post.id === activePostId
            const isEditing = editingPostId === post.id

            return (
              <div
                key={post.id}
                className={isActive ? 'post-sidebar-post active' : 'post-sidebar-post'}
              >
                <button
                  className="post-sidebar-post-main"
                  type="button"
                  aria-label={post.title}
                  onClick={() => onSelectPost?.(post.id)}
                >
                  <span
                    className="post-sidebar-post-thumbnail"
                    style={post.thumbnailBackground
                      ? { background: post.thumbnailBackground }
                      : undefined}
                  >
                    {renderThumbnail(post)}
                  </span>

                  <span className="post-sidebar-post-copy">
                    {isEditing ? (
                      <input
                        className="post-sidebar-post-title-input"
                        type="text"
                        value={draftTitle}
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          event.stopPropagation()

                          if (event.key === 'Escape') {
                            setEditingPostId(null)
                            setDraftTitle('')
                          }

                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void submitRename(post.id)
                          }
                        }}
                      />
                    ) : (
                      <span className="post-sidebar-post-title">{post.title}</span>
                    )}
                    {!isEditing && post.subtitle ? (
                      <span className="post-sidebar-post-subtitle">{post.subtitle}</span>
                    ) : null}
                  </span>

                  {!isEditing && post.detail ? (
                    <span className="post-sidebar-post-detail">{post.detail}</span>
                  ) : null}
                </button>

                {isActive ? (
                  <span className="post-sidebar-post-actions">
                    {isEditing ? (
                      <>
                        <button
                          className="post-sidebar-post-action"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void submitRename(post.id)
                          }}
                        >
                          Save
                        </button>
                        <button
                          className="post-sidebar-post-action"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setEditingPostId(null)
                            setDraftTitle('')
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="post-sidebar-post-action"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            beginRename(post)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="post-sidebar-post-action post-sidebar-post-action-danger"
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()

                            if (window.confirm(`Delete "${post.title}"?`)) {
                              void onDeletePost?.(post.id)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
