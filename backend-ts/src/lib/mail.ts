import { getConfig } from "#src/config.js";
import { logger } from "./logger.js";
import { generateUnsubscribeToken } from "./unsubscribe.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserInfo {
  id_int: number;
  email: string;
  first_name: string;
  last_name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isProduction(): boolean {
  return getConfig().ENVIRONMENT === "production";
}

function isMailConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.MAILGUN_API_KEY);
}

function routeEmailsToTestRecipient(
  to: string[],
  recipientVariables: Record<string, Record<string, unknown>> | null
): [string[], Record<string, Record<string, unknown>> | null] {
  const testEmail =
    getConfig().TEST_RECIPIENT_EMAIL_ADDRESS || "help@thestacks.org";
  const rewrittenTo: string[] = [];
  const rewrittenVars: Record<string, Record<string, unknown>> = {};

  for (const addr of to) {
    const match = addr.match(/(.+?)\s*<(.+?)>/);
    let originalEmail: string;
    if (match) {
      const name = match[1]!.trim();
      originalEmail = match[2]!;
      rewrittenTo.push(`${name} <${testEmail}>`);
    } else {
      originalEmail = addr;
      rewrittenTo.push(testEmail);
    }
    if (recipientVariables && originalEmail in recipientVariables) {
      rewrittenVars[testEmail] = recipientVariables[originalEmail]!;
    }
  }

  return [rewrittenTo, recipientVariables !== null ? rewrittenVars : null];
}

interface SendEmailOptions {
  to: string[];
  subject: string;
  body: string;
  html?: string;
  recipientVariables?: Record<string, Record<string, unknown>>;
  notificationType?: string;
  logOnly?: boolean;
}

