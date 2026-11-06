/** Badge colour per status word, shared by server pages and the data table. */
export const tone: Record<string, string> = {
  approved: "ok", requested: "warn", cancelled: "err", revoked: "err", paid: "ok", won: "ok", active: "ok", completed: "ok", ready: "ok", issued: "warn", submitted: "warn", placed: "warn", training: "info",
  draft: "", planned: "", rejected: "err", void: "err", lost: "err", dropped: "err",
};
