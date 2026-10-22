import nodemailer from "nodemailer";
import { ERROR_CODES } from "@ghosted/shared";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";

export const emailConfigured = Boolean(env.SMTP_URL);
const CAPTURE = env.SMTP_URL === "json";

/** Messages "sent" through the capture transport (tests only). */
export const sentMails = [];

let transport = null;
function getTransport() {
  if (!transport) {
    transport = CAPTURE
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport(env.SMTP_URL);
  }
  return transport;
}

export function assertEmailConfigured() {
  if (!emailConfigured) {
    throw new ApiError(
      503,
      ERROR_CODES.EMAIL_UNAVAILABLE,
      "Email is not configured on this server"
    );
  }
}

export async function sendMail({ to, subject, text, html }) {
  assertEmailConfigured();
  const info = await getTransport().sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
  if (CAPTURE) sentMails.push(JSON.parse(info.message));
  logger.info({ to, subject }, "Email sent");
  return info;
}

function layout(title, body, cta) {
  return `<!doctype html><html><body style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f6f5fb;padding:32px;color:#1f1b2e">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e8e5f3">
    <div style="font-weight:700;font-size:20px;margin-bottom:16px">👻 Ghosted</div>
    <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
    <p style="line-height:1.5;margin:0 0 20px">${body}</p>
    <a href="${cta.href}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">${cta.label}</a>
    <p style="font-size:12px;color:#6b6880;margin-top:24px">If the button does not work, copy this link:<br>${cta.href}</p>
  </div></body></html>`;
}

export function verificationEmail({ fullname, link }) {
  const first = fullname.split(" ")[0];
  return {
    subject: "Verify your email for Ghosted",
    text: `Hi ${first},\n\nConfirm this email address for your Ghosted account by opening:\n${link}\n\nThe link expires in 24 hours. If you did not add this address, ignore this email.`,
    html: layout(
      `Hi ${first}, confirm your email`,
      "Click below to confirm this address for your Ghosted account. The link expires in 24 hours. If you did not add this address, you can ignore this email.",
      { href: link, label: "Verify email" }
    ),
  };
}

export function resetEmail({ fullname, link }) {
  const first = fullname.split(" ")[0];
  return {
    subject: "Reset your Ghosted password",
    text: `Hi ${first},\n\nSomeone asked to reset the password for your Ghosted account. Open this link within one hour to choose a new one:\n${link}\n\nIf this was not you, ignore this email and your password stays the same.`,
    html: layout(
      `Hi ${first}, reset your password`,
      "Someone asked to reset the password for your Ghosted account. The link below works for one hour. If this was not you, ignore this email and nothing changes.",
      { href: link, label: "Choose a new password" }
    ),
  };
}
