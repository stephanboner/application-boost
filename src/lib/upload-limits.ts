// Leave room for multipart headers below Vercel's 4.5 MB request limit.
export const MAX_CV_UPLOAD_BYTES = 4 * 1024 * 1024;
export const CV_UPLOAD_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
