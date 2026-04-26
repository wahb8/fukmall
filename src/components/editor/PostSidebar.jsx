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
  onNewPost,
  onSelectPost,
  logoHref = '/',
  onLogoClick,
}) {
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
          {posts.map((post) => {
            const isActive = post.id === activePostId

            return (
              <button
                key={post.id}
                className={isActive ? 'post-sidebar-post active' : 'post-sidebar-post'}
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
                  <span className="post-sidebar-post-title">{post.title}</span>
                  {post.subtitle ? (
                    <span className="post-sidebar-post-subtitle">{post.subtitle}</span>
                  ) : null}
                </span>

                {post.detail ? (
                  <span className="post-sidebar-post-detail">{post.detail}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
