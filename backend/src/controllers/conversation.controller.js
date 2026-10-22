import * as conversationService from "../services/conversation.service.js";
import * as messageService from "../services/message.service.js";
import { ok } from "../utils/response.js";

export async function list(req, res) {
  const page = await conversationService.listConversations(req.user, req.validated.query);
  ok(res, page);
}

export async function createDirect(req, res) {
  const { conversation, created } = await conversationService.findOrCreateDirect(
    req.user,
    req.validated.body.userId
  );
  ok(
    res,
    { conversation: await conversationService.viewFor(conversation, req.user) },
    created ? 201 : 200
  );
}

export async function get(req, res) {
  const conversation = await conversationService.getConversation(
    req.user,
    req.validated.params.conversationId
  );
  ok(res, { conversation });
}

export async function updateFlags(req, res) {
  const conversation = await conversationService.updateFlags(
    req.user,
    req.validated.params.conversationId,
    req.validated.body
  );
  ok(res, { conversation });
}

export async function markRead(req, res) {
  const conversation = await conversationService.markRead(
    req.user,
    req.validated.params.conversationId
  );
  ok(res, { conversation });
}

export async function clear(req, res) {
  const conversation = await conversationService.clearForMe(
    req.user,
    req.validated.params.conversationId
  );
  ok(res, { conversation });
}

export async function listMessages(req, res) {
  const page = await messageService.listMessages(
    req.user,
    req.validated.params.conversationId,
    req.validated.query
  );
  ok(res, page);
}

export async function searchMessages(req, res) {
  const page = await messageService.searchMessages(
    req.user,
    req.validated.params.conversationId,
    req.validated.query
  );
  ok(res, page);
}

export async function sendMessage(req, res) {
  const { message, duplicate } = await messageService.sendMessage(
    req.user,
    req.validated.params.conversationId,
    req.validated.body,
    req.files ?? {}
  );
  ok(res, { message }, duplicate ? 200 : 201);
}

export async function editMessage(req, res) {
  const { conversationId, messageId } = req.validated.params;
  const message = await messageService.editMessage(
    req.user,
    conversationId,
    messageId,
    req.validated.body
  );
  ok(res, { message });
}

export async function deleteMessage(req, res) {
  const { conversationId, messageId } = req.validated.params;
  const result = await messageService.deleteMessage(
    req.user,
    conversationId,
    messageId,
    req.validated.query.scope
  );
  ok(res, result);
}

export async function addReaction(req, res) {
  const { conversationId, messageId, emoji } = req.validated.params;
  ok(res, await messageService.addReaction(req.user, conversationId, messageId, emoji));
}

export async function removeReaction(req, res) {
  const { conversationId, messageId, emoji } = req.validated.params;
  ok(res, await messageService.removeReaction(req.user, conversationId, messageId, emoji));
}
