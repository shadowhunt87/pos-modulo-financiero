export interface FeedbackMine {
  id: string; kind: string; message: string; route: string; status: string;
  response: string | null; taskRef: string | null; createdAt: string; updatedAt: string;
}
/** Lo que ve el ADMIN: además, quién lo envió (null si esa persona ya no existe) y su navegador. */
export interface FeedbackAdminRow extends FeedbackMine {
  userAgent: string | null;
  user: { id: string; name: string; email: string; role: string } | null;
}