async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const { to } = opts;
  let { recipientVariables = {} } = opts;
  const cfg = getConfig();

  const formData: Record<string, string> = {
    from: "The Stacks <noreply@thestacks.org>",
    subject: opts.subject,
    text: opts.body,
    to: to.join(","),
  };
  if (opts.html) formData["html"] = opts.html;

  if (to.length > 1 && Object.keys(recipientVariables).length === 0) {
    recipientVariables = Object.fromEntries(to.map((e) => [e, {}]));
  }

  if (opts.notificationType) {
    for (const email of Object.keys(recipientVariables)) {
      const token = generateUnsubscribeToken(email, opts.notificationType);
      recipientVariables[email] = {
        ...recipientVariables[email],
        unsub_token: token,
      };
    }
    formData["h:List-Unsubscribe"] =
      `<${cfg.BASE_URL_API}/notifications/unsubscribe?token=%recipient.unsub_token%>`;
    formData["h:List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  if (Object.keys(recipientVariables).length > 0) {
    formData["recipient-variables"] = JSON.stringify(recipientVariables);
  }

  if (!isMailConfigured()) {
    logger.warn({ formData }, "Email service not configured. Skipping send");
    return false;
  }

  if (opts.logOnly) {
    logger.info({ formData }, "Email sent to log.");
    return false;
  }

  const url =
    cfg.MAILGUN_API_URL ?? "https://api.mailgun.net/v3/thestacks.org/messages";

  try {
    const body = new URLSearchParams(formData);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`api:${cfg.MAILGUN_API_KEY}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (resp.status !== 200 && resp.status !== 201) {
      logger.error(
        { status: resp.status, body: await resp.text() },
        "Mailgun error"
      );
      return false;
    }
    return true;
  } catch (e) {
    logger.error({ err: e }, "Failed to send email");
    return false;
  }
}

async function sendNotificationEmail(opts: SendEmailOptions): Promise<boolean> {
  const notificationOpts = { ...opts };
  if (!isProduction()) {
    const [rTo, rVars] = routeEmailsToTestRecipient(
      notificationOpts.to,
      notificationOpts.recipientVariables ?? {}
    );
    notificationOpts.to = rTo;
    notificationOpts.recipientVariables = rVars ?? {};
    notificationOpts.logOnly = true;
  }

  return sendEmail(notificationOpts);
}

// ---------------------------------------------------------------------------
// Auth email builders
// ---------------------------------------------------------------------------

interface AuthUserInfo {
  email: string;
  name: string;
}

export function sendResetPasswordEmail(
  user: AuthUserInfo,
  url: string
): Promise<boolean> {
  const text = `Hi ${user.name},\n\nWe received a request to reset your password. Click the link below to choose a new one:\n\n${url}\n\nIf you didn't request this, you can safely ignore this email.\n`;
  const html = `<p>Hi ${escapeHtml(user.name)},</p><p>We received a request to reset your password. Click the link below to choose a new one:</p><p><a href="${escapeHtml(url)}">Reset your password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`;
  return sendEmail({
    to: [`${user.name} <${user.email}>`],
    subject: "Reset your password",
    body: text,
    html,
  });
}

export function sendVerificationEmail(
  user: AuthUserInfo,
  url: string
): Promise<boolean> {
  const text = `Hi ${user.name},\n\nPlease verify your email address by clicking the link below:\n\n${url}\n\nIf you didn't create an account, you can safely ignore this email.\n`;
  const html = `<p>Hi ${escapeHtml(user.name)},</p><p>Please verify your email address by clicking the link below:</p><p><a href="${escapeHtml(url)}">Verify email</a></p><p>If you didn't create an account, you can safely ignore this email.</p>`;
  return sendEmail({
    to: [`${user.name} <${user.email}>`],
    subject: "Verify your email address",
    body: text,
    html,
  });
}

// ---------------------------------------------------------------------------
// Comment email builders
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * @todo `CommentData`/`PublicationData`/`UserInfo` are still keyed by legacy
 * integer ids (the reply link anchors on `#comment-${id_int}`) — shared with
 * v0 rather than converted. v1 callers resolve `.idInt` privately; converting
 * this to ULIDs is unstarted follow-up work.
 */
export interface CommentData {
  id_int: number;
  user_id_int: number;
  publication_id: number;
  parent_id?: number | null;
  body: string;
  pre_text?: string | null;
  post_text?: string | null;
  commenter_name: string;
  commenter_username?: string;
}

export interface PublicationData {
  id_int: number;
  slug: string;
  title: string;
}

function buildCommentEmail(
  comment: CommentData,
  publication: PublicationData,
  reason: string
): [string, string] {
  const cfg = getConfig();
  const baseUrl = cfg.BASE_URL_WEB;
  const commenterUsername = comment.commenter_username || "";
  const userUrl = commenterUsername
    ? `${baseUrl}/users/${commenterUsername}`
    : "";
  const pubUrl = `${baseUrl}/publications/${publication.slug}`;
  const replyUrl = `${pubUrl}#comment-${comment.id_int}`;
  const unsubUrl = `${baseUrl}/unsubscribe?token=%recipient.unsub_token%`;
  const preText = comment.pre_text || "";
  const postText = comment.post_text || "";

  const contextParts: string[] = [];
  if (preText) contextParts.push(`...${preText}`);
  contextParts.push(comment.body);
  if (postText) contextParts.push(`${postText}...`);
  const contextBlock = contextParts.join(" ");

  const text = `You are receiving this email because ${reason} on ${publication.title} (${pubUrl}).\n\n${comment.commenter_name} writes:\n> ${contextBlock}\n\nReply: ${replyUrl}\n\nIf you no longer wish to receive these emails, you may unsubscribe: ${unsubUrl}\n`;

  const hName = escapeHtml(comment.commenter_name);
  const hPubTitle = escapeHtml(publication.title);
  const hBody = escapeHtml(comment.body);
  const hPre = escapeHtml(preText);
  const hPost = escapeHtml(postText);
  const hReason = escapeHtml(reason);
  const nameHtml = userUrl
    ? `<a href="${escapeHtml(userUrl)}">${hName}</a>`
    : hName;
  const contextHtmlParts: string[] = [];
  if (hPre)
    contextHtmlParts.push(`<span style="color:#888">...${hPre} </span>`);
  contextHtmlParts.push(hBody);
  if (hPost)
    contextHtmlParts.push(`<span style="color:#888"> ${hPost}...</span>`);
  const contextHtml = contextHtmlParts.join("");

  const html = `<p>You are receiving this email because ${hReason} on <a href="${escapeHtml(pubUrl)}">${hPubTitle}</a>.</p><p>${nameHtml} writes:</p><blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px">${contextHtml}</blockquote><p><a href="${escapeHtml(replyUrl)}">Reply</a></p><p style="color:#888;font-size:12px">If you no longer wish to receive these emails, you may <a href="${escapeHtml(unsubUrl)}">unsubscribe</a>.</p>`;

  return [text, html];
}

function emailUsersAboutNewComment(
  comment: CommentData,
  publication: PublicationData,
  users: UserInfo[],
  reason: string,
  notificationType: string
): Promise<boolean> {
  const to = users.map((u) => `${u.first_name} ${u.last_name} <${u.email}>`);
  const recipientVariables = Object.fromEntries(
    users.map((u) => [
      u.email,
      { first_name: u.first_name, last_name: u.last_name },
    ])
  );
  const [text, html] = buildCommentEmail(comment, publication, reason);
  return sendNotificationEmail({
    to,
    subject: `New comment on "${publication.title}"`,
    body: text,
    html,
    recipientVariables,
    notificationType,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function emailBylinesAboutNewComment(
  comment: CommentData,
  publication: PublicationData,
  users: UserInfo[],
  notificationType: string
): Promise<boolean> {
  return emailUsersAboutNewComment(
    comment,
    publication,
    users,
    "you are a byline contributor to this publication",
    notificationType
  );
}

export function emailNonBylinesAboutNewComment(
  comment: CommentData,
  publication: PublicationData,
  users: UserInfo[],
  notificationType: string
): Promise<boolean> {
  return emailUsersAboutNewComment(
    comment,
    publication,
    users,
    "you are a contributor to this publication",
    notificationType
  );
}

export function emailOrgAdminsAboutNewComment(
  comment: CommentData,
  publication: PublicationData,
  users: UserInfo[],
  notificationType: string
): Promise<boolean> {
  const to = users.map((u) => `${u.first_name} ${u.last_name} <${u.email}>`);
  const recipientVariables = Object.fromEntries(
    users.map((u) => [
      u.email,
      { first_name: u.first_name, last_name: u.last_name },
    ])
  );
  const [text, html] = buildCommentEmail(
    comment,
    publication,
    "you are an admin of an organization linked to this publication"
  );
  return sendNotificationEmail({
    to,
    subject: `New comment on "${publication.title}"`,
    body: text,
    html,
    recipientVariables,
    notificationType,
  });
}

export function emailCommenterAboutReply(
  comment: CommentData,
  publication: PublicationData,
  op: UserInfo,
  notificationType: string
): Promise<boolean> {
  const to = [`${op.first_name} ${op.last_name} <${op.email}>`];
  const recipientVariables = {
    [op.email]: { first_name: op.first_name, last_name: op.last_name },
  };
  const [text, html] = buildCommentEmail(
    comment,
    publication,
    "someone replied to your comment"
  );
  return sendNotificationEmail({
    to,
    subject: `New reply to your comment on "${publication.title}"`,
    body: text,
    html,
    recipientVariables,
    notificationType,
  });
}
