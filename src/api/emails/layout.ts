export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface EmailLayout {
  subject: string;
  heading: string;
  paragraphs: string[];
  action: { label: string; url: string };
  note: string;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

export const renderEmail = ({
  subject,
  heading,
  paragraphs,
  action,
  note,
}: EmailLayout): EmailContent => {
  const url = escapeHtml(action.url);
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">',
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>`,
    ...paragraphs.map(
      (paragraph) =>
        `<p style="font-size:15px;line-height:1.5;margin:0 0 16px">${escapeHtml(paragraph)}</p>`,
    ),
    `<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(action.label)}</a></p>`,
    `<p style="font-size:13px;line-height:1.5;color:#666666;margin:0">${escapeHtml(note)}</p>`,
    "</div>",
  ].join("");
  const text = [
    heading,
    ...paragraphs,
    `${action.label}: ${action.url}`,
    note,
  ].join("\n\n");

  return { subject, html, text };
};
