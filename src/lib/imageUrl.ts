/**
 * Chuyển link share (Google Drive...) thành link ảnh trực tiếp để <img> render được.
 * Hỗ trợ:
 *  - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *  - https://drive.google.com/open?id=FILE_ID
 *  - https://drive.google.com/uc?id=FILE_ID
 * Lưu ý: file Drive phải share "Anyone with the link".
 */
export function getDriveFileId(url: string): string | null {
  if (!url) return null;
  const m = url.match(
    /drive\.google\.com\/(?:file\/d\/([\w-]{10,})|open\?[^#]*\bid=([\w-]{10,})|uc\?[^#]*\bid=([\w-]{10,})|thumbnail\?[^#]*\bid=([\w-]{10,}))/
  );
  return m ? m[1] || m[2] || m[3] || m[4] : null;
}

export function toDirectImageUrl(url: string): string {
  const id = getDriveFileId(url);
  // Dùng endpoint thumbnail của Drive (giống web gốc)
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
  return url;
}

/**
 * Danh sách URL thử lần lượt: thumbnail 503/lỗi thì fallback sang lh3.
 * Google thỉnh thoảng rate-limit endpoint thumbnail (503) với request ẩn danh.
 */
export function imageUrlCandidates(url: string): string[] {
  const id = getDriveFileId(url);
  if (!id) return url ? [url] : [];
  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
    `https://lh3.googleusercontent.com/d/${id}=w1000`,
    `https://lh3.googleusercontent.com/d/${id}`,
  ];
}
