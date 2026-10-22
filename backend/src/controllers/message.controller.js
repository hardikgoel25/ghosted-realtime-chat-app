import * as messageService from "../services/message.service.js";
import { ok } from "../utils/response.js";

export async function listMessages(req, res) {
  const page = await messageService.listMessages(
    req.user,
    req.validated.params.userId,
    req.validated.query
  );
  ok(res, page);
}

export async function sendMessage(req, res) {
  const { message, duplicate } = await messageService.sendMessage(
    req.user,
    req.validated.params.userId,
    req.validated.body,
    req.file
  );
  ok(res, { message }, duplicate ? 200 : 201);
}
