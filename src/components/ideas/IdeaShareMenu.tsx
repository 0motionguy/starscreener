// IdeaShareMenu — pure-JSX share popover. shell.js' bindShareMenus()
// activates this on hydration. We emit the `.share-wrap > .share-btn +
// .share-menu` contract per public/shell.js:471-514.

interface IdeaShareMenuProps {
  ideaId: string;
  ideaTitle: string;
}

export function IdeaShareMenu({ ideaId, ideaTitle }: IdeaShareMenuProps) {
  const url = `https://trendingrepo.com/ideas/${ideaId}`;
  const text = ideaTitle;
  return (
    <div className="share-wrap">
      <button type="button" className="share-btn" aria-label="Share this idea">
        Share
      </button>
      <div
        className="share-menu"
        role="menu"
        aria-label="Share options"
      >
        <button
          type="button"
          className="item x"
          data-share="x"
          data-url={url}
          data-text={text}
          role="menuitem"
        >
          <span className="sm-ico" aria-hidden="true">
            X
          </span>
          Share on X
        </button>
        <button
          type="button"
          className="item li"
          data-share="li"
          data-url={url}
          data-text={text}
          role="menuitem"
        >
          <span className="sm-ico" aria-hidden="true">
            in
          </span>
          Share on LinkedIn
        </button>
        <button
          type="button"
          className="item rd"
          data-share="rd"
          data-url={url}
          data-text={text}
          role="menuitem"
        >
          <span className="sm-ico" aria-hidden="true">
            R
          </span>
          Share on Reddit
        </button>
        <button
          type="button"
          className="item bs"
          data-share="bs"
          data-url={url}
          data-text={text}
          role="menuitem"
        >
          <span className="sm-ico" aria-hidden="true">
            🦋
          </span>
          Share on Bluesky
        </button>
        <div className="divider" role="separator" />
        <button
          type="button"
          className="item cp"
          data-share="cp"
          data-url={url}
          data-text={text}
          role="menuitem"
        >
          <span className="sm-ico" aria-hidden="true">
            ↗
          </span>
          Copy link
        </button>
        <button
          type="button"
          className="item em"
          data-share="em"
          data-url={url}
          data-text={text}
          role="menuitem"
        >
          <span className="sm-ico" aria-hidden="true">
            &lt;/&gt;
          </span>
          Copy embed
        </button>
        <button
          type="button"
          className="item rss"
          data-share="rss"
          data-url={url}
          data-text={text}
          role="menuitem"
        >
          <span className="sm-ico" aria-hidden="true">
            ⌁
          </span>
          RSS
        </button>
      </div>
    </div>
  );
}
