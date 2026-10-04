import sanitizeHtml from "sanitize-html";

/**
 * Sanitize untrusted HTML email (Phase 9.5+, 07 AI Security / XSS). External email is untrusted
 * input: scripts, event handlers, styles, forms, iframes, objects and javascript: URLs are removed;
 * links are forced to open in a new tab with `rel="noopener noreferrer nofollow"`; images are limited
 * to https (remote images can notify the sender, but are not executable). The result is safe to
 * render with `dangerouslySetInnerHTML`.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "a",
      "b",
      "i",
      "em",
      "strong",
      "u",
      "s",
      "p",
      "br",
      "hr",
      "span",
      "div",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "img",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    // No style attributes, no classes/ids, no inline CSS — avoids CSS-based attacks and leaks.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
    },
  });
}

/** Collapse a plain-text body for previews/snippets. */
export function textSnippet(text: string, max = 200): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
